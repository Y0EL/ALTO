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

const STATS_TTL_SEC = 300
const WORKER_HEARTBEAT_TTL_SEC = 60

export async function cacheUserStats(userId: string, stats: unknown): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(`user:stats:${userId}`, JSON.stringify(stats), { ex: STATS_TTL_SEC })
  } catch (err) {
    console.warn('Redis cacheUserStats failed:', err)
  }
}

export async function getCachedUserStats(userId: string): Promise<unknown | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get<string>(`user:stats:${userId}`)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (err) {
    console.warn('Redis getCachedUserStats failed:', err)
    return null
  }
}

export async function invalidateUserStats(userId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(`user:stats:${userId}`)
  } catch (err) {
    console.warn('Redis invalidateUserStats failed:', err)
  }
}

export async function setWorkerHeartbeat(workerId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set('worker:heartbeat', JSON.stringify({
      workerId,
      at: new Date().toISOString(),
    }), { ex: WORKER_HEARTBEAT_TTL_SEC })
  } catch (err) {
    console.warn('Redis setWorkerHeartbeat failed:', err)
  }
}

export async function getWorkerHeartbeat(): Promise<{ workerId: string; at: string } | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get<string>('worker:heartbeat')
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (err) {
    console.warn('Redis getWorkerHeartbeat failed:', err)
    return null
  }
}

export async function checkRedis(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  try {
    await redis.set('health:redis', 'ok', { ex: 30 })
    return (await redis.get<string>('health:redis')) === 'ok'
  } catch (err) {
    console.warn('Redis health check failed:', err)
    return false
  }
}
