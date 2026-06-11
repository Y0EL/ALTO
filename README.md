<p align="center">
  <img src="docs/banner.svg" alt="ALTO" width="100%" />
</p>

<p align="center">
  <strong>ALTO</strong> adalah aplikasi transkrip meeting untuk audio Bahasa Indonesia dan Inggris.
  Upload audio, dapatkan transkrip berlabel pembicara, ringkasan, export TXT/SRT, dan link publik untuk berbagi.
</p>

<p align="center">
  <a href="#jalan-lokal"><img src="https://img.shields.io/badge/local-dev-0a0a0b?style=flat-square&logo=node.js&logoColor=white" alt="Local dev"/></a>
  <a href="#staging-production"><img src="https://img.shields.io/badge/staging-readying-0a0a0b?style=flat-square" alt="Staging"/></a>
  <a href="#runtime-aktif"><img src="https://img.shields.io/badge/runtime-Deepgram%20%2B%20OpenAI-0a0a0b?style=flat-square" alt="Runtime"/></a>
  <a href="#lisensi"><img src="https://img.shields.io/badge/license-MIT-0a0a0b?style=flat-square" alt="MIT"/></a>
</p>

<br/>

## Status

```text
╔══════════════════════════════════════════════════════════════════════╗
║  STATUS: STAGING HARDENING                                          ║
╠══════════════════════════════════════════════════════════════════════╣
║  Production candidate untuk controlled launch.                      ║
║  Wajib deploy API + worker + object storage untuk production mode.  ║
║                                                                      ║
║  Masih belum public-scale sampai test suite dan observability        ║
║  production lengkap selesai.                                        ║
╚══════════════════════════════════════════════════════════════════════╝
```

## Arsitektur Sekarang

```text
┌──────────────────┐
│   Browser / PWA   │
│  React + Vite     │
└───────┬─────┬────┘
        │     │ signed PUT audio
        │     ▼
        │  ┌──────────────────┐
        │  │ S3 / R2 Storage   │
        │  │ durable audio     │
        │  └────────┬─────────┘
        │           │ worker reads object
        ▼           ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│     Hono API      │───────▶│   ALTO Worker     │───────▶│  Deepgram Nova 2  │
│  auth, jobs,      │ queue  │  transcription    │        │ transcription +   │
│  signed upload,   │ job    │  processor        │◀───────│ diarization       │
│  credits          │        └────────┬─────────┘        └──────────────────┘
└───────┬──────────┘                 │
        │                            │ summary request
        │                            ▼
        │                  ┌──────────────────┐
        │                  │ OpenAI gpt-4o-mini│
        │                  │ meeting summary   │
        │                  └──────────────────┘
        │
        ├──────────────▶┌──────────────────┐
        │               │ Postgres / Neon   │
        │               │ users, sessions,  │
        │               │ jobs, queue state │
        │               └──────────────────┘
        │
        └──────────────▶┌──────────────────┐
                        │ Upstash Redis     │
                        │ progress, stats,  │
                        │ worker heartbeat  │
                        └──────────────────┘

Output:
  ├─ transcript detail
  ├─ TXT / SRT export
  └─ public share link: /share/:token
```

## Runtime Aktif

| Area | Runtime |
|---|---|
| Frontend | Vite, React, TypeScript, Tailwind CSS, Framer Motion, Phosphor Icons, Vite PWA |
| Backend | Node.js, Hono, Drizzle ORM, Zod |
| Database | Postgres, ditargetkan Neon |
| Cache | Upstash Redis REST API |
| Storage | S3-compatible object storage, contoh Cloudflare R2 |
| Transcription | Deepgram Nova 2 |
| Summary | OpenAI `gpt-4o-mini` |
| Deploy | Fly.io untuk backend, Netlify untuk frontend |

Catatan penting: `backend/src/services/gemini.ts` dan `backend/src/services/openai.ts` masih ada sebagai helper legacy/alternatif. Runtime upload aktif sekarang memakai `transcribeWithDeepgram` dari `backend/src/services/deepgram.ts`.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Runtime truth                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Transcription aktif : Deepgram Nova 2                               │
│ Summary aktif       : OpenAI gpt-4o-mini                            │
│ Gemini              : legacy / experimental helper, bukan runtime   │
│ Provider switch env : belum ada                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Fitur Saat Ini

| | |
|---|---|
| Auth | Login username/password dengan httpOnly cookie |
| Admin | Kelola user, role admin, reset password, top-up kredit |
| Kredit | Kredit berbasis detik, reserve estimasi durasi sebelum upload |
| Reconcile | Durasi aktual Deepgram dipakai untuk refund/deduct selisih |
| Upload limit | Default staging-safe `100 MB`, configurable via env |
| Transkrip | Speaker label, timestamp, punctuation, smart formatting |
| Ringkasan | Summary meeting via OpenAI |
| Export | Copy semua, copy segmen, TXT, SRT |
| Share | Link publik `/share/:token` tanpa login |
| Mobile | UI mobile-first dengan PWA build |

## Yang Belum Production-Wide

Ini bukan kosmetik. Ini blocker sebelum release besar:

- Upload masih dibuffer di memory API. `MAX_UPLOAD_MB` wajib konservatif sampai object storage dipasang.
- Production mode wajib `STORAGE_PROVIDER=s3`; fallback API upload hanya untuk local/dev.
- Worker terpisah wajib dideploy bersama API. Tanpa worker, job direct upload akan berhenti di `queued`.
- `TRANSCRIPTION_PROVIDER` belum dibaca code. Provider abstraction belum selesai.
- CSRF token eksplisit belum ada; saat ini mitigasi mengandalkan strict credentialed CORS + JSON requests.
- Test critical backend belum ada.
- Metadata transcript belum dipisah penuh ke kolom seperti `speaker_count`, `segment_count`, `summary`.

```text
╔══════════════════════════════════════════════════════════════════════╗
║  PRODUCTION READINESS                                               ║
╠══════════════════════════════╦═══════════════════════════════════════╣
║  Area                        ║  Status                               ║
╠══════════════════════════════╬═══════════════════════════════════════╣
║  Build backend/frontend      ║  PASS                                 ║
║  Provider docs               ║  PASS - Deepgram + OpenAI faktual     ║
║  Share link publik           ║  PASS                                 ║
║  Credit tidak negatif        ║  IMPROVED - reserve estimasi upfront  ║
║  Cancel running job          ║  IMPROVED - soft cancel + refund      ║
║  Upload OOM risk             ║  PASS dengan STORAGE_PROVIDER=s3      ║
║  Durable transcription       ║  PASS dengan worker process           ║
║  Auth hardening lengkap      ║  PARTIAL - rate limit + strong seed   ║
║  Health check lengkap        ║  PASS untuk DB/Redis/storage/worker   ║
║  Automated tests             ║  FAIL - belum ada test critical       ║
╚══════════════════════════════╩═══════════════════════════════════════╝
```

## Struktur Project

```text
ALTO/
├─ backend/
│  ├─ src/
│  │  ├─ db/            schema, migrations, seed
│  │  ├─ lib/           validate, prompts
│  │  ├─ middleware/    auth middleware
│  │  ├─ routes/        auth, users, jobs, upload
│  │  └─ services/      auth, redis, deepgram, openai, gemini legacy
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

Isi minimal `backend/.env`:

```bash
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:5173
MAX_UPLOAD_MB=100
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=alto-staging-uploads
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false

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
VITE_API_URL=http://localhost:3000
VITE_MAX_UPLOAD_MB=100
```

Jangan tambahkan `JWT_SECRET`, `COOKIE_SECRET`, `REDIS_URL`, `FRONTEND_ORIGIN`, atau `TRANSCRIPTION_PROVIDER` seolah-olah aktif. Nama-nama itu target arsitektur berikutnya, tapi code sekarang belum membacanya.

```text
┌────────────────────────────┐
│ Env yang aktif sekarang    │
├────────────────────────────┤
│ Backend                    │
│ - DATABASE_URL             │
│ - UPSTASH_REDIS_REST_URL   │
│ - UPSTASH_REDIS_REST_TOKEN │
│ - DEEPGRAM_API_KEY         │
│ - OPENAI_API_KEY           │
│ - ALLOWED_ORIGINS          │
│ - MAX_UPLOAD_MB            │
│ - STORAGE_PROVIDER         │
│ - S3_ENDPOINT              │
│ - S3_REGION                │
│ - S3_BUCKET                │
│ - S3_ACCESS_KEY_ID         │
│ - S3_SECRET_ACCESS_KEY     │
│ - WORKER_POLL_MS           │
│ - LOGIN_RATE_LIMIT_MAX     │
│ - DEFAULT_ADMIN_USERNAME   │
│ - DEFAULT_ADMIN_PASSWORD   │
│                            │
│ Frontend                   │
│ - VITE_API_URL             │
│ - VITE_MAX_UPLOAD_MB       │
└────────────────────────────┘
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

Kalau `DATABASE_URL` belum ada, migrate akan gagal dengan:

```text
DATABASE_URL is required
```

Start backend dan frontend:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev
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

1. Frontend membaca metadata audio dan mengirim `durationSec`.
2. Backend menolak job kalau `credit_seconds < durationSec`.
3. Backend reserve kredit estimasi secara atomic sebelum upload.
4. Production mode: frontend upload audio langsung ke S3/R2 signed URL.
5. Frontend memanggil complete endpoint; backend mengubah job ke `queued`.
6. Worker mengambil job `queued`, membaca audio dari storage, lalu mengirim ke Deepgram.
7. Deepgram mengembalikan transcript dan durasi aktual.
8. Backend reconcile kredit:
   - aktual lebih pendek: refund selisih.
   - aktual lebih panjang: deduct selisih tanpa membuat balance negatif.
9. Kalau upload/transcription gagal, kredit estimasi direfund.
10. Kalau running job dibatalkan, status jadi `cancelled` dan kredit estimasi direfund.

```text
┌────────────┐
│ create job │
└─────┬──────┘
      │ require durationSec
      ▼
┌──────────────────────┐
│ atomic credit reserve │
│ credit >= duration    │
└─────┬────────────────┘
      │ signed URL
      ▼
┌──────────────┐
│ direct upload│──fail/cancel──▶┌───────────────┐
│ to S3 / R2   │                │ refund reserve│
└─────┬────────┘                └───────────────┘
      │ complete
      ▼
┌────────────┐
│ queued     │
└─────┬──────┘
      │ worker claim
      ▼
┌──────────────┐
│ transcribing │
└─────┬────────┘
      │ actual duration
      ▼
┌──────────────────────┐
│ reconcile credit      │
│ refund / deduct delta │
└─────┬────────────────┘
      ▼
┌───────────┐
│ completed │
└───────────┘
```

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
- `PUT /upload/:jobId`
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

Deploy:

```powershell
fly deploy
```

`backend/fly.toml` menjalankan release command:

```text
node dist/db/migrate.js && node dist/db/seed.js
```

Worker harus dideploy sebagai process/service terpisah dengan env yang sama:

```powershell
npm --prefix backend run start:worker
```

Untuk Cloudflare R2/S3 bucket, set CORS agar frontend origin boleh `PUT` ke signed URL:

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

Deploy backend dulu, baru frontend, kalau ada perubahan API/env/database.

## Definition Of Done Production

ALTO baru boleh disebut production-ready setelah daftar ini hijau:

```text
┌──────────────────────────────────────────────┬─────────┐
│ Requirement                                  │ Status  │
├──────────────────────────────────────────────┼─────────┤
│ Staging env terpisah dari production          │ OPS     │
│ README dan source code sinkron                │ PASS    │
│ Upload tidak OOM                              │ PASS*   │
│ Transcription pakai durable worker/queue      │ PASS*   │
│ Credit tidak bisa negatif                     │ PARTIAL │
│ Cancel job tidak deduct credit                │ PASS    │
│ Auth hardened dengan rate limit               │ PASS    │
│ Progress berasal dari backend                 │ PASS    │
│ History tidak load transcript besar penuh     │ PARTIAL │
│ Test critical backend                         │ TODO    │
│ Health check DB/Redis/worker                  │ PASS*   │
│ Deploy bisa diulang tanpa manual guessing     │ PARTIAL │
└──────────────────────────────────────────────┴─────────┘

*PASS membutuhkan `STORAGE_PROVIDER=s3`, bucket CORS benar, dan worker process
aktif. Tanpa itu, aplikasi hanya berjalan dalam local/dev fallback mode.
```

## Smoke Test Staging

Checklist minimal:

- `backend/.env` atau Fly secrets punya `DATABASE_URL`.
- `npm --prefix backend run db:migrate` sukses.
- `npm --prefix backend run db:seed` sukses.
- Backend `/health` return ok, termasuk `db`, `redis`, `storage`, dan `worker`.
- Worker process aktif dan heartbeat terlihat di `/health`.
- Frontend bisa load.
- Admin login sukses.
- Password default lemah ditolak di `NODE_ENV=staging`.
- Test user bisa dibuat dan di-topup.
- User tanpa kredit cukup tidak bisa start job.
- Upload kecil selesai.
- Upload kecil lewat signed URL selesai.
- Upload di atas `MAX_UPLOAD_MB` ditolak frontend dan backend.
- Running job cancel mengembalikan kredit estimasi.
- Transcript selesai bisa dibuka.
- Share link bisa dibuka tanpa login.
- Export TXT dan SRT jalan.

## Security Notes

- API key hanya di backend env.
- Session pakai httpOnly cookie.
- Password di-hash bcrypt.
- Admin route dijaga `requireAdmin`.
- Job read/delete/upload/share owner-scoped.
- Public transcript hanya lewat token yang sulit ditebak.
- Production upload memakai signed URL ke object storage. Fallback API upload hanya untuk local/dev.

## Lisensi

MIT.

<br/>

<p align="center">
  <sub>ALTO harus jujur secara arsitektur sebelum tampil percaya diri di production.</sub>
</p>
