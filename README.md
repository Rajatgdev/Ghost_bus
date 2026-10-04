# Ghost Bus

Detects **unmatched scheduled services** on Dublin's bus network — scheduled trips that,
under a healthy and schedule-compatible live feed, have **no fresh matched vehicle and no
explicit cancellation**. It is **not** a verified physical no-show detector (a cancelled-but-silent
bus and a running-but-untracked bus look identical in the feed). We report telemetry anomalies
with explicit uncertainty, never a physical cause. See `docs/design-summary.md`.

Build for Ireland (Dogpatch Labs · OpenAI × Give(a)Go), 4 Oct 2026.

## Layout (isolated monorepo)

```
ghost-bus/
├── backend/     FastAPI — poller + detector. Deploys to Railway (Root Directory = /backend).
├── frontend/    Vite + React. Deploys to Vercel (Root Directory = frontend).
└── docs/        design summary (invariants).
```

Frontend and backend deploy **independently**: Railway root = `/backend`, Vercel root = `frontend`.
They talk over HTTP; Vercel proxies `/api/*` to Railway (see `frontend/vercel.json`).

## Quick start (backend — the part that matters first)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.skeleton --mock      # zero keys: run ONE decision cycle on a canned snapshot
cp .env.example .env               # add NTA_API_KEY
python -m app.probe                # one-off: prove the live NTA feed works (build-plan step 1)
python -m app.skeleton             # real: one live cycle, cohort health + assessments printed
```

The skeleton proves the detector (truth table + precedence + cohort health) end to end before any
server, DB, or UI. Database is OFF by default (`USE_DB=false`); schema lives in
`backend/app/db/migrations/001_initial.sql` for build-plan step 2.
