import { checkTime } from "../lib/history.js";
import { fmtClock } from "./StatusBanner.jsx";

// What happened to each flagged trip in later checks, built from the slim check log in this browser.
// Wording rule: say exactly what the checks saw, including how much of the trip we actually watched.
const MAX_GAP_MS = 15 * 60 * 1000; // a gap longer than this means we can't say how the trip ended
const FULL_WATCH_SLACK_MIN = 10;    // watching began within 10 min of departure = we saw the whole run

const OUTCOME = {
  open:          { order: 0, cls: "bad",  label: "Still no vehicle" },
  ended:         { order: 1, cls: "bad",  label: "Finished on the timetable with no vehicle" },
  dropout_open:  { order: 2, cls: "warn", label: "Vehicle stopped reporting" },
  dropout_ended: { order: 3, cls: "warn", label: "Vehicle stopped reporting mid-trip" },
  cancelled:     { order: 4, cls: "warn", label: "Cancellation sent later" },
  appeared:      { order: 5, cls: "ok",   label: "Vehicle appeared later" },
  lost:          { order: 6, cls: "mute", label: "No later check to confirm" },
};

const clock = (t) => (t ? fmtClock(new Date(t).toISOString()) : "—");
const mins = (a, b) => Math.max(0, Math.round((b - a) / 60000));
const dayMin = (t) => { const [h, m] = clock(t).split(":").map(Number); return h * 60 + m; };
const hmMin = (s) => { const [h, m] = String(s || "").split(":").map(Number); return Number.isNaN(h) ? null : h * 60 + (m || 0); };

export function followUp(log) {
  const recs = new Map();
  const lastVehicle = new Map(); // trip_id -> last time a vehicle was reporting on it
  const checks = log.filter((c) => c.h).sort((a, b) => checkTime(a.t) - checkTime(b.t));
  const watchStart = checks[0] ? checkTime(checks[0].t) : null;

  for (const c of checks) {
    const t = checkTime(c.t);
    for (const [id, code] of Object.entries(c.a)) {
      let r = recs.get(id);
      if (code === "U") {
        if (!r || (r.state !== "open" && r.state !== "dropout_open")) {
          const [route, start, stop] = c.m[id] || ["?", "", ""];
          const lv = lastVehicle.get(id) ?? null;
          r = { id, route, start, stop, firstAt: t, flags: 0, lastVehicleAt: lv, state: lv ? "dropout_open" : "open", outcomeAt: null };
          recs.set(id, r);
        }
        r.flags++;
        r.lastFlagAt = t;
      } else if (code === "V") {
        lastVehicle.set(id, t);
        if (r && (r.state === "open" || r.state === "dropout_open")) { r.state = "appeared"; r.outcomeAt = t; }
      } else if (code === "C" && r && (r.state === "open" || r.state === "dropout_open")) {
        r.state = "cancelled"; r.outcomeAt = t;
      }
    }
    for (const r of recs.values()) {
      if ((r.state === "open" || r.state === "dropout_open") && !(r.id in c.a)) {
        r.state = t - r.lastFlagAt > MAX_GAP_MS ? "lost" : r.state === "open" ? "ended" : "dropout_ended";
        r.outcomeAt = t;
      }
    }
  }

  const list = [...recs.values()].sort((a, b) => OUTCOME[a.state].order - OUTCOME[b.state].order || a.firstAt - b.firstAt);
  const tally = { open: 0, ended: 0, dropout: 0, cancelled: 0, appeared: 0, lost: 0 };
  for (const r of list) tally[r.state.startsWith("dropout") ? "dropout" : r.state]++;
  return { list, tally, watchStart, nChecks: checks.length };
}

function detail(r, watchStart) {
  const n = `${r.flags} ${r.flags === 1 ? "check" : "checks"}`;
  switch (r.state) {
    case "open":
      return `No vehicle in ${n} since ${clock(r.firstAt)}.`;
    case "ended": {
      const dep = hmMin(r.start);
      const full = dep != null && watchStart != null && dayMin(watchStart) <= dep + FULL_WATCH_SLACK_MIN;
      return full
        ? `No vehicle in any check from departure to its scheduled end (${clock(r.outcomeAt)}).`
        : `We only watched from ${clock(r.firstAt)}, it departed at ${r.start}. No vehicle in ${n} up to its scheduled end (${clock(r.outcomeAt)}).`;
    }
    case "dropout_open":
      return `Had a vehicle until ${clock(r.lastVehicleAt)}, then none in ${n}. Usually a tracker dropping out.`;
    case "dropout_ended":
      return `Had a vehicle until ${clock(r.lastVehicleAt)}, then none up to its scheduled end (${clock(r.outcomeAt)}). Usually a tracker dropping out.`;
    case "cancelled":
      return `Operator sent a cancellation at ${clock(r.outcomeAt)}, ${mins(r.firstAt, r.outcomeAt)} min after we flagged it.`;
    case "appeared":
      return `Vehicle reporting at ${clock(r.outcomeAt)}, ${mins(r.firstAt, r.outcomeAt)} min after we flagged it. Likely a late log-on.`;
    default:
      return "The page wasn't checking when this trip finished.";
  }
}

export default function FollowUp({ log }) {
  const { list, tally, watchStart, nChecks } = followUp(log);
  if (!nChecks) return null;

  return (
    <section className="followup" aria-label="Follow-up on flagged trips">
      <div className="fu-head">
        <h2>Follow-up on flagged trips</h2>
        <p>Every flagged trip is watched in later checks. {nChecks} {nChecks === 1 ? "check" : "checks"} since {clock(watchStart)}, saved in this browser.</p>
      </div>

      {list.length === 0 ? (
        <div className="fu-empty">No trips flagged since {clock(watchStart)}. Keep this page open with auto-refresh on to build up a record.</div>
      ) : (
        <>
          <ul className="fu-tally">
            <li className="bad"><b>{tally.ended}</b> finished with no vehicle</li>
            <li className="bad"><b>{tally.open}</b> still no vehicle</li>
            <li className="warn"><b>{tally.dropout}</b> vehicle stopped reporting</li>
            <li className="warn"><b>{tally.cancelled}</b> cancelled later</li>
            <li className="ok"><b>{tally.appeared}</b> vehicle appeared later</li>
            {tally.lost > 0 && <li className="mute"><b>{tally.lost}</b> no later check</li>}
          </ul>
          <p className="fu-note">
            <b>Finished with no vehicle</b> is the strongest signal: the trip reached the end of its timetable and no vehicle
            ever reported on it in our checks. Trips that had a vehicle earlier are counted separately, because that's usually a tracker dropping out.
          </p>
          <table className="fu-table">
            <thead><tr><th>Route</th><th>Departs</th><th>Stop</th><th>Flagged</th><th>What happened</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const o = OUTCOME[r.state];
                return (
                  <tr key={r.id} className={o.cls}>
                    <td><span className="badge sm">{r.route}</span></td>
                    <td className="num">{r.start}</td>
                    <td>{r.stop || "—"}</td>
                    <td className="num">{clock(r.firstAt)}</td>
                    <td><span className={`state ${o.cls}`}>{o.label}</span><span className="why">{detail(r, watchStart)}</span></td>
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
