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


@router.post("/ask")
async def ask(payload: dict):
    """Natural-language question over the CURRENT live cycle (additive; Jev-backed).

    Jev maps the question -> a typed filter (intent + route). Code runs the real cycle and
    applies the filter to the REAL assessments, so the answer can only contain real results.
    Falls back to 'all current ghosts' if Jev is unavailable.
    """
    question = (payload or {}).get("question", "").strip()
    if not question:
        raise HTTPException(400, "Ask a question, e.g. 'any ghost buses on the 39 right now?'")
    if not settings.nta_api_key:
        raise HTTPException(400, "NTA_API_KEY is not set on the server.")

    # 1) the real cycle (unchanged detector)
    if settings.use_db:
        from app.services import instances
        expected = await instances.active_now()
    else:
        expected = mock_instances()
    bundle = await pipeline.run_live_cycle(expected)
    rows = bundle["assessments"]
    routes = sorted({r["instance"]["route_short_name"] for r in rows})

    # 2) ask Jev for the filter (typed); fall back to only_ghosts on any error
    intent, route, conf, jev_ok = "only_ghosts", None, 0.0, False
    try:
        from app.services import jev
        f = await jev.route_question(question, routes)
        intent, route, conf, jev_ok = f["intent"], f["route"], f["confidence"], True
    except Exception as e:
        print(f"[ask] jev fallback: {e!r}")

    # 3) apply the filter IN CODE to the real rows
    def is_ghost(r):
        return r["assessment"] == "unmatched"
    if route:
        sel = [r for r in rows if r["instance"]["route_short_name"] == route]
    elif intent == "only_ghosts":
        sel = [r for r in rows if is_ghost(r)]
    elif intent == "everything":
        sel = rows
    else:  # summary
        sel = [r for r in rows if is_ghost(r)]

    ghosts = [r for r in sel if is_ghost(r)]
    counts = bundle["counts"]

    # 4) a plain-English answer WRITTEN BY CODE from the real numbers (Jev never writes prose)
    if route:
        g = len(ghosts)
        answer = (f"Route {route}: {g} scheduled trip(s) with no live vehicle right now."
                  if g else f"Route {route}: all scheduled trips currently have a vehicle (or aren't due yet).")
    elif intent == "summary":
        answer = (f"{counts.get('unmatched', 0)} unmatched, "
                  f"{counts.get('vehicle_observed', 0)} with a vehicle, "
                  f"{counts.get('watch', 0)} not yet due.")
    else:
        g = counts.get("unmatched", 0)
        answer = (f"{g} Dublin bus trip(s) are scheduled and due right now with no live vehicle."
                  if g else "No unmatched trips right now — everything due has a vehicle.")

    return {
        "question": question, "answer": answer,
        "intent": intent, "route": route, "jev_confidence": conf, "jev_used": jev_ok,
        "results": sel, "as_of": bundle["as_of"], "counts": counts,
    }