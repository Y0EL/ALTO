import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, DownloadSimple, MagnifyingGlass, Check } from '@phosphor-icons/react'
import type { TranscriptPayload } from '../lib/api'
import { speakerColor, parseTimestamp } from '../lib/format'

interface Props {
  transcript: TranscriptPayload
  filename: string
  isPartial?: boolean
}

export function TranscriptViewer({ transcript, filename, isPartial }: Props) {
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<'all' | 'segment' | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return transcript.segments
    const q = query.toLowerCase()
    return transcript.segments.filter(
      (s) => s.text.toLowerCase().includes(q) || s.speaker.toLowerCase().includes(q)
    )
  }, [transcript.segments, query])

  const copyAll = async () => {
    const text = transcript.segments
      .map((s) => `[${s.start}] ${s.speaker}: ${s.text}`)
      .join('\n\n')
    await navigator.clipboard.writeText(text)
    setCopied('all')
    setTimeout(() => setCopied(null), 1500)
  }

  const copySegment = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied('segment')
    setTimeout(() => setCopied(null), 1000)
  }

  const downloadTxt = () => {
    const text = transcript.segments
      .map((s) => `[${s.start}] ${s.speaker}: ${s.text}`)
      .join('\n\n')
    triggerDownload(text, `${stripExt(filename)}.txt`, 'text/plain')
  }

  const downloadSrt = () => {
    const lines = transcript.segments.map((s, i) => {
      const start = toSrtTime(s.start)
      const end = toSrtTime(s.end)
      return `${i + 1}\n${start} --> ${end}\n${s.speaker}: ${s.text}`
    })
    triggerDownload(lines.join('\n\n'), `${stripExt(filename)}.srt`, 'text/plain')
  }

  const summaryLines = String(Array.isArray(transcript.summary) ? transcript.summary.join('\n') : (transcript.summary ?? ''))
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)

  return (
    <div className="space-y-6">
      {summaryLines.length > 0 && (
        <div className="card p-5 sm:p-7">
          <h3 className="eyebrow mb-3">Ringkasan</h3>
          <ul className="space-y-2.5">
            {summaryLines.map((line, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex gap-3 text-[15px] text-ink leading-relaxed"
              >
                <span className="text-zinc-300 select-none mt-2 w-1 h-1 rounded-full bg-zinc-400 flex-shrink-0" />
                <span>{line}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky top-14 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-white/95 backdrop-blur border-b border-zinc-200/80 sm:rounded-xl sm:border sm:bg-white sm:py-2 sm:px-3 sm:shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari di transkrip…"
              className="w-full rounded-lg border border-zinc-200 sm:border-0 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-zinc-900/5"
            />
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={copyAll}
              className="grid place-items-center w-9 h-9 rounded-lg hover:bg-zinc-100 text-zinc-700"
              title="Salin semua"
            >
              {copied === 'all' ? <Check size={16} weight="bold" /> : <Copy size={16} />}
            </button>
            <button
              onClick={downloadTxt}
              className="px-3 h-9 rounded-lg hover:bg-zinc-100 text-sm font-medium text-zinc-700 flex items-center gap-1.5"
              title="Download TXT"
            >
              <DownloadSimple size={16} />
              TXT
            </button>
            <button
              onClick={downloadSrt}
              className="px-3 h-9 rounded-lg hover:bg-zinc-100 text-sm font-medium text-zinc-700 flex items-center gap-1.5"
              title="Download SRT"
            >
              SRT
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-12">
            Tidak ada hasil untuk "{query}"
          </p>
        ) : (
          filtered.map((seg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className="group rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 transition-colors overflow-hidden"
            >
              <div className="grid sm:grid-cols-[auto_1fr] gap-3 sm:gap-5 p-4 sm:p-5">
                <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 flex-shrink-0 sm:w-32">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${speakerColor(seg.speaker)}`}
                  >
                    {seg.speaker}
                  </span>
                  <span className="text-[11px] text-zinc-400 tabular-nums">
                    {seg.start}
                    <span className="hidden sm:inline"> → {seg.end}</span>
                  </span>
                </div>
                <p className="text-[15px] leading-relaxed text-ink">{highlight(seg.text, query)}</p>
              </div>
              <button
                onClick={() => copySegment(seg.text)}
                className="px-4 py-2 w-full text-left text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 border-t border-zinc-100 transition-colors opacity-0 group-hover:opacity-100 sm:flex items-center justify-end gap-1 hidden"
              >
                <Copy size={12} />
                Salin segmen
              </button>
            </motion.div>
          ))
        )}
      </div>

      <div className="sm:hidden fixed inset-x-0 z-[35] px-4 pt-3 bg-gradient-to-t from-white via-white to-white/0"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 rounded-2xl bg-ink p-2 shadow-xl">
          <button
            onClick={copyAll}
            className="flex-1 py-2.5 rounded-xl text-sm text-white font-medium flex items-center justify-center gap-1.5 hover:bg-zinc-800"
          >
            {copied === 'all' ? <Check size={16} weight="bold" /> : <Copy size={16} />}
            Salin
          </button>
          <button
            onClick={downloadTxt}
            className="flex-1 py-2.5 rounded-xl text-sm text-white font-medium flex items-center justify-center gap-1.5 hover:bg-zinc-800"
          >
            <DownloadSimple size={16} />
            TXT
          </button>
          <button
            onClick={downloadSrt}
            className="flex-1 py-2.5 rounded-xl text-sm text-white font-medium flex items-center justify-center gap-1.5 hover:bg-zinc-800"
          >
            SRT
          </button>
        </div>
      </div>
    </div>
  )
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const q = query.trim()
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let idx = lower.indexOf(ql)
  while (idx >= 0) {
    if (idx > i) parts.push(text.slice(i, idx))
    parts.push(
      <mark key={i + '-' + idx} className="bg-zinc-900 text-white rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
    )
    i = idx + q.length
    idx = lower.indexOf(ql, i)
  }
  if (i < text.length) parts.push(text.slice(i))
  return parts
}

function stripExt(name: string) {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(0, idx) : name
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toSrtTime(ts: string): string {
  const sec = parseTimestamp(ts)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${pad(h)}:${pad(m)}:${pad(s)},000`
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}
