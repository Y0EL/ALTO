export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}j ${m}m`
  if (m > 0) return `${m}m ${s}d`
  return `${s}d`
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 0) return 'baru saja'
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes}m lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}j lalu`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}h lalu`
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(parts[0]) || 0
}

const SPEAKER_STYLES = [
  'bg-zinc-900 text-white border-zinc-900',
  'bg-white text-zinc-900 border-zinc-300',
  'bg-zinc-100 text-zinc-900 border-zinc-200',
  'bg-zinc-200 text-zinc-900 border-zinc-300',
  'bg-zinc-50 text-zinc-700 border-zinc-200',
  'bg-zinc-300 text-zinc-900 border-zinc-400',
]

export function speakerColor(label: string): string {
  const match = label.match(/(\d+)/)
  const n = match ? Number(match[1]) - 1 : 0
  return SPEAKER_STYLES[n % SPEAKER_STYLES.length]
}
