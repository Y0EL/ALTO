import 'dotenv/config'
import { setGlobalDispatcher, Agent } from 'undici'

setGlobalDispatcher(new Agent({
  headersTimeout: 60 * 60 * 1000,
  bodyTimeout: 60 * 60 * 1000,
  connectTimeout: 30 * 1000,
}))

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { AppEnv } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { jobsRouter } from './routes/jobs.js'
import { uploadRouter } from './routes/upload.js'
import { db } from './db/client.js'
import { jobs } from './db/schema.js'
import { inArray } from 'drizzle-orm'

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

// On startup: mark any stuck jobs as failed (machine restart mid-transcription)
async function recoverStuckJobs() {
  try {
    const stuck = await db
      .update(jobs)
      .set({
        status: 'failed',
        errorMessage: 'Server restart saat proses berlangsung. Silakan upload ulang.',
      })
      .where(inArray(jobs.status, ['transcribing', 'uploading']))
      .returning({ id: jobs.id })

    if (stuck.length > 0) {
      console.log(`Marked ${stuck.length} stuck job(s) as failed:`, stuck.map((j) => j.id))
    }
  } catch (err) {
    console.error('Failed to recover stuck jobs:', err)
  }
}

const port = Number(process.env.PORT ?? 3000)
console.log(`Backend listening on http://localhost:${port}`)

serve({ fetch: app.fetch, port })

recoverStuckJobs()
