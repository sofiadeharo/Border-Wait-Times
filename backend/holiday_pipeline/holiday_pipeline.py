"""
Holiday Calendar Ingestion Pipeline
Carga el calendario de feriados y recesos escolares US/MX (holidays.csv)
a la tabla `holidays` en Postgres.
"""

import csv
import os
import logging
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass
from functools import wraps
import time

import psycopg2
from psycopg2.extras import execute_batch
import pytz
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/holiday_pipeline.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "holidays.csv")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "password"),
    "port": int(os.getenv("DB_PORT", "5432"))
}

MAX_RETRIES = 3
RETRY_DELAY = 5


# ============================================================================
# DATA MODELS
# ============================================================================

@dataclass
class HolidayData:
    day_of_year: int
    date_value: str
    day_of_week: str
    us_is_federal_holiday: bool
    us_federal_holiday_name: Optional[str]
    us_is_school_break: bool
    us_school_break_name: Optional[str]
    us_is_summer_vacation: bool
    us_school_data_available: bool
    mx_is_official_holiday: bool
    mx_official_holiday_name: Optional[str]
    mx_is_bridge_day: bool
    mx_bridge_day_name: Optional[str]
    mx_is_summer_vacation: bool


# ============================================================================
# RETRY DECORATOR
# ============================================================================

def retry_on_failure(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if attempt == MAX_RETRIES:
                    logger.error(f"Failed after {MAX_RETRIES} attempts: {str(e)}")
                    raise
                wait_time = RETRY_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    f"Attempt {attempt}/{MAX_RETRIES} failed. "
                    f"Retrying in {wait_time}s... Error: {str(e)}"
                )
                time.sleep(wait_time)
    return wrapper


# ============================================================================
# CSV PARSING
# ============================================================================

def _to_bool(value: str) -> bool:
    return value.strip().upper() == "TRUE"


def _to_str_or_none(value: str) -> Optional[str]:
    value = value.strip()
    return value if value else None


class HolidayCSVReader:
    def read(self, csv_path: str = CSV_PATH) -> List[HolidayData]:
        logger.info(f"Reading holidays CSV from '{csv_path}'...")
        records = []
        with open(csv_path, newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for line_num, row in enumerate(reader, start=2):
                day_of_year_raw = row.get("Dia (dia del anio)", "").strip()
                if not day_of_year_raw.isdigit():
                    if day_of_year_raw:
                        logger.warning(
                            f"Skipping non-data row at line {line_num}: {day_of_year_raw!r}"
                        )
                    continue
                records.append(HolidayData(
                    day_of_year=int(day_of_year_raw),
                    date_value=row["Fecha"].strip(),
                    day_of_week=row["Dia semana"].strip(),
                    us_is_federal_holiday=_to_bool(row["US - Es feriado federal"]),
                    us_federal_holiday_name=_to_str_or_none(row["US - Nombre feriado federal"]),
                    us_is_school_break=_to_bool(row["US - Es receso escolar"]),
                    us_school_break_name=_to_str_or_none(row["US - Nombre receso escolar"]),
                    us_is_summer_vacation=_to_bool(row["US - Es vacaciones_verano"]),
                    us_school_data_available=_to_bool(row["US - Dato escolar disponible"]),
                    mx_is_official_holiday=_to_bool(row["MX - Es feriado oficial"]),
                    mx_official_holiday_name=_to_str_or_none(row["MX - Nombre feriado oficial"]),
                    mx_is_bridge_day=_to_bool(row["MX - Es puente"]),
                    mx_bridge_day_name=_to_str_or_none(row["MX - Nombre puente"]),
                    mx_is_summer_vacation=_to_bool(row["MX - Es vacaciones_verano"]),
                ))
        logger.info(f"Parsed {len(records)} holiday records")
        return records


# ============================================================================
# DATABASE
# ============================================================================

class DatabaseHandler:
    def __init__(self):
        self.conn = None
        self.connect()

    def connect(self):
        try:
            self.conn = psycopg2.connect(**DB_CONFIG)
            logger.info("Database connection established")
        except psycopg2.OperationalError as e:
            logger.error(f"Database connection failed: {str(e)}")
            raise

    def create_tables(self):
        with self.conn.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS holidays (
                    id SERIAL PRIMARY KEY,
                    day_of_year INTEGER NOT NULL,
                    date_value DATE NOT NULL,
                    day_of_week VARCHAR(20),
                    us_is_federal_holiday BOOLEAN DEFAULT FALSE,
                    us_federal_holiday_name VARCHAR(255),
                    us_is_school_break BOOLEAN DEFAULT FALSE,
                    us_school_break_name VARCHAR(255),
                    us_is_summer_vacation BOOLEAN DEFAULT FALSE,
                    us_school_data_available BOOLEAN DEFAULT FALSE,
                    mx_is_official_holiday BOOLEAN DEFAULT FALSE,
                    mx_official_holiday_name VARCHAR(255),
                    mx_is_bridge_day BOOLEAN DEFAULT FALSE,
                    mx_bridge_day_name VARCHAR(255),
                    mx_is_summer_vacation BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE (date_value)
                );

                CREATE INDEX IF NOT EXISTS idx_holidays_date
                    ON holidays(date_value);

                CREATE TABLE IF NOT EXISTS holiday_ingestion_logs (
                    id SERIAL PRIMARY KEY,
                    execution_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    records_processed INTEGER,
                    records_inserted INTEGER,
                    status VARCHAR(50),
                    error_message TEXT,
                    execution_duration_seconds FLOAT
                );
            """)
            self.conn.commit()
            logger.info("Holiday database tables created/verified")

    @retry_on_failure
    def upsert_holidays(self, records: List[HolidayData]) -> int:
        if not records:
            logger.warning("No holiday records to insert")
            return 0

        with self.conn.cursor() as cursor:
            data_tuples = [
                (
                    r.day_of_year, r.date_value, r.day_of_week,
                    r.us_is_federal_holiday, r.us_federal_holiday_name,
                    r.us_is_school_break, r.us_school_break_name,
                    r.us_is_summer_vacation, r.us_school_data_available,
                    r.mx_is_official_holiday, r.mx_official_holiday_name,
                    r.mx_is_bridge_day, r.mx_bridge_day_name,
                    r.mx_is_summer_vacation,
                )
                for r in records
            ]

            try:
                execute_batch(
                    cursor,
                    """
                    INSERT INTO holidays
                    (day_of_year, date_value, day_of_week,
                     us_is_federal_holiday, us_federal_holiday_name,
                     us_is_school_break, us_school_break_name,
                     us_is_summer_vacation, us_school_data_available,
                     mx_is_official_holiday, mx_official_holiday_name,
                     mx_is_bridge_day, mx_bridge_day_name,
                     mx_is_summer_vacation)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (date_value) DO UPDATE SET
                        day_of_year = EXCLUDED.day_of_year,
                        day_of_week = EXCLUDED.day_of_week,
                        us_is_federal_holiday = EXCLUDED.us_is_federal_holiday,
                        us_federal_holiday_name = EXCLUDED.us_federal_holiday_name,
                        us_is_school_break = EXCLUDED.us_is_school_break,
                        us_school_break_name = EXCLUDED.us_school_break_name,
                        us_is_summer_vacation = EXCLUDED.us_is_summer_vacation,
                        us_school_data_available = EXCLUDED.us_school_data_available,
                        mx_is_official_holiday = EXCLUDED.mx_is_official_holiday,
                        mx_official_holiday_name = EXCLUDED.mx_official_holiday_name,
                        mx_is_bridge_day = EXCLUDED.mx_is_bridge_day,
                        mx_bridge_day_name = EXCLUDED.mx_bridge_day_name,
                        mx_is_summer_vacation = EXCLUDED.mx_is_summer_vacation
                    """,
                    data_tuples,
                    page_size=200
                )
                self.conn.commit()
                logger.info(f"Upserted {len(data_tuples)} holiday records into database")
                return len(data_tuples)

            except psycopg2.Error as e:
                self.conn.rollback()
                logger.error(f"Database insert error: {str(e)}")
                raise

    def log_ingestion(self, records_processed: int, records_inserted: int,
                       status: str, error_msg: Optional[str] = None,
                       duration: float = 0):
        with self.conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO holiday_ingestion_logs
                (records_processed, records_inserted, status, error_message,
                 execution_duration_seconds)
                VALUES (%s, %s, %s, %s, %s)
            """, (records_processed, records_inserted, status, error_msg, duration))
            self.conn.commit()

    def close(self):
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")


# ============================================================================
# PIPELINE PRINCIPAL
# ============================================================================

class HolidayDataPipeline:
    def __init__(self):
        self.csv_reader = HolidayCSVReader()
        self.db = DatabaseHandler()

    def run(self) -> Dict:
        start_time = time.time()
        stats = {
            'timestamp': datetime.now(pytz.UTC).isoformat(),
            'status': 'success',
            'records_fetched': 0,
            'records_inserted': 0,
            'error': None,
            'duration_seconds': 0
        }

        try:
            logger.info("=" * 70)
            logger.info("Starting Holiday Data Pipeline Execution")
            logger.info("=" * 70)

            logger.info("Step 1: Reading holidays CSV...")
            records = self.csv_reader.read()
            stats['records_fetched'] = len(records)

            logger.info("Step 2: Upserting to database...")
            inserted = self.db.upsert_holidays(records)
            stats['records_inserted'] = inserted

            duration = time.time() - start_time
            stats['duration_seconds'] = round(duration, 2)
            self.db.log_ingestion(
                records_processed=stats['records_fetched'],
                records_inserted=stats['records_inserted'],
                status='success',
                duration=duration
            )

            logger.info("=" * 70)
            logger.info("Holiday Pipeline Execution Completed Successfully")
            logger.info(f"Duration: {duration:.2f}s")
            logger.info(f"Records: {stats['records_fetched']} fetched, "
                        f"{stats['records_inserted']} upserted")
            logger.info("=" * 70)

        except Exception as e:
            logger.error(f"Holiday pipeline failed with error: {str(e)}", exc_info=True)
            stats['status'] = 'failed'
            stats['error'] = str(e)
            duration = time.time() - start_time
            stats['duration_seconds'] = round(duration, 2)

            self.db.log_ingestion(
                records_processed=stats['records_fetched'],
                records_inserted=stats['records_inserted'],
                status='failed',
                error_msg=str(e),
                duration=duration
            )

        finally:
            self.db.close()

        return stats


# ============================================================================
# ENTRY POINT
# ============================================================================

def main():
    pipeline = HolidayDataPipeline()
    pipeline.db.create_tables()
    stats = pipeline.run()
    return stats


if __name__ == "__main__":
    main()
