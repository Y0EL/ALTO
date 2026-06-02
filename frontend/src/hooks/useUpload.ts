import { useCallback, useRef, useState } from 'react'
import { api } from '../lib/api'

export type UploadStage = 'idle' | 'creating' | 'uploading' | 'queued' | 'error'

export interface UploadState {
  stage: UploadStage
  progress: number
  jobId: string | null
  error: string | null
}

export function useUpload() {
  const [state, setState] = useState<UploadState>({
    stage: 'idle',
    progress: 0,
    jobId: null,
    error: null,
  })
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const reset = useCallback(() => {
    xhrRef.current?.abort()
    xhrRef.current = null
    setState({ stage: 'idle', progress: 0, jobId: null, error: null })
  }, [])

  const start = useCallback(async (file: File, language: 'id' | 'en' | 'auto' = 'auto') => {
    setState({ stage: 'creating', progress: 0, jobId: null, error: null })

    try {
      const { jobId, uploadUrl } = await api.post<{ jobId: string; uploadUrl: string }>('/jobs', {
        filename: file.name,
        mimeType: file.type || guessMimeFromName(file.name),
        sizeBytes: file.size,
        language,
      })

      setState((s) => ({ ...s, stage: 'uploading', jobId }))

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        xhr.open('PUT', `${api.baseUrl}${uploadUrl}`, true)
        xhr.withCredentials = true
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return
          const pct = Math.min(99, Math.round((e.loaded / e.total) * 100))
          setState((s) => ({ ...s, progress: pct }))
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setState((s) => ({ ...s, stage: 'queued', progress: 100 }))
            resolve()
          } else {
            let msg = `Upload gagal (${xhr.status})`
            try {
              const body = JSON.parse(xhr.responseText) as { error?: string }
              if (body?.error) msg = body.error
            } catch {
              // ignore
            }
            reject(new Error(msg))
          }
        }

        xhr.onerror = () => reject(new Error('Koneksi ke server gagal'))
        xhr.onabort = () => reject(new Error('Upload dibatalkan'))
        xhr.send(file)
      })

      return jobId
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload gagal'
      setState((s) => ({ ...s, stage: 'error', error: msg }))
      throw err
    }
  }, [])

  return { state, start, reset }
}

function guessMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'mp3') return 'audio/mp3'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'm4a') return 'audio/aac'
  if (ext === 'aac') return 'audio/aac'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'flac') return 'audio/flac'
  return 'application/octet-stream'
}
