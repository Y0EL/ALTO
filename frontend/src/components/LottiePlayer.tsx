import { lazy, memo, Suspense, useEffect, useState, type ReactNode } from 'react'

const Lottie = lazy(() => import('lottie-react'))

interface Props {
  /** Optional: URL ke file Lottie JSON. Jika tidak ada → fallback dipakai. */
  src?: string
  /** Optional: data JSON langsung (lebih disukai daripada src) */
  animationData?: object
  /** Komponen fallback (SVG/Framer) saat src belum tersedia atau gagal load. */
  fallback: ReactNode
  className?: string
  loop?: boolean
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const LottiePlayer = memo(function LottiePlayer({
  src,
  animationData,
  fallback,
  className = '',
  loop = true,
}: Props) {
  const [loadedData, setLoadedData] = useState<object | null>(animationData ?? null)
  const [failed, setFailed] = useState(false)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (animationData || !src || reduced) return
    let cancelled = false
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!cancelled) setLoadedData(json)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [src, animationData, reduced])

  if (reduced || failed || (!animationData && !loadedData)) {
    return <div className={className}>{fallback}</div>
  }

  return (
    <div className={className}>
      <Suspense fallback={<div className={className}>{fallback}</div>}>
        <Lottie animationData={loadedData ?? animationData} loop={loop} />
      </Suspense>
    </div>
  )
})
