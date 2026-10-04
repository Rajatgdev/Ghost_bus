import { fmtClock } from "./StatusBanner.jsx";

// List of saved checks, newest first. Picking one shows that check on the normal board.
export default function PastChecks({ checks, onOpen, onOpenSample, onClear }) {
  const rows = [...checks].reverse();
  return (
    <section className="past" aria-label="Past checks">
      <div className="past-head">
        <h2>Past checks</h2>
        {rows.length > 0 && <button className="link" onClick={onClear}>Clear history</button>}
      </div>
      {rows.length === 0 ? (
        <div className="fu-empty">
          No past checks yet. Every live check is saved here automatically, in this browser.
        </div>
      ) : (
        <table className="past-table">
          <thead><tr><th>Checked at</th><th>No vehicle</th><th>Due</th><th>Data</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const k = c.counts || {};
              const ok = !!c.cohort_health?.healthy;
              const due = (k.unmatched || 0) + (k.vehicle_observed || 0) + (k.predicted_delayed || 0);
              return (
                <tr key={c.as_of}>
                  <td className="num">{fmtClock(c.as_of)}</td>
                  <td className={`num ${ok && k.unmatched ? "bad-ink" : ""}`}>{ok ? k.unmatched || 0 : "—"}</td>
                  <td className="num">{due}</td>
                  <td>{ok ? "Healthy" : "Not assessed"}</td>
                  <td className="right"><button className="link" onClick={() => onOpen(c.as_of)}>View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="past-sample">
        <button className="link" onClick={onOpenSample}>View the sample check</button> (made-up timetable, for testing the layout).
      </p>
    </section>
  );
}
