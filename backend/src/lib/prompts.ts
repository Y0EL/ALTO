export type Language = 'id' | 'en' | 'auto'

export function buildTranscriptionPrompt(language: Language): string {
  const langLabel =
    language === 'id'
      ? 'Indonesian (Bahasa Indonesia)'
      : language === 'en'
        ? 'English'
        : 'the language spoken in the audio (auto-detect; Indonesian or English are most likely)'

  return `You are a professional meeting transcriber.
Transcribe the following meeting audio in ${langLabel}.

Output STRICT JSON ONLY (no markdown code fences, no commentary, no preamble) with EXACTLY this shape:
{
  "segments": [
    {"start": "MM:SS", "end": "MM:SS", "speaker": "Speaker 1", "text": "..."}
  ],
  "speakerCount": <integer>,
  "summary": "3-5 bullet points (each starting with '- ') of key decisions, topics, and action items",
  "language": "id" | "en" | "mixed"
}

Rules:
- Identify distinct speakers by voice characteristics (pitch, cadence, accent). Label sequentially: "Speaker 1", "Speaker 2", etc.
- KEEP THE SAME SPEAKER LABEL CONSISTENT across the whole transcript — once Speaker 1 is identified, every later turn from the same voice must use "Speaker 1".
- If only one voice is detected, use "Speaker 1" for all segments.
- Segment by natural speaker turns or pauses (~10-30 seconds each). Do NOT merge multiple speakers into one segment.
- For Indonesian: use formal spelling (NOT SMS/gaul form like "yg", "krn", "gw"). Preserve any English code-switching words as-is.
- Preserve filler words ("uhh", "kayak", "gitu", "nah") ONLY if they carry meaning in context, otherwise omit.
- Use MM:SS timestamps (or HH:MM:SS if the audio exceeds 1 hour).
- The summary must be in the SAME LANGUAGE as the majority of the transcript.

Return ONLY the JSON object. No other text.`
}

export function buildChunkPrompt(language: Language, chunkIndex: number, startOffsetSec: number, endOffsetSec: number, isLast: boolean): string {
  const langLabel =
    language === 'id'
      ? 'Indonesian (Bahasa Indonesia)'
      : language === 'en'
        ? 'English'
        : 'the language spoken in the audio (auto-detect; Indonesian or English are most likely)'

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }

  return `You are a professional meeting transcriber.
Transcribe ONLY the portion of this audio from ${formatTime(startOffsetSec)} to ${formatTime(endOffsetSec)} in ${langLabel}.
This is chunk ${chunkIndex + 1} of a longer recording.${isLast ? ' This is the FINAL chunk.' : ''}

Output STRICT JSON ONLY with this shape:
{
  "segments": [
    {"start": "MM:SS", "end": "MM:SS", "speaker": "Speaker 1", "text": "..."}
  ],
  "speakerCount": <integer>
}

Rules:
- ONLY transcribe audio between ${formatTime(startOffsetSec)} and ${formatTime(endOffsetSec)}. Ignore audio outside this range.
- Use ABSOLUTE timestamps from the original audio (not relative to chunk start).
- Identify distinct speakers by voice. Label as "Speaker 1", "Speaker 2", etc.
- Keep speaker labels consistent within this chunk.
- Segment by natural speaker turns (~10-30 seconds each).
- For Indonesian: use formal spelling. Preserve English code-switching as-is.
- Use HH:MM:SS format if timestamps exceed 59:59, otherwise MM:SS.

Return ONLY the JSON object. No other text.`
}

export const STRICT_RETRY_PROMPT = `Your previous response was not valid JSON. Return ONLY the JSON object with the exact shape specified previously. No markdown, no commentary, no code fences. Start your response with { and end with }.`
