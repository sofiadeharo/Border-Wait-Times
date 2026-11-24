"""
CBP Border Wait Times Data Ingestion Pipeline
Automatiza la recopilación de datos de espera en cruces fronterizos
El Paso - Ciudad Juárez
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict, List
import requests
import json
from dataclasses import dataclass
from functools import wraps
import time

import psycopg2
from psycopg2.extras import execute_batch, RealDictCursor
import pytz

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/pipeline.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

CBP_API_URL = "https://bwt.cbp.gov/api/waittimes"

# Postgres NOTIFY channel signaling the weather pipeline (backend/weather_pipeline)
# to run right after this pipeline completes, keeping both datasets time-aligned
# instead of drifting on independent schedules. Weather pipeline's scheduler.py
# LISTENs on this same channel name.
WEATHER_TRIGGER_CHANNEL = "cbp_pipeline_complete"

PORTS_OF_INTEREST = {
    "240201": "Bridge of the Americas (BOTA)",
    "240202": "Paso Del Norte (PDN)",
    "240203": "Ysleta",
    "240801": "Santa Teresa",
}

LANE_GROUPS = {
    'commercial_vehicle_lanes': 'Commercial Vehicle',
    'passenger_vehicle_lanes': 'Passenger Vehicle',
    'pedestrian_lanes': 'Pedestrian',
}

LANE_TYPES = {
    'standard_lanes': 'Standard',
    'FAST_lanes': 'FAST',
    'NEXUS_SENTRI_lanes': 'NEXUS/SENTRI',
    'ready_lanes': 'Ready Lane',
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
class WaitTimeData:
    port_id: str
    port_name: str
    crossing_type: str
    lane_type: str
    wait_time_minutes: int
    status: str
    timestamp: datetime
    lanes_open: Optional[int] = None  # CBP-reported open lanes for this lane type
    
    def to_dict(self):
        return {
            'port_id': self.port_id,
            'port_name': self.port_name,
            'crossing_type': self.crossing_type,
            'lane_type': self.lane_type,
            'wait_time_minutes': self.wait_time_minutes,
            'status': self.status,
            'timestamp': self.timestamp,
            'lanes_open': self.lanes_open,
            'created_at': datetime.now(pytz.UTC)
        }


# ============================================================================
# RETRY DECORATOR
# ============================================================================

def retry_on_failure(func):
    def wrapper(*args, **kwargs):
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if attempt == MAX_RETRIES:
                    logger.error(f"Falló después de {MAX_RETRIES} intentos: {str(e)}")
                    raise
                wait_time = RETRY_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    f"Intento {attempt}/{MAX_RETRIES} falló. "
                    f"Reintentando en {wait_time}s... Error: {str(e)}"
                )
                time.sleep(wait_time)
    return wrapper


# ============================================================================
# CBP API CLIENT
# ============================================================================

class CBPAPIClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'BorderWaitTimesApp/1.0'
        })
    
    @retry_on_failure
    def fetch_wait_times(self) -> str:
        logger.info("Fetching CBP wait times...")
        response = self.session.get(CBP_API_URL, timeout=TIMEOUT)
        response.raise_for_status()
        logger.info(f"Status: {response.status_code}")
        return response.text

    def parse_wait_times(self, response: str) -> List[WaitTimeData]:
        parsed_data = []
        now = datetime.now(pytz.UTC)

        try:
            ports = json.loads(response)

            for port in ports:
                port_id = port.get('port_number', '')
                if port_id not in PORTS_OF_INTEREST:
                    continue

                port_name = PORTS_OF_INTEREST[port_id]

                for group_key, crossing_type in LANE_GROUPS.items():
                    lane_group = port.get(group_key, {})

                    for lane_key, lane_type in LANE_TYPES.items():
                        lane = lane_group.get(lane_key)
                        if lane is None:
                            continue

                        status = lane.get('operational_status', 'Unknown')
                        delay_str = lane.get('delay_minutes', '')

                        try:
                            wait_time = int(delay_str) if delay_str else 0
                        except ValueError:
                            wait_time = 0

                        try:
                            lanes_open = int(lane.get('lanes_open') or '')
                        except ValueError:
                            lanes_open = None

                        wait_data = WaitTimeData(
                            port_id=port_id,
                            port_name=port_name,
                            crossing_type=crossing_type,
                            lane_type=lane_type,
                            wait_time_minutes=wait_time,
                            status=status,
                            timestamp=now,
                            lanes_open=lanes_open
                        )
                        parsed_data.append(wait_data)
                        logger.debug(
                            f"Parsed: {port_name} - {crossing_type} - "
                            f"{lane_type}: {wait_time}min ({status})"
                        )

            logger.info(f"Total records parsed: {len(parsed_data)}")
            return parsed_data

        except json.JSONDecodeError as e:
            logger.error(f"JSON Parse error: {str(e)}")
            raise


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
                CREATE TABLE IF NOT EXISTS wait_times (
                    id SERIAL PRIMARY KEY,
                    port_id VARCHAR(50) NOT NULL,
                    port_name VARCHAR(255) NOT NULL,
                    crossing_type VARCHAR(100),
                    lane_type VARCHAR(100),
                    wait_time_minutes INTEGER,
                    status VARCHAR(50),
                    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE (port_id, crossing_type, lane_type, timestamp)
                );

                ALTER TABLE wait_times ADD COLUMN IF NOT EXISTS lanes_open INTEGER;
                
                CREATE INDEX IF NOT EXISTS idx_port_id_timestamp 
                    ON wait_times(port_id, timestamp DESC);
                
                CREATE INDEX IF NOT EXISTS idx_timestamp 
                    ON wait_times(timestamp DESC);
                
                CREATE TABLE IF NOT EXISTS ingestion_logs (
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
            logger.info("Database tables created/verified")
    
    @retry_on_failure
    def insert_wait_times(self, wait_times: List[WaitTimeData]) -> int:
        if not wait_times:
            logger.warning("No wait times to insert")
            return 0
        
        with self.conn.cursor() as cursor:
            data_tuples = [
                (
                    wt.port_id,
                    wt.port_name,
                    wt.crossing_type,
                    wt.lane_type,
                    wt.wait_time_minutes,
                    wt.status,
                    wt.timestamp,
                    wt.lanes_open
                )
                for wt in wait_times
            ]
            
            try:
                execute_batch(
                    cursor,
                    """
                    INSERT INTO wait_times 
                    (port_id, port_name, crossing_type, lane_type, 
                     wait_time_minutes, status, timestamp, lanes_open)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (port_id, crossing_type, lane_type, timestamp) 
                    DO NOTHING
                    """,
                    data_tuples,
                    page_size=1000
                )
                self.conn.commit()
                inserted = cursor.rowcount
                logger.info(f"Inserted {inserted} records into database")
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
                INSERT INTO ingestion_logs 
                (records_processed, records_inserted, status, error_message, 
                 execution_duration_seconds)
                VALUES (%s, %s, %s, %s, %s)
            """, (records_processed, records_inserted, status, error_msg, duration))
            self.conn.commit()
    
    def notify(self, channel: str):
        with self.conn.cursor() as cursor:
            cursor.execute(f"NOTIFY {channel};")
        self.conn.commit()

    def close(self):
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")


# ============================================================================
# PIPELINE PRINCIPAL
# ============================================================================

class CBPDataPipeline:
    def __init__(self):
        self.api_client = CBPAPIClient()
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
            logger.info("Starting CBP Data Pipeline Execution")
            logger.info("=" * 70)
            
            logger.info("Step 1: Fetching data from CBP API...")
            xml_response = self.api_client.fetch_wait_times()
            
            logger.info("Step 2: Parsing XML response...")
            wait_times = self.api_client.parse_wait_times(xml_response)
            stats['records_fetched'] = len(wait_times)
            
            logger.info("Step 3: Inserting to database...")
            inserted = self.db.insert_wait_times(wait_times)
            stats['records_inserted'] = inserted
            
            duration = time.time() - start_time
            stats['duration_seconds'] = round(duration, 2)
            self.db.log_ingestion(
                records_processed=stats['records_fetched'],
                records_inserted=stats['records_inserted'],
                status='success',
                duration=duration
            )

            self.db.notify(WEATHER_TRIGGER_CHANNEL)
            logger.info(f"Sent trigger notification on channel '{WEATHER_TRIGGER_CHANNEL}'")

            logger.info("=" * 70)
            logger.info("Pipeline Execution Completed Successfully")
            logger.info(f"Duration: {duration:.2f}s")
            logger.info(f"Records: {stats['records_fetched']} fetched, "
                       f"{stats['records_inserted']} inserted")
            logger.info("=" * 70)
            
        except Exception as e:
            logger.error(f"Pipeline failed with error: {str(e)}", exc_info=True)
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
    pipeline = CBPDataPipeline()
    pipeline.db.create_tables()
    stats = pipeline.run()
    return stats


if __name__ == "__main__":
    main()
