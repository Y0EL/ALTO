<p align="center">
  <img src="docs/banner.svg" alt="ALTO" width="100%" />
</p>

<p align="center">
  <strong>ALTO</strong> turns long meeting audio into structured, speaker labeled transcripts in minutes. Built for teams that record more than they have time to listen back to.
</p>

<p align="center">
  <a href="#run-locally"><img src="https://img.shields.io/badge/run-locally-0a0a0b?style=flat-square&logo=node.js&logoColor=white" alt="Run locally"/></a>
  <a href="#deploy"><img src="https://img.shields.io/badge/deploy-fly.io%20%2B%20netlify-0a0a0b?style=flat-square" alt="Deploy"/></a>
  <a href="#stack"><img src="https://img.shields.io/badge/stack-react%20%2B%20hono-0a0a0b?style=flat-square" alt="Stack"/></a>
  <img src="https://img.shields.io/badge/license-MIT-0a0a0b?style=flat-square" alt="MIT"/>
</p>

<br/>

## What it does

Drop a meeting recording, get back a clean transcript. Speakers are auto labelled (`Speaker 1`, `Speaker 2`, ...), timestamps are aligned to natural speaker turns, and a short summary is generated alongside. Audio up to 9 hours per file works in a single request thanks to Google Gemini 2.5 Flash. Everything lives behind a login so your transcripts stay private to your team.

```
audio file  →  upload  →  ALTO listens  →  transcript with speakers
                                              + summary
                                              + export (TXT / SRT)
```

## Features

| | |
|---|---|
| 🎙️  Long audio | Single file up to 9 hours, no manual chunking |
| 👥  Diarization | Auto detects multiple speakers and keeps labels consistent |
| 🌐  Bilingual | Bahasa Indonesia and English, auto detect by default |
| ⚡  Live status | Lottie style progress while ALTO processes |
| 📋  Exports | One click TXT or SRT subtitle file |
| 🔐  Team auth | Username and password login, admin manages users |
| 📱  Mobile first | Built for phone first, looks just as good on desktop |

## Stack

* **Frontend** Vite, React, TypeScript, Tailwind, Framer Motion, Lottie. Deploys to Netlify.
* **Backend** Hono on Node 20, Drizzle ORM, Zod. Deploys to Fly.io.
* **Database** Neon Postgres with serverless driver.
* **Cache** Upstash Redis for job status.
* **STT engine** Google Gemini 2.5 Flash via File API.

<br/>

<p align="center">
  <img src="docs/logo.svg" alt="A" width="80" />
</p>

## Run locally

You need Node 20+ and accounts at [Neon](https://neon.tech), [Upstash](https://upstash.com), and [Google AI Studio](https://aistudio.google.com/app/apikey). All three offer generous free tiers.

**1. Clone and install.**

```powershell
git clone https://github.com/<you>/alto.git
cd alto
npm --prefix backend install
npm --prefix frontend install
```

**2. Configure backend env.**

Copy `.env.example` to `backend/.env` and fill in your values.

```bash
GEMINI_API_KEY=AIzaSy...
DATABASE_URL=postgresql://...neon.tech/...
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=...
DEFAULT_ADMIN_USERNAME=yoel
DEFAULT_ADMIN_PASSWORD=123
ALLOWED_ORIGINS=http://localhost:5173
```

**3. Migrate and seed.**

```powershell
cd backend
npm run db:generate
npm run db:migrate
npm run db:seed
```

This creates the admin user `yoel` with password `123`. You can change both later from the admin panel.

**4. Run both servers.**

```powershell
# terminal one
npm --prefix backend run dev

# terminal two
npm --prefix frontend run dev
```

Open http://localhost:5173, log in, upload an audio file. Done.

## Deploy

### Backend on Fly.io

```powershell
cd backend
fly launch --no-deploy --copy-config --name alto-api --region sin
fly secrets set GEMINI_API_KEY=... DATABASE_URL=... UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... DEFAULT_ADMIN_USERNAME=yoel DEFAULT_ADMIN_PASSWORD=123 ALLOWED_ORIGINS=https://your.netlify.app
fly deploy
```

The `release_command` in `fly.toml` runs migrations and seeds the admin user automatically.

### Frontend on Netlify

1. Push the repo to GitHub.
2. Connect Netlify to the repo. Base directory `frontend`, build command `npm install && npm run build`, publish `frontend/dist`.
3. Set env var `VITE_API_URL=https://alto-api.fly.dev`.
4. Trigger a deploy.

After the Netlify URL is final, update `ALLOWED_ORIGINS` on Fly so the backend trusts the new origin.

```powershell
fly secrets set ALLOWED_ORIGINS=https://alto.netlify.app
```

## Architecture

```
┌──────────────┐        ┌──────────────┐        ┌──────────────────┐
│   Netlify    │ ◀───▶ │   Fly.io     │ ◀───▶ │   Gemini API     │
│  React app   │        │  Hono API    │        │   File + STT     │
└──────────────┘        └──────┬───────┘        └──────────────────┘
                              │
                       ┌──────┴───────┐
                       ▼              ▼
                 ┌──────────┐   ┌───────────┐
                 │   Neon   │   │  Upstash  │
                 │ Postgres │   │   Redis   │
                 └──────────┘   └───────────┘
```

Audio bytes never touch disk on the backend. The browser streams the file straight into Fly, which forwards it to Gemini's resumable file API. The transcript JSON comes back, gets validated, and lands in Postgres.

## Folder layout

```
alto/
├── backend/                  Hono API, Drizzle, Fly.io target
│   ├── src/
│   │   ├── routes/           auth, users, jobs, upload, health
│   │   ├── services/         gemini, auth, redis, db
│   │   ├── middleware/       requireAuth, requireAdmin
│   │   └── db/               schema, migrations, seed
│   ├── Dockerfile
│   └── fly.toml
│
├── frontend/                 Vite + React, Netlify target
│   ├── public/lottie/        optional Lottie JSON drop in
│   ├── src/
│   │   ├── components/       UploadZone, JobStatus, TranscriptViewer, ...
│   │   ├── pages/            Login, Home, Job, Admin
│   │   ├── hooks/            useAuth, useUpload, useJobPolling
│   │   └── lib/              api, format
│   └── netlify.toml
│
├── docs/                     banner.svg, logo.svg
└── README.md
```

## Security notes

* All API keys live in environment variables. Nothing sensitive ships to the browser.
* Sessions use httpOnly, SameSite Lax cookies with a 30 day sliding window.
* Passwords are bcrypt hashed at cost 10.
* The default admin password `123` is for first login. Replace it from the admin panel before going public.
* The backend deletes the uploaded Gemini file when a job is deleted, so audio does not linger.

## Free tier math

For a team of ten people each uploading ten two hour meetings per month, total monthly cost lands somewhere around:

* **Gemini free tier** zero rupiah, capped at 1500 requests per day
* **Gemini Flash paid** roughly 23 USD per month
* **Whisper API** roughly 72 USD per month for the same volume

Neon, Upstash, Fly.io and Netlify each have a free tier that covers a small team comfortably.

## License

MIT. Use it, fork it, ship your own.

<br/>

<p align="center">
  <sub>Made with care for the meetings nobody wants to listen to twice.</sub>
</p>
