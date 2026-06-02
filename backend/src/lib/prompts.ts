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

export const STRICT_RETRY_PROMPT = `Your previous response was not valid JSON. Return ONLY the JSON object with the exact shape specified previously. No markdown, no commentary, no code fences. Start your response with { and end with }.`
