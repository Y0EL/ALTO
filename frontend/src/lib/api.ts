const BASE_URL = ((import.meta.env.VITE_API_URL as string) || 'http://localhost:3000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    let body: { error?: string; detail?: unknown } | null = null
    try {
      body = await res.json()
    } catch {
      // ignore
    }
    throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`, body?.detail)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  baseUrl: BASE_URL,
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// === Types ===
export interface SessionUser {
  id: string
  username: string
  isAdmin: boolean
  creditSeconds: number
}

export interface UserStats {
  totalDurationSec: number
  latestDurationSec: number
  totalJobs: number
  creditSeconds: number
  estimatedCostUSD: number
  memberSince: string | null
}

export interface JobSummary {
  id: string
  filename: string
  durationSec: number | null
  sizeBytes: number | null
  language: string
  status: 'pending' | 'uploading' | 'transcribing' | 'completed' | 'failed'
  createdAt: string
  completedAt: string | null
  speakerCount: number | null
}

export interface TranscriptSegment {
  start: string
  end: string
  speaker: string
  text: string
}

export interface TranscriptPayload {
  segments: TranscriptSegment[]
  speakerCount: number
  summary: string
  language: 'id' | 'en' | 'mixed'
}

export interface JobDetail {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number | null
  durationSec: number | null
  language: string
  status: JobSummary['status']
  transcript: TranscriptPayload | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

export interface JobStatusPayload {
  id: string
  status: JobSummary['status']
  progress?: number
  error?: string
}

export interface ManagedUser {
  id: string
  username: string
  isAdmin: boolean
  creditSeconds: number
  createdAt: string
}
