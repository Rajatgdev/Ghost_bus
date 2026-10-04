# Ghost Bus

**Spot the Dublin buses that are scheduled, due, and simply not there — live.**

Ghost Bus watches Dublin's bus schedule against the live vehicle feed and surfaces the
trips that *should* be on the road right now but have **no live vehicle reporting and no
cancellation**. These are "ghost buses": services the apps still show as due, that never
come.

It is deliberately **not** a verified physical no-show detector. A bus that was quietly
cancelled and a bus that is running with a broken GPS tracker look *identical* in the feed,
so Ghost Bus reports the honest, observable fact — *"scheduled, due, no vehicle"* — and
**never claims the cause**. That restraint is the point: it's a telemetry-anomaly detector
you can trust, not a guess dressed up as certainty.

Built in a day for **Build for Ireland** (Dogpatch Labs · OpenAI × Give(a)Go), Dublin AI Week.

- **Live app:** https://ghost-bus-olive.vercel.app
- **API:** https://ghostbus-production.up.railway.app
- **Stack:** FastAPI (Railway) · Postgres (Neon) · Vite + React (Vercel) · NTA GTFS-Realtime · **Jev / TypeSafe**

---

## How it works

Every check asks three questions and compares the answers:

1. **What *should* be running now?** — a query over the static GTFS timetable in Postgres
   (calendar + trip windows) builds the set of trips scheduled and due at this moment.
2. **What *is* running now?** — two live NTA GTFS-Realtime feeds: **Vehicles** (every bus
   with a GPS position + `trip_id`) and **TripUpdates** (predictions + cancellations).
3. **Which scheduled trips have no bus behind them?** — the two sets are joined on `trip_id`.
   A scheduled, due trip whose `trip_id` has no live vehicle, and that wasn't cancelled, is
   flagged **unmatched** (a ghost candidate).

```
 Static schedule (Neon)            Live feed (NTA GTFS-RT)
 "should be running now"           "actually running now"
          |                                 |
          +----------------+----------------+
                      join on trip_id
                           |
          +----------------+----------------+
   has a live vehicle            no vehicle + not cancelled
   -> Vehicle observed           + past its grace window
                                 -> GHOST (unmatched)
```

### What keeps it honest

- **A grace period.** Buses often switch their tracker on a few minutes late, so a due trip
  isn't flagged the instant it's due — it waits in a `watch` state for a few minutes first
  (`UNMATCHED_GRACE_SECS`, default 180s). Only if there's *still* no vehicle does it become a
  ghost. This is the difference between a defensible flag and a false alarm.
- **Cohort health gate.** If too little of the fleet is reporting (feed outage, stale data),
  the detector abstains rather than flag everything as missing.
- **No cause claimed, ever.** Cancellations the operator actually reports are shown
  separately; a missing vehicle is only ever reported as "no live vehicle", never as a
  cancellation.
- **Follow-up tracking.** Each flagged trip is watched across later checks and resolved into
  an honest outcome — *vehicle appeared later*, *cancellation sent later*, *never seen before
  it left the schedule*, or *no later check to confirm* — so a snapshot becomes evidence.

### Ask it in plain English (Jev)

A natural-language box sits on top, powered by **Jev (TypeSafe System One)**. Jev maps a
typed-in question to a structured filter — *intent* (`only_ghosts`, a specific route, a
summary) and *which route* — and the backend applies that filter to the **real** detection
results. Jev chooses *what to show*; it never generates the data, so it cannot invent a bus
that isn't really missing.

> "any ghost buses right now?"  ·  "what's happening with the 39?"  ·  "give me a quick summary"

---

## Layout (isolated monorepo)

```
ghost-bus/
|-- backend/     FastAPI — detector + live cycle + Jev. Deploys to Railway (Root Dir = /backend).
|   `-- app/
|       |-- services/  nta . instances . health . detector . pipeline . jev . feasibility
|       |-- routers/   monitor.py  (the API)
|       |-- db/        Neon schema + static GTFS importer
|       |-- skeleton.py  run-me-first proof
|       `-- probe.py     one-off live-feed feasibility check
|-- frontend/    Vite + React dashboard. Deploys to Vercel (Root Dir = frontend).
|   `-- src/     Live page . AskBox . FlaggedMap . FollowUp . PastChecks . StatusBanner
`-- docs/        design-summary.md (the load-bearing invariants)
```

Frontend and backend deploy **independently**. Vercel proxies `/api/*` to the Railway
backend (see `frontend/vercel.json`), so the browser uses same-origin relative paths.

---

## API

| Method & path | Does |
| --- | --- |
| `GET /health` | App + database health |
| `GET /api/cohorts` | The operator allowlist |
| `POST /api/cycle` | Run one live decision cycle; returns every scheduled trip with its assessment, cohort health, coverage counts, and as-of time |
| `POST /api/ask` | Natural-language question (`{"question": "..."}`) -> Jev routes it, the backend answers from the real cycle |

`POST /api/cycle` and `POST /api/ask` return per-trip rows with: route, scheduled stop,
due time, and one of `vehicle_observed . watch . unmatched . predicted_delayed .
explicit_cancelled . explicit_deleted . data_unusable . excluded_unsupported`.

---

## Run it locally

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # add NTA_API_KEY, DATABASE_URL(s), JEV_API_KEY; set USE_DB=true

# prove the detector end to end with zero keys / zero network:
python -m app.skeleton --mock

# check the live NTA feed is healthy (incrementality, trip_id presence, skew, cadence):
python -m app.probe

# serve the API:
uvicorn app.main:app --reload     # http://localhost:8000
```

**One-time data load (Neon).** The detector needs the Dublin timetable in Postgres:

```bash
python -m app.db.migrate                         # create the schema (direct Neon URL)
curl -L -o gtfs.zip https://www.transportforireland.ie/transitData/Data/GTFS_Realtime.zip
python -m app.db.import_static gtfs.zip          # loads a ~20-route Dublin Bus slice
```

The importer streams the 429 MB `stop_times.txt` and keeps only the allowlisted routes, so
it stays well within a free Neon tier.

### Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173 (proxies /api -> localhost:8000)
```

---

## Environment

| Var | Where | Purpose |
| --- | --- | --- |
| `NTA_API_KEY` | backend | NTA GTFS-Realtime key (header `x-api-key`) |
| `DATABASE_URL` / `DATABASE_URL_DIRECT` | backend | Neon pooled (app) / direct (migrations) |
| `USE_DB` | backend | `true` to use the real schedule (vs. the mock skeleton) |
| `JEV_API_KEY` / `JEV_MODEL` | backend | TypeSafe System One (Jev) for `/api/ask` |
| `UNMATCHED_GRACE_SECS` | backend | grace before a due trip is flagged (default 180) |
| `ALLOWED_ORIGINS` | backend | CORS: your Vercel URL |
| `VITE_API_URL` | frontend | backend URL (local dev) |

---

## Design

The full technical design — the two-axis uncertainty model, the four data identities, the
decision truth-table, the cohort-health formula, and the deliberate scope cuts — lives in
[`docs/design-summary.md`](docs/design-summary.md). The short version: **detection is pure,
deterministic code; Jev sits on top as an optional natural-language layer and never touches a
verdict.**

*Data: NTA GTFS-Realtime (TripUpdates + Vehicles) and TFI static timetable. Not affiliated
with the NTA or TFI.*