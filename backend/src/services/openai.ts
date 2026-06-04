import { createReadStream, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import OpenAI from 'openai'
import type { TranscriptPayload, TranscriptSegment } from '../db/schema.js'
import type { Language } from '../lib/prompts.js'

const execFileAsync = promisify(execFile)

const MAX_WHISPER_BYTES = 24 * 1024 * 1024 // 24MB
const CHUNK_MINUTES = 10
const DIARIZE_BATCH_SIZE = 100
const MERGE_MAX_GAP_SEC = 1.5
const MERGE_MAX_DURATION_SEC = 25

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

async function compressToSpeech(inputPath: string): Promise<string> {
  const outputPath = join(tmpdir(), `alto-compressed-${Date.now()}.mp3`)
  await execFileAsync('ffmpeg', [
    '-i', inputPath,
    '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k',
    outputPath, '-y',
  ], { timeout: 10 * 60 * 1000 })
  return outputPath
}

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

// Merge over-granular Whisper segments into natural speech units (~25s max)
// Stops merging on significant silence gaps (likely speaker changes)
function mergeWhisperSegments(segments: WhisperSegment[]): WhisperSegment[] {
  if (segments.length === 0) return []

  const merged: WhisperSegment[] = []
  let current = { ...segments[0] }

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i]
    const gap = next.start - current.end
    const currentDuration = current.end - current.start

    if (gap <= MERGE_MAX_GAP_SEC && currentDuration < MERGE_MAX_DURATION_SEC) {
      current.end = next.end
      current.text = current.text + ' ' + next.text
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)

  return merged
}

function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Diarize one batch of segments, carrying over speaker context from previous batches
async function diarizeBatch(
  segments: WhisperSegment[],
  language: Language,
  speakerContext: string
): Promise<{ diarized: TranscriptSegment[]; speakerContext: string }> {
  const openai = client()

  const rawTranscript = segments
    .map((s) => `[${formatTimestamp(s.start)}-${formatTimestamp(s.end)}] ${s.text}`)
    .join('\n')

  const langLabel =
    language === 'id' ? 'Indonesian' : language === 'en' ? 'English' : 'the same language as the transcript'

  const contextNote = speakerContext
    ? `\n\nSpeakers identified so far:\n${speakerContext}\nUSE THE SAME SPEAKER LABELS for the same voices.`
    : ''

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 16000,
    messages: [
      {
        role: 'system',
        content: `You are a meeting transcript processor. Add speaker diarization to this transcript segment.${contextNote}

Output STRICT JSON:
{
  "segments": [{"start": "MM:SS", "end": "MM:SS", "speaker": "Speaker 1", "text": "..."}],
  "speakerSummary": "Speaker 1: [brief voice description], Speaker 2: [brief voice description]"
}

Rules:
- Infer speaker changes from context (topic shifts, Q&A patterns, conversation flow)
- Label as "Speaker 1", "Speaker 2", etc. Keep labels consistent${contextNote ? ' with provided context' : ''}
- Keep original timestamps exactly
- speakerSummary: short description of each speaker's characteristics for context carry-over
- Return ONLY the JSON object`,
      },
      {
        role: 'user',
        content: rawTranscript,
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  const parsed = JSON.parse(text) as {
    segments: TranscriptSegment[]
    speakerSummary?: string
  }

  if (!Array.isArray(parsed.segments)) throw new Error('GPT returned invalid structure in batch')

  const diarized = parsed.segments.map((s) => ({
    start: s.start,
    end: s.end ?? s.start,
    speaker: s.speaker ?? 'Speaker 1',
    text: s.text,
  }))

  return {
    diarized,
    speakerContext: parsed.speakerSummary ?? speakerContext,
  }
}

async function diarizeInBatches(
  segments: WhisperSegment[],
  language: Language
): Promise<TranscriptSegment[]> {
  const allDiarized: TranscriptSegment[] = []
  let speakerContext = ''
  const totalBatches = Math.ceil(segments.length / DIARIZE_BATCH_SIZE)

  console.log(`Diarizing ${segments.length} segments in ${totalBatches} batches`)

  for (let i = 0; i < segments.length; i += DIARIZE_BATCH_SIZE) {
    const batch = segments.slice(i, i + DIARIZE_BATCH_SIZE)
    const batchNum = Math.floor(i / DIARIZE_BATCH_SIZE) + 1
    console.log(`Diarizing batch ${batchNum}/${totalBatches} (${batch.length} segments)`)

    const { diarized, speakerContext: newContext } = await diarizeBatch(batch, language, speakerContext)
    allDiarized.push(...diarized)
    speakerContext = newContext
  }

  return allDiarized
}

async function generateSummary(segments: TranscriptSegment[], language: Language): Promise<string> {
  const openai = client()

  const langLabel =
    language === 'id' ? 'Indonesian' : language === 'en' ? 'English' : 'the same language as the transcript'

  // Condense transcript to plain text for summary (no timestamps needed)
  const plainText = segments
    .map((s) => `${s.speaker}: ${s.text}`)
    .join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `Summarize this meeting transcript. Output JSON: {"summary": "3-5 bullet points starting with '- '"}. Summary must be in ${langLabel}. Return ONLY the JSON object.`,
      },
      {
        role: 'user',
        content: plainText.slice(0, 60000), // cap input to avoid token limit
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  try {
    const parsed = JSON.parse(text) as { summary?: string }
    const s = parsed.summary
    return Array.isArray(s) ? s.join('\n') : String(s ?? '')
  } catch {
    return ''
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

    args.onProgress?.('Compressing audio...')
    console.log(`Original size: ${Math.round(args.buffer.length / 1024 / 1024)}MB`)
    const compressedPath = await compressToSpeech(tmpPath)
    tempFiles.push(compressedPath)

    const compressedSize = statSync(compressedPath).size
    console.log(`Compressed to ${Math.round(compressedSize / 1024 / 1024)}MB`)

    let rawSegments: WhisperSegment[] = []

    if (compressedSize <= MAX_WHISPER_BYTES) {
      args.onProgress?.('Transcribing audio...')
      console.log('Single-shot Whisper transcription')
      rawSegments = await runWhisper(compressedPath, args.language)
      console.log(`Whisper returned ${rawSegments.length} raw segments`)
    } else {
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
        rawSegments.push(...chunkSegments)
        console.log(`Chunk ${i + 1} done: ${chunkSegments.length} segments`)
      }
      console.log(`Total raw segments: ${rawSegments.length}`)
    }

    // Merge over-granular Whisper segments before diarization
    const mergedSegments = mergeWhisperSegments(rawSegments)
    console.log(`After merge: ${rawSegments.length} → ${mergedSegments.length} segments`)

    // Diarize in batches to stay within GPT output token limits
    args.onProgress?.('Adding speaker labels...')
    const diarizedSegments = await diarizeInBatches(mergedSegments, args.language)

    // Generate summary separately
    args.onProgress?.('Generating summary...')
    const summary = await generateSummary(diarizedSegments, args.language)

    const uniqueSpeakers = new Set(diarizedSegments.map((s) => s.speaker))
    const detectedLang = args.language === 'auto' ? 'mixed' : args.language

    console.log(`Done: ${diarizedSegments.length} segments, ${uniqueSpeakers.size} speakers`)

    return {
      segments: diarizedSegments,
      speakerCount: uniqueSpeakers.size,
      summary,
      language: detectedLang,
    }
  } finally {
    for (const f of tempFiles) {
      try { if (existsSync(f)) unlinkSync(f) } catch {}
    }
  }
}
