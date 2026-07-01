import os
import logging
import psycopg2
import pandas as pd
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

OUTPUT_DIR = "./project_exports"

DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": "border_pass_2026",
    "database": "border_wait_times",
}

TABLES = ["wait_times", "ingestion_logs"]


def export_to_excel() -> str:
    """Export database tables to Excel using a temp file to prevent corruption.

    Writes to a .tmp file first, then atomically replaces the target only when
    the full write succeeds. Returns the final output path.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    try:
        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor, connect_timeout=10)
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        raise

    output_path = os.path.join(OUTPUT_DIR, "border_wait_times.xlsx")
    temp_path = output_path + ".tmp"

    try:
        with pd.ExcelWriter(temp_path, engine="openpyxl") as writer:
            for table in TABLES:
                df = pd.read_sql_query(f"SELECT * FROM {table}", conn)
                df.to_excel(writer, sheet_name=table, index=False)
                logger.info(f"Written sheet '{table}' ({len(df)} rows)")

        os.replace(temp_path, output_path)
        logger.info(f"Export complete: {output_path}")
        return output_path

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
            logger.warning(f"Removed temp file after error: {temp_path}")
        logger.error(f"Export failed: {e}")
        raise

    finally:
        conn.close()
