// Past checks, kept in this browser only (the backend doesn't store checks yet).
// Each live check is saved in a compact form; storage failures never break the page.
const KEY = "ghostbus.checks.v1";
const MAX = 40;

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
