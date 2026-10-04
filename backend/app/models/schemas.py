"""The data that flows through one decision cycle. Mirrors the design's four identities
at the in-memory level: expected instances (from static; mocked until step 2), observed
vehicles/predictions (from the live feeds), cohort health, and the per-instance assessment.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class Assessment(str, Enum):
    """The per-cycle call assessment (design: the truth table)."""
    data_unusable = "data_unusable"
    explicit_cancelled = "explicit_cancelled"
    explicit_deleted = "explicit_deleted"
    vehicle_observed = "vehicle_observed"
    predicted_delayed = "predicted_delayed"
    watch = "watch"
    unmatched = "unmatched"
    excluded_unsupported = "excluded_unsupported"


class ExpectedInstance(BaseModel):
    """A dated trip instance resolved from static schedule. Mocked until build-plan step 2."""
    trip_id: str
    operator_id: str
    route_short_name: str
    service_date: str
    start_time: str
    ref_stop_name: str = ""
    effective_start_secs: int       # service-day seconds
    static_due_secs: int            # service-day seconds
    supported: bool = True          # False -> excluded_unsupported (freq/NEW/REPLACEMENT/DUPLICATED)


class VehicleObservation(BaseModel):
    """One VehiclePosition from the Vehicles feed (parsed)."""
    entity_id: str
    trip_id: str | None = None
    route_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    vehicle_timestamp: int | None = None


class TripPrediction(BaseModel):
    """One trip-level signal from the TripUpdates feed (parsed)."""
    trip_id: str
    schedule_relationship: str | None = None   # SCHEDULED | CANCELED | DELETED | ...
    predicted_due_secs: int | None = None
    prediction_timestamp: int | None = None


class CohortHealth(BaseModel):
    """Axis-A gate result for one cohort this cycle."""
    operator_id: str
    state: str          # feed_unusable | cohort_down | cohort_coldstart | cohort_degraded | cohort_healthy
    expected: int       # E
    matched: int        # M
    healthy: bool = False
    reason: str = ""


class CallAssessment(BaseModel):
    """The immutable per-cycle assessment for one expected instance."""
    instance: ExpectedInstance
    assessment: Assessment
    effective_due_secs: int | None = None
    predicted_due_secs: int | None = None
    evidence_level: str = "observed"       # observed | inferred
    reason_code: str = ""
