import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ArrowClockwise, Coin } from '@phosphor-icons/react'
import { UploadZone, type Lang } from '../components/UploadZone'
import { JobStatus } from '../components/JobStatus'
import { HistoryList } from '../components/HistoryList'
import { useUpload } from '../hooks/useUpload'
import { useJobPolling } from '../hooks/useJobPolling'
import { useAuth } from '../hooks/useAuth'
import { MAX_UPLOAD_MB } from '../lib/limits'

function usePullToRefresh(onRefresh: () => void) {
  const startY = useRef(0)
  const pulling = useRef(false)
  const [pullDist, setPullDist] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 0) return
    startY.current = e.touches[0].clientY
    pulling.current = true
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return
    const dist = Math.max(0, Math.min(80, e.touches[0].clientY - startY.current))
    setPullDist(dist)
  }, [])

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return
    pulling.current = false
    if (pullDist >= 60) {
      setRefreshing(true)
      setPullDist(0)
      onRefresh()
      setTimeout(() => setRefreshing(false), 800)
    } else {
      setPullDist(0)
    }
  }, [pullDist, onRefresh])

  return { pullDist, refreshing, onTouchStart, onTouchMove, onTouchEnd }
}

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { state, start, reset } = useUpload()
  const { job } = useJobPolling(state.jobId)
  const [historyKey, setHistoryKey] = useState(0)

  const refreshHistory = useCallback(() => setHistoryKey((k) => k + 1), [])
  const { pullDist, refreshing, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(refreshHistory)

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

  const scrollToUpload = () => {
    document.getElementById('upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const showHero = state.stage === 'idle'
  const showStatus =
    state.stage === 'creating' ||
    state.stage === 'uploading' ||
    state.stage === 'queued' ||
    state.stage === 'error' ||
    !!job

  return (
    <div
      className="min-h-[100dvh] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-16 bg-white"
      onTouchStart={showHero ? onTouchStart : undefined}
      onTouchMove={showHero ? onTouchMove : undefined}
      onTouchEnd={showHero ? onTouchEnd : undefined}
    >
      {/* Pull-to-refresh indicator */}
      <AnimatePresence>
        {(pullDist > 0 || refreshing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-14 inset-x-0 z-20 flex justify-center pointer-events-none"
            style={{ transform: `translateY(${Math.min(pullDist * 0.5, 20)}px)` }}
          >
            <div className="bg-ink text-white rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium shadow-lg">
              <ArrowClockwise
                size={14}
                weight="bold"
                className={refreshing ? 'animate-spin' : ''}
                style={!refreshing ? { transform: `rotate(${pullDist * 3}deg)` } : undefined}
              />
              {refreshing ? 'Memuat ulang…' : pullDist >= 60 ? 'Lepas untuk refresh' : 'Tarik untuk refresh'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              Upload audio meeting hingga {MAX_UPLOAD_MB} MB. Dapatkan transkrip dengan timestamp dan label
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
        <section id="upload" className="mx-auto max-w-3xl px-4 md:px-8 mt-10 md:mt-14">
          {user?.creditSeconds === 0 ? (
            <div className="card p-8 text-center shadow-sm">
              <div className="grid place-items-center w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 mx-auto mb-4">
                <Coin weight="duotone" size={28} className="text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">Kredit habis</h3>
              <p className="mt-2 text-sm text-zinc-500 leading-relaxed max-w-xs mx-auto">
                Kamu tidak punya kredit tersisa. Hubungi admin untuk topup dan lanjutkan transkrip.
              </p>
            </div>
          ) : (
            <UploadZone onStart={handleStart} disabled={state.stage !== 'idle'} />
          )}
        </section>
      )}

      {showHero && (
        <section id="history" className="mx-auto max-w-3xl px-4 md:px-8 mt-16 md:mt-24">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-xl tracking-tight font-semibold">Riwayat</h2>
            <span className="text-xs text-zinc-400">milik {user?.username}</span>
          </div>
          <HistoryList refreshKey={historyKey} />
        </section>
      )}

      {/* FAB — mobile only, visible when idle */}
      <AnimatePresence>
        {showHero && user?.creditSeconds !== 0 && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            whileTap={{ scale: 0.92 }}
            onClick={scrollToUpload}
            className="md:hidden fixed right-5 z-40 w-14 h-14 rounded-full bg-ink text-white shadow-xl grid place-items-center"
            style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
            aria-label="Upload baru"
          >
            <Plus size={24} weight="bold" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
