import { Readable } from 'node:stream'
import type { TranscriptPayload } from '../db/schema.js'
import { buildTranscriptionPrompt, buildChunkPrompt, STRICT_RETRY_PROMPT, type Language } from '../lib/prompts.js'

const CHUNK_BASE_SECONDS = 10 * 60 // 10 minutes base
const CHUNK_VARIANCE_SECONDS = 90  // +/- 1.5 minutes random variance

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
  maxRetries?: number
}): Promise<string> {
  const key = apiKey()
  const maxRetries = args.maxRetries ?? 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000) // 1 hour

    const res = await fetch(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
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

    // Handle rate limit (429)
    if (res.status === 429 && attempt < maxRetries) {
      const body = await res.json().catch(() => ({})) as { error?: { details?: Array<{ retryDelay?: string }> } }
      const retryDelay = body.error?.details?.find((d) => d.retryDelay)?.retryDelay
      const waitMs = retryDelay ? parseRetryDelay(retryDelay) : (attempt + 1) * 60_000
      console.warn(`Rate limited, waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${maxRetries}`)
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }

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

  throw new Error('Gemini rate limit exceeded after max retries')
}

function parseRetryDelay(delay: string): number {
  // Parse "36s" or "36.754157293s" format
  const match = delay.match(/^([\d.]+)s$/)
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 1000 // Add 1s buffer
  return 60_000 // Default 1 minute
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

function generateChunkBoundaries(totalDurationSec: number): Array<{ start: number; end: number }> {
  const chunks: Array<{ start: number; end: number }> = []
  let cursor = 0
  let index = 0

  while (cursor < totalDurationSec) {
    // Random variance: -90 to +90 seconds from base 10 minutes
    const variance = (Math.random() * 2 - 1) * CHUNK_VARIANCE_SECONDS
    const chunkDuration = Math.max(5 * 60, CHUNK_BASE_SECONDS + variance) // min 5 minutes

    const end = Math.min(cursor + chunkDuration, totalDurationSec)
    chunks.push({ start: cursor, end })
    cursor = end
    index++
  }

  return chunks
}

interface ChunkTranscript {
  segments: Array<{ start: string; end: string; speaker: string; text: string }>
  speakerCount: number
}

function tryParseChunkTranscript(text: string): ChunkTranscript | null {
  let candidate = text.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidate = fence[1].trim()

  try {
    const parsed = JSON.parse(candidate) as ChunkTranscript
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
    }
  } catch {
    return null
  }
}

async function transcribeChunk(args: {
  fileUri: string
  mimeType: string
  language: Language
  chunkIndex: number
  startSec: number
  endSec: number
  isLast: boolean
}): Promise<ChunkTranscript> {
  const prompt = buildChunkPrompt(args.language, args.chunkIndex, args.startSec, args.endSec, args.isLast)

  const firstText = await callGenerateContent({
    fileUri: args.fileUri,
    mimeType: args.mimeType,
    prompt,
  })
  const first = tryParseChunkTranscript(firstText)
  if (first) return first

  console.warn(`Chunk ${args.chunkIndex} first response not valid JSON, retrying`)
  const retryText = await callGenerateContent({
    fileUri: args.fileUri,
    mimeType: args.mimeType,
    prompt: `${prompt}\n\n${STRICT_RETRY_PROMPT}`,
  })
  const retry = tryParseChunkTranscript(retryText)
  if (retry) return retry

  throw new Error(`Chunk ${args.chunkIndex} did not return parseable JSON after retry`)
}

function mergeChunkTranscripts(chunks: ChunkTranscript[], language: Language): TranscriptPayload {
  const allSegments = chunks.flatMap((c) => c.segments)
  const uniqueSpeakers = new Set(allSegments.map((s) => s.speaker))

  return {
    segments: allSegments,
    speakerCount: uniqueSpeakers.size,
    summary: '', // Will be generated separately
    language: language === 'auto' ? 'mixed' : language,
  }
}

async function generateSummary(args: {
  fileUri: string
  mimeType: string
  language: Language
}): Promise<string> {
  const langLabel = args.language === 'id' ? 'Indonesian' : args.language === 'en' ? 'English' : 'the same language as the audio'

  const prompt = `Listen to this meeting audio and provide a summary.
Output ONLY a JSON object with this shape (no markdown, no code fences):
{"summary": "3-5 bullet points (each starting with '- ') of key decisions, topics, and action items"}

The summary must be in ${langLabel}.
Return ONLY the JSON object.`

  try {
    const text = await callGenerateContent({
      fileUri: args.fileUri,
      mimeType: args.mimeType,
      prompt,
    })

    let candidate = text.trim()
    const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) candidate = fence[1].trim()

    const parsed = JSON.parse(candidate) as { summary?: string }
    return parsed.summary ?? ''
  } catch (err) {
    console.warn('Failed to generate summary:', err)
    return ''
  }
}

export async function transcribeAudio(args: {
  fileUri: string
  mimeType: string
  language: Language
  durationSec?: number
  onChunkComplete?: (partialTranscript: TranscriptPayload, chunkIndex: number, totalChunks: number) => Promise<void>
}): Promise<TranscriptPayload> {
  // If duration unknown or short (<15 min), use single-shot transcription
  const duration = args.durationSec ?? 0
  if (duration < 15 * 60) {
    console.log(`Audio duration ${duration}s < 15min, using single-shot transcription`)
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

  // Chunked transcription for long audio
  console.log(`Audio duration ${duration}s, using chunked transcription`)
  const boundaries = generateChunkBoundaries(duration)
  console.log(`Generated ${boundaries.length} chunks:`, boundaries)

  const chunkResults: ChunkTranscript[] = []

  for (let i = 0; i < boundaries.length; i++) {
    const { start, end } = boundaries[i]
    console.log(`Processing chunk ${i + 1}/${boundaries.length}: ${start}s - ${end}s`)

    const chunk = await transcribeChunk({
      fileUri: args.fileUri,
      mimeType: args.mimeType,
      language: args.language,
      chunkIndex: i,
      startSec: start,
      endSec: end,
      isLast: i === boundaries.length - 1,
    })

    chunkResults.push(chunk)
    console.log(`Chunk ${i + 1} completed: ${chunk.segments.length} segments`)

    // Build and save partial transcript after each chunk
    const partial = mergeChunkTranscripts(chunkResults, args.language)
    await args.onChunkComplete?.(partial, i, boundaries.length)
  }

  // Final merged result
  const merged = mergeChunkTranscripts(chunkResults, args.language)

  // Generate summary separately (quick call on full audio)
  console.log('Generating summary...')
  merged.summary = await generateSummary({
    fileUri: args.fileUri,
    mimeType: args.mimeType,
    language: args.language,
  })

  return merged
}
