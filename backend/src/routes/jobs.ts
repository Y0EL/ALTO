import { Hono } from 'hono'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/client.js'
import { jobs, users, type JobStatus } from '../db/schema.js'
import { requireAuth, type AppEnv } from '../middleware/auth.js'
import { isAllowedMime, normalizeMime, MAX_FILE_BYTES } from '../lib/validate.js'
import { deleteGeminiFile } from '../services/gemini.js'
import { cacheJobStatus, getCachedJobStatus } from '../services/redis.js'
import { createUploadUrl, isObjectStorageEnabled, isObjectStorageRequired } from '../services/storage.js'

const directBrowserUploadEnabled = process.env.BROWSER_DIRECT_UPLOAD === 'true'

const createSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  durationSec: z.number().int().positive(),
  language: z.enum(['id', 'en', 'auto']).optional(),
})

export const jobsRouter = new Hono<AppEnv>()

jobsRouter.get('/shared/:token', async (c) => {
  const token = c.req.param('token')
  const [job] = await db.select().from(jobs).where(eq(jobs.shareToken, token)).limit(1)

  if (!job) return c.json({ error: 'Link bagikan tidak ditemukan' }, 404)

  return c.json(toJobDetail(job, false))
})

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

  // Reserve the estimated duration atomically so credit cannot go negative.
  const [reservation] = await db
    .update(users)
    .set({ creditSeconds: sql`${users.creditSeconds} - ${parsed.data.durationSec}` })
    .where(and(eq(users.id, user.id), sql`${users.creditSeconds} >= ${parsed.data.durationSec}`))
    .returning({ creditSeconds: users.creditSeconds })

  if (!reservation) {
    return c.json({ error: 'Kredit tidak cukup untuk durasi audio ini. Hubungi admin untuk topup.' }, 402)
  }

  const jobId = nanoid()
  const storageEnabled = isObjectStorageEnabled()
  if (!storageEnabled && isObjectStorageRequired()) {
    await db
      .update(users)
      .set({ creditSeconds: sql`${users.creditSeconds} + ${parsed.data.durationSec}` })
      .where(eq(users.id, user.id))
    return c.json({ error: 'Object storage belum aktif. Production upload dinonaktifkan.' }, 503)
  }
  const storageKey = storageEnabled ? `uploads/${user.id}/${jobId}/${parsed.data.filename}` : null

  let created: typeof jobs.$inferSelect
  try {
    ;[created] = await db
      .insert(jobs)
      .values({
        id: jobId,
        userId: user.id,
        filename: parsed.data.filename,
        mimeType: mime,
        sizeBytes: parsed.data.sizeBytes,
        durationSec: parsed.data.durationSec,
        language: parsed.data.language ?? 'auto',
        storageKey,
        status: 'pending' satisfies JobStatus,
      })
      .returning()
  } catch (err) {
    await db
      .update(users)
      .set({ creditSeconds: sql`${users.creditSeconds} + ${parsed.data.durationSec}` })
      .where(eq(users.id, user.id))
    throw err
  }

  await cacheJobStatus(jobId, { status: 'pending', progress: 0 })

  if (storageEnabled && storageKey && !directBrowserUploadEnabled) {
    return c.json({
      jobId: created.id,
      uploadMethod: 'api',
      uploadUrl: `/upload/${created.id}/storage`,
    })
  }

  if (storageEnabled && storageKey) {
    let signedUrl: string
    try {
      signedUrl = await createUploadUrl({
        key: storageKey,
        mimeType: mime,
        sizeBytes: parsed.data.sizeBytes,
      })
    } catch (err) {
      await Promise.all([
        db
          .update(users)
          .set({ creditSeconds: sql`${users.creditSeconds} + ${parsed.data.durationSec}` })
          .where(eq(users.id, user.id)),
        db
          .update(jobs)
          .set({
            status: 'failed' satisfies JobStatus,
            errorMessage: err instanceof Error ? err.message : 'Gagal membuat signed upload URL',
          })
          .where(eq(jobs.id, jobId)),
      ])
      throw err
    }

    return c.json({
      jobId: created.id,
      uploadMethod: 'direct',
      uploadUrl: signedUrl,
      completeUrl: `/upload/${created.id}/complete`,
    })
  }

  return c.json({
    jobId: created.id,
    uploadMethod: 'api',
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
      speakerCount: sql<number | null>`(${jobs.transcript}->>'speakerCount')::int`,
    })
    .from(jobs)
    .where(and(eq(jobs.userId, user.id), ne(jobs.status, 'cancelled')))
    .orderBy(desc(jobs.createdAt))
    .limit(100)

  return c.json({
    jobs: rows.map((r) => ({
      ...r,
      speakerCount:
        r.status === 'completed' && r.speakerCount
          ? r.speakerCount
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
  if (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled') {
    const cached = await getCachedJobStatus(id)
    if (cached && typeof cached === 'object' && 'progress' in cached) {
      progress = (cached as { progress?: number }).progress
    }
  }

  return c.json(toJobDetail(job, true, progress))
})

jobsRouter.post('/:id/share', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const [job] = await db
    .select({
      id: jobs.id,
      shareToken: jobs.shareToken,
    })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1)

  if (!job) return c.json({ error: 'Job tidak ditemukan' }, 404)

  if (job.shareToken) {
    return c.json({ shareToken: job.shareToken, sharePath: `/share/${job.shareToken}` })
  }

  const shareToken = nanoid(32)
  const [updated] = await db
    .update(jobs)
    .set({ shareToken })
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .returning({ shareToken: jobs.shareToken })

  return c.json({ shareToken: updated.shareToken, sharePath: `/share/${updated.shareToken}` })
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

  const isRunning = job.status === 'pending' || job.status === 'uploading' || job.status === 'queued' || job.status === 'transcribing'
  if (isRunning) {
    await db
      .update(jobs)
      .set({ status: 'cancelled' satisfies JobStatus, cancelledAt: new Date() })
      .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))

    if (job.durationSec && job.durationSec > 0) {
      await db
        .update(users)
        .set({ creditSeconds: sql`${users.creditSeconds} + ${job.durationSec}` })
        .where(eq(users.id, user.id))
    }

    await cacheJobStatus(id, { status: 'cancelled', progress: 0 })
    return c.json({ ok: true, cancelled: true })
  }

  if (job.geminiFileName) {
    await deleteGeminiFile(job.geminiFileName)
  }

  if (job.storageKey) {
    const { deleteObject, isObjectStorageEnabled } = await import('../services/storage.js')
    if (isObjectStorageEnabled()) {
      await deleteObject(job.storageKey).catch((err) => console.warn(`Failed to delete storage object for ${id}:`, err))
    }
  }

  await db.delete(jobs).where(eq(jobs.id, id))
  return c.json({ ok: true })
})

function toJobDetail(job: typeof jobs.$inferSelect, includeShareToken: boolean, progress?: number) {
  return {
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
    cancelledAt: job.cancelledAt,
    shareToken: includeShareToken ? job.shareToken : undefined,
  }
}
