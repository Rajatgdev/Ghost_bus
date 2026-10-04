"""The poller loop (Railway worker). Build-plan steps 3-4.

Design says an ALWAYS-ON worker with a monotonic-deadline scheduler (not Railway cron):
each tick fetches both feeds, dedups to source snapshots, computes cohort health, assesses
expected instances, and persists one decision cycle under the leader lease. For now this is
a thin loop that runs the in-memory preview and prints — persistence lands with db/store.py.

    python -m app.jobs.run_cycle --interval 30
"""
import argparse
import asyncio
import time

from app.core.mockdata import mock_instances
from app.services import pipeline


async def _loop(interval_s: int) -> None:
    while True:
        start = time.monotonic()
        try:
            bundle = await pipeline.run_live_cycle(mock_instances())
            ch = bundle["cohort_health"]
            live = {k: v for k, v in bundle["counts"].items() if v}
            print(f"[cycle] {bundle['as_of']} health={ch['state']} "
                  f"E={ch['expected']} M={ch['matched']} counts={live}", flush=True)
            # TODO(step 4): persist one decision cycle here, fenced by the leader epoch.
        except Exception as e:  # one bad cycle must not kill the loop
            print(f"[cycle] ERROR {e!r}", flush=True)
        # monotonic deadline: skip (don't catch up) if a cycle overran
        sleep = interval_s - (time.monotonic() - start)
        await asyncio.sleep(max(0.0, sleep))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=int, default=30)
    a = ap.parse_args()
    asyncio.run(_loop(a.interval))
