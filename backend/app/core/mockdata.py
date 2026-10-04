"""Canned data for the walking skeleton — stands in for the static import (step 2).

mock_instances(): expected trip instances (what step 2 will produce from static GTFS).
MOCK_VEHICLES_BODY: a GTFS-RT Vehicles payload where only SOME of those trips have a live
vehicle. With the fixed mock "now" (14:35) the skeleton shows the full truth table:
vehicle_observed (the matched, due trips), unmatched (a due trip with no vehicle), and
watch (a trip that hasn't started). Zero network.
"""
from __future__ import annotations

from app.models.schemas import ExpectedInstance

# Fixed "now" for the mock run so the demo is deterministic regardless of wall clock.
MOCK_NOW_SECS = 14 * 3600 + 35 * 60   # 14:35 service-day seconds


def _mm(h: int, m: int) -> int:
    return h * 3600 + m * 60


def mock_instances() -> list[ExpectedInstance]:
    return [
        ExpectedInstance(trip_id="T-46A-1", operator_id="dublin_bus", route_short_name="46A",
                         service_date="2026-10-04", start_time="14:20", ref_stop_name="Donnybrook",
                         effective_start_secs=_mm(14, 20), static_due_secs=_mm(14, 32)),
        ExpectedInstance(trip_id="T-15-2", operator_id="dublin_bus", route_short_name="15",
                         service_date="2026-10-04", start_time="14:10", ref_stop_name="Rathfarnham",
                         effective_start_secs=_mm(14, 10), static_due_secs=_mm(14, 18)),
        ExpectedInstance(trip_id="T-7-3", operator_id="dublin_bus", route_short_name="7",
                         service_date="2026-10-04", start_time="14:05", ref_stop_name="Blackrock",
                         effective_start_secs=_mm(14, 5), static_due_secs=_mm(14, 15)),
        ExpectedInstance(trip_id="T-39-4", operator_id="dublin_bus", route_short_name="39",
                         service_date="2026-10-04", start_time="14:25", ref_stop_name="Ongar",
                         effective_start_secs=_mm(14, 25), static_due_secs=_mm(14, 30)),
        # due, but NO live vehicle -> unmatched
        ExpectedInstance(trip_id="T-145-5", operator_id="dublin_bus", route_short_name="145",
                         service_date="2026-10-04", start_time="14:20", ref_stop_name="Heuston",
                         effective_start_secs=_mm(14, 20), static_due_secs=_mm(14, 33)),
        # starts later -> watch, never unmatched
        ExpectedInstance(trip_id="T-84-6", operator_id="dublin_bus", route_short_name="84",
                         service_date="2026-10-04", start_time="15:50", ref_stop_name="Greystones",
                         effective_start_secs=_mm(15, 50), static_due_secs=_mm(15, 58)),
    ]


def _veh(vid: str, trip_id: str, route_id: str) -> dict:
    return {"id": vid, "vehicle": {"trip": {"trip_id": trip_id, "route_id": route_id},
                                   "position": {"latitude": 53.33, "longitude": -6.25},
                                   "timestamp": 1_759_000_000}}


# 4 of the 6 instances have a live vehicle (so cohort is healthy: M=4, E=6).
MOCK_VEHICLES_BODY = {
    "header": {"gtfs_realtime_version": "2.0", "incrementality": "FULL_DATASET",
               "timestamp": 1_759_000_000},
    "entity": [
        _veh("V1", "T-46A-1", "46A"),
        _veh("V2", "T-15-2", "15"),
        _veh("V3", "T-7-3", "7"),
        _veh("V4", "T-39-4", "39"),
    ],
}

MOCK_TRIPUPDATES_BODY = {
    "header": {"gtfs_realtime_version": "2.0", "incrementality": "FULL_DATASET",
               "timestamp": 1_759_000_000},
    "entity": [],
}
