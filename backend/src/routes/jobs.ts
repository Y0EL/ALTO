import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/client.js'
import { jobs, type JobStatus } from '../db/schema.js'
import { requireAuth, type AppEnv } from '../middleware/auth.js'
import { isAllowedMime, normalizeMime, MAX_FILE_BYTES } from '../lib/validate.js'
import { deleteGeminiFile } from '../services/gemini.js'
import { cacheJobStatus, getCachedJobStatus } from '../services/redis.js'

const createSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  durationSec: z.number().int().positive().optional(),
  language: z.enum(['id', 'en', 'auto']).optional(),
})

export const jobsRouter = new Hono<AppEnv>()

jobsRouter.use('*', requireAuth)

jobsRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400)
  }
  const mime = normalizeMime(parsed.data.mimeType)
  if (!isAllowedMime(mime)) {
    return c.json({ error: `Format audio tidak didukung: ${parsed.data.mimeType}` }, 415)
  }

  const user = c.get('user')

  if (user.creditSeconds <= 0) {
    return c.json({ error: 'Kredit kamu habis. Hubungi admin untuk topup.' }, 402)
  }

  const jobId = nanoid()

  const [created] = await db
    .insert(jobs)
    .values({
      id: jobId,
      userId: user.id,
      filename: parsed.data.filename,
      mimeType: mime,
      sizeBytes: parsed.data.sizeBytes,
      durationSec: parsed.data.durationSec ?? null,
      language: parsed.data.language ?? 'auto',
      status: 'pending' satisfies JobStatus,
    })
    .returning()

  await cacheJobStatus(jobId, { status: 'pending', progress: 0 })

  return c.json({
    jobId: created.id,
    uploadUrl: `/upload/${created.id}`,
  })
})

jobsRouter.get('/', async (c) => {
  const user = c.get('user')
  const rows = await db
    .select({
      id: jobs.id,
      filename: jobs.filename,
      durationSec: jobs.durationSec,
      sizeBytes: jobs.sizeBytes,
      language: jobs.language,
      status: jobs.status,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
      speakerCount: jobs.transcript,
    })
    .from(jobs)
    .where(eq(jobs.userId, user.id))
    .orderBy(desc(jobs.createdAt))
    .limit(100)

  return c.json({
    jobs: rows.map((r) => ({
      ...r,
      speakerCount:
        r.status === 'completed' && r.speakerCount
          ? (r.speakerCount as { speakerCount?: number }).speakerCount ?? null
          : null,
    })),
  })
})

jobsRouter.get('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1)

  if (!job) return c.json({ error: 'Job tidak ditemukan' }, 404)

  // Get progress from cache for in-progress jobs
  let progress: number | undefined
  if (job.status !== 'completed' && job.status !== 'failed') {
    const cached = await getCachedJobStatus(id)
    if (cached && typeof cached === 'object' && 'progress' in cached) {
      progress = (cached as { progress?: number }).progress
    }
  }

  return c.json({
    id: job.id,
    filename: job.filename,
    mimeType: job.mimeType,
    sizeBytes: job.sizeBytes,
    durationSec: job.durationSec,
    language: job.language,
    status: job.status,
    progress,
    transcript: job.transcript,
    error: job.errorMessage,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  })
})

jobsRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1)

  if (!job) return c.json({ error: 'Job tidak ditemukan' }, 404)

  if (job.geminiFileName) {
    await deleteGeminiFile(job.geminiFileName)
  }

  await db.delete(jobs).where(eq(jobs.id, id))
  return c.json({ ok: true })
})
