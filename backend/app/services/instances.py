"""Build real expected instances from the static schedule in Neon (build-plan step 3).

"Which trips should be running right now?" = trips whose service runs today (calendar +
calendar_dates), that are on the road around now (effective window vs now ± grace/horizon),
on the active static version. Each becomes an ExpectedInstance the detector matches against
the live Vehicles feed. This REPLACES app.core.mockdata as the source for live cycles.

Service-day note: this is the same-day query. It is correct for all daytime hours. A small
overnight gap (roughly 00:00-06:30, where YESTERDAY's after-midnight trips also count) is
left as a TODO below — it does not affect a daytime demo.
"""
from __future__ import annotations

import time

from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.schemas import ExpectedInstance

# window around "now": include trips starting within HORIZON, due until GRACE after their end
HORIZON_SECS = 900   # 15 min: trips about to start are `watch`, not `unmatched`
GRACE_SECS = 300     # 5 min after a trip's last stop, still count it

# The ref stop/time for an instance = the scheduled call nearest `now` on that trip, so the
# UI can say "<route> at <stop>" and the detector has a concrete due time.
_SQL = text("""
with v as (
  select version_id from static_feed_versions where status = 'active' limit 1
),
today_services as (
  select c.service_id
  from calendar c, v
  where c.version_id = v.version_id
    and current_date between c.start_date and c.end_date
    and case extract(dow from current_date)
          when 0 then c.sunday when 6 then c.saturday
          else (c.monday and c.tuesday and c.wednesday and c.thursday and c.friday) end
  -- added by exception (type 1)
  union
  select cd.service_id from calendar_dates cd, v
  where cd.version_id = v.version_id and cd.date = current_date and cd.exception_type = 1
),
removed_services as (
  select cd.service_id from calendar_dates cd, v
  where cd.version_id = v.version_id and cd.date = current_date and cd.exception_type = 2
),
active_trips as (
  select t.trip_id, t.route_id, t.service_id, t.direction_id,
         t.effective_start_secs, t.effective_end_secs
  from trips t, v
  where t.version_id = v.version_id
    and t.effective_start_secs is not null
    and t.service_id in (select service_id from today_services)
    and t.service_id not in (select service_id from removed_services)
    and t.effective_start_secs <= cast(:now as int) + cast(:horizon as int)
    and t.effective_end_secs   >= cast(:now as int) - cast(:grace as int)
),
-- the stop-call on each trip nearest to now (for the UI label + due time)
ref_call as (
  select distinct on (st.trip_id)
         st.trip_id, st.stop_id, st.stop_sequence, st.departure_secs
  from stop_times st, v
  where st.version_id = v.version_id
    and st.trip_id in (select trip_id from active_trips)
  order by st.trip_id, abs(coalesce(st.departure_secs, st.arrival_secs) - cast(:now as int))
)
select at.trip_id, r.route_short_name, at.direction_id,
       at.effective_start_secs,
       coalesce(rc.departure_secs, at.effective_start_secs) as due_secs,
       s.stop_name
from active_trips at
join routes r  on r.version_id = (select version_id from v) and r.route_id = at.route_id
left join ref_call rc on rc.trip_id = at.trip_id
left join stops s  on s.version_id = (select version_id from v) and s.stop_id = rc.stop_id
""")


def _now_service_secs() -> int:
    lt = time.localtime()
    return lt.tm_hour * 3600 + lt.tm_min * 60 + lt.tm_sec


async def active_now(now_secs: int | None = None) -> list[ExpectedInstance]:
    """Expected instances that should be running right now, from the active static version."""
    now = now_secs if now_secs is not None else _now_service_secs()
    today = time.strftime("%Y-%m-%d")
    out: list[ExpectedInstance] = []
    async with SessionLocal() as s:
        rows = await s.execute(_SQL, {"now": now, "horizon": HORIZON_SECS, "grace": GRACE_SECS})
        for r in rows:
            m = r._mapping
            due = m["due_secs"]
            start = m["effective_start_secs"]
            hh, mm = divmod(start // 60, 60)
            out.append(ExpectedInstance(
                trip_id=m["trip_id"],
                operator_id="dublin_bus",
                route_short_name=m["route_short_name"] or "?",
                service_date=today,
                start_time=f"{hh:02d}:{mm:02d}",
                ref_stop_name=m["stop_name"] or "",
                effective_start_secs=start,
                static_due_secs=due,
                supported=True,
            ))
    return out

# TODO(overnight): between ~00:00 and ~06:30, also union YESTERDAY's services whose trips have
# effective_end_secs > 86400, comparing against now + 86400. Not needed for a daytime demo.