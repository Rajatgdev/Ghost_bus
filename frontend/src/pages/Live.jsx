import { useEffect, useMemo, useState } from "react";
import { Bus, RefreshCw, AlertTriangle, Radio, History, ChevronDown } from "lucide-react";
import { runCycle } from "../lib/api";
import replayFixture from "../fixtures/replay.json";
import StatusBanner from "../components/StatusBanner.jsx";
import Coverage from "../components/Coverage.jsx";
import StopMap from "../components/StopMap.jsx";

// Honest labels: these are telemetry assessments, never physical-cause claims.
const LABEL = {
  unmatched: "Unmatched — due, no vehicle on this trip",
  vehicle_observed: "Vehicle observed",
  predicted_delayed: "Predicted delayed",
  watch: "Not yet due",
  explicit_cancelled: "Cancelled (reported by operator)",
  data_unusable: "Abstained — data unusable",
  excluded_unsupported: "Excluded — unsupported trip type",
};
const REASON = {
  due_no_vehicle: "Scheduled and past its due time; no live vehicle is reporting on this trip and no cancellation was sent. Cause unknown — could be a silent cancellation or a tracking failure.",
  not_started: "Trip hasn't reached its first scheduled departure yet.",
  window_open: "Inside its due window; no vehicle yet, so we keep watching rather than flag.",
  cohort_unhealthy: "Too few vehicles from this operator are reporting to judge absence.",
  unsupported_kind: "Frequency-based or realtime-added trip; outside the MVP scope.",
};
const SEV = { unmatched: "bad", data_unusable: "warn", predicted_delayed: "warn", vehicle_observed: "ok" };
const REFRESH_MS = 60_000;

const hhmm = (s) => (s == null ? "—" : `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`);

export default function Live() {
  const startReplay = new URLSearchParams(location.search).has("replay");
  const [mode, setMode] = useState(startReplay ? "replay" : "live");
  const [liveBundle, setLiveBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const bundle = mode === "replay" ? replayFixture : liveBundle;

  async function run() {
    setLoading(true);
    setError("");
    try {
      setLiveBundle(await runCycle());
      setNow(Date.now());
    } catch (e) {
      setError(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }

  // clock for the stale banner
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(t); }, []);
  // optional auto-refresh, live mode only
  useEffect(() => {
    if (!auto || mode !== "live") return;
    run();
    const t = setInterval(run, REFRESH_MS);
    return () => clearInterval(t);
  }, [auto, mode]);

  const h = bundle?.cohort_health;
  const rows = useMemo(() => {
    const list = (bundle?.assessments || []).filter((a) => a.assessment !== "explicit_deleted");
    const due = (a) => a.effective_due_secs ?? a.instance.static_due_secs;
    // stable typed sort: unmatched first, then effective-due time, then trip_id as tiebreak
    return list.sort((a, b) =>
      (a.assessment !== "unmatched") - (b.assessment !== "unmatched") ||
      due(a) - due(b) || a.instance.trip_id.localeCompare(b.instance.trip_id));
  }, [bundle]);
  const shown = onlyFlagged ? rows.filter((a) => a.assessment === "unmatched") : rows;
  const flagged = rows.filter((a) => a.assessment === "unmatched").length;

  return (
    <div className="wrap">
      <header className="head">
        <div className="brand"><Bus size={20} aria-hidden="true" /> <span>Ghost Bus</span></div>
        <div className="modes" role="tablist" aria-label="Data mode">
          <button role="tab" aria-selected={mode === "live"} className={mode === "live" ? "on" : ""}
            onClick={() => setMode("live")}><Radio size={14} aria-hidden="true" /> Live</button>
          <button role="tab" aria-selected={mode === "replay"} className={mode === "replay" ? "on" : ""}
            onClick={() => setMode("replay")}><History size={14} aria-hidden="true" /> Replay</button>
        </div>
      </header>

      <h1 className="title">Scheduled Dublin buses with no live vehicle</h1>
      <p className="claim">
        Dublin bus trips that are <em>scheduled and due</em> but have no live vehicle reporting
        and no cancellation. This is a telemetry signal: we can't tell a silent cancellation
        from a bus whose tracker is off, so we never claim the cause.
      </p>

      {mode === "live" && (
        <div className="controls">
          <button className="btn" onClick={run} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden="true" />
            {loading ? "Checking feed…" : liveBundle ? "Run again" : "Run live cycle"}
          </button>
          <label className="check">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto-refresh every 60s
          </label>
        </div>
      )}

      {error && mode === "live" && (
        <div className="status bad" role="alert"><AlertTriangle size={16} aria-hidden="true" />
          <span>Couldn't reach the detector: {error}. Try Replay to see a captured cycle.</span></div>
      )}

      {bundle && (
        <>
          <StatusBanner bundle={bundle} mode={mode} now={now} />

          <div className="meta">
            <span>decided at {bundle.as_of}</span>
            {bundle.feed && (
              <span>
                vehicles {bundle.feed.vehicles_entities} · trip updates {bundle.feed.trip_updates_entities} ·
                {" "}{bundle.feed.incrementality || "FULL_DATASET"} · skew {bundle.feed.skew_s ?? "—"}s
              </span>
            )}
            {h && <span>operator {h.state.replace(/^cohort_/, "").replace(/_/g, " ")} · {h.matched}/{h.expected} expected trips have a vehicle</span>}
          </div>

          <Coverage counts={bundle.counts} />

          {!h?.healthy ? (
            <div className="empty">
              Abstaining — the feed isn't healthy enough to judge absence this cycle, so nothing is
              flagged. That's a "can't tell", not an "all clear".
            </div>
          ) : (
            <>
              <StopMap rows={rows} selected={open} onSelect={(id) => setOpen(id)} />

              <div className="list-head">
                <h2>{flagged} unmatched {flagged === 1 ? "trip" : "trips"}</h2>
                <label className="check">
                  <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                  Show unmatched only
                </label>
              </div>

              {shown.length === 0 ? (
                <div className="empty">No trips in this view.</div>
              ) : (
                <ul className="rows">
                  {shown.map((a) => {
                    const id = a.instance.trip_id;
                    const isOpen = open === id;
                    return (
                      <li key={id} className={`row ${SEV[a.assessment] || ""} ${isOpen ? "open" : ""}`}>
                        <button className="row-main" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
                          <span className="route">{a.instance.route_short_name}</span>
                          <span className="when">{a.instance.start_time}</span>
                          <span className="stop">{a.instance.ref_stop_name || "—"}</span>
                          <span className="verdict">
                            <i className={`dot ${SEV[a.assessment] || "mute"}`} aria-hidden="true" />
                            {LABEL[a.assessment] || a.assessment}
                          </span>
                          <ChevronDown size={14} className="chev" aria-hidden="true" />
                        </button>
                        {isOpen && (
                          <dl className="detail">
                            <dt>Why</dt><dd>{REASON[a.reason_code] || (a.assessment === "vehicle_observed" ? "A vehicle is reporting on this trip." : "—")}</dd>
                            <dt>Scheduled due</dt><dd>{hhmm(a.instance.static_due_secs)} at {a.instance.ref_stop_name || "reference stop"}</dd>
                            {a.predicted_due_secs != null && (<><dt>Predicted due</dt><dd>{hhmm(a.predicted_due_secs)}</dd></>)}
                            <dt>Evidence</dt><dd>{a.evidence_level} · trip {id} · {a.instance.service_date}</dd>
                          </dl>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {!bundle && !loading && !error && (
        <div className="empty">Press “Run live cycle” to check the current feed, or switch to Replay.</div>
      )}

      <footer className="foot">
        Data: NTA GTFS-Realtime (TripUpdates + Vehicles) and TFI static timetable. Not affiliated with NTA or TFI.
      </footer>
    </div>
  );
}
