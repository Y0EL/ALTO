import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { eq, lt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client.js'
import { sessions, users, type User } from '../db/schema.js'

const SESSION_DAYS = 30

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createUser(input: {
  username: string
  password: string
  isAdmin?: boolean
}): Promise<User> {
  const passwordHash = await hashPassword(input.password)
  const [user] = await db
    .insert(users)
    .values({
      id: nanoid(),
      username: input.username,
      passwordHash,
      isAdmin: input.isAdmin ?? false,
    })
    .returning()
  return user
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1)
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({ token, userId, expiresAt })
  return { token, expiresAt }
}

export async function findSession(token: string): Promise<{ user: User; expiresAt: Date } | null> {
  const rows = await db
    .select({
      sessionToken: sessions.token,
      expiresAt: sessions.expiresAt,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, token))
    return null
  }
  return { user: row.user, expiresAt: row.expiresAt }
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token))
}

export async function cleanupExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}

export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60
  const parts = [
    `session=${token}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${opts.secure ? 'None' : 'Lax'}`,
    `Max-Age=${maxAge}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(opts: { secure: boolean }): string {
  const parts = [
    'session=',
    'Path=/',
    'HttpOnly',
    `SameSite=${opts.secure ? 'None' : 'Lax'}`,
    'Max-Age=0',
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}
