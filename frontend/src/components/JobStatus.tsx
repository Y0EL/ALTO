import { motion } from 'framer-motion'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import type { JobDetail } from '../lib/api'
import type { UploadState } from '../hooks/useUpload'
import { WaveformBars } from './animations/WaveformBars'
import { MicTranscribing } from './animations/MicTranscribing'
import { SuccessCheck } from './animations/SuccessCheck'
import { LottiePlayer } from './LottiePlayer'

interface Props {
  upload: UploadState
  job: JobDetail | null
  onReset: () => void
  onViewTranscript: () => void
}

type Phase = 'idle' | 'uploading' | 'transcribing' | 'completed' | 'failed'

function derivePhase(
  upload: UploadState,
  job: JobDetail | null
): { phase: Phase; progress: number; message: string; detail: string } {
  if (job?.status === 'completed') {
    return {
      phase: 'completed',
      progress: 100,
      message: 'Transkrip selesai',
      detail: `${job.transcript?.segments.length ?? 0} segmen - ${job.transcript?.speakerCount ?? 1} pembicara`,
    }
  }

  if (job?.status === 'failed' || job?.status === 'cancelled' || upload.stage === 'error') {
    return {
      phase: 'failed',
      progress: 0,
      message: job?.status === 'cancelled' ? 'Dibatalkan' : 'Gagal',
      detail:
        job?.status === 'cancelled'
          ? 'Transkrip dibatalkan dan kredit dikembalikan.'
          : job?.error ?? upload.error ?? 'Terjadi kesalahan',
    }
  }

  if (upload.stage === 'creating' || upload.stage === 'uploading') {
    return {
      phase: 'uploading',
      progress: upload.progress,
      message: 'Mengupload audio',
      detail: `${upload.progress}% terkirim`,
    }
  }

  if (
    job?.status === 'queued' ||
    job?.status === 'transcribing' ||
    job?.status === 'uploading' ||
    upload.stage === 'queued'
  ) {
    return {
      phase: 'transcribing',
      progress: job?.progress ?? (job?.status === 'queued' ? 20 : 60),
      message: job?.status === 'queued' ? 'Masuk antrian' : 'ALTO sedang mendengarkan',
      detail:
        job?.status === 'queued'
          ? 'Audio sudah terkirim dan menunggu worker transkrip.'
          : 'Mengidentifikasi pembicara dan menulis transkrip...',
    }
  }

  return { phase: 'idle', progress: 0, message: '', detail: '' }
}

export function JobStatus({ upload, job, onReset, onViewTranscript }: Props) {
  const { phase, progress, message, detail } = derivePhase(upload, job)

  if (phase === 'idle') return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="card p-6 sm:p-10 overflow-hidden shadow-sm"
    >
      <div className="flex flex-col items-center gap-6 sm:grid sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
        <div className="grid place-items-center w-44 h-44 flex-shrink-0">
          {phase === 'uploading' && (
            <LottiePlayer
              className="w-44 h-44"
              fallback={<WaveformBars bars={9} className="w-40 h-24" />}
            />
          )}
          {phase === 'transcribing' && (
            <LottiePlayer
              className="w-44 h-44"
              fallback={<MicTranscribing size={92} />}
            />
          )}
          {phase === 'completed' && (
            <LottiePlayer
              className="w-44 h-44"
              fallback={<SuccessCheck size={92} />}
            />
          )}
          {phase === 'failed' && (
            <div className="grid place-items-center w-24 h-24 rounded-full bg-red-50 border border-red-200">
              <WarningCircle weight="duotone" size={48} className="text-red-500" />
            </div>
          )}
        </div>

        <div className="text-center sm:text-left w-full">
          <p className="eyebrow">
            {phase === 'uploading' && 'Langkah 1 dari 2'}
            {phase === 'transcribing' && (job?.status === 'queued' ? 'Antrian' : 'Langkah 2 dari 2')}
            {phase === 'completed' && 'Selesai'}
            {phase === 'failed' && 'Gagal'}
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl tracking-tightest font-semibold leading-tight">
            {message}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto sm:mx-0 leading-relaxed">
            {detail}
          </p>

          {(phase === 'uploading' || phase === 'transcribing') && (
            <div className="mt-5 max-w-md mx-auto sm:mx-0 w-full">
              <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                <motion.div
                  className="h-full bg-ink rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 22 }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>{phase === 'uploading' ? 'Mengirim' : job?.status === 'queued' ? 'Menunggu' : 'Memproses'}</span>
                <span className="tabular-nums">{Math.round(progress)}%</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3 justify-center sm:justify-start">
            {phase === 'completed' && (
              <>
                <button onClick={onViewTranscript} className="btn-primary">
                  <CheckCircle weight="bold" size={16} />
                  Lihat Transkrip
                </button>
                <button onClick={onReset} className="btn-ghost">
                  Transkrip lagi
                </button>
              </>
            )}
            {phase === 'failed' && (
              <button onClick={onReset} className="btn-primary">
                Coba lagi
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
