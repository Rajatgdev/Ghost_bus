# Design summary — load-bearing invariants

Full spec: the Ghost Bus Technical Design Doc (v3). This is the one-screen version for coding
agents and humans. When in doubt, the doc wins.

## The claim
Detect **unmatched scheduled services** — an observable telemetry anomaly — never a physical
no-show. Unit of claim = a **dated trip instance**. No stop-level service claims in the MVP.

## Two axes of uncertainty (the spine)
- **Axis A — data usability** (cohort health, FULL_DATASET, usable timestamps, bounded skew).
  If bad -> **abstain** (`data_unusable`).
- **Axis B — physical cause** (silent-cancel vs silent-tracking-failure). Unknowable; carried in
  the report as "cause unknown"; never blocks a flag.
Abstention is driven by Axis A, never by Axis B.

## Four identities (never conflate)
1. acquisition_attempt — every fetch, success/fail.
2. source_snapshot — immutable; dedup by (feed_kind, feed_timestamp, canonical_hash).
3. decision_cycle + immutable call_assessment — answers read these frozen rows, never mutable incidents.
4. expected_instance — a dated trip from STATIC; the enumeration. Missing match = the signal.
A serial id is never an idempotency or ownership key.

## Decision precedence (services/detector.py)
cohort health gate -> explicit CANCELED/DELETED -> unsupported kind ->
effective_due = min(static+max_ext, max(static, predicted)) ->
fresh matched vehicle (vehicle_observed) -> fresh prediction & now<due (predicted_delayed) ->
before start / within window (watch) -> else unmatched.
Raw facts always stored; trusted classification only after the gate.

## Cohort health (services/health.py; static denominators)
feed_unusable / cohort_down (E>0,M=0) / cohort_coldstart / cohort_degraded / cohort_healthy.
Denominator E from static expected, not matched-only (no selection bias). Thresholds from the
step-1 probe, in config.

## Lifecycle (build-plan step 4)
call_assessment (per cycle, immutable) != incident lifecycle
(candidate -> persistent_unmatched -> resolved/expired). Miss streak advances only on a NEW
distinct Vehicles snapshot. Re-entry = new episode. Count trips/episodes/cohorts, not rows.

## Runtime
Single writer via lease (leader_id, epoch); writes conditional on epoch (fencing, not
idempotency). Neon pooled for app, direct for migrations/lease. Monotonic-deadline scheduler
(skip, no catch-up burst). Atomic snapshot publication (staging->complete). FULL_DATASET only.

## Where the code is now
- REAL: detector (truth table + precedence), cohort health, NTA client + parse, feasibility
  probe, one in-memory decision cycle, the walking skeleton, the API (/api/cohorts, /api/cycle).
- MOCKED until step 2 (static import): expected instances (core/mockdata.py).
- STUBBED: db/store.py (four-identity writes, step 3-4), jobs/run_cycle.py persistence (step 4).

## Scope cuts (MVP) — report as coverage, do not hide
Excluded: frequency/headway, NEW/REPLACEMENT/DUPLICATED, stop-level progress/service, area
geography, route-shape map, Jev on the critical path.
