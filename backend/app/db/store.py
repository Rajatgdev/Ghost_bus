"""Neon access layer — OFF by default (USE_DB=false).

Stubbed for the thin slice. Build-plan steps 3-4 implement the four-identity writes
(acquisition_attempts, source_snapshots, decision_cycles + immutable call_assessments,
incidents + transitions) with lease-epoch fencing, as raw SQL over the async session —
the schema lives in migrations/001_initial.sql, this file just queries it.
"""
# from sqlalchemy import text
# from app.db.session import SessionLocal

# TODO(step 3): record_attempt(), upsert_snapshot() (dedup on feed_kind+feed_timestamp+hash)
# TODO(step 4): write_cycle(), write_assessments(), apply_incident_transitions() [fenced by epoch]
# TODO(step 5): latest_cycle_bundle() -> the frozen read bundle for the frontend
