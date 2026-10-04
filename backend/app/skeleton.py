"""THE WALKING SKELETON. Run this first:  python -m app.skeleton

Proves the whole detector on ONE decision cycle, end to end.

  --mock   (or no NTA key)  -> canned Vehicles snapshot + mock instances, zero network.
  (keys set in .env)        -> fetches the LIVE Vehicles + TripUpdates feeds and runs the
                               real cohort-health + decision function against mock instances
                               (real static instances arrive with build-plan step 2).

Start in --mock to see the flow (truth table + precedence + cohort health), then set
NTA_API_KEY and run for real.
"""
import argparse
import asyncio

from app.core.config import settings
from app.core.mockdata import (MOCK_NOW_SECS, MOCK_TRIPUPDATES_BODY,
                               MOCK_VEHICLES_BODY, mock_instances)
from app.services import pipeline


def _report(bundle: dict) -> None:
    ch = bundle["cohort_health"]
    print("\n" + "=" * 60)
    print(f"as of {bundle['as_of']}  |  now={bundle['now_service_secs']}s (service-day)")
    print(f"cohort health: {ch['state']}  (E={ch['expected']} M={ch['matched']} "
          f"healthy={ch['healthy']})  {ch['reason']}")
    if bundle.get("feed"):
        f = bundle["feed"]
        print(f"feed: vehicles={f['vehicles_status']}/{f['vehicles_entities']} "
              f"tripupdates={f['trip_updates_status']}/{f['trip_updates_entities']} "
              f"incrementality={f['incrementality']} skew={f['skew_s']}s"
              + (f"  ERROR={f['error']}" if f.get("error") else ""))
    print("-" * 60)
    for a in bundle["assessments"]:
        inst = a["instance"]
        print(f"  {a['assessment']:<20} {inst['route_short_name']:>4} {inst['start_time']} "
              f"@ {inst['ref_stop_name'] or '-':<14} trip={inst['trip_id']} "
              + (f"({a['reason_code']})" if a["reason_code"] else ""))
    c = bundle["counts"]
    live = {k: v for k, v in c.items() if v}
    print("-" * 60)
    print(f"counts: {live}")
    print("=" * 60)


async def mock_run() -> None:
    print("[mock] no network — canned Vehicles snapshot + mock instances")
    vehicles = pipeline.parse_vehicles(MOCK_VEHICLES_BODY)
    predictions = pipeline.parse_predictions(MOCK_TRIPUPDATES_BODY)
    bundle = pipeline.assess_cycle(mock_instances(), vehicles, predictions,
                                   feed_usable=True, now_secs=MOCK_NOW_SECS)
    _report(bundle)


async def real_run() -> None:
    print(f"[real] fetching live feeds from {settings.nta_base_url}")
    bundle = await pipeline.run_live_cycle(mock_instances())
    _report(bundle)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true",
                    help="run on a canned snapshot with zero network")
    args = ap.parse_args()

    if args.mock or not settings.nta_api_key:
        asyncio.run(mock_run())
    else:
        asyncio.run(real_run())
