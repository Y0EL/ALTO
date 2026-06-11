<p align="center">
  <img src="docs/banner.svg" alt="ALTO" width="100%" />
</p>

<p align="center">
  <strong>ALTO</strong> adalah aplikasi transkrip meeting untuk audio Bahasa Indonesia dan Inggris.
  Upload audio, dapatkan transkrip berlabel pembicara, ringkasan, export TXT/SRT, dan link publik untuk berbagi.
</p>

<p align="center">
  <a href="#jalan-lokal"><img src="https://img.shields.io/badge/local-dev-0a0a0b?style=flat-square&logo=node.js&logoColor=white" alt="Local dev"/></a>
  <a href="#staging-production"><img src="https://img.shields.io/badge/staging-production-0a0a0b?style=flat-square" alt="Staging"/></a>
  <a href="#runtime-aktif"><img src="https://img.shields.io/badge/runtime-Deepgram%20%2B%20OpenAI-0a0a0b?style=flat-square" alt="Runtime"/></a>
  <a href="#lisensi"><img src="https://img.shields.io/badge/license-MIT-0a0a0b?style=flat-square" alt="MIT"/></a>
</p>

<br/>

## Status

> **Production candidate untuk controlled launch.**  
> Wajib deploy **API + worker + object storage** untuk production mode. Masih belum public-scale sampai test suite dan observability production lengkap selesai.

| Gate | Status |
|---|---|
| Local build | PASS |
| DB migration | PASS |
| Backend health | PASS |
| Local E2E upload/transcription | PASS |
| Production signed upload | Needs staging validation |
| Worker deployment | Required for production |
| Automated critical tests | TODO |

## Arsitektur Sekarang

```mermaid
flowchart LR
  Browser["Browser / PWA<br/>React + Vite"]
  API["Hono API<br/>auth, jobs, signed upload, credits"]
  Storage["S3 / R2 Storage<br/>durable audio object"]
  Worker["ALTO Worker<br/>queued job processor"]
  Deepgram["Deepgram Nova 2<br/>transcription + diarization"]
  OpenAI["OpenAI gpt-4o-mini<br/>meeting summary"]
  DB["Postgres / Neon<br/>users, sessions, jobs, queue state"]
  Redis["Upstash Redis<br/>progress, stats, worker heartbeat"]
  Output["Transcript UI<br/>TXT/SRT export<br/>/share/:token"]

  Browser -->|"create job + durationSec"| API
  API -->|"signed upload URL"| Browser
  Browser -->|"PUT audio"| Storage
  Browser -->|"complete upload"| API
  API -->|"queue job"| DB
  Worker -->|"claim queued job"| DB
  Worker -->|"read object"| Storage
  Worker --> Deepgram
  Worker --> OpenAI
  Worker -->|"save transcript/status"| DB
  API --> Redis
  Worker --> Redis
  Browser -->|"poll job"| API
  API --> Output
```

## Runtime Aktif

| Area | Runtime |
|---|---|
| Frontend | Vite, React, TypeScript, Tailwind CSS, Framer Motion, Phosphor Icons, Vite PWA |
| Backend API | Node.js, Hono, Drizzle ORM, Zod |
| Worker | Node.js worker process polling queued jobs |
| Database | Postgres, ditargetkan Neon |
| Cache | Upstash Redis REST API |
| Storage | S3-compatible object storage, contoh Cloudflare R2 |
| Transcription | Deepgram Nova 2 |
| Summary | OpenAI `gpt-4o-mini` |
| Deploy | Fly.io untuk backend/worker, Netlify untuk frontend |

Catatan penting: `backend/src/services/gemini.ts` dan `backend/src/services/openai.ts` masih ada sebagai helper legacy/alternatif. Runtime upload aktif sekarang memakai `transcribeWithDeepgram` dari `backend/src/services/deepgram.ts`.

```mermaid
flowchart TB
  Runtime["Runtime Truth"]
  Runtime --> DG["Transcription aktif: Deepgram Nova 2"]
  Runtime --> OA["Summary aktif: OpenAI gpt-4o-mini"]
  Runtime --> GM["Gemini: legacy / experimental helper"]
  Runtime --> PS["Provider switch env: belum aktif"]
```

## Fitur Saat Ini

| Area | Fitur |
|---|---|
| Auth | Login username/password dengan httpOnly cookie |
| Admin | Kelola user, role admin, reset password, top-up kredit |
| Kredit | Kredit berbasis detik, reserve estimasi durasi sebelum upload |
| Reconcile | Durasi aktual Deepgram dipakai untuk refund/deduct selisih |
| Upload | Production mode stream via API ke S3/R2; signed URL optional |
| Worker | Job `queued` diproses worker terpisah |
| Transkrip | Speaker label, timestamp, punctuation, smart formatting |
| Ringkasan | Summary meeting via OpenAI |
| Export | Copy semua, copy segmen, TXT, SRT |
| Share | Link publik `/share/:token` tanpa login |
| Mobile | UI mobile-first dengan PWA build |

## Production Readiness

| Area | Status | Catatan |
|---|---|---|
| Build backend/frontend | PASS | `npm run build:backend`, `npm run build:frontend` |
| Provider docs | PASS | Deepgram + OpenAI faktual |
| Share link publik | PASS | Public token route tersedia |
| Credit tidak negatif | PARTIAL | Reserve estimasi upfront; audit log belum ada |
| Cancel running job | PASS | Soft cancel + refund estimasi |
| Upload OOM risk | PASS* | PASS jika `STORAGE_PROVIDER=s3` aktif |
| Durable transcription | PASS* | PASS jika worker process dideploy |
| Auth hardening | PARTIAL | Rate limit + strong seed; CSRF token eksplisit belum ada |
| Health check | PASS* | DB/Redis/storage/worker dicek |
| History query | PARTIAL | Tidak load transcript penuh, tapi metadata columns belum lengkap |
| Automated tests | TODO | Critical test suite belum ada |

`PASS*` berarti wajib ada S3/R2 config valid, bucket CORS benar, dan worker process aktif. Tanpa itu, app hanya masuk local/dev fallback mode.

## Yang Masih Perlu Sebelum Public-Scale

- Test critical backend: auth, credit, cancel, worker claim, share route, transcript export.
- CSRF token eksplisit untuk mutating cookie requests.
- Credit/billing audit log.
- Metadata kolom terpisah: `speaker_count`, `segment_count`, `summary`.
- Observability production yang lebih lengkap: structured logs, request ID, alerting.
- Provider abstraction jika nanti ingin fallback selain Deepgram.

## Struktur Project

```text
ALTO/
├─ backend/
│  ├─ src/
│  │  ├─ db/            schema, migrations, seed
│  │  ├─ lib/           validate, prompts
│  │  ├─ middleware/    auth middleware
│  │  ├─ routes/        auth, users, jobs, upload
│  │  ├─ services/      auth, redis, storage, deepgram, transcription
│  │  └─ worker.ts      queued transcription worker
│  ├─ Dockerfile
│  └─ fly.toml
│
├─ frontend/
│  ├─ src/
│  │  ├─ components/    upload, transcript, nav, status UI
│  │  ├─ hooks/         auth, upload, polling
│  │  ├─ lib/           api, format, limits
│  │  └─ pages/         landing, login, home, job, shared job, admin
│  └─ netlify.toml
│
├─ docs/                banner.svg, logo.svg
├─ .env.example
└─ README.md
```

<p align="center">
  <img src="docs/logo.svg" alt="ALTO logo" width="80" />
</p>

## Environment

`.env.example` berisi contoh backend dan frontend sekaligus. Jangan anggap semua variable aktif global. Buat dua file terpisah:

```powershell
Copy-Item .env.example backend/.env
Copy-Item .env.example frontend/.env
```

Isi minimal `backend/.env` untuk production mode:

```bash
NODE_ENV=staging
PORT=3000
ALLOWED_ORIGINS=https://your-frontend-domain
MAX_UPLOAD_MB=100

STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=alto-staging-uploads
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
BROWSER_DIRECT_UPLOAD=false

DATABASE_URL=postgres://user:pass@host/db?sslmode=require
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=...

DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...

WORKER_POLL_MS=5000
LOGIN_RATE_LIMIT_MAX=10
LOGIN_RATE_LIMIT_WINDOW_SEC=900

DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=change-me-min-8-chars
```

Isi minimal `frontend/.env`:

```bash
VITE_API_URL=https://your-api-domain
VITE_MAX_UPLOAD_MB=100
```

Jangan tambahkan `JWT_SECRET`, `COOKIE_SECRET`, `REDIS_URL`, `FRONTEND_ORIGIN`, atau `TRANSCRIPTION_PROVIDER` seolah-olah aktif. Nama-nama itu target arsitektur berikutnya, tapi code sekarang belum membacanya.

```mermaid
flowchart LR
  BackendEnv["Backend env"] --> DB["DATABASE_URL"]
  BackendEnv --> Redis["UPSTASH_REDIS_REST_URL/TOKEN"]
  BackendEnv --> Provider["DEEPGRAM_API_KEY<br/>OPENAI_API_KEY"]
  BackendEnv --> Storage["STORAGE_PROVIDER=s3<br/>S3_*"]
  BackendEnv --> Security["ALLOWED_ORIGINS<br/>LOGIN_RATE_LIMIT_*"]
  FrontendEnv["Frontend env"] --> API["VITE_API_URL"]
  FrontendEnv --> Limit["VITE_MAX_UPLOAD_MB"]
```

## Jalan Lokal

Install dependency:

```powershell
npm --prefix backend install
npm --prefix frontend install
```

Jalankan migration setelah `backend/.env` punya `DATABASE_URL` valid:

```powershell
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```

Start local fallback mode:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev
```

Start worker untuk production-like mode:

```powershell
npm --prefix backend run dev:worker
```

Buka:

```text
http://localhost:5173
```

## Script

Root:

```powershell
npm run dev:backend
npm run dev:worker
npm run dev:frontend
npm run build:backend
npm run build:frontend
```

Backend:

```powershell
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
npm --prefix backend run db:generate
npm --prefix backend run db:studio
npm --prefix backend run dev:worker
npm --prefix backend run start:worker
```

## Flow Job Dan Kredit

```mermaid
sequenceDiagram
  participant U as User / Browser
  participant API as Hono API
  participant S as S3 / R2
  participant DB as Postgres
  participant W as Worker
  participant DG as Deepgram
  participant OA as OpenAI

  U->>API: POST /jobs {durationSec, sizeBytes}
  API->>DB: atomic reserve credit
  API-->>U: signed upload URL
  U->>S: PUT audio
  U->>API: POST /upload/:jobId/complete
  API->>DB: status = queued
  W->>DB: claim queued job
  W->>S: read audio object
  W->>DG: transcribe + diarize
  W->>OA: generate summary
  W->>DB: save transcript + completed
  W->>DB: reconcile credit delta
  U->>API: poll /jobs/:id
  API-->>U: transcript/status
```

Credit rules:

1. Frontend membaca metadata audio dan mengirim `durationSec`.
2. Backend menolak job kalau `credit_seconds < durationSec`.
3. Backend reserve kredit estimasi secara atomic sebelum upload.
4. Worker reconcile dengan durasi aktual dari Deepgram.
5. Gagal/cancel akan refund estimasi sesuai status job.

## Share Link Publik

Owner klik tombol bagikan di halaman job. Frontend memanggil:

```text
POST /jobs/:id/share
```

Backend membuat atau reuse `jobs.share_token`, lalu frontend membuka link:

```text
/share/<token>
```

Orang tanpa login bisa melihat transcript melalui:

```text
GET /jobs/shared/:token
```

## API Ringkas

Authenticated:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/me/stats`
- `GET /jobs`
- `POST /jobs`
- `GET /jobs/:id`
- `POST /jobs/:id/share`
- `DELETE /jobs/:id`
- `POST /upload/:jobId/complete`
- `PUT /upload/:jobId` local/dev fallback only
- `/users/*` khusus admin

Public:

- `GET /health`
- `GET /jobs/shared/:token`

## Migration

Migration dijalankan dari backend package. Developer tidak perlu mengedit file SQL manual untuk setup normal.

Sebelum deploy backend yang membawa perubahan schema:

```powershell
npm --prefix backend run db:migrate
```

Pastikan target DB benar. Jangan jalankan migration staging ke database production.

## Staging Production

Pisahkan resource staging:

```text
alto-staging-api
alto-staging-worker
alto-staging-web
alto-staging-db
alto-staging-redis
alto-staging-uploads
```

Pisahkan resource production:

```text
alto-api
alto-worker
alto-web
alto-db
alto-redis
alto-uploads
```

### Backend Fly.io

Set secret staging:

```powershell
fly secrets set `
  NODE_ENV=staging `
  ALLOWED_ORIGINS=https://your-staging-web `
  MAX_UPLOAD_MB=100 `
  STORAGE_PROVIDER=s3 `
  S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com `
  S3_REGION=auto `
  S3_BUCKET=alto-staging-uploads `
  S3_ACCESS_KEY_ID=... `
  S3_SECRET_ACCESS_KEY=... `
  DEEPGRAM_API_KEY=... `
  OPENAI_API_KEY=... `
  DATABASE_URL=... `
  UPSTASH_REDIS_REST_URL=... `
  UPSTASH_REDIS_REST_TOKEN=... `
  DEFAULT_ADMIN_USERNAME=admin `
  DEFAULT_ADMIN_PASSWORD=...
```

Deploy API:

```powershell
fly deploy
```

Worker harus dideploy sebagai process/service terpisah dengan env yang sama:

```powershell
npm --prefix backend run start:worker
```

Default production upload ALTO tidak butuh R2 CORS karena browser upload ke API, lalu API stream ke R2 tanpa buffer penuh di memory. Kalau `BROWSER_DIRECT_UPLOAD=true`, set CORS agar frontend origin boleh `PUT` ke signed URL:

```json
[
  {
    "AllowedOrigins": ["https://your-staging-web"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

### Frontend Netlify

Netlify config:

- base: `frontend/`
- build command: `npm install --no-audit --no-fund && npm run build`
- publish: `dist`

Env frontend staging:

```text
VITE_API_URL=https://your-staging-api
VITE_MAX_UPLOAD_MB=100
```

Deploy backend dulu, deploy worker, lalu frontend.

## Smoke Test Staging

Checklist minimal:

- `npm --prefix backend run db:migrate` sukses.
- `npm --prefix backend run db:seed` sukses.
- Backend `/health` return `status: ok`.
- `/health` checks: `db`, `redis`, `storage`, `worker` semuanya `true`.
- Worker process aktif.
- Frontend bisa load.
- Admin login sukses.
- Test user bisa dibuat dan di-topup.
- User tanpa kredit cukup tidak bisa start job.
- Upload kecil selesai dan job masuk queue.
- Job tidak stuck di `queued`.
- Transcript selesai bisa dibuka.
- Share link bisa dibuka tanpa login.
- Export TXT dan SRT jalan.

## Security Notes

- API key hanya di backend env.
- Session pakai httpOnly cookie.
- Password di-hash bcrypt.
- Admin route dijaga `requireAdmin`.
- Login punya rate limit.
- Job read/delete/upload/share owner-scoped.
- Public transcript hanya lewat token yang sulit ditebak.
- Production upload default memakai API proxy streaming ke object storage. Direct signed URL upload optional jika R2 CORS sudah aktif.

## Lisensi

MIT.

<br/>

<p align="center">
  <sub>ALTO harus jujur secara arsitektur sebelum tampil percaya diri di production.</sub>
</p>
