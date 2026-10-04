// Past checks, kept in this browser only (the backend doesn't store checks yet).
// Each live check is saved in a compact form; storage failures never break the page.
const KEY = "ghostbus.checks.v1";
const MAX = 30; // full checks kept for "View" (they are large)

function compact(b) {
  return {
    as_of: b.as_of,
    counts: b.counts,
    cohort_health: b.cohort_health,
    feed: b.feed,
    feed_usable: b.feed_usable,
    preview: !!b.preview,
    assessments: (b.assessments || []).map((a) => ({
      assessment: a.assessment,
      reason_code: a.reason_code,
      effective_due_secs: a.effective_due_secs,
      instance: {
        trip_id: a.instance.trip_id,
        route_short_name: a.instance.route_short_name,
        start_time: a.instance.start_time,
        ref_stop_name: a.instance.ref_stop_name,
        ref_stop_lat: a.instance.ref_stop_lat,
        ref_stop_lon: a.instance.ref_stop_lon,
        static_due_secs: a.instance.static_due_secs,
        service_date: a.instance.service_date,
      },
    })),
  };
}

export function loadChecks() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Add a check (newest last). Returns the new list. */
export function saveCheck(list, bundle) {
  if (!bundle?.as_of || bundle.preview) return list;
  if (list.some((c) => c.as_of === bundle.as_of)) return list;
  let next = [...list, compact(bundle)].slice(-MAX);
  // if storage is full, drop the oldest until it fits
  while (next.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      break;
    } catch {
      if (next.length === 1) break;
      next = next.slice(1);
    }
  }
  return next;
}

export function clearChecks() {
  try { localStorage.removeItem(KEY); } catch {}
  return [];
}

export function checkTime(asOf) {
  const t = Date.parse(String(asOf || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(t) ? 0 : t;
}

// ---- Follow-up log: a slim record of every check (about 4 KB each), kept much longer
// than the full checks so the follow-up still covers the whole afternoon.
const LOG_KEY = "ghostbus.log.v1";
const LOG_MAX = 400; // ~6.5 hours at one check a minute

const CODE = { unmatched: "U", vehicle_observed: "V", predicted_delayed: "V", explicit_cancelled: "C", watch: "W" };

function slim(b) {
  const a = {}, m = {};
  for (const x of b.assessments || []) {
    const id = x.instance.trip_id;
    a[id] = CODE[x.assessment] || "O";
    if (x.assessment === "unmatched")
      m[id] = [x.instance.route_short_name, x.instance.start_time?.slice(0, 5), x.instance.ref_stop_name || ""];
  }
  return { t: b.as_of, h: !!b.cohort_health?.healthy, a, m };
}

function writeLog(next) {
  while (next.length) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(next)); break; }
    catch { if (next.length === 1) break; next = next.slice(Math.ceil(next.length / 10)); }
  }
  return next;
}

export function loadLog() {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || "null");
    if (Array.isArray(v)) return v;
  } catch {}
  // first run: build it from any full checks already saved
  return writeLog(loadChecks().map(slim));
}

export function appendLog(log, bundle) {
  if (!bundle?.as_of || bundle.preview) return log;
  if (log.some((e) => e.t === bundle.as_of)) return log;
  return writeLog([...log, slim(bundle)].slice(-LOG_MAX));
}

export function clearLog() {
  try { localStorage.removeItem(LOG_KEY); } catch {}
  return [];
}
