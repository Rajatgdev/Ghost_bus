// One line of provenance at the top of every view: is this live, stale, abstaining, or replay?
export const STALE_AFTER_S = 120;

function parseAsOf(asOf) {
  // backend sends 2026-10-04T11:56:11+0000 (no colon in offset); Date() wants +00:00
  const t = Date.parse(String(asOf || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(t) ? null : t;
}

export function bundleAgeSecs(asOf, now = Date.now()) {
  const t = parseAsOf(asOf);
  return t == null ? null : Math.max(0, Math.round((now - t) / 1000));
}

/** Clock time in Dublin, whatever timezone the server or browser is in. */
export function fmtClock(asOf) {
  const t = parseAsOf(asOf);
  if (t == null) return "—";
  return new Date(t).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Dublin" });
}

function fmtAge(s) {
  if (s < 60) return "just now";
  if (s < 90) return "1 min ago";
  return `${Math.round(s / 60)} min ago`;
}

export function statusOf(bundle, mode, now) {
  if (!bundle) return null;
  const at = fmtClock(bundle.as_of);
  if (mode === "replay")
    return { kind: "replay", label: "Past check", text: `Saved check from ${at}. Not live.` };
  const age = bundleAgeSecs(bundle.as_of, now);
  if (!bundle.feed_usable || bundle.feed?.error)
    return { kind: "bad", label: "Feed unavailable",
      text: "The live feed couldn't be used this check, so nothing is flagged." };
  if (age != null && age > STALE_AFTER_S)
    return { kind: "warn", label: "Out of date", text: `Last checked at ${at} (${fmtAge(age)}). Run again for current data.` };
  if (!bundle.cohort_health?.healthy)
    return { kind: "warn", label: "Not enough data",
      text: "Too few buses are reporting to judge which are missing, so nothing is flagged." };
  return { kind: "ok", label: "Live", text: `Checked at ${at} · ${age == null ? "just now" : fmtAge(age)}` };
}

export default function StatusBanner({ bundle, mode, now }) {
  const s = statusOf(bundle, mode, now);
  if (!s) return null;
  return (
    <div className={`provenance ${s.kind}`} role="status" aria-live="polite">
      <span className="pill">{s.kind === "ok" && <i className="pulse" aria-hidden="true" />}{s.label}</span>
      <span>{s.text}</span>
    </div>
  );
}
