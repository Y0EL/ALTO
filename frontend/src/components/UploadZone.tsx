import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadSimple, MusicNote, X, Globe, CaretDown } from '@phosphor-icons/react'
import { formatBytes } from '../lib/format'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../lib/limits'

const ACCEPT_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']

export type Lang = 'id' | 'en' | 'auto'

interface Props {
  onStart: (file: File, language: Lang) => void
  disabled?: boolean
}

export function UploadZone({ onStart, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [lang, setLang] = useState<Lang>('auto')
  const inputRef = useRef<HTMLInputElement>(null)

  const validate = (f: File): string | null => {
    const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '')
    if (!ACCEPT_EXT.includes(ext)) {
      return `Format ${ext} belum didukung. Pakai ${ACCEPT_EXT.join(', ')}`
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      return `File terlalu besar (${formatBytes(f.size)}). Max ${MAX_UPLOAD_MB} MB`
    }
    if (f.size === 0) return 'File kosong'
    return null
  }

  const handleFile = (f: File) => {
    const err = validate(f)
    if (err) {
      setError(err)
      setFile(null)
      return
    }
    setError(null)
    setFile(f)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const submit = () => {
    if (!file) return
    onStart(file, lang)
  }

  return (
    <div className="card p-5 sm:p-7 shadow-sm">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_EXT.join(',') + ',audio/*'}
        onChange={onChange}
        className="sr-only"
      />

      {!file ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative rounded-2xl border-2 border-dashed transition-colors ${
            dragging ? 'border-ink bg-zinc-50' : 'border-zinc-200 bg-zinc-50/50'
          } p-8 sm:p-12 text-center`}
        >
          <div className="grid place-items-center w-14 h-14 rounded-2xl bg-white border border-zinc-200 mx-auto mb-5 shadow-sm">
            <UploadSimple weight="bold" size={22} className="text-ink" />
          </div>

          <h3 className="text-lg font-semibold tracking-tight">
            Drop file audio rapat di sini
          </h3>
          <p className="mt-1.5 text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed">
            <span className="hidden sm:inline">Atau </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="underline underline-offset-4 decoration-zinc-400 hover:decoration-ink text-ink font-medium"
            >
              pilih dari perangkat
            </button>
            . Max {MAX_UPLOAD_MB} MB · {ACCEPT_EXT.map((e) => e.slice(1)).join(' · ')}
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn-primary mt-6 w-full sm:hidden"
          >
            <UploadSimple weight="bold" size={18} />
            Pilih File Audio
          </button>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </motion.div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={file.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200"
            >
              <div className="grid place-items-center w-12 h-12 rounded-xl bg-white border border-zinc-200 flex-shrink-0">
                <MusicNote weight="duotone" size={22} className="text-ink" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                  {formatBytes(file.size)} · {file.type || 'audio'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  if (inputRef.current) inputRef.current.value = ''
                }}
                className="grid place-items-center w-9 h-9 rounded-lg hover:bg-zinc-200 text-zinc-500"
                aria-label="Hapus file"
              >
                <X size={18} />
              </button>
            </motion.div>
          </AnimatePresence>

          <div>
            <label className="label">Bahasa audio</label>
            <div className="relative">
              <Globe
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="input appearance-none pl-10 pr-10 cursor-pointer"
              >
                <option value="auto">Deteksi otomatis</option>
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
              <CaretDown
                size={16}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              />
            </div>
          </div>

          <button type="button" onClick={submit} disabled={disabled} className="btn-primary w-full sm:w-auto">
            Mulai Transkrip
          </button>
        </div>
      )}
    </div>
  )
}
