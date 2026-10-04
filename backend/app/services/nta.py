"""NTA GTFS-Realtime v2 client + shared JSON parse helpers.

Auth header is ``x-api-key`` (confirmed against real NTA code — not the Azure
``Ocp-Apim-Subscription-Key``). ``?format=json`` returns GTFS-RT as JSON so we can skip
protobuf. The parse helpers are tolerant of the canonical nested shape and the flattened
variants seen in some NTA exports, and they live here so the probe and the pipeline share
one parser (design: validate the real shape at startup).
"""
from __future__ import annotations

import time
from typing import Any

import httpx

FEEDS = ("Vehicles", "TripUpdates")


async def fetch(base_url: str, api_key: str, feed: str, *,
                secondary: str = "", timeout: float = 20.0) -> dict[str, Any]:
    """Fetch one feed as JSON. Falls back to the secondary key once on HTTP 401."""
    url = f"{base_url}/{feed}?format=json"
    headers = {"x-api-key": api_key, "Accept": "application/json"}
    t0 = time.time()
    status, body, err = 0, None, None
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.get(url, headers=headers)
            if r.status_code == 401 and secondary:
                r = await c.get(url, headers={**headers, "x-api-key": secondary})
            status = r.status_code
            if status == 200:
                try:
                    body = r.json()
                except Exception as e:  # noqa: BLE001
                    err = f"JSON decode failed: {e}"
            else:
                err = f"HTTP {status}"
    except Exception as e:  # noqa: BLE001 - callers want the reason, not a crash
        err = f"{type(e).__name__}: {e}"
    return {"feed": feed, "status": status, "elapsed_s": round(time.time() - t0, 3),
            "body": body, "error": err}


# --- parse helpers: tolerant of canonical GTFS-RT JSON and flattened variants ---

def entities(body: dict | None) -> list[dict]:
    if not isinstance(body, dict):
        return []
    ents = body.get("entity") or body.get("Entity") or []
    return ents if isinstance(ents, list) else []


def header(body: dict | None) -> dict:
    if not isinstance(body, dict):
        return {}
    return body.get("header") or body.get("Header") or {}


def header_ts(body: dict | None) -> int | None:
    ts = header(body).get("timestamp")
    try:
        return int(ts) if ts is not None else None
    except (TypeError, ValueError):
        return None


def incrementality(body: dict | None) -> str | None:
    return header(body).get("incrementality")


def trip_id_of(entity: dict, feed: str) -> str | None:
    node = entity.get("vehicle") if feed == "Vehicles" else entity.get("trip_update")
    if isinstance(node, dict):
        trip = node.get("trip") or {}
        tid = trip.get("trip_id") or trip.get("tripId")
        if tid:
            return tid
    return entity.get("trip_id") or entity.get("tripId") or entity.get("tripid")
