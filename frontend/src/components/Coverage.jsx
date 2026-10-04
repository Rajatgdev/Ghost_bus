// Coverage, not just anomalies: every partition is shown so "0 flagged" is never
// confused with "0 checked". Partitions are disjoint and sum to the total.
const PARTS = [
  { key: "flagged",   label: "Unmatched",        cls: "bad",  from: ["unmatched"] },
  { key: "observed",  label: "Vehicle observed", cls: "ok",   from: ["vehicle_observed"] },
  { key: "pending",   label: "Not yet due / delayed", cls: "mute", from: ["watch", "predicted_delayed"] },
  { key: "cancelled", label: "Cancelled (reported)", cls: "mute", from: ["explicit_cancelled"] },
  { key: "abstained", label: "Abstained",        cls: "warn", from: ["data_unusable"] },
  { key: "excluded",  label: "Excluded (unsupported)", cls: "mute", from: ["excluded_unsupported"] },
];

export default function Coverage({ counts }) {
  if (!counts) return null;
  // explicit_deleted is hidden from rider-facing views, including the total
  const total = Object.entries(counts)
    .filter(([k]) => k !== "explicit_deleted")
    .reduce((s, [, v]) => s + v, 0);
  const parts = PARTS.map((p) => ({ ...p, n: p.from.reduce((s, k) => s + (counts[k] || 0), 0) }));

  return (
    <section className="coverage" aria-label="Coverage this cycle">
      <div className="cov-total">
        <b>{total}</b> scheduled trips checked this cycle
      </div>
      <div className="cov-bar" aria-hidden="true">
        {parts.filter((p) => p.n).map((p) => (
          <span key={p.key} className={`seg ${p.cls}`} style={{ flexGrow: p.n }} />
        ))}
      </div>
      <ul className="cov-legend">
        {parts.map((p) => (
          <li key={p.key} className={p.n ? "" : "zero"}>
            <i className={`dot ${p.cls}`} aria-hidden="true" />
            <b>{p.n}</b> {p.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
