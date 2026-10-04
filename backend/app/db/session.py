"""Async SQLAlchemy engine on the POOLED Neon URL (app queries). Migrations use the DIRECT
url (see migrate.py). Only imported when USE_DB=true. Small pool + pre-ping for Neon's
serverless compute. Build-plan step 2+.
"""
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings


def _async_url(url: str) -> str:
    """Normalize a Neon URL to the asyncpg driver and strip sslmode (asyncpg negotiates SSL)."""
    from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
    for old, new in (("postgresql+asyncpg://", "postgresql+asyncpg://"),
                     ("postgresql://", "postgresql+asyncpg://"),
                     ("postgres://", "postgresql+asyncpg://")):
        if url.startswith(old):
            url = url.replace(old, new, 1)
            break
    p = urlsplit(url)
    q = [(k, v) for k, v in parse_qsl(p.query) if k != "sslmode"]
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(q), p.fragment))


engine = create_async_engine(_async_url(settings.database_url),
                             pool_size=2, max_overflow=0, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
