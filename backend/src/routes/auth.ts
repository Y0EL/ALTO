import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { z } from 'zod'
import { eq, and, sum, max, count } from 'drizzle-orm'
import {
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  deleteSession,
  findUserByUsername,
  verifyPassword,
} from '../services/auth.js'
import { requireAuth, type AppEnv } from '../middleware/auth.js'
import { db } from '../db/client.js'
import { jobs, users } from '../db/schema.js'
import { cacheUserStats, getCachedUserStats, getRedis } from '../services/redis.js'

const DEEPGRAM_COST_PER_MIN = 0.0043
const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10)
const LOGIN_RATE_LIMIT_WINDOW_SEC = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SEC ?? 15 * 60)
const memoryLoginAttempts = new Map<string, { count: number; resetAt: number }>()

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
})

export const authRouter = new Hono<AppEnv>()

authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)

  const rateLimitKey = loginRateLimitKey(c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'local', parsed.data.username)
  if (await isLoginRateLimited(rateLimitKey)) {
    return c.json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' }, 429)
  }

  const user = await findUserByUsername(parsed.data.username.trim())
  if (!user) {
    await recordFailedLogin(rateLimitKey)
    return c.json({ error: 'Username atau password salah' }, 401)
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!ok) {
    await recordFailedLogin(rateLimitKey)
    return c.json({ error: 'Username atau password salah' }, 401)
  }

  const { token } = await createSession(user.id)
  const secure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  c.header('Set-Cookie', buildSessionCookie(token, { secure }))
  await clearFailedLogin(rateLimitKey)

  return c.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
  })
})

authRouter.post('/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (token) await deleteSession(token)
  const secure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  c.header('Set-Cookie', clearSessionCookie({ secure }))
  return c.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (c) => {
  const user = c.get('user')
  const [row] = await db
    .select({ creditSeconds: users.creditSeconds })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  return c.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    creditSeconds: row?.creditSeconds ?? 0,
  })
})

authRouter.get('/me/stats', requireAuth, async (c) => {
  const user = c.get('user')

  const cached = await getCachedUserStats(user.id)
  if (cached) return c.json(cached)

  const [agg] = await db
    .select({
      totalDurationSec: sum(jobs.durationSec),
      latestDurationSec: max(jobs.durationSec),
      totalJobs: count(jobs.id),
    })
    .from(jobs)
    .where(and(eq(jobs.userId, user.id), eq(jobs.status, 'completed')))

  const [userRow] = await db
    .select({ creditSeconds: users.creditSeconds, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  const totalDurationSec = Number(agg?.totalDurationSec ?? 0)
  const estimatedCostUSD = parseFloat(((totalDurationSec / 60) * DEEPGRAM_COST_PER_MIN).toFixed(4))

  const stats = {
    totalDurationSec,
    latestDurationSec: Number(agg?.latestDurationSec ?? 0),
    totalJobs: Number(agg?.totalJobs ?? 0),
    creditSeconds: userRow?.creditSeconds ?? 0,
    estimatedCostUSD,
    memberSince: userRow?.createdAt ?? null,
  }

  await cacheUserStats(user.id, stats)
  return c.json(stats)
})

function loginRateLimitKey(ip: string, username: string): string {
  return `login:${ip.split(',')[0].trim()}:${username.trim().toLowerCase()}`
}

async function isLoginRateLimited(key: string): Promise<boolean> {
  const redis = getRedis()
  if (redis) {
    const count = Number(await redis.get<string>(key).catch(() => 0) ?? 0)
    return count >= LOGIN_RATE_LIMIT_MAX
  }

  const current = memoryLoginAttempts.get(key)
  if (!current || current.resetAt < Date.now()) return false
  return current.count >= LOGIN_RATE_LIMIT_MAX
}

async function recordFailedLogin(key: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, LOGIN_RATE_LIMIT_WINDOW_SEC)
    return
  }

  const now = Date.now()
  const current = memoryLoginAttempts.get(key)
  if (!current || current.resetAt < now) {
    memoryLoginAttempts.set(key, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_SEC * 1000 })
    return
  }
  memoryLoginAttempts.set(key, { ...current, count: current.count + 1 })
}

async function clearFailedLogin(key: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    await redis.del(key).catch(() => undefined)
    return
  }
  memoryLoginAttempts.delete(key)
}
