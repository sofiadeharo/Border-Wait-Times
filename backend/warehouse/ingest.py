"""
Warehouse ingestion job: fetch raw sources -> bronze (upsert) -> refresh gold.

Run hourly as an Azure Container Apps Job (or any scheduler). Reads the same
DB_* environment variables as the rest of the backend.

    python -m backend.warehouse.ingest            # from repo root
"""
from __future__ import annotations

import os

import psycopg2
from psycopg2.extras import execute_values

from . import sources

DB = {
    "host": os.getenv("DB_HOST", "localhost"),
    "dbname": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "border_pass_2026"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

UPSERTS = {
    "bronze.bts_crossings": (
        ["date", "port_id", "port_name", "measure", "volume"],
        "(date, port_id, measure)",
        "port_name = EXCLUDED.port_name, volume = EXCLUDED.volume, ingested_at = now()",
    ),
    "bronze.weather": (
        ["date", "location", "temp_max_c", "precip_mm", "wind_kph"],
        "(date, location)",
        "temp_max_c = EXCLUDED.temp_max_c, precip_mm = EXCLUDED.precip_mm, "
        "wind_kph = EXCLUDED.wind_kph, ingested_at = now()",
    ),
    "bronze.holidays": (
        ["date", "us_federal_holiday", "us_school_break", "us_summer_vacation",
         "mx_official_holiday", "mx_bridge_day", "mx_summer_vacation"],
        "(date)",
        "us_federal_holiday = EXCLUDED.us_federal_holiday, "
        "us_school_break = EXCLUDED.us_school_break, "
        "us_summer_vacation = EXCLUDED.us_summer_vacation, "
        "mx_official_holiday = EXCLUDED.mx_official_holiday, "
        "mx_bridge_day = EXCLUDED.mx_bridge_day, "
        "mx_summer_vacation = EXCLUDED.mx_summer_vacation",
    ),
    "bronze.cbp_wait_times": (
        ["port_id", "crossing_type", "lane_type", "wait_minutes", "status", "observed_at"],
        "(port_id, crossing_type, lane_type, observed_at)",
        "wait_minutes = EXCLUDED.wait_minutes, status = EXCLUDED.status",
    ),
}


def _upsert(cur, table: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    cols, conflict, update = UPSERTS[table]
    values = [tuple(r.get(c) for c in cols) for r in rows]
    execute_values(
        cur,
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES %s "
        f"ON CONFLICT {conflict} DO UPDATE SET {update}",
        values, page_size=1000,
    )
    return len(values)


def main() -> None:
    tasks = [
        ("bronze.bts_crossings", sources.fetch_bts_crossings),
        ("bronze.weather", sources.fetch_weather),
        ("bronze.holidays", sources.fetch_holidays),
        ("bronze.cbp_wait_times", sources.fetch_cbp_wait_snapshot),
    ]
    with psycopg2.connect(**DB) as conn, conn.cursor() as cur:
        for table, fetch in tasks:
            try:
                n = _upsert(cur, table, fetch())
                print(f"  {table:26s} {n:>7,} rows")
            except Exception as e:  # noqa: BLE001
                print(f"  {table:26s} FAILED: {e}")
        conn.commit()
        print("  refreshing gold …")
        cur.execute("CALL gold.refresh_medallion()")
        conn.commit()
    print("done")


if __name__ == "__main__":
    main()
