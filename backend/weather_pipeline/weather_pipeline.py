"""
Weather Data Ingestion Pipeline
Recopila condiciones climaticas actuales para El Paso y Ciudad Juarez
desde WeatherAPI (https://www.weatherapi.com/api-explorer.aspx)
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List
import requests
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
        logging.FileHandler('logs/weather_pipeline.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

WEATHER_API_URL = "https://api.weatherapi.com/v1/current.json"
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")

LOCATIONS = {
    "juarez": "Ciudad Juarez, Mexico",
    "el_paso": "El Paso, TX",
}

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "password"),
    "port": int(os.getenv("DB_PORT", "5432"))
}

MAX_RETRIES = 3
RETRY_DELAY = 5
TIMEOUT = 30


# ============================================================================
# DATA MODELS
# ============================================================================

@dataclass
class WeatherData:
    location_key: str
    location_name: str
    region: str
    country: str
    lat: float
    lon: float
    local_time: datetime
    temp_c: float
    feelslike_c: float
    condition_text: str
    wind_kph: float
    wind_dir: str
    pressure_mb: float
    precip_mm: float
    humidity: int
    cloud: int
    vis_km: float
    uv: float
    observed_at: datetime


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
# WEATHER API CLIENT
# ============================================================================

class WeatherAPIClient:
    def __init__(self):
        if not WEATHER_API_KEY:
            raise ValueError("WEATHER_API_KEY environment variable is not set")
        self.session = requests.Session()

    @retry_on_failure
    def fetch_current_weather(self, location_query: str) -> Dict:
        logger.info(f"Fetching current weather for '{location_query}'...")
        response = self.session.get(
            WEATHER_API_URL,
            params={"key": WEATHER_API_KEY, "q": location_query, "aqi": "no"},
            timeout=TIMEOUT
        )
        response.raise_for_status()
        logger.info(f"Status: {response.status_code}")
        return response.json()

    def parse_current_weather(self, location_key: str, payload: Dict) -> WeatherData:
        location = payload["location"]
        current = payload["current"]

        return WeatherData(
            location_key=location_key,
            location_name=location.get("name", ""),
            region=location.get("region", ""),
            country=location.get("country", ""),
            lat=location.get("lat"),
            lon=location.get("lon"),
            local_time=datetime.fromtimestamp(
                location["localtime_epoch"], tz=timezone.utc
            ),
            temp_c=current.get("temp_c"),
            feelslike_c=current.get("feelslike_c"),
            condition_text=current.get("condition", {}).get("text", ""),
            wind_kph=current.get("wind_kph"),
            wind_dir=current.get("wind_dir", ""),
            pressure_mb=current.get("pressure_mb"),
            precip_mm=current.get("precip_mm"),
            humidity=current.get("humidity"),
            cloud=current.get("cloud"),
            vis_km=current.get("vis_km"),
            uv=current.get("uv"),
            observed_at=datetime.fromtimestamp(
                current["last_updated_epoch"], tz=timezone.utc
            ),
        )


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
                CREATE TABLE IF NOT EXISTS weather_data (
                    id SERIAL PRIMARY KEY,
                    location_key VARCHAR(50) NOT NULL,
                    location_name VARCHAR(255) NOT NULL,
                    region VARCHAR(255),
                    country VARCHAR(100),
                    lat DOUBLE PRECISION,
                    lon DOUBLE PRECISION,
                    local_time TIMESTAMP WITH TIME ZONE,
                    temp_c NUMERIC(5,2),
                    feelslike_c NUMERIC(5,2),
                    condition_text VARCHAR(100),
                    wind_kph NUMERIC(5,2),
                    wind_dir VARCHAR(10),
                    pressure_mb NUMERIC(6,2),
                    precip_mm NUMERIC(6,2),
                    humidity INTEGER,
                    cloud INTEGER,
                    vis_km NUMERIC(5,2),
                    uv NUMERIC(4,1),
                    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE (location_key, observed_at)
                );

                CREATE INDEX IF NOT EXISTS idx_weather_location_observed
                    ON weather_data(location_key, observed_at DESC);

                CREATE TABLE IF NOT EXISTS weather_ingestion_logs (
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
            logger.info("Weather database tables created/verified")

    @retry_on_failure
    def insert_weather_data(self, records: List[WeatherData]) -> int:
        if not records:
            logger.warning("No weather records to insert")
            return 0

        with self.conn.cursor() as cursor:
            data_tuples = [
                (
                    r.location_key, r.location_name, r.region, r.country,
                    r.lat, r.lon, r.local_time, r.temp_c, r.feelslike_c,
                    r.condition_text, r.wind_kph, r.wind_dir, r.pressure_mb,
                    r.precip_mm, r.humidity, r.cloud, r.vis_km, r.uv,
                    r.observed_at
                )
                for r in records
            ]

            try:
                execute_batch(
                    cursor,
                    """
                    INSERT INTO weather_data
                    (location_key, location_name, region, country, lat, lon,
                     local_time, temp_c, feelslike_c, condition_text, wind_kph,
                     wind_dir, pressure_mb, precip_mm, humidity, cloud, vis_km,
                     uv, observed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (location_key, observed_at) DO NOTHING
                    """,
                    data_tuples,
                    page_size=100
                )
                self.conn.commit()
                inserted = cursor.rowcount
                logger.info(f"Inserted {inserted} weather records into database")
                return inserted

            except psycopg2.Error as e:
                self.conn.rollback()
                logger.error(f"Database insert error: {str(e)}")
                raise

    def log_ingestion(self, records_processed: int, records_inserted: int,
                       status: str, error_msg: Optional[str] = None,
                       duration: float = 0):
        with self.conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO weather_ingestion_logs
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

class WeatherDataPipeline:
    def __init__(self):
        self.api_client = WeatherAPIClient()
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
            logger.info("Starting Weather Data Pipeline Execution")
            logger.info("=" * 70)

            records = []
            for location_key, location_query in LOCATIONS.items():
                logger.info(f"Fetching weather for {location_key} ({location_query})...")
                payload = self.api_client.fetch_current_weather(location_query)
                records.append(self.api_client.parse_current_weather(location_key, payload))

            stats['records_fetched'] = len(records)

            logger.info("Inserting weather records to database...")
            inserted = self.db.insert_weather_data(records)
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
            logger.info("Weather Pipeline Execution Completed Successfully")
            logger.info(f"Duration: {duration:.2f}s")
            logger.info(f"Records: {stats['records_fetched']} fetched, "
                        f"{stats['records_inserted']} inserted")
            logger.info("=" * 70)

        except Exception as e:
            logger.error(f"Weather pipeline failed with error: {str(e)}", exc_info=True)
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
    pipeline = WeatherDataPipeline()
    pipeline.db.create_tables()
    stats = pipeline.run()
    return stats


if __name__ == "__main__":
    main()
