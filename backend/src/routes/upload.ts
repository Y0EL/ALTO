import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { jobs, type JobStatus, type TranscriptPayload } from '../db/schema.js'
import { requireAuth, type AppEnv } from '../middleware/auth.js'
import { transcribeWithDeepgram } from '../services/deepgram.js'
import { cacheJobStatus } from '../services/redis.js'

export const uploadRouter = new Hono<AppEnv>()

uploadRouter.use('*', requireAuth)

uploadRouter.put('/:jobId', async (c) => {
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
    buffer,
    mimeType: job.mimeType,
    language: job.language as 'id' | 'en' | 'auto',
  }).catch((err) => console.error('Background transcription crashed', err))

  return c.json({ jobId, status: 'transcribing' })
})

async function runTranscriptionTask(args: {
  jobId: string
  buffer: Buffer
  mimeType: string
  language: 'id' | 'en' | 'auto'
}): Promise<void> {
  try {
    const transcript: TranscriptPayload = await transcribeWithDeepgram({
      buffer: args.buffer,
      mimeType: args.mimeType,
      language: args.language,
      onProgress: async (step) => {
        console.log(`[${args.jobId}] ${step}`)
        const progressMap: Record<string, number> = {
          'Compressing audio...': 35,
          'Transcribing audio...': 50,
          'Adding speaker labels and summary...': 85,
        }
        const progress = progressMap[step] ?? 50
        await cacheJobStatus(args.jobId, { status: 'transcribing', progress })
      },
    })

    await db
      .update(jobs)
      .set({
        status: 'completed' satisfies JobStatus,
        transcript,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, args.jobId))
    await cacheJobStatus(args.jobId, { status: 'completed', progress: 100 })
  } catch (err) {
    console.error('Transcription failed', err)
    const msg = err instanceof Error ? err.message : String(err)
    await db
      .update(jobs)
      .set({ status: 'failed' satisfies JobStatus, errorMessage: msg })
      .where(eq(jobs.id, args.jobId))
    await cacheJobStatus(args.jobId, { status: 'failed', error: msg })
  }
}
