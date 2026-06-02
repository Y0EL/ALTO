import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { AppEnv } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { jobsRouter } from './routes/jobs.js'
import { uploadRouter } from './routes/upload.js'

const app = new Hono<AppEnv>()

app.use('*', logger())

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigins[0]
      return allowedOrigins.includes(origin) ? origin : null
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  })
)

app.get('/health', (c) =>
  c.json({ ok: true, service: 'audio-to-text-api', time: new Date().toISOString() })
)

app.route('/auth', authRouter)
app.route('/users', usersRouter)
app.route('/jobs', jobsRouter)
app.route('/upload', uploadRouter)

app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error', message: err.message }, 500)
})

const port = Number(process.env.PORT ?? 3000)
console.log(`Backend listening on http://localhost:${port}`)

serve({ fetch: app.fetch, port })
