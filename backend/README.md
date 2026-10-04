# Ghost Bus backend

FastAPI. The poller + detector live here. Deploys to Railway (Root Directory = `/backend`).

## Run the walking skeleton first

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.skeleton --mock      # zero keys: one decision cycle on a canned snapshot
cp .env.example .env               # add NTA_API_KEY
python -m app.probe                # build-plan step 1: measure the live feed
python -m app.skeleton             # real: one live cycle over the configured cohorts
```

## Run the API

```bash
uvicorn app.main:app --reload
# GET  /health                      app + db health
# GET  /api/cohorts                 the operator allowlist
# POST /api/cycle                   run ONE live decision cycle, return the bundle
```

## Structure

```
app/
├── main.py              FastAPI + CORS + /health
├── skeleton.py          run-me-first proof (mock or real)
├── probe.py             build-plan step 1: measure the live feed (one-off)
├── core/
│   ├── config.py        settings + thresholds (policy lives here)
│   └── cohorts.py       the operator allowlist — edit this to add an operator
├── services/
│   ├── nta.py           GTFS-R client (x-api-key, ?format=json) + JSON parse helpers
│   ├── feasibility.py   step-1 probe logic (pure summarize + run)
│   ├── health.py        the cohort-health formula (Axis-A gate)
│   ├── detector.py      THE CORE — the one decision function (truth table + precedence)
│   └── pipeline.py      wires ONE in-memory decision cycle (no DB yet)
├── routers/monitor.py   /api/cohorts, /api/cycle
├── db/                  Neon layer — OFF by default (USE_DB=false); schema in migrations/
└── models/schemas.py    ExpectedInstance, VehicleObservation, CohortHealth, CallAssessment
```

Expected instances are **mocked** until the static GTFS import (build-plan step 2); the detector
and cohort-health run for real against the live Vehicles/TripUpdates feeds.

## Deploy to Railway

1. Push repo to GitHub.
2. New Railway service → connect repo → **Root Directory = `/backend`**.
3. Add env vars from `.env.example` (Railway auto-detects `$PORT`).
4. Set `ALLOWED_ORIGINS` to your Vercel URL.
