"""Build-plan step 1: the feasibility probe logic.

Turns the design's "measurement-gated" items into real numbers before the detector is
trusted: HTTP success, incrementality, trip_id presence, cross-feed join rate, skew,
source cadence, and the real JSON shape. ``summarize`` is pure; ``run`` polls.
Static-vs-realtime exact-match needs the static import (step 2) and is listed as pending.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

from app.core.config import settings
from app.services import nta


async def _sample(feed: str) -> dict[str, Any]:
    r = await nta.fetch(settings.nta_base_url, settings.nta_api_key, feed,
                        secondary=settings.nta_api_key_secondary)
    ents = nta.entities(r["body"])
    trip_ids = [t for t in (nta.trip_id_of(e, feed) for e in ents) if t]
    return {
        "feed": feed, "status": r["status"], "error": r["error"],
        "header_ts": nta.header_ts(r["body"]),
        "incrementality": nta.incrementality(r["body"]),
        "entity_count": len(ents), "trip_id_count": len(trip_ids), "trip_ids": trip_ids,
        "top_level_keys": sorted(r["body"].keys()) if isinstance(r["body"], dict) else None,
        "sample_entity_keys": sorted(ents[0].keys()) if ents and isinstance(ents[0], dict) else None,
    }


def summarize(vehicle_samples: list[dict], tripupdate_samples: list[dict]) -> dict[str, Any]:
    """Pure: collected samples -> feasibility report. No network (deterministic)."""
    def ok(s): return [x for x in s if x["status"] == 200]
    def dts(s): return sorted({x["header_ts"] for x in s if x["header_ts"] is not None})

    def cadence(s):
        ts = dts(s)
        gaps = [b - a for a, b in zip(ts, ts[1:]) if b > a]
        return round(sum(gaps) / len(gaps), 1) if gaps else None

    def presence(s):
        tot = sum(x["entity_count"] for x in s)
        tid = sum(x["trip_id_count"] for x in s)
        return round(100.0 * tid / tot, 1) if tot else None

    def avg(s):
        return round(sum(x["entity_count"] for x in s) / len(s), 1) if s else None

    def incr(s):
        return sorted({x["incrementality"] for x in s if x["incrementality"]}) or None

    v, t = ok(vehicle_samples), ok(tripupdate_samples)
    overlap = skew = None
    if v and t:
        vs, ts = set(v[-1]["trip_ids"]), set(t[-1]["trip_ids"])
        if vs:
            overlap = round(100.0 * len(vs & ts) / len(vs), 1)
        if v[-1]["header_ts"] and t[-1]["header_ts"]:
            skew = abs(v[-1]["header_ts"] - t[-1]["header_ts"])

    vc = cadence(v)
    persistence = None
    if vc is not None:
        persistence = {"vehicle_source_cadence_s": vc,
                       "min_window_for_2_snapshots_s": round(2 * vc, 1)}

    return {
        "vehicles": {"samples": len(vehicle_samples), "http_200": len(v),
                     "incrementality": incr(v), "distinct_upstream_snapshots": len(dts(v)),
                     "source_cadence_s": vc, "trip_id_presence_pct": presence(v),
                     "avg_entity_count": avg(v),
                     "top_level_keys": v[-1]["top_level_keys"] if v else None,
                     "sample_entity_keys": v[-1]["sample_entity_keys"] if v else None},
        "trip_updates": {"samples": len(tripupdate_samples), "http_200": len(t),
                         "incrementality": incr(t), "source_cadence_s": cadence(t),
                         "trip_id_presence_pct": presence(t), "avg_entity_count": avg(t)},
        "cross_feed": {"vehicle_trip_id_in_tripupdates_pct": overlap, "feed_skew_s": skew},
        "persistence_feasibility": persistence,
        "pending": ["static_exact_match_pct: needs the static GTFS import (step 2)",
                    "fair_use_rate_limit: confirm from the subscription before raising cadence"],
    }


async def run(duration_s: int = 90, interval_s: int = 15) -> dict[str, Any]:
    """Poll both feeds for ``duration_s`` (every ``interval_s``), then summarize."""
    vs: list[dict] = []
    ts: list[dict] = []
    deadline = time.monotonic() + duration_s
    n = 0
    while True:
        n += 1
        v, t = await asyncio.gather(_sample("Vehicles"), _sample("TripUpdates"))
        vs.append(v)
        ts.append(t)
        print(f"  sample {n}: vehicles={v['status']}/{v['entity_count']} "
              f"tripupdates={t['status']}/{t['entity_count']}", flush=True)
        if time.monotonic() >= deadline:
            break
        await asyncio.sleep(interval_s)
    report = summarize(vs, ts)
    report["meta"] = {"duration_s": duration_s, "interval_s": interval_s, "samples": n,
                      "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    return report
