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
import { inArray, sql } from 'drizzle-orm'
import { checkRedis, getWorkerHeartbeat } from './services/redis.js'
import { checkStorage, isObjectStorageEnabled } from './services/storage.js'

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

app.get('/health', async (c) => {
  const checks = {
    db: false,
    redis: false,
    storage: !isObjectStorageEnabled(),
    worker: !isObjectStorageEnabled(),
  }

  try {
    await db.select({ ok: sql<number>`1` })
    checks.db = true
  } catch (err) {
    console.error('Health DB check failed:', err)
  }

  checks.redis = await checkRedis()

  if (isObjectStorageEnabled()) {
    checks.storage = await checkStorage().catch((err) => {
      console.error('Health storage check failed:', err)
      return false
    })
    const heartbeat = await getWorkerHeartbeat()
    checks.worker = Boolean(heartbeat && Date.now() - Date.parse(heartbeat.at) < 90_000)
  }

  const ok = Object.values(checks).every(Boolean)
  return c.json(
    {
      status: ok ? 'ok' : 'degraded',
      service: 'audio-to-text-api',
      checks,
      time: new Date().toISOString(),
    },
    ok ? 200 : 503
  )
})

app.route('/auth', authRouter)
app.route('/users', usersRouter)
app.route('/jobs', jobsRouter)
app.route('/upload', uploadRouter)

app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// On startup: mark non-durable in-flight uploads as failed. Queued durable
// storage jobs are owned by the worker process, not the API.
async function recoverStuckJobs() {
  try {
    const stuck = await db
      .update(jobs)
      .set({
        status: 'failed',
        errorMessage: 'Server restart saat proses berlangsung. Silakan upload ulang.',
      })
      .where(inArray(jobs.status, ['uploading']))
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
