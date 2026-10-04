# Ghost Bus — demo script (≈2 min)

**Before going on stage:** open the Vercel URL in two tabs: one on Live, one with `?replay`.
If wifi or the feed fails, use the Replay tab and say so out loud.

## 1. Problem (20s)
"Ghost buses are a national issue in Ireland. When an operator cancels a trip without sending
a cancellation, the realtime system can fall back to the timetable, so your app shows a bus
that isn't coming."

## 2. What we built (20s)
"Ghost Bus compares the TFI timetable with the NTA live feeds every cycle. It flags trips that
are scheduled and due, with no vehicle reporting and no cancellation."

## 3. The honest part (25s) — this is what makes it credible
"We can't tell a silent cancellation from a bus whose tracker is off; they look identical in
the data. So we never claim the cause. We report a telemetry fact: no vehicle on this trip.
And when the feed itself is unhealthy, we abstain instead of flagging hundreds of false ghosts."

## 4. Show it (40s)
- Press **Run live cycle**. Point at the status banner: live, stale or abstaining.
- Point at the **coverage bar**: "N trips checked, X observed, Y unmatched. Zero flagged
  never means zero checked."
- Click the red pin, or the top row, to open **Why**: due time, evidence, "cause unknown".
- If live shows "abstaining", say: "This is the system refusing to guess. Here's a cycle where
  it could judge," and switch to **Replay**.

## 5. Close (15s)
"Next: a full-day log of unmatched trips per route, so riders and the NTA can see where ghosts
cluster. Built today on public NTA and TFI data."

## Do not say
- "This bus didn't come" / "the operator cancelled it" (unknowable from the feed)
- "The app showed it as due" (we have no capture of the app)
- Any accuracy number (we haven't measured one)
