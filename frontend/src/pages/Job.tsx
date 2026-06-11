import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, ShareNetwork, Trash, WarningCircle, XCircle } from '@phosphor-icons/react'
import { ApiError, api, type JobDetail, type ShareJobResponse } from '../lib/api'
import { TranscriptViewer } from '../components/TranscriptViewer'
import { LoadingScreen } from '../components/LoadingScreen'
import { formatBytes, formatDuration, formatRelativeTime } from '../lib/format'
import { useJobPolling } from '../hooks/useJobPolling'

export default function Job() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [initial, setInitial] = useState<JobDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    if (!id) return
    setError(null)
    api
      .get<JobDetail>(`/jobs/${id}`)
      .then(setInitial)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message)
        else setError('Gagal memuat job')
      })
  }, [id])

  const isActive =
    initial?.status === 'uploading' ||
    initial?.status === 'queued' ||
    initial?.status === 'transcribing' ||
    initial?.status === 'pending'
  const { job: polled } = useJobPolling(isActive ? (id ?? null) : null)
  const job = polled ?? initial

  const handleDelete = async (force?: boolean) => {
    if (!id || !job) return
    const isRunning = job.status === 'uploading' || job.status === 'queued' || job.status === 'transcribing' || job.status === 'pending'
    const msg = isRunning
      ? 'Batalkan proses transkrip ini? Job akan dihapus dari riwayat.'
      : 'Hapus transkrip ini dari riwayat? Aksi tidak bisa dibatalkan.'
    if (!force && !confirm(msg)) return

    setDeleting(true)
    try {
      await api.delete(`/jobs/${id}`)
      navigate('/', { replace: true })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus')
      setDeleting(false)
    }
  }

  const handleShare = async () => {
    if (!id || !job) return
    setSharing(true)
    try {
      const data = job.shareToken
        ? { shareToken: job.shareToken, sharePath: `/share/${job.shareToken}` }
        : await api.post<ShareJobResponse>(`/jobs/${id}/share`)
      const shareUrl = `${window.location.origin}${data.sharePath}`

      setInitial((current) => (current ? { ...current, shareToken: data.shareToken } : current))

      if (navigator.share) {
        await navigator.share({
          title: job.filename,
          text: 'Transkrip ALTO',
          url: shareUrl,
        })
      } else {
        await navigator.clipboard.writeText(shareUrl)
      }

      setShared(true)
      setTimeout(() => setShared(false), 1800)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        alert(err instanceof Error ? err.message : 'Gagal membuat link bagikan')
      }
    } finally {
      setSharing(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] grid place-items-center p-6 bg-white">
        <div className="text-center max-w-sm">
          <WarningCircle weight="duotone" size={48} className="mx-auto text-red-500" />
          <p className="mt-3 font-medium">{error}</p>
          <Link to="/" className="btn-ghost mt-6 inline-flex">
            <ArrowLeft size={16} />
            Kembali
          </Link>
        </div>
      </div>
    )
  }

  if (!job) return <LoadingScreen />

  const isRunning = job.status === 'uploading' || job.status === 'queued' || job.status === 'transcribing' || job.status === 'pending'

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 pt-6 pb-24 md:pb-12">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-ink mb-4">
        <ArrowLeft size={14} />
        Semua transkrip
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 22 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-2xl md:text-3xl tracking-tightest font-semibold leading-tight truncate"
              title={job.filename}
            >
              {job.filename}
            </h1>
            <p className="mt-2 text-xs text-zinc-500 tabular-nums">
              {[
                formatRelativeTime(job.createdAt),
                job.durationSec ? formatDuration(job.durationSec) : null,
                job.sizeBytes ? formatBytes(job.sizeBytes) : null,
                job.transcript?.speakerCount ? `${job.transcript.speakerCount} pembicara` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleShare}
              disabled={sharing}
              className="grid place-items-center w-9 h-9 rounded-lg text-zinc-500 hover:text-ink hover:bg-zinc-100 disabled:opacity-40"
              title={shared ? 'Link disalin' : 'Bagikan'}
            >
              {shared ? <Check size={18} weight="bold" /> : <ShareNetwork size={18} />}
            </button>
            <button
              onClick={() => handleDelete()}
              disabled={deleting}
              className={`grid place-items-center w-9 h-9 rounded-lg ${
                isRunning
                  ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50'
                  : 'text-zinc-400 hover:text-red-600 hover:bg-red-50'
              } disabled:opacity-40`}
              title={isRunning ? 'Batalkan & hapus' : 'Hapus'}
            >
              {isRunning ? <XCircle size={20} /> : <Trash size={18} />}
            </button>
          </div>
        </div>
      </motion.div>

      <div className="mt-8">
        {job.status === 'completed' && job.transcript ? (
          <TranscriptViewer transcript={job.transcript} filename={job.filename} />
        ) : job.status === 'failed' || job.status === 'cancelled' ? (
          <div className="card p-8 text-center">
            <WarningCircle weight="duotone" size={48} className="mx-auto text-red-500" />
            <h2 className="mt-4 text-lg font-semibold">
              {job.status === 'cancelled' ? 'Transkrip dibatalkan' : 'Transkrip gagal'}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto break-words">
              {job.status === 'cancelled'
                ? 'Job ini dibatalkan dan kredit estimasi dikembalikan.'
                : job.error || 'Terjadi kesalahan tak dikenal.'}
            </p>
            <button onClick={() => handleDelete()} disabled={deleting} className="btn-ghost mt-6">
              Hapus dari riwayat
            </button>
          </div>
        ) : job.status === 'transcribing' && job.transcript?.segments?.length ? (
          <div>
            <div className="card p-4 mb-4 flex items-center gap-3 bg-amber-50 border-amber-200">
              <div className="flex items-end gap-0.5 h-5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 bg-amber-500 rounded-full animate-pulse-ring"
                    style={{
                      animationDelay: `${i * 120}ms`,
                      height: `${10 + (i % 3) * 6}px`,
                    }}
                  />
                ))}
              </div>
              <p className="text-sm text-amber-800">
                ALTO sedang mendengarkan... ({job.transcript.segments.length} segmen sejauh ini)
              </p>
              <button
                onClick={() => handleDelete()}
                disabled={deleting}
                className="ml-auto inline-flex items-center gap-1 text-xs text-amber-700 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
              >
                <XCircle size={14} />
                Batalkan
              </button>
            </div>
            <TranscriptViewer transcript={job.transcript} filename={job.filename} isPartial />
          </div>
        ) : (
          <div className="card p-12 text-center">
            <div className="flex items-end justify-center gap-1 h-10 mb-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1.5 bg-ink rounded-full animate-pulse-ring"
                  style={{
                    animationDelay: `${i * 120}ms`,
                    height: `${20 + (i % 3) * 12}px`,
                  }}
                />
              ))}
            </div>
            <p className="text-sm text-zinc-600">
              {job.status === 'queued' ? 'Menunggu worker transkrip...' : job.status === 'transcribing' ? 'ALTO sedang mendengarkan...' : 'Memproses...'}
            </p>
            <button
              onClick={() => handleDelete()}
              disabled={deleting}
              className="mt-6 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50"
            >
              <XCircle size={14} />
              Batalkan
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
