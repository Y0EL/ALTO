const DEFAULT_MAX_UPLOAD_MB = 100
const configuredMaxUploadMb = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB)

export const MAX_UPLOAD_MB = Number.isFinite(configuredMaxUploadMb)
  ? Math.max(1, configuredMaxUploadMb)
  : DEFAULT_MAX_UPLOAD_MB

export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
