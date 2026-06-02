import { Redis } from '@upstash/redis'

let _redis: Redis | null = null

export function getRedis(): Redis | null {
  if (_redis) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  _redis = new Redis({ url, token })
  return _redis
}

const STATUS_TTL_SEC = 60 * 30

export async function cacheJobStatus(jobId: string, status: unknown): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(`job:${jobId}:status`, JSON.stringify(status), { ex: STATUS_TTL_SEC })
  } catch (err) {
    console.warn('Redis cacheJobStatus failed:', err)
  }
}

export async function getCachedJobStatus(jobId: string): Promise<unknown | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get<string>(`job:${jobId}:status`)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (err) {
    console.warn('Redis getCachedJobStatus failed:', err)
    return null
  }
}
