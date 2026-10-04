import { useState } from "react";
import { Bus, RefreshCw, AlertTriangle } from "lucide-react";
import { runCycle } from "../lib/api";

// Honest labels: these are telemetry assessments, never physical-cause claims.
const LABEL = {
  unmatched: "Unmatched — scheduled & due, no vehicle",
  vehicle_observed: "Vehicle observed",
  predicted_delayed: "Predicted delayed",
  watch: "Watch — not yet due",
  explicit_cancelled: "Cancelled (reported)",
  explicit_deleted: "Deleted (hidden from riders)",
  data_unusable: "Abstained — data unusable",
  excluded_unsupported: "Excluded — unsupported",
};
const SEV = { unmatched: "bad", data_unusable: "warn", predicted_delayed: "warn" };

export default function Live() {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      setBundle(await runCycle());
    } catch (e) {
      setError(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }

  const h = bundle?.cohort_health;
  const list = bundle?.assessments || [];
  // rider-facing: hide explicit_deleted; show unmatched first
  const shown = list
    .filter((a) => a.assessment !== "explicit_deleted")
    .sort((a, b) => (a.assessment === "unmatched" ? -1 : 0) - (b.assessment === "unmatched" ? -1 : 0));

  return (
    <div className="wrap">
      <header className="head">
        <div className="brand"><Bus size={20} /> <span>Ghost Bus</span></div>
        <button className="btn" onClick={run} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          {loading ? "Running…" : "Run live cycle"}
        </button>
      </header>

      <p className="claim">
        Unmatched <em>scheduled services</em> on Dublin's bus network — scheduled and due, with no
        live vehicle in the feed. This is a telemetry signal, not a claim that a bus was cancelled.
      </p>

      {error && <div className="banner err"><AlertTriangle size={16} /> {error}</div>}

      {bundle && (
        <>
          <div className="meta">
            <span>as of {bundle.as_of}</span>
            {bundle.preview && <span className="tag">preview · instances mocked (step 2)</span>}
            {bundle.feed && (
              <span>
                feed {bundle.feed.vehicles_status}/{bundle.feed.vehicles_entities} ·
                incrementality {String(bundle.feed.incrementality)} · skew {String(bundle.feed.skew_s)}s
              </span>
            )}
          </div>

          {h && (
            <div className={`health ${h.healthy ? "ok" : "down"}`}>
              cohort <b>{h.state}</b> — expected {h.expected}, matched {h.matched}
              {h.reason ? ` · ${h.reason}` : ""}
            </div>
          )}

          {!h?.healthy ? (
            <div className="empty">
              Abstaining — the feed/cohort isn't healthy enough to judge absence this cycle.
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">No eligible instances this cycle.</div>
          ) : (
            <ul className="rows">
              {shown.map((a, i) => (
                <li key={i} className={`row ${SEV[a.assessment] || ""}`}>
                  <span className="route">{a.instance.route_short_name}</span>
                  <span className="when">{a.instance.start_time}</span>
                  <span className="stop">{a.instance.ref_stop_name || "—"}</span>
                  <span className="verdict">{LABEL[a.assessment] || a.assessment}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!bundle && !loading && (
        <div className="empty">Press “Run live cycle” to assess the current feed.</div>
      )}
    </div>
  );
}
