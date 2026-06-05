import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { createUser, findUserByUsername, hashPassword } from '../services/auth.js'
import { requireAdmin, type AppEnv } from '../middleware/auth.js'

const createSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/, 'Username hanya huruf, angka, _ . -'),
  password: z.string().min(3).max(256),
  isAdmin: z.boolean().optional(),
})

const passwordSchema = z.object({
  newPassword: z.string().min(3).max(256),
})

const MAX_CREDIT_SECONDS = 315_360_000 // 10 tahun

const creditsSchema = z.object({
  creditSeconds: z.number().int().min(0).max(MAX_CREDIT_SECONDS).optional(),
  addSeconds: z.number().int().min(1).max(MAX_CREDIT_SECONDS).optional(),
})

export const usersRouter = new Hono<AppEnv>()

usersRouter.use('*', requireAdmin)

usersRouter.get('/', async (c) => {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      isAdmin: users.isAdmin,
      creditSeconds: users.creditSeconds,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)

  return c.json({ users: rows })
})

usersRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400)
  }

  const existing = await findUserByUsername(parsed.data.username)
  if (existing) return c.json({ error: 'Username sudah dipakai' }, 409)

  const user = await createUser(parsed.data)
  return c.json(
    { id: user.id, username: user.username, isAdmin: user.isAdmin, createdAt: user.createdAt },
    201
  )
})

usersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const self = c.get('user')

  if (id === self.id) {
    return c.json({ error: 'Tidak bisa hapus akun sendiri' }, 400)
  }

  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })
  if (!deleted) return c.json({ error: 'User tidak ditemukan' }, 404)

  return c.json({ ok: true })
})

usersRouter.patch('/:id/password', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = passwordSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Password minimal 3 karakter' }, 400)

  const passwordHash = await hashPassword(parsed.data.newPassword)
  const [updated] = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, id))
    .returning({ id: users.id })

  if (!updated) return c.json({ error: 'User tidak ditemukan' }, 404)
  return c.json({ ok: true })
})

usersRouter.patch('/:id/credits', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = creditsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)

  const [current] = await db
    .select({ creditSeconds: users.creditSeconds })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!current) return c.json({ error: 'User tidak ditemukan' }, 404)

  const newCredits =
    parsed.data.creditSeconds !== undefined
      ? parsed.data.creditSeconds
      : current.creditSeconds + (parsed.data.addSeconds ?? 0)

  const [updated] = await db
    .update(users)
    .set({ creditSeconds: Math.max(0, newCredits) })
    .where(eq(users.id, id))
    .returning({ id: users.id, creditSeconds: users.creditSeconds })

  return c.json({ ok: true, creditSeconds: updated.creditSeconds })
})
