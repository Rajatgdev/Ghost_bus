"""Build-plan step 1: measure the live NTA feed. Run:  python -m app.probe

Writes probe-report.json and prints a human summary. Needs NTA_API_KEY in .env. No database.
"""
import argparse
import asyncio
import json
from pathlib import Path

from app.core.config import settings
from app.services.feasibility import run


async def _main(duration: int, interval: int, out: str) -> None:
    if not settings.nta_api_key:
        raise SystemExit("NTA_API_KEY is not set — add it to .env first.")
    print(f"Probing {settings.nta_base_url} for {duration}s every {interval}s ...")
    report = await run(duration_s=duration, interval_s=interval)
    Path(out).write_text(json.dumps(report, indent=2))

    v, t, x = report["vehicles"], report["trip_updates"], report["cross_feed"]
    print("\n=== Feasibility report ===")
    print(f"Vehicles:    {v['http_200']}/{v['samples']} ok | incrementality={v['incrementality']} "
          f"| cadence={v['source_cadence_s']}s | trip_id present={v['trip_id_presence_pct']}% "
          f"| avg entities={v['avg_entity_count']}")
    print(f"TripUpdates: {t['http_200']}/{t['samples']} ok | cadence={t['source_cadence_s']}s "
          f"| avg entities={t['avg_entity_count']}")
    print(f"Cross-feed:  vehicle trip_id in TripUpdates={x['vehicle_trip_id_in_tripupdates_pct']}% "
          f"| skew={x['feed_skew_s']}s")
    print(f"Vehicles top-level JSON keys: {v['top_level_keys']}")
    print(f"Vehicles sample entity keys:  {v['sample_entity_keys']}")
    print(f"\nFull report -> {out}")
    print("Gate (step 1): incrementality == FULL_DATASET, trip_id presence high, "
          "skew small, cadence fast enough for a 2-snapshot promotion.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Ghost Bus feasibility probe (build-plan step 1)")
    ap.add_argument("--duration", type=int, default=90)
    ap.add_argument("--interval", type=int, default=15)
    ap.add_argument("--out", default="probe-report.json")
    a = ap.parse_args()
    asyncio.run(_main(a.duration, a.interval, a.out))
