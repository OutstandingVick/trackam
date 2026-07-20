# Trackam

**Affordable, self-hostable coding time tracking for African developers.**

WakaTime is great, but at **$9–14/month** it's out of reach for many developers in
Nigeria and across Africa. Trackam gives you the same automatic coding-time tracking —
time by project, language, editor and OS — while being **free to self-host** and
**100% compatible with the official WakaTime editor plugins**.

You don't install anything new in your editor. You keep the WakaTime plugin you already
have and just point it at your own Trackam server.

---

## Features

- **Drop-in WakaTime API compatibility** — works with the official VS Code, Cursor,
  JetBrains, Vim, Sublime, etc. plugins.
- **Automatic tracking** via heartbeats (project, language, branch, editor, OS).
- **Dashboard** with today / 7-day / 30-day views, daily chart, and breakdowns by
  project, language, editor and operating system.
- **Editor status bar** support (`statusbar/today`) so your editor shows today's total.
- **Unlimited history** — your data, your server, no paywalled history.
- **Cheap to run** — a single small VPS (1 vCPU / 1 GB RAM) hosts app + Postgres.

## Tech stack

- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL
- **Frontend:** static dashboard styled with Tailwind CSS
- **Deploy:** Docker + Docker Compose

---

## Quick start (Docker — recommended)

Requires Docker and Docker Compose.

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env and set a strong JWT_SECRET (and BASE_URL for production)

# 2. Build and start (Postgres + migrations + app)
docker compose up -d --build

# 3. Open the dashboard
open http://localhost:3000
```

That's it. Sign up, then copy your editor config from the dashboard.

## Local development (without Docker)

Requires Node.js 18+ and a running PostgreSQL.

```bash
npm install
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
npm run migrate               # create tables
npm run dev                   # start with hot reload on http://localhost:3000
```

---

## Connecting your editor

1. Install the official **WakaTime** plugin for your editor (if you don't have it).
2. Sign up on your Trackam dashboard and copy the config shown there, or edit
   `~/.wakatime.cfg` manually:

```ini
[settings]
api_url = https://your-trackam-host/api/v1
api_key = your-api-key-from-the-dashboard
```

3. Start coding. Heartbeats flow to your server and appear on the dashboard.

> **Tip:** `api_url` must end in `/api/v1`. For local testing use
> `http://localhost:3000/api/v1`.

---

## How it works

The WakaTime editor plugins send **heartbeats** (small events describing what you're
editing) to whatever `api_url` you configure. Trackam implements the same endpoints the
plugins expect:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/users/current/heartbeats.bulk` | Receive batches of heartbeats |
| `POST /api/v1/users/current/heartbeats` | Receive a single/array of heartbeats |
| `GET  /api/v1/users/current/statusbar/today` | Today's total for the editor status bar |

Coding time is derived from heartbeats the same way WakaTime does it: consecutive
heartbeats within `HEARTBEAT_TIMEOUT_SECONDS` (default **15 min**) count as continuous
coding; larger gaps are treated as breaks so idle time isn't counted.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `BASE_URL` | `http://localhost:3000` | Public URL (no trailing slash) |
| `DATABASE_URL` | `postgres://trackam:trackam@localhost:5432/trackam` | Postgres connection |
| `JWT_SECRET` | — | **Required.** Secret for signing dashboard sessions |
| `HEARTBEAT_TIMEOUT_SECONDS` | `900` | Max gap counted as continuous coding |

## Project structure

```
src/
  index.ts            # Express app + wiring
  config.ts           # Env config
  db.ts               # Postgres pool
  migrate.ts          # Runs db/schema.sql
  auth.ts             # Password/session + WakaTime API-key auth
  routes/
    wakatime.ts       # WakaTime-compatible ingestion + statusbar
    account.ts        # Signup / login / API key
    stats.ts          # Dashboard stats API
  utils/
    duration.ts       # Heartbeat -> coding time algorithm
    useragent.ts      # Parse editor/OS from User-Agent
public/               # Tailwind dashboard (index.html + app.js)
db/schema.sql         # Database schema
```

## Roadmap

- Leaderboards (private, for teams/communities)
- GitHub README time badges
- Weekly email summaries
- Optional paid hosting tier priced in naira (Paystack) to fund the free tier

## License

MIT
