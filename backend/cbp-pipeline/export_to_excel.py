import psycopg2
import pandas as pd
from psycopg2.extras import RealDictCursor
from datetime import datetime
import openpyxl 
import tempfile 
import logging 

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
OUTPUT_DIR = "./project_exports"

DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": "border_pass_2026",
    "database": "border_wait_times",
}

TABLES = ["wait_times", "ingestion_logs"]


def export_to_excel():
    try: 
        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor, connect_timeout=10)  # Set a timeout for the connection
    except Exception as e: 
        print(f"Error connecting to the database: {e}") 
        logging.error(f"Error connecting to the database: {e}")
        return 
    
            

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = f"{OUTPUT_DIR}/border_wait_times_.xlsx"
    tempfile_path=output_path + f".tmp"


try: 
    with pd.ExcelWriter(tempfile_path, engine="openpyxl") as writer: # using pandas Excel writer to write on the tempoary file 
        for table in TABLES: # Querying from the postrgres database and writing to the excel file 
            query = f"SELECT * FROM {table}"
            df = pd.read_sql_query(query, conn)
            df.to_excel(writer, sheet_name=table, index=False)
    # Once all sheets are written, rename the temporary file to the final output path
    os.rename(tempfile_path, output_path)
except Exception as e:
    if os.path.exists (tempfile_path):
        os.remove(tempfile_path)  # Clean up the temporary file in case of an error
        logging.error(f"Error during export to Excel: {e}. Temporary file removed.")
    raise 


