"""Cohort health — the Axis-A gate (design: Cohort health).

Operator-level. The denominator E is the static expected count, NOT the matched count,
so health cannot be gamed by conditioning on already-matched entities (no selection bias).
Pure function: given the counts and the feed-usability flag, return the state.
"""
from __future__ import annotations

from app.core.config import settings
from app.models.schemas import CohortHealth


def cohort_health(operator_id: str, *, expected: int, matched: int,
                  feed_usable: bool, cycles_observed: int) -> CohortHealth:
    if not feed_usable:
        return CohortHealth(operator_id=operator_id, state="feed_unusable",
                            expected=expected, matched=matched, healthy=False,
                            reason="feed not FULL_DATASET / stale / skew too large")
    if expected > 0 and matched == 0:
        return CohortHealth(operator_id=operator_id, state="cohort_down",
                            expected=expected, matched=matched, healthy=False,
                            reason="expected>0 but no matched vehicles (likely outage)")
    if cycles_observed < settings.coldstart_n:
        # eligible, but the lifecycle must not promote to persistent yet (step 4).
        return CohortHealth(operator_id=operator_id, state="cohort_coldstart",
                            expected=expected, matched=matched, healthy=True,
                            reason=f"warming up ({cycles_observed}/{settings.coldstart_n})")
    frac = (matched / expected) if expected else 1.0
    if frac < settings.min_observed_fraction or matched < settings.min_abs_floor:
        return CohortHealth(operator_id=operator_id, state="cohort_degraded",
                            expected=expected, matched=matched, healthy=False,
                            reason=f"M/E={frac:.2f} or M={matched} below floor")
    return CohortHealth(operator_id=operator_id, state="cohort_healthy",
                        expected=expected, matched=matched, healthy=True)
