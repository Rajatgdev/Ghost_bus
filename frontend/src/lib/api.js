// Same-origin: Vercel proxies /api/* to Railway (vercel.json); Vite proxies it in dev.
async function req(path, opts = {}) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const b = await r.json();
      if (typeof b.detail === "string") msg = b.detail;
    } catch {}
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export const getCohorts = () => req("/api/cohorts");
export const runCycle = () => req("/api/cycle", { method: "POST" });
