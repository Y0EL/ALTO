import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { User } from '../db/schema.js'
import { findSession } from '../services/auth.js'

export type AppEnv = {
  Variables: {
    user: User
  }
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, 'session')
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const result = await findSession(token)
  if (!result) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.set('user', result.user)
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  const result = await findSession(token)
  if (!result) return c.json({ error: 'Unauthorized' }, 401)
  if (!result.user.isAdmin) return c.json({ error: 'Forbidden — admin only' }, 403)
  c.set('user', result.user)
  await next()
}

export function getUser(c: Context<AppEnv>): User {
  const user = c.get('user')
  if (!user) throw new Error('User missing — requireAuth not applied')
  return user
}
