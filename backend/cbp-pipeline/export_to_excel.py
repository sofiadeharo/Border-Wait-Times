import psycopg2
import pandas as pd
from psycopg2.extras import RealDictCursor
from datetime import datetime
import openpyxl 
OUTPUT_DIR = "."

DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": "border_pass_2026",
    "database": "border_wait_times",
}

TABLES = ["wait_times", "ingestion_logs"]


def export_to_excel():
    conn = psycopg2.connect(**DB_CONFIG)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = f"{OUTPUT_DIR}/border_wait_times_{timestamp}.xlsx"

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            for table in TABLES:
                cursor.execute(f"SELECT * FROM {table} ORDER BY id DESC")
                rows = cursor.fetchall()
                df = pd.DataFrame(rows)

                for col in df.select_dtypes(include=["datetimetz"]).columns:
                    df[col] = df[col].dt.tz_localize(None)

                df.to_excel(writer, sheet_name=table, index=False)
                print(f"  {table}: {len(df)} rows exported")

    conn.close()
    print(f"\nExported to: {output_path}")


if __name__ == "__main__":
    export_to_excel()
