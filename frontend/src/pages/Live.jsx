import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search, ChevronRight, CircleCheck, Diamond, Clock3, TriangleAlert, Ban } from "lucide-react";
import { runCycle } from "../lib/api";
import replayFixture from "../fixtures/replay.json";
import StatusBanner, { fmtClock } from "../components/StatusBanner.jsx";
import FlaggedMap from "../components/FlaggedMap.jsx";
import FollowUp from "../components/FollowUp.jsx";
import PastChecks from "../components/PastChecks.jsx";
import { loadChecks, saveCheck, clearChecks, loadLog, appendLog, clearLog } from "../lib/history.js";

// Wording rule: we report what the feed shows, never why. "No vehicle reporting", not "cancelled".
const TRIP = {
  unmatched: { text: "No vehicle reporting", cls: "bad", Icon: Diamond },
  vehicle_observed: { text: "Vehicle reporting", cls: "ok", Icon: CircleCheck },
  predicted_delayed: { text: "Running late (predicted)", cls: "warn", Icon: Clock3 },
  watch: { text: "Not yet due", cls: "mute", Icon: Clock3 },
  explicit_cancelled: { text: "Cancelled by operator", cls: "mute", Icon: Ban },
  data_unusable: { text: "Not assessed", cls: "warn", Icon: TriangleAlert },
  excluded_unsupported: { text: "Not covered", cls: "mute", Icon: Ban },
};
const WHY = {
  due_no_vehicle: "Past due · no cancellation sent · cause unknown",
  window_open: "Inside its due window. Waiting before flagging.",
  not_started: "Hasn't reached its first departure yet.",
  cohort_unhealthy: "Too few buses reporting to judge.",
  unsupported_kind: "Frequency-based or added trip, outside what this check covers.",
};
const REFRESH_MS = 60_000;
const hhmm = (s) => (s == null ? "—" : `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`);
const byRoute = (a, b) => a.localeCompare(b, "en", { numeric: true });

function groupRoutes(assessments) {
  const m = new Map();
  for (const a of assessments) {
    if (a.assessment === "explicit_deleted") continue; // never shown to riders
    const r = a.instance.route_short_name || "?";
    if (!m.has(r)) m.set(r, { route: r, trips: [], unmatched: 0, reporting: 0, pending: 0, other: 0 });
    const g = m.get(r);
    g.trips.push(a);
    if (a.assessment === "unmatched") g.unmatched++;
    else if (a.assessment === "vehicle_observed" || a.assessment === "predicted_delayed") g.reporting++;
    else if (a.assessment === "watch") g.pending++;
    else g.other++;
  }
  const due = (a) => a.effective_due_secs ?? a.instance.static_due_secs;
  for (const g of m.values())
    g.trips.sort((a, b) => (a.assessment !== "unmatched") - (b.assessment !== "unmatched") || due(a) - due(b));
  // TfL board rule: problem routes first (most first), then everything else in route order
  return [...m.values()].sort((a, b) => (b.unmatched > 0) - (a.unmatched > 0) || b.unmatched - a.unmatched || byRoute(a.route, b.route));
}

function routeStatus(g) {
  if (g.unmatched) return { cls: "bad", Icon: Diamond, text: `${g.unmatched} ${g.unmatched === 1 ? "trip" : "trips"} with no vehicle` };
  if (g.reporting) return { cls: "ok", Icon: CircleCheck, text: "No issues detected" };
  if (g.pending) return { cls: "mute", Icon: Clock3, text: "Nothing due yet" };
  return { cls: "mute", Icon: Ban, text: "Not assessed" };
}

export default function Live() {
  const [mode, setMode] = useState(new URLSearchParams(location.search).has("replay") ? "past" : "live");
  const [checks, setChecks] = useState(loadChecks);
  const [log, setLog] = useState(loadLog);
  const [pastSel, setPastSel] = useState(null); // null = list, "sample", or a saved check's as_of
  const [liveBundle, setLiveBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);

  const bundle = mode === "live" ? liveBundle
    : pastSel === "sample" ? replayFixture
    : checks.find((c) => c.as_of === pastSel) || null;

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await runCycle();
      setLiveBundle(res);
      setChecks((l) => saveCheck(l, res));
      setLog((l) => appendLog(l, res));
      setNow(Date.now());
    } catch (e) {
      setError(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (mode === "live" && !liveBundle && !loading) run(); // check on first open
  }, [mode]);
  useEffect(() => {
    if (!auto || mode !== "live") return;
    const t = setInterval(run, REFRESH_MS);
    return () => clearInterval(t);
  }, [auto, mode]);

  const healthy = !!bundle?.cohort_health?.healthy;
  const routes = useMemo(() => groupRoutes(bundle?.assessments || []), [bundle]);
  const c = bundle?.counts || {};
  const unmatched = c.unmatched || 0;
  const reporting = (c.vehicle_observed || 0) + (c.predicted_delayed || 0);
  const due = unmatched + reporting;
  const problemRoutes = routes.filter((g) => g.unmatched).length;
  const notCovered = (c.excluded_unsupported || 0) + (c.data_unusable || 0) + (c.explicit_cancelled || 0);

  const shown = routes.filter((g) =>
    (!problemsOnly || g.unmatched) && (!q.trim() || g.route.toLowerCase().startsWith(q.trim().toLowerCase())));

  const pick = (r) => {
    setQ(""); setProblemsOnly(false);
    setOpen((s) => new Set(s).add(r));
    setTimeout(() => document.getElementById(`route-${r}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const toggle = (r) => setOpen((s) => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n; });

  return (
    <div className="page">
      <header className="top">
        <div className="wrap top-inner">
          <div className="brand">
            <span className="mark" aria-hidden="true">GB</span>
            <span><b>Ghost Bus</b><small>Dublin bus service check</small></span>
          </div>
          <div className="seg" role="tablist" aria-label="Data source">
            <button role="tab" aria-selected={mode === "live"} onClick={() => setMode("live")}>Live</button>
            <button role="tab" aria-selected={mode === "past"} onClick={() => { setMode("past"); setPastSel(null); }}>
              Past checks{checks.length ? ` (${checks.length})` : ""}
            </button>
          </div>
        </div>
      </header>

      <main className="wrap">
        <section className="intro">
          <h1>Scheduled buses with no vehicle reporting</h1>
          <p>
            We compare the TFI timetable with the NTA live feed. A trip is flagged when it's due,
            no vehicle is reporting on it, and no cancellation was sent. We show what the feed says,
            not why: a silent cancellation and a bus with its tracker off look the same.
          </p>
        </section>

        {mode === "past" && !pastSel && (
          <PastChecks checks={checks}
            onOpen={(id) => setPastSel(id)}
            onOpenSample={() => setPastSel("sample")}
            onClear={() => { if (confirm("Clear all past checks saved in this browser?")) { setChecks(clearChecks()); setLog(clearLog()); } }} />
        )}
        {mode === "past" && pastSel && (
          <button className="back" onClick={() => setPastSel(null)}><ArrowLeft size={15} aria-hidden="true" /> All past checks</button>
        )}

        <div className="toolbar">
          <StatusBanner bundle={bundle} mode={mode === "live" ? "live" : "replay"} now={now} />
          {mode === "live" && (
            <div className="actions">
              <label className="check">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                Auto-refresh
              </label>
              <button className="btn" onClick={run} disabled={loading}>
                <RefreshCw size={15} className={loading ? "spin" : ""} aria-hidden="true" />
                {loading ? "Checking…" : "Check now"}
              </button>
            </div>
          )}
        </div>

        {error && mode === "live" && (
          <div className="notice bad" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>Couldn't reach the service ({error}). <button className="link" onClick={() => { setMode("past"); setPastSel(null); }}>View past checks</button></span>
          </div>
        )}
        {bundle?.preview && (
          <div className="notice">Sample timetable data. Feed checks are real.</div>
        )}

        {!bundle && loading && <div className="empty">Checking the live feed…</div>}

        {bundle && (
          <>
            <section className="headline" aria-label="Summary">
              <div className="headline-main">
                <span className={`big ${healthy && unmatched ? "bad" : ""}`}>{healthy ? unmatched : "—"}</span>
                <span className="big-label">
                  {healthy
                    ? <>of <b>{due}</b> trips due now have no vehicle reporting</>
                    : <>Not assessed this check. Too few buses reporting to tell which are missing.</>}
                </span>
              </div>
              <dl className="stats">
                <div><dt>Routes affected</dt><dd>{healthy ? problemRoutes : "—"}</dd></div>
                <div><dt>Vehicle reporting</dt><dd>{reporting}</dd></div>
                <div><dt>Not yet due / waiting</dt><dd>{c.watch || 0}</dd></div>
                <div><dt>Not covered</dt><dd>{notCovered}</dd></div>
              </dl>
              {bundle.feed && (
                <p className="source">
                  Feed at {fmtClock(bundle.as_of)}: {bundle.feed.vehicles_entities} vehicles, {bundle.feed.trip_updates_entities} trip updates.
                  {" "}{bundle.cohort_health?.matched}/{bundle.cohort_health?.expected} scheduled trips matched to a vehicle.
                </p>
              )}
            </section>

            {healthy && <FlaggedMap assessments={bundle.assessments || []} onPick={pick} />}

            {mode === "live" && <FollowUp log={log} />}

            {healthy && (
              <section className="board" aria-label="Routes">
                <div className="board-head">
                  <h2>By route</h2>
                  <div className="filters">
                    <label className="search">
                      <Search size={15} aria-hidden="true" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Route, e.g. 46A" aria-label="Find a route" />
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
                      Issues only
                    </label>
                  </div>
                </div>

                {shown.length === 0 ? (
                  <div className="empty">{problemsOnly ? "No routes with missing vehicles in this check." : "No matching routes."}</div>
                ) : (
                  <ul className="routes">
                    {shown.map((g) => {
                      const s = routeStatus(g);
                      const isOpen = open.has(g.route);
                      return (
                        <li key={g.route} id={`route-${g.route}`} className={`route ${s.cls} ${isOpen ? "open" : ""}`}>
                          <button className="route-row" aria-expanded={isOpen} onClick={() => toggle(g.route)}>
                            <span className="badge">{g.route}</span>
                            <span className={`state ${s.cls}`}><s.Icon size={15} aria-hidden="true" />{s.text}</span>
                            <span className="count">{g.trips.length} {g.trips.length === 1 ? "trip" : "trips"}</span>
                            <ChevronRight size={16} className="chev" aria-hidden="true" />
                          </button>
                          {isOpen && (
                            <table className="trips">
                              <thead><tr><th>Departs</th><th>Due</th><th>Stop</th><th>Status</th></tr></thead>
                              <tbody>
                                {g.trips.map((a) => {
                                  const t = a.reason_code === "within_grace"
                                    ? { text: "Due, waiting a few minutes before flagging", cls: "mute", Icon: Clock3 }
                                    : TRIP[a.assessment] || { text: a.assessment, cls: "mute", Icon: Clock3 };
                                  return (
                                    <tr key={a.instance.trip_id} className={t.cls}>
                                      <td className="num">{a.instance.start_time?.slice(0, 5)}</td>
                                      <td className="num">{hhmm(a.effective_due_secs ?? a.instance.static_due_secs)}</td>
                                      <td>{a.instance.ref_stop_name || "—"}</td>
                                      <td>
                                        <span className={`state ${t.cls}`}><t.Icon size={14} aria-hidden="true" />{t.text}</span>
                                        {a.assessment === "unmatched" && <span className="why">{WHY[a.reason_code] || WHY.due_no_vehicle}</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <footer className="wrap foot">
        Source: NTA GTFS-Realtime (Vehicles, TripUpdates) and the TFI static timetable. Independent project, not affiliated with NTA or TFI.
      </footer>
    </div>
  );
}
