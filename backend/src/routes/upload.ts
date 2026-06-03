import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { jobs, type JobStatus, type TranscriptPayload } from '../db/schema.js'
import { requireAuth, type AppEnv } from '../middleware/auth.js'
import {
  transcribeAudio,
  uploadAudioToGemini,
  waitForFileActive,
} from '../services/gemini.js'
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
  await cacheJobStatus(jobId, { status: 'uploading', progress: 0 })

  let uploaded
  try {
    uploaded = await uploadAudioToGemini({
      body,
      mimeType: job.mimeType,
      sizeBytes,
      displayName: job.filename,
    })
  } catch (err) {
    console.error('Gemini upload failed', err)
    const msg = err instanceof Error ? err.message : String(err)
    await db
      .update(jobs)
      .set({ status: 'failed' satisfies JobStatus, errorMessage: `Upload gagal: ${msg}` })
      .where(eq(jobs.id, jobId))
    await cacheJobStatus(jobId, { status: 'failed', error: msg })
    return c.json({ error: 'Upload ke Gemini gagal', detail: msg }, 502)
  }

  await db
    .update(jobs)
    .set({
      status: 'transcribing' satisfies JobStatus,
      geminiFileUri: uploaded.fileUri,
      geminiFileName: uploaded.fileName,
    })
    .where(eq(jobs.id, jobId))
  await cacheJobStatus(jobId, { status: 'transcribing', progress: 30 })

  void runTranscriptionTask({
    jobId,
    fileUri: uploaded.fileUri,
    fileName: uploaded.fileName,
    mimeType: uploaded.mimeType,
    language: job.language as 'id' | 'en' | 'auto',
    durationSec: job.durationSec ?? undefined,
  }).catch((err) => console.error('Background transcription crashed', err))

  return c.json({ jobId, status: 'transcribing' })
})

async function runTranscriptionTask(args: {
  jobId: string
  fileUri: string
  fileName: string
  mimeType: string
  language: 'id' | 'en' | 'auto'
  durationSec?: number
}): Promise<void> {
  try {
    await waitForFileActive(args.fileName)
    await cacheJobStatus(args.jobId, { status: 'transcribing', progress: 50 })

    const transcript: TranscriptPayload = await transcribeAudio({
      fileUri: args.fileUri,
      mimeType: args.mimeType,
      language: args.language,
      durationSec: args.durationSec,
      onProgress: (chunkIndex, totalChunks) => {
        const progress = 50 + Math.round((chunkIndex / totalChunks) * 45)
        void cacheJobStatus(args.jobId, { status: 'transcribing', progress })
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
