import { Readable } from 'node:stream'
import { Agent } from 'undici'
import type { TranscriptPayload } from '../db/schema.js'
import { buildTranscriptionPrompt, STRICT_RETRY_PROMPT, type Language } from '../lib/prompts.js'

const longTimeoutAgent = new Agent({
  headersTimeout: 60 * 60 * 1000, // 1 hour
  bodyTimeout: 60 * 60 * 1000,    // 1 hour
  connectTimeout: 30 * 1000,       // 30 seconds
})

const GEMINI_BASE = 'https://generativelanguage.googleapis.com'
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY
  if (!k) throw new Error('GEMINI_API_KEY is required')
  return k
}

export interface UploadedGeminiFile {
  fileUri: string
  fileName: string
  mimeType: string
}

export async function uploadAudioToGemini(args: {
  body: ReadableStream<Uint8Array> | Buffer | Uint8Array
  mimeType: string
  sizeBytes: number
  displayName: string
}): Promise<UploadedGeminiFile> {
  const key = apiKey()

  const initRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(args.sizeBytes),
      'X-Goog-Upload-Header-Content-Type': args.mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: args.displayName } }),
  })

  if (!initRes.ok) {
    const text = await initRes.text().catch(() => '')
    throw new Error(`Gemini upload init failed (${initRes.status}): ${text}`)
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Gemini did not return an upload URL')

  const uploadBody =
    args.body instanceof ReadableStream
      ? (Readable.fromWeb(args.body as never) as unknown as NodeJS.ReadableStream)
      : args.body

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(args.sizeBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: uploadBody as never,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '')
    throw new Error(`Gemini upload bytes failed (${uploadRes.status}): ${text}`)
  }

  const json = (await uploadRes.json()) as {
    file?: { uri?: string; name?: string; mimeType?: string }
  }
  if (!json.file?.uri || !json.file?.name) {
    throw new Error('Gemini upload response missing file.uri/name')
  }

  return {
    fileUri: json.file.uri,
    fileName: json.file.name,
    mimeType: json.file.mimeType ?? args.mimeType,
  }
}

export async function waitForFileActive(fileName: string, timeoutMs = 60_000): Promise<void> {
  const key = apiKey()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${GEMINI_BASE}/v1beta/${fileName}`, {
      headers: { 'x-goog-api-key': key },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Gemini file status failed (${res.status}): ${text}`)
    }
    const data = (await res.json()) as { state?: string; error?: { message?: string } }
    if (data.state === 'ACTIVE') return
    if (data.state === 'FAILED') throw new Error(`Gemini file processing failed: ${data.error?.message ?? 'unknown'}`)
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('Gemini file did not become ACTIVE in time')
}

export async function deleteGeminiFile(fileName: string): Promise<void> {
  const key = apiKey()
  try {
    await fetch(`${GEMINI_BASE}/v1beta/${fileName}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': key },
    })
  } catch (err) {
    console.warn('Failed to delete Gemini file:', err)
  }
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

async function callGenerateContent(args: {
  fileUri: string
  mimeType: string
  prompt: string
}): Promise<string> {
  const key = apiKey()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000) // 1 hour

  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
    dispatcher: longTimeoutAgent as never,
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: args.prompt },
            { file_data: { mime_type: args.mimeType, file_uri: args.fileUri } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 65536,
      },
    }),
  })

  clearTimeout(timeout)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini generateContent failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as GenerateContentResponse

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked content: ${data.promptFeedback.blockReason}`)
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini returned empty response')
  return text
}

function tryParseTranscript(text: string): TranscriptPayload | null {
  let candidate = text.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidate = fence[1].trim()

  try {
    const parsed = JSON.parse(candidate) as TranscriptPayload
    if (!Array.isArray(parsed.segments)) return null
    if (!parsed.segments.every((s) => typeof s.start === 'string' && typeof s.text === 'string')) {
      return null
    }
    return {
      segments: parsed.segments.map((s) => ({
        start: s.start,
        end: s.end ?? s.start,
        speaker: s.speaker ?? 'Speaker 1',
        text: s.text,
      })),
      speakerCount: parsed.speakerCount ?? new Set(parsed.segments.map((s) => s.speaker)).size,
      summary: parsed.summary ?? '',
      language: (parsed.language as 'id' | 'en' | 'mixed') ?? 'mixed',
    }
  } catch {
    return null
  }
}

export async function transcribeAudio(args: {
  fileUri: string
  mimeType: string
  language: Language
}): Promise<TranscriptPayload> {
  const prompt = buildTranscriptionPrompt(args.language)
  const firstText = await callGenerateContent({
    fileUri: args.fileUri,
    mimeType: args.mimeType,
    prompt,
  })
  const first = tryParseTranscript(firstText)
  if (first) return first

  console.warn('First Gemini response not valid JSON, retrying with stricter prompt')
  const retryText = await callGenerateContent({
    fileUri: args.fileUri,
    mimeType: args.mimeType,
    prompt: `${prompt}\n\n${STRICT_RETRY_PROMPT}`,
  })
  const retry = tryParseTranscript(retryText)
  if (retry) return retry

  throw new Error('Gemini did not return parseable transcript JSON after retry')
}
