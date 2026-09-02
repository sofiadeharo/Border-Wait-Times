"""
One-shot database initialisation for the Render deployment.

Applies backend/database/schema.sql and seeds the US/MX holiday calendar from
backend/holiday_pipeline/holidays.csv. Idempotent (CREATE TABLE IF NOT EXISTS +
ON CONFLICT upserts), so it is safe to run on every deploy or on a schedule.

Reads the same DB_* environment variables as the rest of the backend.
"""

import os
import sys

# holiday_pipeline configures a logging FileHandler at import time.
os.makedirs("logs", exist_ok=True)

import psycopg2

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "dbname": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "password"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(HERE, "schema.sql")
HOLIDAY_PIPELINE_DIR = os.path.join(HERE, "..", "holiday_pipeline")


def apply_schema() -> None:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(schema_sql)
        conn.commit()
    print(f"[init_db] schema applied from {SCHEMA_PATH}")


def seed_holidays() -> None:
    sys.path.insert(0, HOLIDAY_PIPELINE_DIR)
    from holiday_pipeline import main as run_holiday_pipeline

    run_holiday_pipeline()
    print("[init_db] holiday calendar seeded")


if __name__ == "__main__":
    apply_schema()
    seed_holidays()
