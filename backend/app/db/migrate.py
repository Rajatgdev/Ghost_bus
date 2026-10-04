"""Apply .sql migrations in order on the DIRECT (non-pooled) Neon URL.
Run as a one-off, NOT on app startup:  python -m app.db.migrate
"""
import glob
import os

import psycopg

from app.core.config import settings


def main() -> None:
    here = os.path.join(os.path.dirname(__file__), "migrations")
    files = sorted(glob.glob(os.path.join(here, "*.sql")))
    if not settings.database_url_direct:
        raise SystemExit("DATABASE_URL_DIRECT is not set — cannot run migrations")
    with psycopg.connect(settings.database_url_direct) as conn:
        for path in files:
            with open(path) as f:
                conn.execute(f.read())
            print(f"applied {os.path.basename(path)}")
        conn.commit()
    print("migrations complete")


if __name__ == "__main__":
    main()
