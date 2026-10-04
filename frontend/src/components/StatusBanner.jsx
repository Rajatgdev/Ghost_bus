import { AlertTriangle, CheckCircle2, History, Info } from "lucide-react";

// How old can a live bundle get before we call it stale (seconds).
export const STALE_AFTER_S = 120;

export function bundleAgeSecs(asOf, now = Date.now()) {
  // as_of comes as 2026-10-04T14:35:00+0100 (no colon in offset) -> normalise for Date()
  const iso = String(asOf || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((now - t) / 1000));
}

/** Decide the single most important status for this bundle. Order matters: worst first. */
export function statusOf(bundle, mode, now) {
  if (!bundle) return null;
  if (mode === "replay")
    return { kind: "replay", Icon: History,
      text: `Replay — a captured cycle from ${fmtTime(bundle.as_of)}. Not live; never counted as live.` };
  const age = bundleAgeSecs(bundle.as_of, now);
  if (!bundle.feed_usable || bundle.feed?.error)
    return { kind: "bad", Icon: AlertTriangle,
      text: `Feed unusable this cycle${bundle.feed?.error ? ` (${bundle.feed.error})` : ""} — abstaining, nothing flagged.` };
  if (age != null && age > STALE_AFTER_S)
    return { kind: "warn", Icon: AlertTriangle,
      text: `Stale — last cycle was ${fmtAge(age)} ago. Results may not reflect the network now.` };
  if (!bundle.cohort_health?.healthy)
    return { kind: "warn", Icon: AlertTriangle,
      text: `Cohort ${bundle.cohort_health?.state || "unhealthy"} — too few vehicles matched to judge absence. Abstaining.` };
  return { kind: "ok", Icon: CheckCircle2,
    text: `Live · cohort healthy · updated ${age == null ? "just now" : `${fmtAge(age)} ago`}` };
}

export default function StatusBanner({ bundle, mode, now }) {
  const s = statusOf(bundle, mode, now);
  if (!s) return null;
  return (
    <>
      <div className={`status ${s.kind}`} role="status" aria-live="polite">
        <s.Icon size={16} aria-hidden="true" />
        <span>{s.text}</span>
      </div>
      {bundle.preview && (
        <div className="status note">
          <Info size={16} aria-hidden="true" />
          <span>Preview: the scheduled trip list is sample data until the timetable import lands. Feed checks are real.</span>
        </div>
      )}
    </>
  );
}

export function fmtTime(asOf) {
  const m = String(asOf || "").match(/T(\d{2}:\d{2})/);
  return m ? m[1] : asOf;
}
function fmtAge(s) {
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}
