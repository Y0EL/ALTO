import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const DEFAULT_SIGNED_URL_TTL_SEC = 15 * 60

export function isObjectStorageEnabled(): boolean {
  return process.env.STORAGE_PROVIDER === 's3'
}

function bucket(): string {
  const value = process.env.S3_BUCKET
  if (!value) throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3')
  return value
}

function client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT
  const region = process.env.S3_REGION ?? 'auto'
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=s3')
  }

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  })
}

export async function createUploadUrl(args: {
  key: string
  mimeType: string
  sizeBytes: number
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: args.key,
    ContentType: args.mimeType,
    ContentLength: args.sizeBytes,
  })
  return getSignedUrl(client(), command, {
    expiresIn: Number(process.env.S3_SIGNED_URL_TTL_SEC ?? DEFAULT_SIGNED_URL_TTL_SEC),
  })
}

export async function readObject(key: string): Promise<Buffer> {
  const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  const chunks: Uint8Array[] = []
  const body = result.Body
  if (!body || typeof (body as { transformToByteArray?: unknown }).transformToByteArray !== 'function') {
    throw new Error('Storage object response did not include a readable body')
  }
  const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
  chunks.push(bytes)
  return Buffer.concat(chunks)
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

export async function checkStorage(): Promise<boolean> {
  if (!isObjectStorageEnabled()) return false
  await client().send(new HeadBucketCommand({ Bucket: bucket() }))
  return true
}
