import { useEffect, useState } from 'react'
import { api, type JobDetail } from '../lib/api'

export function useJobPolling(jobId: string | null, opts?: { intervalMs?: number }) {
  const [job, setJob] = useState<JobDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const interval = opts?.intervalMs ?? 3000

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const data = await api.get<JobDetail>(`/jobs/${jobId}`)
        if (cancelled) return
        setJob(data)
        setError(null)
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') return
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Gagal mengambil status')
      }
      timer = setTimeout(tick, interval)
    }

    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId, interval])

  return { job, error }
}
