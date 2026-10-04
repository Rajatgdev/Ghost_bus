import { checkTime } from "../lib/history.js";
import { fmtClock } from "./StatusBanner.jsx";

// What happened to each flagged trip in later checks. Built only from checks this browser saw.
// "Ended" needs a check soon after the last flag; otherwise we say we lost track instead of guessing.
const MAX_GAP_MS = 15 * 60 * 1000;

const OUTCOME = {
  open:      { order: 0, cls: "bad",  label: "Still no vehicle" },
  ended:     { order: 1, cls: "bad",  label: "No vehicle seen before the trip left the schedule" },
  cancelled: { order: 2, cls: "warn", label: "Cancellation sent later" },
  appeared:  { order: 3, cls: "ok",   label: "Vehicle appeared later" },
  lost:      { order: 4, cls: "mute", label: "No later check to confirm" },
};

export function followUp(checks) {
  const recs = new Map();
  const healthy = checks.filter((c) => c.cohort_health?.healthy).sort((a, b) => checkTime(a.as_of) - checkTime(b.as_of));
  for (const c of healthy) {
    const t = checkTime(c.as_of);
    const present = new Set();
    for (const a of c.assessments) {
      const id = a.instance.trip_id;
      present.add(id);
      let r = recs.get(id);
      if (a.assessment === "unmatched") {
        if (!r) {
          r = { id, route: a.instance.route_short_name, start: a.instance.start_time?.slice(0, 5),
            stop: a.instance.ref_stop_name, firstAt: t, lastFlagAt: t, flags: 0, state: "open", outcomeAt: null };
          recs.set(id, r);
        }
        if (r.state !== "open") { r.state = "open"; r.outcomeAt = null; } // flagged again
        r.flags++;
        r.lastFlagAt = t;
      } else if (r && r.state === "open") {
        if (a.assessment === "vehicle_observed" || a.assessment === "predicted_delayed") { r.state = "appeared"; r.outcomeAt = t; }
        else if (a.assessment === "explicit_cancelled") { r.state = "cancelled"; r.outcomeAt = t; }
      }
    }
    for (const r of recs.values())
      if (r.state === "open" && !present.has(r.id)) {
        r.state = t - r.lastFlagAt <= MAX_GAP_MS ? "ended" : "lost";
        r.outcomeAt = t;
      }
  }
  const list = [...recs.values()].sort((a, b) => OUTCOME[a.state].order - OUTCOME[b.state].order || a.firstAt - b.firstAt);
  const tally = { open: 0, ended: 0, cancelled: 0, appeared: 0, lost: 0 };
  for (const r of list) tally[r.state]++;
  return { list, tally, since: healthy[0] ? checkTime(healthy[0].as_of) : null, nChecks: healthy.length };
}

const clock = (t) => (t ? fmtClock(new Date(t).toISOString()) : "—");
const mins = (a, b) => Math.max(0, Math.round((b - a) / 60000));

export default function FollowUp({ checks }) {
  const { list, tally, since, nChecks } = followUp(checks);
  if (!nChecks) return null;

  return (
    <section className="followup" aria-label="Follow-up on flagged trips">
      <div className="fu-head">
        <div>
          <h2>Follow-up on flagged trips</h2>
          <p>Each flagged trip is watched in later checks. {nChecks} {nChecks === 1 ? "check" : "checks"} since {clock(since)}, in this browser.</p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="fu-empty">No trips flagged since {clock(since)}. Keep this page open with auto-refresh on to build up a record.</div>
      ) : (
        <>
          <ul className="fu-tally">
            <li className="bad"><b>{tally.open}</b> still no vehicle</li>
            <li className="bad"><b>{tally.ended}</b> no vehicle before trip left schedule</li>
            <li className="warn"><b>{tally.cancelled}</b> cancellation sent later</li>
            <li className="ok"><b>{tally.appeared}</b> vehicle appeared later</li>
            {tally.lost > 0 && <li className="mute"><b>{tally.lost}</b> no later check</li>}
          </ul>
          <table className="fu-table">
            <thead><tr><th>Route</th><th>Departs</th><th>Stop</th><th>First flagged</th><th>What happened</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const o = OUTCOME[r.state];
                const detail = r.state === "open"
                  ? `flagged in ${r.flags} ${r.flags === 1 ? "check" : "checks"}`
                  : r.state === "lost" ? "" : `at ${clock(r.outcomeAt)}, ${mins(r.firstAt, r.outcomeAt)} min after first flag`;
                return (
                  <tr key={r.id} className={o.cls}>
                    <td><span className="badge sm">{r.route}</span></td>
                    <td className="num">{r.start}</td>
                    <td>{r.stop || "—"}</td>
                    <td className="num">{clock(r.firstAt)}</td>
                    <td><span className={`state ${o.cls}`}>{o.label}</span>{detail && <span className="why">{detail}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
