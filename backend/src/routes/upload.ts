import { Hono } from 'hono'
import { Readable } from 'node:stream'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { jobs, users, type JobStatus, type TranscriptPayload } from '../db/schema.js'
import { requireAuth, type AppEnv } from '../middleware/auth.js'
import { transcribeWithDeepgram } from '../services/deepgram.js'
import { cacheJobStatus, invalidateUserStats } from '../services/redis.js'
import { isObjectStorageEnabled, isObjectStorageRequired, writeObjectStream } from '../services/storage.js'

export const uploadRouter = new Hono<AppEnv>()

uploadRouter.use('*', requireAuth)

uploadRouter.post('/:jobId/complete', async (c) => {
  const user = c.get('user')
  const jobId = c.req.param('jobId')

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, user.id)))
    .limit(1)

  if (!job) return c.json({ error: 'Job tidak ditemukan' }, 404)
  if (!job.storageKey) return c.json({ error: 'Job ini tidak memakai object storage upload' }, 409)
  if (job.status !== 'pending' && job.status !== 'uploading') {
    return c.json({ error: `Job sudah ${job.status}, tidak bisa di-queue ulang` }, 409)
  }

  await db
    .update(jobs)
    .set({
      status: 'queued' satisfies JobStatus,
      uploadedAt: new Date(),
      queuedAt: new Date(),
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, user.id)))

  await cacheJobStatus(jobId, { status: 'queued', progress: 20 })
  return c.json({ jobId, status: 'queued' })
})

uploadRouter.put('/:jobId/storage', async (c) => {
  if (!isObjectStorageEnabled()) {
    return c.json({ error: 'Object storage belum aktif' }, 503)
  }

  const user = c.get('user')
  const jobId = c.req.param('jobId')

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, user.id)))
    .limit(1)

  if (!job) return c.json({ error: 'Job tidak ditemukan' }, 404)
  if (!job.storageKey) return c.json({ error: 'Job ini tidak punya storage key' }, 409)
  if (job.status !== 'pending') {
    return c.json({ error: `Job sudah ${job.status}, tidak bisa upload ulang` }, 409)
  }

  const body = c.req.raw.body
  if (!body) return c.json({ error: 'Request body kosong' }, 400)

  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (!contentLength) return c.json({ error: 'Content-Length missing' }, 411)
  if (job.sizeBytes && contentLength !== job.sizeBytes) {
    return c.json({ error: 'Ukuran upload tidak cocok dengan job yang dibuat' }, 400)
  }

  await db.update(jobs).set({ status: 'uploading' satisfies JobStatus }).where(eq(jobs.id, jobId))
  await cacheJobStatus(jobId, { status: 'uploading', progress: 10 })

  try {
    await writeObjectStream({
      key: job.storageKey,
      mimeType: job.mimeType,
      sizeBytes: contentLength,
      body: Readable.fromWeb(body as never),
    })

    await db
      .update(jobs)
      .set({
        status: 'queued' satisfies JobStatus,
        uploadedAt: new Date(),
        queuedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, user.id)))

    await cacheJobStatus(jobId, { status: 'queued', progress: 20 })
    return c.json({ jobId, status: 'queued' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await Promise.all([
      db
        .update(jobs)
        .set({ status: 'failed' satisfies JobStatus, errorMessage: `Upload storage gagal: ${msg}` })
        .where(eq(jobs.id, jobId)),
      refundReservedCredits(jobId, user.id),
      cacheJobStatus(jobId, { status: 'failed', error: msg }),
    ])
    return c.json({ error: 'Gagal upload ke object storage', detail: msg }, 502)
  }
})

uploadRouter.put('/:jobId', async (c) => {
  if (isObjectStorageEnabled() || isObjectStorageRequired()) {
    return c.json({ error: 'Direct object storage upload aktif. Gunakan signed upload URL.' }, 409)
  }

  const user = c.get('user')
  const jobId = c.req.param('jobId')

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, user.id)))
    .limit(1)

  if (!job) return c.json({ error: 'Job tidak ditemukan' }, 404)
  if (job.status !== 'pending') {
    return c.json({ error: `Job sudah ${job.status}, tidak bisa upload ulang` }, 409)
  }

  const body = c.req.raw.body
  if (!body) return c.json({ error: 'Request body kosong' }, 400)

  const sizeBytes = job.sizeBytes ?? Number(c.req.header('content-length') ?? 0)
  if (!sizeBytes) return c.json({ error: 'Content-Length missing' }, 411)

  await db.update(jobs).set({ status: 'uploading' satisfies JobStatus }).where(eq(jobs.id, jobId))
  await cacheJobStatus(jobId, { status: 'uploading', progress: 10 })

  // Buffer the audio in memory
  let buffer: Buffer
  try {
    const chunks: Uint8Array[] = []
    const reader = body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    buffer = Buffer.concat(chunks)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db
      .update(jobs)
      .set({ status: 'failed' satisfies JobStatus, errorMessage: `Upload gagal: ${msg}` })
      .where(eq(jobs.id, jobId))
    if (job.durationSec && job.durationSec > 0) {
      await db
        .update(users)
        .set({ creditSeconds: sql`${users.creditSeconds} + ${job.durationSec}` })
        .where(eq(users.id, user.id))
    }
    await cacheJobStatus(jobId, { status: 'failed', error: msg })
    return c.json({ error: 'Gagal membaca upload', detail: msg }, 502)
  }

  await db
    .update(jobs)
    .set({ status: 'transcribing' satisfies JobStatus })
    .where(eq(jobs.id, jobId))
  await cacheJobStatus(jobId, { status: 'transcribing', progress: 30 })

  void runTranscriptionTask({
    jobId,
    userId: user.id,
    buffer,
    mimeType: job.mimeType,
    language: job.language as 'id' | 'en' | 'auto',
  }).catch((err) => console.error('Background transcription crashed', err))

  return c.json({ jobId, status: 'transcribing' })
})

async function runTranscriptionTask(args: {
  jobId: string
  userId: string
  buffer: Buffer
  mimeType: string
  language: 'id' | 'en' | 'auto'
}): Promise<void> {
  try {
    const { payload: transcript, durationSec: actualDuration } = await transcribeWithDeepgram({
      buffer: args.buffer,
      mimeType: args.mimeType,
      language: args.language,
      onProgress: async (step) => {
        console.log(`[${args.jobId}] ${step}`)
        const progressMap: Record<string, number> = {
          'Transcribing audio...': 50,
          'Processing speaker labels...': 70,
          'Generating summary...': 85,
        }
        const progress = progressMap[step] ?? 50
        await cacheJobStatus(args.jobId, { status: 'transcribing', progress })
      },
    })

    const [current] = await db
      .select({ status: jobs.status, durationSec: jobs.durationSec })
      .from(jobs)
      .where(eq(jobs.id, args.jobId))
      .limit(1)

    if (!current || current.status === 'cancelled') {
      console.log(`[${args.jobId}] Job cancelled before completion; skipping save and credit reconciliation`)
      return
    }

    // Store Deepgram-measured duration (authoritative), not the client estimate
    await db
      .update(jobs)
      .set({
        status: 'completed' satisfies JobStatus,
        transcript,
        durationSec: actualDuration,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, args.jobId))

    // Reconcile the up-front reservation with Deepgram's measured duration.
    const estimatedDuration = current.durationSec ?? actualDuration
    const delta = actualDuration - estimatedDuration
    if (delta < 0) {
      await db
        .update(users)
        .set({ creditSeconds: sql`${users.creditSeconds} + ${Math.abs(delta)}` })
        .where(eq(users.id, args.userId))
    } else if (delta > 0) {
      await db
        .update(users)
        .set({ creditSeconds: sql`GREATEST(${users.creditSeconds} - ${delta}, 0)` })
        .where(eq(users.id, args.userId))
    }

    await Promise.all([
      cacheJobStatus(args.jobId, { status: 'completed', progress: 100 }),
      invalidateUserStats(args.userId),
    ])
  } catch (err) {
    console.error('Transcription failed', err)
    const msg = err instanceof Error ? err.message : String(err)

    const [current] = await db
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, args.jobId))
      .limit(1)

    if (!current || current.status === 'cancelled') {
      console.log(`[${args.jobId}] Job cancelled after provider error; leaving cancelled`)
      return
    }

    await Promise.all([
      db.update(jobs)
        .set({ status: 'failed' satisfies JobStatus, errorMessage: msg })
        .where(eq(jobs.id, args.jobId)),
      refundReservedCredits(args.jobId, args.userId),
    ])
    await cacheJobStatus(args.jobId, { status: 'failed', error: msg })
  }
}

async function refundReservedCredits(jobId: string, userId: string): Promise<void> {
  const [job] = await db
    .select({ durationSec: jobs.durationSec, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1)

  if (!job || job.status === 'cancelled' || !job.durationSec || job.durationSec <= 0) return

  await db
    .update(users)
    .set({ creditSeconds: sql`${users.creditSeconds} + ${job.durationSec}` })
    .where(eq(users.id, userId))
}
