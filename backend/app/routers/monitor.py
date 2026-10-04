"""API the frontend calls.

/api/cohorts  -> the operator allowlist.
/api/cycle    -> run ONE live decision cycle now and return the bundle (cohort health,
                 per-instance assessments, coverage counts, as-of). Expected instances are
                 mocked until the static import (build-plan step 2); the detector and
                 cohort-health run for real against the live feeds.

The frozen-cycle bundle served from the DB (build-plan step 5) replaces the in-memory
preview here once ingestion + persistence land.
"""
from fastapi import APIRouter, HTTPException

from app.core.cohorts import COHORTS
from app.core.config import settings
from app.core.mockdata import mock_instances
from app.services import pipeline

router = APIRouter(prefix="/api", tags=["monitor"])


@router.get("/cohorts")
async def cohorts():
    return {"cohorts": COHORTS, "note": "operator_ids are placeholders until static import (step 2)"}


@router.post("/cycle")
async def cycle():
    if not settings.nta_api_key:
        raise HTTPException(400, "NTA_API_KEY is not set on the server.")
    preview = True
    if settings.use_db:
        from app.services import instances
        expected = await instances.active_now()
        preview = False
    else:
        expected = mock_instances()
    bundle = await pipeline.run_live_cycle(expected)
    bundle["preview"] = preview
    bundle["expected_count"] = len(expected)
    return bundle