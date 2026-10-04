"""Wire ONE decision cycle in memory (no DB yet).

fetch Vehicles + TripUpdates -> parse -> cohort health -> assess each expected instance.
Expected instances are supplied by the caller (mocked until the static import, step 2);
the detector and cohort-health run for real. DB persistence, the four-identity tables, and
the incident lifecycle are build-plan steps 3-4.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

from app.core.cohorts import PREVIEW_COHORT
from app.core.config import settings
from app.models.schemas import (
    Assessment, CallAssessment, ExpectedInstance, TripPrediction, VehicleObservation,
)
from app.services import detector, health, nta


def _now_service_secs() -> int:
    """Service-day seconds in Europe/Dublin (NOT server-local — Railway runs UTC)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    now = datetime.now(ZoneInfo("Europe/Dublin"))
    return now.hour * 3600 + now.minute * 60 + now.second


def parse_vehicles(body: dict | None) -> list[VehicleObservation]:
    out = []
    for e in nta.entities(body):
        v = e.get("vehicle") if isinstance(e.get("vehicle"), dict) else {}
        pos = v.get("position") or {}
        out.append(VehicleObservation(
            entity_id=str(e.get("id", "")),
            trip_id=nta.trip_id_of(e, "Vehicles"),
            route_id=(v.get("trip") or {}).get("route_id"),
            latitude=pos.get("latitude"),
            longitude=pos.get("longitude"),
            vehicle_timestamp=v.get("timestamp"),
        ))
    return out


def parse_predictions(body: dict | None) -> dict[str, TripPrediction]:
    out: dict[str, TripPrediction] = {}
    for e in nta.entities(body):
        tu = e.get("trip_update") if isinstance(e.get("trip_update"), dict) else {}
        trip = tu.get("trip") or {}
        tid = nta.trip_id_of(e, "TripUpdates")
        if not tid:
            continue
        out[tid] = TripPrediction(
            trip_id=tid,
            schedule_relationship=trip.get("schedule_relationship"),
        )
    return out


def assess_cycle(instances: list[ExpectedInstance],
                 vehicles: list[VehicleObservation],
                 predictions: dict[str, TripPrediction],
                 *, feed_usable: bool, cycles_observed: int = 99,
                 now_secs: int | None = None) -> dict[str, Any]:
    """Pure: run cohort health + the decision function over the given cycle inputs."""
    now = now_secs if now_secs is not None else _now_service_secs()
    matched_trip_ids = {v.trip_id for v in vehicles if v.trip_id}

    # one synthetic cohort for the preview (real per-operator attribution needs static, step 2)
    expected = len(instances)
    matched = sum(1 for i in instances if i.trip_id in matched_trip_ids)
    ch = health.cohort_health(PREVIEW_COHORT, expected=expected, matched=matched,
                              feed_usable=feed_usable, cycles_observed=cycles_observed)

    assessments: list[CallAssessment] = []
    for inst in instances:
        pred = predictions.get(inst.trip_id)
        assessments.append(detector.assess(
            inst,
            cohort_healthy=ch.healthy,
            now_secs=now,
            schedule_relationship=pred.schedule_relationship if pred else None,
            matched_vehicle=inst.trip_id in matched_trip_ids,
            predicted_due_secs=pred.predicted_due_secs if pred else None,
            has_fresh_prediction=bool(pred and pred.predicted_due_secs is not None),
            grace_secs=settings.unmatched_grace_secs,
        ))

    counts: dict[str, int] = {a.value: 0 for a in Assessment}
    for a in assessments:
        counts[a.assessment.value] += 1

    return {
        "as_of": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "now_service_secs": now,
        "cohort_health": ch.model_dump(),
        "counts": counts,
        "assessments": [a.model_dump() for a in assessments],
        "feed_usable": feed_usable,
    }


async def run_live_cycle(instances: list[ExpectedInstance]) -> dict[str, Any]:
    """Fetch both live feeds with the configured key and assess the given instances."""
    v_res, t_res = await asyncio.gather(
        nta.fetch(settings.nta_base_url, settings.nta_api_key, "Vehicles",
                  secondary=settings.nta_api_key_secondary),
        nta.fetch(settings.nta_base_url, settings.nta_api_key, "TripUpdates",
                  secondary=settings.nta_api_key_secondary),
    )
    vehicles = parse_vehicles(v_res["body"])
    predictions = parse_predictions(t_res["body"])

    incr = nta.incrementality(v_res["body"])
    v_ts, t_ts = nta.header_ts(v_res["body"]), nta.header_ts(t_res["body"])
    skew = abs(v_ts - t_ts) if (v_ts and t_ts) else None
    feed_usable = (
        v_res["status"] == 200
        and (incr in (None, "FULL_DATASET"))         # NTA omits -> defaults to FULL_DATASET
        and (skew is None or skew <= settings.max_skew_secs)
    )

    bundle = assess_cycle(instances, vehicles, predictions, feed_usable=feed_usable)
    bundle["feed"] = {
        "vehicles_status": v_res["status"], "trip_updates_status": t_res["status"],
        "incrementality": incr, "skew_s": skew,
        "vehicles_entities": len(vehicles), "trip_updates_entities": len(predictions),
        "error": v_res["error"] or t_res["error"],
    }
    return bundle
