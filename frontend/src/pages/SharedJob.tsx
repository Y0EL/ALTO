import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, WarningCircle } from '@phosphor-icons/react'
import { ApiError, api, type JobDetail } from '../lib/api'
import { LoadingScreen } from '../components/LoadingScreen'
import { TranscriptViewer } from '../components/TranscriptViewer'
import { formatBytes, formatDuration, formatRelativeTime } from '../lib/format'
import { Logo } from '../components/Navbar'

export default function SharedJob() {
  const { token } = useParams<{ token: string }>()
  const [job, setJob] = useState<JobDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    setError(null)
    api
      .get<JobDetail>(`/jobs/shared/${token}`)
      .then(setJob)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message)
        else setError('Gagal memuat link bagikan')
      })
  }, [token])

  if (error) {
    return (
      <div className="min-h-[100dvh] grid place-items-center p-6 bg-white">
        <div className="text-center max-w-sm">
          <WarningCircle weight="duotone" size={48} className="mx-auto text-red-500" />
          <p className="mt-3 font-medium">{error}</p>
          <Link to="/" className="btn-ghost mt-6 inline-flex">
            <ArrowLeft size={16} />
            Beranda ALTO
          </Link>
        </div>
      </div>
    )
  }

  if (!job) return <LoadingScreen />

  const isReady = job.status === 'completed' && job.transcript

  return (
    <div className="min-h-[100dvh] bg-white">
      <header className="border-b border-zinc-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">ALTO</span>
          </Link>
          <span className="text-xs font-medium text-zinc-400">Link publik</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 md:px-8 pt-6 pb-24 md:pb-12">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 22 }}
        >
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
                .join(' Â· ')}
            </p>
          </div>
        </motion.div>

        <div className="mt-8">
          {isReady ? (
            <TranscriptViewer transcript={job.transcript!} filename={job.filename} />
          ) : job.status === 'failed' || job.status === 'cancelled' ? (
            <div className="card p-8 text-center">
              <WarningCircle weight="duotone" size={48} className="mx-auto text-red-500" />
              <h2 className="mt-4 text-lg font-semibold">
                {job.status === 'cancelled' ? 'Transkrip dibatalkan' : 'Transkrip gagal'}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto break-words">
                {job.status === 'cancelled'
                  ? 'Link ini tidak lagi menampilkan transkrip karena job dibatalkan.'
                  : job.error || 'Terjadi kesalahan tak dikenal.'}
              </p>
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
              <p className="text-sm text-zinc-600">Transkrip belum selesai diproses.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
