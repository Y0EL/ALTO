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

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
})

export const authRouter = new Hono<AppEnv>()

authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)

  const user = await findUserByUsername(parsed.data.username.trim())
  if (!user) return c.json({ error: 'Username atau password salah' }, 401)

  const ok = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!ok) return c.json({ error: 'Username atau password salah' }, 401)

  const { token } = await createSession(user.id)
  const secure = process.env.NODE_ENV === 'production'
  c.header('Set-Cookie', buildSessionCookie(token, { secure }))

  return c.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
  })
})

authRouter.post('/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (token) await deleteSession(token)
  const secure = process.env.NODE_ENV === 'production'
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

  return c.json({
    totalDurationSec: Number(agg?.totalDurationSec ?? 0),
    latestDurationSec: Number(agg?.latestDurationSec ?? 0),
    totalJobs: Number(agg?.totalJobs ?? 0),
    creditSeconds: userRow?.creditSeconds ?? 0,
    memberSince: userRow?.createdAt ?? null,
  })
})
