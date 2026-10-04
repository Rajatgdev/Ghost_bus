"""FastAPI entry point. Deploys to Railway (root dir = /backend).
Start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import monitor

app = FastAPI(title="Ghost Bus", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(monitor.router)


@app.get("/health")
async def health():
    """App health, and DB reachability when the DB layer is enabled (USE_DB=true)."""
    db = "disabled"
    if settings.use_db:
        try:
            from sqlalchemy import text
            from app.db.session import SessionLocal
            async with SessionLocal() as s:
                await s.execute(text("SELECT 1"))
            db = "connected"
        except Exception:
            db = "unreachable"
    return {"status": "ok", "database": db}
