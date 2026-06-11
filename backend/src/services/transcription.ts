import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { jobs, users, type JobStatus } from '../db/schema.js'
import { transcribeWithDeepgram } from './deepgram.js'
import { cacheJobStatus, invalidateUserStats } from './redis.js'
import { readObject } from './storage.js'

const PROGRESS_BY_STEP: Record<string, number> = {
  'Transcribing audio...': 50,
  'Processing speaker labels...': 70,
  'Generating summary...': 85,
}

export async function processStoredTranscriptionJob(jobId: string): Promise<void> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
  if (!job) throw new Error(`Job ${jobId} not found`)
  if (job.status === 'cancelled') return
  if (!job.storageKey) throw new Error(`Job ${jobId} missing storage key`)

  try {
    await cacheJobStatus(jobId, { status: 'transcribing', progress: 30 })
    const buffer = await readObject(job.storageKey)

    const { payload: transcript, durationSec: actualDuration } = await transcribeWithDeepgram({
      buffer,
      mimeType: job.mimeType,
      language: job.language as 'id' | 'en' | 'auto',
      onProgress: async (step) => {
        console.log(`[${jobId}] ${step}`)
        await cacheJobStatus(jobId, {
          status: 'transcribing',
          progress: PROGRESS_BY_STEP[step] ?? 50,
        })
      },
    })

    const [current] = await db
      .select({ status: jobs.status, durationSec: jobs.durationSec })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!current || current.status === 'cancelled') {
      console.log(`[${jobId}] Job cancelled before completion; skipping save and credit reconciliation`)
      return
    }

    await db
      .update(jobs)
      .set({
        status: 'completed' satisfies JobStatus,
        transcript,
        durationSec: actualDuration,
        completedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(jobs.id, jobId))

    await reconcileReservedCredits(jobId, job.userId, current.durationSec ?? actualDuration, actualDuration)

    await Promise.all([
      cacheJobStatus(jobId, { status: 'completed', progress: 100 }),
      invalidateUserStats(job.userId),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${jobId}] Transcription failed`, err)

    const [current] = await db
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!current || current.status === 'cancelled') return

    await Promise.all([
      db
        .update(jobs)
        .set({ status: 'failed' satisfies JobStatus, errorMessage: msg })
        .where(eq(jobs.id, jobId)),
      refundReservedCredits(jobId, job.userId),
      cacheJobStatus(jobId, { status: 'failed', error: msg }),
    ])
  }
}

async function reconcileReservedCredits(
  jobId: string,
  userId: string,
  estimatedDuration: number,
  actualDuration: number
): Promise<void> {
  const delta = actualDuration - estimatedDuration
  if (delta < 0) {
    await db
      .update(users)
      .set({ creditSeconds: sql`${users.creditSeconds} + ${Math.abs(delta)}` })
      .where(eq(users.id, userId))
  } else if (delta > 0) {
    await db
      .update(users)
      .set({ creditSeconds: sql`GREATEST(${users.creditSeconds} - ${delta}, 0)` })
      .where(eq(users.id, userId))
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
