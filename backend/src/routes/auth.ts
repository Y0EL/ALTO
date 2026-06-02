import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { z } from 'zod'
import {
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  deleteSession,
  findUserByUsername,
  verifyPassword,
} from '../services/auth.js'
import { requireAuth, type AppEnv } from '../middleware/auth.js'

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
  return c.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
  })
})
