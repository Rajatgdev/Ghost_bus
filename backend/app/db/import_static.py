"""Import a route-filtered slice of the static GTFS zip into Neon (build-plan step 2).

One Dublin Bus cohort, a fixed ~20-route allowlist, free-tier-safe. Streams the giant
stop_times.txt (429 MB) line by line, keeping only the allowlisted trips, so nothing huge is
ever held in memory. Writes everything under ONE static_feed_versions row and flips it to
'active' at the end. shapes.txt / translations.txt are skipped (not needed for the MVP).

Insert order respects the foreign keys:
    version -> agency -> routes -> trips -> calendar/calendar_dates -> stops -> stop_times.

Run on the DIRECT (non-pooled) Neon URL:
    python -m app.db.import_static gtfs.zip

Columns are read by HEADER NAME, not position, so it tolerates feed column-order changes.
"""
from __future__ import annotations

import csv
import io
import sys
import zipfile
from datetime import date

import psycopg

from app.core.config import settings

AGENCY_ID = "1"  # Dublin Bus (Bus Atha Cliath) — from agency.txt

# MVP allowlist by route_short_name (6 BusConnects spines + classic + lower-frequency).
ROUTE_SHORT_NAMES = {
    "C1", "C2", "E1", "E2", "G1", "H2",
    "15", "16", "27", "39", "39A", "41", "13", "14", "11",
    "33", "44", "56A", "65", "151",
}

BATCH = 5000


def _secs(hhmmss: str) -> int | None:
    """GTFS time -> service-day seconds. Handles extended hours (e.g. 25:10:00)."""
    if not hhmmss:
        return None
    try:
        h, m, s = (int(x) for x in hhmmss.split(":"))
        return h * 3600 + m * 60 + s
    except ValueError:
        return None


def _d(yyyymmdd: str) -> date | None:
    try:
        return date(int(yyyymmdd[0:4]), int(yyyymmdd[4:6]), int(yyyymmdd[6:8]))
    except (ValueError, IndexError):
        return None


def _reader(zf: zipfile.ZipFile, name: str):
    """Yield dict rows (header-keyed) from a GTFS text file, streaming."""
    with zf.open(name, "r") as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig", newline=""))


def _flush(cur, sql: str, rows: list[tuple]) -> int:
    if rows:
        cur.executemany(sql, rows)
        n = len(rows)
        rows.clear()
        return n
    return 0


def main(zip_path: str) -> None:
    if not settings.database_url_direct:
        raise SystemExit("DATABASE_URL_DIRECT is not set — cannot import.")

    zf = zipfile.ZipFile(zip_path)
    names = set(zf.namelist())
    print(f"opened {zip_path}: {len(names)} files")

    conn = psycopg.connect(settings.database_url_direct, autocommit=False)
    cur = conn.cursor()

    try:
        # --- 0. new version row ---
        cur.execute(
            "INSERT INTO static_feed_versions (source_url, allowlist_version, imported_at, status) "
            "VALUES (%s, %s, now(), 'importing') RETURNING version_id",
            ("GTFS_Realtime.zip", "dublin20-v1"))
        version_id = cur.fetchone()[0]
        print(f"version_id = {version_id} (importing)")

        # --- 1. agency (all) ---
        n = 0
        for r in _reader(zf, "agency.txt"):
            cur.execute(
                "INSERT INTO agency (version_id, agency_id, agency_timezone) VALUES (%s,%s,%s) "
                "ON CONFLICT DO NOTHING",
                (version_id, r["agency_id"], r.get("agency_timezone") or "Europe/Dublin"))
            n += 1
        print(f"agency: {n}")

        # --- 2. routes (agency 1 AND short_name in allowlist) ---
        route_ids: set[str] = set()
        n = 0
        for r in _reader(zf, "routes.txt"):
            if r.get("agency_id") != AGENCY_ID:
                continue
            if (r.get("route_short_name") or "") not in ROUTE_SHORT_NAMES:
                continue
            route_ids.add(r["route_id"])
            rt = r.get("route_type")
            cur.execute(
                "INSERT INTO routes (version_id, route_id, agency_id, route_short_name, "
                "route_long_name, route_type) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (version_id, r["route_id"], r["agency_id"], r.get("route_short_name"),
                 r.get("route_long_name"), int(rt) if rt and rt.isdigit() else None))
            n += 1
        print(f"routes: {n}  ({len(route_ids)} route_ids)")
        if not route_ids:
            raise SystemExit("no routes matched the allowlist — aborting.")

        # --- 3. trips (route_id in allowlisted routes) ---
        trip_ids: set[str] = set()
        service_ids: set[str] = set()
        buf: list[tuple] = []
        n = 0
        trips_sql = ("INSERT INTO trips (version_id, trip_id, route_id, service_id, operator_id, "
                     "direction_id, trip_headsign) VALUES (%s,%s,%s,%s,%s,%s,%s) "
                     "ON CONFLICT DO NOTHING")
        for r in _reader(zf, "trips.txt"):
            if r.get("route_id") not in route_ids:
                continue
            trip_ids.add(r["trip_id"])
            service_ids.add(r["service_id"])
            did = r.get("direction_id")
            buf.append((version_id, r["trip_id"], r["route_id"], r["service_id"], AGENCY_ID,
                        int(did) if did and did.isdigit() else None, r.get("trip_headsign")))
            if len(buf) >= BATCH:
                n += _flush(cur, trips_sql, buf)
        n += _flush(cur, trips_sql, buf)
        print(f"trips: {n}  ({len(service_ids)} service_ids)")

        # --- 4. calendar (only our services) ---
        n = 0
        for r in _reader(zf, "calendar.txt"):
            if r["service_id"] not in service_ids:
                continue
            def b(k): return r.get(k) == "1"
            cur.execute(
                "INSERT INTO calendar (version_id, service_id, monday, tuesday, wednesday, "
                "thursday, friday, saturday, sunday, start_date, end_date) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (version_id, r["service_id"], b("monday"), b("tuesday"), b("wednesday"),
                 b("thursday"), b("friday"), b("saturday"), b("sunday"),
                 _d(r.get("start_date", "")), _d(r.get("end_date", ""))))
            n += 1
        print(f"calendar: {n}")

        # --- 5. calendar_dates (only our services) ---
        n = 0
        if "calendar_dates.txt" in names:
            for r in _reader(zf, "calendar_dates.txt"):
                if r["service_id"] not in service_ids:
                    continue
                cur.execute(
                    "INSERT INTO calendar_dates (version_id, service_id, date, exception_type) "
                    "VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    (version_id, r["service_id"], _d(r["date"]), int(r["exception_type"])))
                n += 1
        print(f"calendar_dates: {n}")

        # --- 6. stops (ALL — the file is tiny; load before stop_times for the FK) ---
        buf = []
        n = 0
        stops_sql = ("INSERT INTO stops (version_id, stop_id, stop_code, stop_name, "
                     "stop_lat, stop_lon) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING")
        for r in _reader(zf, "stops.txt"):
            lat, lon = r.get("stop_lat"), r.get("stop_lon")
            buf.append((version_id, r["stop_id"], r.get("stop_code"), r.get("stop_name"),
                        float(lat) if lat else None, float(lon) if lon else None))
            if len(buf) >= BATCH:
                n += _flush(cur, stops_sql, buf)
        n += _flush(cur, stops_sql, buf)
        print(f"stops: {n}")

        # --- 7. stop_times (STREAM 429MB; keep only our trips) ---
        buf = []
        n = 0
        st_sql = ("INSERT INTO stop_times (version_id, trip_id, stop_sequence, stop_id, "
                  "arrival_secs, departure_secs) VALUES (%s,%s,%s,%s,%s,%s) "
                  "ON CONFLICT DO NOTHING")
        for r in _reader(zf, "stop_times.txt"):
            if r["trip_id"] not in trip_ids:
                continue
            buf.append((version_id, r["trip_id"], int(r["stop_sequence"]), r["stop_id"],
                        _secs(r.get("arrival_time", "")), _secs(r.get("departure_time", ""))))
            if len(buf) >= BATCH:
                n += _flush(cur, st_sql, buf)
                if n % 50000 == 0:
                    print(f"  stop_times: {n} ...", flush=True)
        n += _flush(cur, st_sql, buf)
        print(f"stop_times: {n}")

        # --- 8. per-trip effective window from stop_times ---
        cur.execute(
            "UPDATE trips t SET effective_start_secs = s.min_dep, effective_end_secs = s.max_arr "
            "FROM (SELECT version_id, trip_id, min(departure_secs) AS min_dep, "
            "             max(arrival_secs) AS max_arr "
            "      FROM stop_times WHERE version_id = %s GROUP BY version_id, trip_id) s "
            "WHERE t.version_id = s.version_id AND t.trip_id = s.trip_id", (version_id,))
        print(f"trip windows computed: {cur.rowcount}")

        # --- 9. activate this version, supersede any previous active ---
        cur.execute("UPDATE static_feed_versions SET status = 'superseded' "
                    "WHERE status = 'active' AND version_id <> %s", (version_id,))
        cur.execute("UPDATE static_feed_versions SET status = 'active' WHERE version_id = %s",
                    (version_id,))
        conn.commit()
        print(f"\nDONE. version {version_id} is now ACTIVE.")
    except Exception:
        conn.rollback()
        print("ROLLED BACK — nothing committed.")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "gtfs.zip")