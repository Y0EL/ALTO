import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UploadZone, type Lang } from '../components/UploadZone'
import { JobStatus } from '../components/JobStatus'
import { HistoryList } from '../components/HistoryList'
import { useUpload } from '../hooks/useUpload'
import { useJobPolling } from '../hooks/useJobPolling'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { state, start, reset } = useUpload()
  const { job } = useJobPolling(state.jobId)
  const [historyKey, setHistoryKey] = useState(0)

  const handleStart = async (file: File, lang: Lang) => {
    try {
      await start(file, lang)
    } catch {
      // already in state.error
    }
  }

  const handleReset = () => {
    reset()
    setHistoryKey((k) => k + 1)
  }

  const handleViewTranscript = () => {
    if (state.jobId) navigate(`/job/${state.jobId}`)
  }

  const showHero = state.stage === 'idle'
  const showStatus =
    state.stage === 'creating' ||
    state.stage === 'uploading' ||
    state.stage === 'queued' ||
    state.stage === 'error' ||
    !!job

  return (
    <div className="min-h-[100dvh] pb-16 bg-white">
      {showHero && (
        <section className="mx-auto max-w-3xl px-4 md:px-8 pt-12 md:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 100, damping: 22 }}
          >
            <p className="eyebrow mb-5">Hai, {user?.username}</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl tracking-tightest leading-[1] font-semibold">
              Rapat panjang.
              <br />
              <span className="text-zinc-400">Transkrip rapi.</span>
            </h1>
            <p className="mt-5 text-[15px] sm:text-base text-zinc-600 leading-relaxed max-w-[52ch]">
              Upload audio meeting hingga 9.5 jam. Dapatkan transkrip dengan timestamp dan label
              pembicara, langsung bisa di-copy atau di-export.
            </p>
          </motion.div>
        </section>
      )}

      {showStatus && (
        <section className="mx-auto max-w-3xl px-4 md:px-8 pt-12 md:pt-24">
          <JobStatus
            upload={state}
            job={job}
            onReset={handleReset}
            onViewTranscript={handleViewTranscript}
          />
        </section>
      )}

      {showHero && (
        <section className="mx-auto max-w-3xl px-4 md:px-8 mt-10 md:mt-14">
          <UploadZone onStart={handleStart} disabled={state.stage !== 'idle'} />
        </section>
      )}

      {showHero && (
        <section className="mx-auto max-w-3xl px-4 md:px-8 mt-16 md:mt-24">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-xl tracking-tight font-semibold">Riwayat</h2>
            <span className="text-xs text-zinc-400">milik {user?.username}</span>
          </div>
          <HistoryList refreshKey={historyKey} />
        </section>
      )}
    </div>
  )
}
