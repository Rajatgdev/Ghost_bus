"""Jev (TypeSafe System One) — the natural-language question layer.

Strictly additive and OFF the detection path. Jev never sees the bus data and never
invents an answer: it maps the user's *question* to a typed FILTER (intent + which route),
and code applies that filter to the real assessments the deterministic detector already
produced. So Jev can only surface or narrow REAL results, never hallucinate a ghost.

Docs: POST https://api.typesafe.ai/v1/systemone , Bearer auth, Choice primitive.
If Jev is unavailable, callers fall back to "show all current ghosts".
"""
from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings

API_URL = "https://api.typesafe.ai/v1/systemone"

# What the user wants to see — a fixed, code-owned set of intents.
INTENTS = {
    "only_ghosts": "Show only the buses flagged as unmatched / ghost / missing / not showing up.",
    "specific_route": "Show the status of one particular bus route the user named (e.g. 'the 39', 'C1').",
    "summary": "Give a short overall summary / count of the current situation.",
    "everything": "Show the full list of all scheduled trips and their status.",
}


class JevError(Exception):
    pass


async def _ask(state: str, questions: dict[str, Any], timeout: float = 15.0) -> dict[str, Any]:
    if not settings.jev_api_key:
        raise JevError("JEV_API_KEY not set")
    headers = {"Authorization": f"Bearer {settings.jev_api_key}",
               "Content-Type": "application/json"}
    payload = {"state": state, "model": settings.jev_model, "questions": questions}
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(API_URL, headers=headers, json=payload)
        if r.status_code != 200:
            raise JevError(f"HTTP {r.status_code}: {r.text[:200]}")
        return r.json()


async def route_question(question: str, routes_in_cycle: list[str]) -> dict[str, Any]:
    """Return {'intent': str, 'route': str|None, 'confidence': float} for the user's question.

    Two Choice questions in ONE call: the intent, and (speculatively) which of the routes
    actually present in this cycle they mean. Code decides whether to use the route.
    """
    # route options must be a non-empty map; add a 'none' escape hatch
    route_opts = {r: f"The user is asking about bus route {r}." for r in sorted(set(routes_in_cycle))}
    route_opts["none"] = "The user did not name a specific route that is in the list."

    questions = {
        "intent": {"type": "choice",
                   "instructions": "What is the user asking to see about Dublin buses right now?",
                   "criteria": INTENTS},
        "route": {"type": "choice",
                  "instructions": "If the user named a specific bus route, which one?",
                  "criteria": route_opts},
    }
    data = await _ask(f"User question: {question}", questions)
    ans = data.get("answers", {})
    intent = ans.get("intent", {}).get("choice", "only_ghosts")
    intent_conf = float(ans.get("intent", {}).get("confidence", 0.0))
    route = ans.get("route", {}).get("choice")
    if route == "none":
        route = None
    return {"intent": intent, "route": route, "confidence": intent_conf}