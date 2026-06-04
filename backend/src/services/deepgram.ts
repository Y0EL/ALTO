import OpenAI from 'openai'
import type { TranscriptPayload, TranscriptSegment } from '../db/schema.js'
import type { Language } from '../lib/prompts.js'

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1/listen'

function dgKey(): string {
  const k = process.env.DEEPGRAM_API_KEY
  if (!k) throw new Error('DEEPGRAM_API_KEY is required')
  return k
}

function openaiClient(): OpenAI {
  const k = process.env.OPENAI_API_KEY
  if (!k) throw new Error('OPENAI_API_KEY is required')
  return new OpenAI({ apiKey: k })
}

function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

interface DgWord {
  word: string
  start: number
  end: number
  speaker?: number
  punctuated_word?: string
}

interface DgResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        words?: DgWord[]
        transcript?: string
      }>
    }>
  }
}

// Group word-level Deepgram output into speaker segments
function wordsToSegments(words: DgWord[]): TranscriptSegment[] {
  if (words.length === 0) return []

  const segments: TranscriptSegment[] = []
  let current: { start: number; end: number; speaker: number; words: string[] } = {
    start: words[0].start,
    end: words[0].end,
    speaker: words[0].speaker ?? 0,
    words: [words[0].punctuated_word ?? words[0].word],
  }

  for (let i = 1; i < words.length; i++) {
    const w = words[i]
    const spk = w.speaker ?? 0
    const gap = w.start - current.end

    // New segment on speaker change or long silence (>2s)
    if (spk !== current.speaker || gap > 2) {
      segments.push({
        start: formatTimestamp(current.start),
        end: formatTimestamp(current.end),
        speaker: `Speaker ${current.speaker + 1}`,
        text: current.words.join(' ').trim(),
      })
      current = { start: w.start, end: w.end, speaker: spk, words: [w.punctuated_word ?? w.word] }
    } else {
      current.end = w.end
      current.words.push(w.punctuated_word ?? w.word)
    }
  }

  // Push last segment
  if (current.words.length > 0) {
    segments.push({
      start: formatTimestamp(current.start),
      end: formatTimestamp(current.end),
      speaker: `Speaker ${current.speaker + 1}`,
      text: current.words.join(' ').trim(),
    })
  }

  return segments.filter((s) => s.text.length > 0)
}

async function generateSummary(segments: TranscriptSegment[], language: Language): Promise<string> {
  const openai = openaiClient()
  const langLabel = language === 'id' ? 'Indonesian' : language === 'en' ? 'English' : 'the same language as the transcript'

  const plainText = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n').slice(0, 60000)

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `Summarize this meeting transcript. Output JSON: {"summary": "3-5 bullet points each starting with '- '"}. Summary in ${langLabel}. Return ONLY the JSON.`,
        },
        { role: 'user', content: plainText },
      ],
    })
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { summary?: unknown }
    const s = parsed.summary
    return Array.isArray(s) ? s.join('\n') : String(s ?? '')
  } catch (err) {
    console.warn('Summary generation failed:', err)
    return ''
  }
}

export async function transcribeWithDeepgram(args: {
  buffer: Buffer
  mimeType: string
  language: Language
  onProgress?: (step: string) => void
}): Promise<TranscriptPayload> {
  const key = dgKey()

  const dgLang = args.language === 'id' ? 'id' : args.language === 'en' ? 'en' : 'id'

  const params = new URLSearchParams({
    model: 'nova-2',
    language: dgLang,
    diarize: 'true',
    punctuate: 'true',
    smart_format: 'true',
    utterances: 'false',
  })

  args.onProgress?.('Transcribing audio...')
  console.log(`Sending ${Math.round(args.buffer.length / 1024 / 1024)}MB to Deepgram (lang: ${dgLang})`)

  const res = await fetch(`${DEEPGRAM_BASE}?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': args.mimeType,
    },
    body: args.buffer,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deepgram transcription failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as DgResponse
  const words = data.results?.channels?.[0]?.alternatives?.[0]?.words ?? []
  console.log(`Deepgram returned ${words.length} words`)

  if (words.length === 0) throw new Error('Deepgram returned empty transcript')

  args.onProgress?.('Processing speaker labels...')
  const segments = wordsToSegments(words)
  console.log(`Grouped into ${segments.length} segments`)

  args.onProgress?.('Generating summary...')
  const summary = await generateSummary(segments, args.language)

  const uniqueSpeakers = new Set(segments.map((s) => s.speaker))

  return {
    segments,
    speakerCount: uniqueSpeakers.size,
    summary,
    language: args.language === 'auto' ? 'mixed' : args.language,
  }
}
