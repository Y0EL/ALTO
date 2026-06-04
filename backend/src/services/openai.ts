import { createReadStream, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import OpenAI from 'openai'
import type { TranscriptPayload } from '../db/schema.js'
import type { Language } from '../lib/prompts.js'

const MAX_WHISPER_BYTES = 24 * 1024 * 1024 // 24MB (Whisper limit is 25MB)

function client(): OpenAI {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is required')
  return new OpenAI({ apiKey: key })
}

function hasFfmpeg(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function compressAudio(inputPath: string): Promise<string> {
  const outputPath = join(tmpdir(), `alto-compressed-${Date.now()}.mp3`)
  execSync(`ffmpeg -i "${inputPath}" -vn -ar 16000 -ac 1 -b:a 32k "${outputPath}" -y`, {
    stdio: 'ignore',
    timeout: 10 * 60 * 1000,
  })
  return outputPath
}

async function writeBufferToTmp(buffer: Buffer, ext: string): Promise<string> {
  const path = join(tmpdir(), `alto-upload-${Date.now()}.${ext}`)
  writeFileSync(path, buffer)
  return path
}

function getExt(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mp3': 'mp3', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'audio/wave': 'wav', 'audio/aac': 'm4a', 'audio/m4a': 'm4a',
    'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/webm': 'webm',
    'video/mp4': 'mp4', 'video/webm': 'webm',
  }
  return map[mimeType] ?? 'mp3'
}

interface WhisperSegment {
  start: number
  end: number
  text: string
}

async function runWhisper(filePath: string, language: Language): Promise<WhisperSegment[]> {
  const openai = client()
  const lang = language === 'auto' ? undefined : language

  const transcription = await openai.audio.transcriptions.create({
    file: createReadStream(filePath) as never,
    model: 'whisper-1',
    language: lang,
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  })

  return (transcription.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }))
}

function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

async function diarizeAndSummarize(
  segments: WhisperSegment[],
  language: Language
): Promise<TranscriptPayload> {
  const openai = client()

  const rawTranscript = segments
    .map((s) => `[${formatTimestamp(s.start)}-${formatTimestamp(s.end)}] ${s.text}`)
    .join('\n')

  const langLabel =
    language === 'id' ? 'Indonesian' : language === 'en' ? 'English' : 'auto-detect'

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: `You are a meeting transcript processor. Given a raw transcript with timestamps, add speaker diarization and generate a summary.

Output STRICT JSON with this shape:
{
  "segments": [{"start": "MM:SS", "end": "MM:SS", "speaker": "Speaker 1", "text": "..."}],
  "speakerCount": <integer>,
  "summary": "3-5 bullet points starting with '- '",
  "language": "id" | "en" | "mixed"
}

Rules:
- Infer speaker changes from context (topic shifts, conversation flow, question/answer patterns)
- Label speakers as "Speaker 1", "Speaker 2", etc. consistently
- Keep timestamps from the original
- Summary must be in ${langLabel === 'auto-detect' ? 'the same language as the transcript' : langLabel}
- Return ONLY the JSON object`,
      },
      {
        role: 'user',
        content: rawTranscript,
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  const parsed = JSON.parse(text) as TranscriptPayload

  if (!Array.isArray(parsed.segments)) throw new Error('GPT-4o returned invalid structure')

  return {
    segments: parsed.segments.map((s) => ({
      start: s.start,
      end: s.end ?? s.start,
      speaker: s.speaker ?? 'Speaker 1',
      text: s.text,
    })),
    speakerCount: parsed.speakerCount ?? new Set(parsed.segments.map((s) => s.speaker)).size,
    summary: parsed.summary ?? '',
    language: parsed.language ?? 'mixed',
  }
}

export async function transcribeWithOpenAI(args: {
  buffer: Buffer
  mimeType: string
  language: Language
  onProgress?: (step: string) => void
}): Promise<TranscriptPayload> {
  const ext = getExt(args.mimeType)
  let tmpPath = await writeBufferToTmp(args.buffer, ext)
  let compressedPath: string | null = null

  try {
    // Compress if too large for Whisper
    if (args.buffer.length > MAX_WHISPER_BYTES) {
      if (!hasFfmpeg()) {
        throw new Error(`File too large for Whisper (${Math.round(args.buffer.length / 1024 / 1024)}MB > 24MB) and ffmpeg not available`)
      }
      args.onProgress?.('Compressing audio...')
      console.log(`File size ${Math.round(args.buffer.length / 1024 / 1024)}MB > 24MB, compressing with ffmpeg`)
      compressedPath = await compressAudio(tmpPath)
      console.log(`Compressed to ${Math.round(statSync(compressedPath).size / 1024 / 1024)}MB`)
    }

    const whisperInput = compressedPath ?? tmpPath

    args.onProgress?.('Transcribing audio...')
    console.log('Running Whisper transcription...')
    const segments = await runWhisper(whisperInput, args.language)
    console.log(`Whisper returned ${segments.length} segments`)

    args.onProgress?.('Adding speaker labels and summary...')
    console.log('Running GPT-4o diarization...')
    const result = await diarizeAndSummarize(segments, args.language)
    console.log(`Final transcript: ${result.segments.length} segments, ${result.speakerCount} speakers`)

    return result
  } finally {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch {}
    try { if (compressedPath && existsSync(compressedPath)) unlinkSync(compressedPath) } catch {}
  }
}
