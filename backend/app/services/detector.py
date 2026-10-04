"""THE CORE: the one decision function.

Per expected instance per cycle, fixed precedence (design: The decision function). It
separates raw facts (gathered by the pipeline) from trusted classification — no fresh-looking
observation can bypass the cohort-health gate. Pure: all inputs are passed in, nothing fetched.
"""
from __future__ import annotations

from app.models.schemas import Assessment, CallAssessment, ExpectedInstance

# Cap on how far a fresh prediction can push the effective due time past the static one.
MAX_PREDICTION_EXTENSION_SECS = 1800


def effective_due(inst: ExpectedInstance, predicted_due_secs: int | None) -> int:
    base = inst.static_due_secs
    if predicted_due_secs is None:
        return base
    return min(base + MAX_PREDICTION_EXTENSION_SECS, max(base, predicted_due_secs))


def assess(inst: ExpectedInstance, *, cohort_healthy: bool, now_secs: int,
           schedule_relationship: str | None, matched_vehicle: bool,
           predicted_due_secs: int | None, has_fresh_prediction: bool,
           grace_secs: int = 0) -> CallAssessment:
    """Return the per-cycle assessment for one expected instance.

    `now_secs` is service-day seconds. `schedule_relationship` is the trip-level value from a
    matched TripUpdate (or None). `matched_vehicle` is True iff a fresh VehiclePosition matched.
    """
    # 1. Axis-A gate — if the cohort is not healthy, we cannot say anything reliable.
    if not cohort_healthy:
        return CallAssessment(instance=inst, assessment=Assessment.data_unusable,
                              reason_code="cohort_unhealthy")

    # 2. explicit status / unsupported kind
    if schedule_relationship == "CANCELED":
        return CallAssessment(instance=inst, assessment=Assessment.explicit_cancelled)
    if schedule_relationship == "DELETED":
        return CallAssessment(instance=inst, assessment=Assessment.explicit_deleted)
    if not inst.supported:
        return CallAssessment(instance=inst, assessment=Assessment.excluded_unsupported,
                              reason_code="unsupported_kind")

    # 3. effective due (prediction wins, but bounded)
    eff = effective_due(inst, predicted_due_secs)

    # 4. observed vehicle / fresh prediction
    if matched_vehicle:
        return CallAssessment(instance=inst, assessment=Assessment.vehicle_observed,
                              effective_due_secs=eff)
    if has_fresh_prediction and now_secs < eff:
        return CallAssessment(instance=inst, assessment=Assessment.predicted_delayed,
                              effective_due_secs=eff, predicted_due_secs=predicted_due_secs)
    
    # 5. start / window (+ grace: a bus often logs on a few minutes late)
    if now_secs < inst.effective_start_secs:
        return CallAssessment(instance=inst, assessment=Assessment.watch,
                              effective_due_secs=eff, reason_code="not_started")
    if now_secs <= eff + grace_secs:
        return CallAssessment(instance=inst, assessment=Assessment.watch,
                              effective_due_secs=eff, reason_code="within_grace")

    # 6. qualified absence (cause unknown — Axis B)
    return CallAssessment(instance=inst, assessment=Assessment.unmatched,
                          effective_due_secs=eff, reason_code="due_no_vehicle")