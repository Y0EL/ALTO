import 'dotenv/config'
import { setGlobalDispatcher, Agent } from 'undici'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { jobs, type JobStatus } from './db/schema.js'
import { cacheJobStatus, setWorkerHeartbeat } from './services/redis.js'
import { isObjectStorageEnabled } from './services/storage.js'
import { processStoredTranscriptionJob } from './services/transcription.js'

setGlobalDispatcher(new Agent({
  headersTimeout: 60 * 60 * 1000,
  bodyTimeout: 60 * 60 * 1000,
  connectTimeout: 30 * 1000,
}))

const pollMs = Number(process.env.WORKER_POLL_MS ?? 5000)
const workerId = `${process.env.FLY_MACHINE_ID ?? 'local'}-${process.pid}`

async function claimQueuedJob(): Promise<string | null> {
  const [candidate] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.status, 'queued'))
    .orderBy(asc(jobs.queuedAt), asc(jobs.createdAt))
    .limit(1)

  if (!candidate) return null

  const [claimed] = await db
    .update(jobs)
    .set({
      status: 'transcribing' satisfies JobStatus,
      startedAt: new Date(),
      errorMessage: null,
    })
    .where(and(eq(jobs.id, candidate.id), eq(jobs.status, 'queued')))
    .returning({ id: jobs.id })

  return claimed?.id ?? null
}

async function tick(): Promise<void> {
  await setWorkerHeartbeat(workerId)
  const jobId = await claimQueuedJob()
  if (!jobId) return

  console.log(`[${jobId}] Worker ${workerId} claimed job`)
  await cacheJobStatus(jobId, { status: 'transcribing', progress: 30 })
  await processStoredTranscriptionJob(jobId)
}

async function main() {
  if (!isObjectStorageEnabled()) {
    throw new Error('Worker requires STORAGE_PROVIDER=s3 so queued jobs can read durable audio')
  }

  const recovered = await db
    .update(jobs)
    .set({
      status: 'queued' satisfies JobStatus,
      queuedAt: new Date(),
      startedAt: null,
      errorMessage: 'Worker restart; job re-queued.',
    })
    .where(and(eq(jobs.status, 'transcribing'), isNotNull(jobs.storageKey)))
    .returning({ id: jobs.id })

  if (recovered.length > 0) {
    console.log(`Re-queued ${recovered.length} in-flight job(s):`, recovered.map((job) => job.id))
  }

  console.log(`ALTO worker ${workerId} polling every ${pollMs}ms`)
  for (;;) {
    try {
      await tick()
    } catch (err) {
      console.error('Worker tick failed:', err)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

void main()
