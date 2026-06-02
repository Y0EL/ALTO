export const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/aac',
  'audio/x-m4a',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
])

export const MAX_FILE_BYTES = 1.5 * 1024 * 1024 * 1024

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_AUDIO_MIMES.has(mime.toLowerCase())
}

export function normalizeMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m === 'audio/mpeg') return 'audio/mp3'
  if (m === 'audio/x-wav' || m === 'audio/wave') return 'audio/wav'
  if (m === 'audio/x-m4a' || m === 'audio/mp4') return 'audio/aac'
  if (m === 'audio/x-flac') return 'audio/flac'
  return m
}
