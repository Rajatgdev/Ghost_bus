import { CircleCheck, Diamond, Clock3, TriangleAlert, Ban } from "lucide-react";

// Wording rule: we report what the feed shows, never why. "No vehicle reporting", not "cancelled".
export const TRIP = {
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
export const hhmm = (s) => (s == null ? "—" : `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`);

function statusOf(a) {
  if (a.reason_code === "within_grace") return { text: "Due, waiting a few minutes before flagging", cls: "mute", Icon: Clock3 };
  return TRIP[a.assessment] || { text: a.assessment, cls: "mute", Icon: Clock3 };
}

/** Trip rows. `showRoute` adds a route column (used by the Ask box, where trips mix routes). */
export default function TripTable({ trips, showRoute = false }) {
  return (
    <table className={`trips ${showRoute ? "with-route" : ""}`}>
      <thead><tr>{showRoute && <th>Route</th>}<th>Departs</th><th>Due</th><th>Stop</th><th>Status</th></tr></thead>
      <tbody>
        {trips.map((a) => {
          const t = statusOf(a);
          return (
            <tr key={a.instance.trip_id} className={t.cls}>
              {showRoute && <td><span className="badge sm">{a.instance.route_short_name}</span></td>}
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
  );
}
