import { createReadStream, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import OpenAI from 'openai'

const execFileAsync = promisify(execFile)
import type { TranscriptPayload } from '../db/schema.js'
import type { Language } from '../lib/prompts.js'

const MAX_WHISPER_BYTES = 24 * 1024 * 1024 // 24MB
const CHUNK_MINUTES = 10

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

async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ], { timeout: 30_000 })
  return parseFloat(stdout.trim()) || 0
}

function writeBufferToTmp(buffer: Buffer, ext: string): string {
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

// Compress to mono 16kHz 32kbps mp3 - good enough for speech, ~14MB/hour
async function compressToSpeech(inputPath: string): Promise<string> {
  const outputPath = join(tmpdir(), `alto-compressed-${Date.now()}.mp3`)
  await execFileAsync('ffmpeg', [
    '-i', inputPath,
    '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k',
    outputPath, '-y',
  ], { timeout: 10 * 60 * 1000 })
  return outputPath
}

// Split audio into chunks of ~CHUNK_MINUTES minutes
async function splitAudio(inputPath: string, durationSec: number): Promise<string[]> {
  const chunkPaths: string[] = []
  const chunkSec = CHUNK_MINUTES * 60
  let start = 0
  let index = 0

  while (start < durationSec) {
    const outPath = join(tmpdir(), `alto-chunk-${Date.now()}-${index}.mp3`)
    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-ss', String(start),
      '-t', String(chunkSec),
      '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k',
      outPath, '-y',
    ], { timeout: 5 * 60 * 1000 })
    chunkPaths.push(outPath)
    start += chunkSec
    index++
  }

  return chunkPaths
}

interface WhisperSegment {
  start: number
  end: number
  text: string
}

async function runWhisper(filePath: string, language: Language, offsetSec = 0): Promise<WhisperSegment[]> {
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
    start: s.start + offsetSec,
    end: s.end + offsetSec,
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
- Keep original timestamps
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
  const tmpPath = writeBufferToTmp(args.buffer, ext)
  const tempFiles: string[] = [tmpPath]

  try {
    if (!hasFfmpeg()) throw new Error('ffmpeg not available on this server')

    // Always compress first for consistent format + smaller size
    args.onProgress?.('Compressing audio...')
    console.log(`Original size: ${Math.round(args.buffer.length / 1024 / 1024)}MB`)
    const compressedPath = await compressToSpeech(tmpPath)
    tempFiles.push(compressedPath)

    const compressedSize = statSync(compressedPath).size
    console.log(`Compressed to ${Math.round(compressedSize / 1024 / 1024)}MB`)

    let allSegments: WhisperSegment[] = []

    if (compressedSize <= MAX_WHISPER_BYTES) {
      // Single file, send directly
      args.onProgress?.('Transcribing audio...')
      console.log('Single-shot Whisper transcription')
      allSegments = await runWhisper(compressedPath, args.language)
      console.log(`Whisper returned ${allSegments.length} segments`)
    } else {
      // Too large even after compression → split into chunks
      const durationSec = await getAudioDuration(compressedPath)
      const totalChunks = Math.ceil(durationSec / (CHUNK_MINUTES * 60))
      console.log(`Audio ${Math.round(durationSec / 60)}min → splitting into ${totalChunks} chunks`)

      const chunkPaths = await splitAudio(compressedPath, durationSec)
      tempFiles.push(...chunkPaths)

      for (let i = 0; i < chunkPaths.length; i++) {
        const offsetSec = i * CHUNK_MINUTES * 60
        args.onProgress?.(`Transcribing chunk ${i + 1}/${chunkPaths.length}...`)
        console.log(`Chunk ${i + 1}/${chunkPaths.length} (offset ${offsetSec}s)`)

        const chunkSegments = await runWhisper(chunkPaths[i], args.language, offsetSec)
        allSegments.push(...chunkSegments)
        console.log(`Chunk ${i + 1} done: ${chunkSegments.length} segments`)
      }
    }

    args.onProgress?.('Adding speaker labels and summary...')
    console.log(`Total segments: ${allSegments.length}, running diarization...`)
    const result = await diarizeAndSummarize(allSegments, args.language)
    console.log(`Done: ${result.segments.length} segments, ${result.speakerCount} speakers`)

    return result
  } finally {
    for (const f of tempFiles) {
      try { if (existsSync(f)) unlinkSync(f) } catch {}
    }
  }
}
