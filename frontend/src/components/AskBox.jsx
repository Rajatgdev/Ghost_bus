import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { ask } from "../lib/api";
import { fmtClock } from "./StatusBanner.jsx";
import TripTable from "./TripTable.jsx";

// Ask in plain English. Jev only decides WHAT to show (which route, ghosts vs everything);
// the backend runs a real check and writes the answer from real numbers.
const EXAMPLES = ["Any ghost buses right now?", "How is the 46A doing?", "Give me a quick summary"];
const INTENT = { only_ghosts: "trips with no vehicle", specific_route: "one route", summary: "summary", everything: "all trips" };
const SHOW = 25;

export default function AskBox() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resp, setResp] = useState(null);
  const [all, setAll] = useState(false);

  async function submit(question) {
    const text = (question ?? q).trim();
    if (!text || loading) return;
    setQ(text);
    setLoading(true);
    setError("");
    setAll(false);
    try {
      setResp(await ask(text));
    } catch (e) {
      setError(e.message || "failed");
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  const due = (a) => a.effective_due_secs ?? a.instance.static_due_secs;
  const rows = (resp?.results || [])
    .filter((a) => a.assessment !== "explicit_deleted")
    .sort((a, b) => (a.assessment !== "unmatched") - (b.assessment !== "unmatched") || due(a) - due(b));
  const shown = all ? rows : rows.slice(0, SHOW);
  const readAs = resp ? (resp.route ? `route ${resp.route}` : INTENT[resp.intent] || resp.intent) : "";

  return (
    <section className="ask" aria-label="Ask about Dublin buses">
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="ask-input" className="ask-label">Ask</label>
        <input id="ask-input" value={q} maxLength={200} autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. any buses missing on the 39?" />
        <button className="btn" type="submit" disabled={loading || !q.trim()}>
          {loading ? "Checking…" : <>Ask <ArrowRight size={15} aria-hidden="true" /></>}
        </button>
      </form>

      {!resp && !error && (
        <div className="ask-examples">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="chip" onClick={() => submit(x)} disabled={loading}>{x}</button>
          ))}
        </div>
      )}

      {error && <div className="ask-error" role="alert">Couldn't answer that ({error}).</div>}

      {resp && (
        <div className="ask-result" aria-live="polite">
          <div className="ask-answer">
            <p>{resp.answer}</p>
            <button className="icon-btn" aria-label="Clear answer" onClick={() => { setResp(null); setQ(""); }}><X size={16} /></button>
          </div>
          <p className="ask-meta">
            Checked at {fmtClock(resp.as_of)} · read as: {readAs}
            {resp.jev_used
              ? <> · question interpreted by Jev</>
              : <> · <span className="warn-ink">couldn't interpret the question, so this shows all trips with no vehicle</span></>}
          </p>
          {rows.length > 0 && (
            <>
              <TripTable trips={shown} showRoute />
              {rows.length > SHOW && !all && (
                <button className="link ask-more" onClick={() => setAll(true)}>Show all {rows.length} trips</button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
