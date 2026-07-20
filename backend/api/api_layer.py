import os
from datetime import datetime, timezone

import joblib
import pandas as pd
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException

app = FastAPI()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "dbname": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "border_pass_2026"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "ml", "modelo_bota_waittimes_passengerlanes.joblib"
)
rf_model_bota = joblib.load(MODEL_PATH)

# Sin fuente de volumen en vivo todavia; placeholder para esta prueba inicial.
BASELINE_DAILY_VOLUME_BOTA = 12500.0


@app.get("/")
def read_root():
    return {"status": "success", "message": "FastAPI is running!"}


@app.get("/wait-times")
def get_wait_times():
    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT DISTINCT ON (port_id, crossing_type, lane_type)
                        port_id, port_name, crossing_type, lane_type,
                        wait_time_minutes, status, timestamp
                    FROM wait_times
                    ORDER BY port_id, crossing_type, lane_type, timestamp DESC
                """)
                return cursor.fetchall()
    except psycopg2.Error:
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.get("/predict/bota-wait-time")
def predict_bota_wait_time():
    try:
        now = datetime.now(timezone.utc)
        dia_semana = now.weekday()  # Monday=0 ... Sunday=6
        features = pd.DataFrame([{
            "month": now.month,
            "hour": now.hour,
            "dia_semana": dia_semana,
            "es_fin_semana": int(dia_semana >= 5),
            "hora_pico_matutina": int(6 <= now.hour <= 9),
            "es_ready_lane": 0,
            "baseline_daily_volume_vehiculos_BOTA": BASELINE_DAILY_VOLUME_BOTA,
        }])
        predicted_minutes = float(rf_model_bota.predict(features)[0])
        return {
            "predicted_wait_minutes": round(predicted_minutes, 1),
            "predicted_at": now.isoformat(),
            "features_used": features.iloc[0].to_dict(),
        }
    except Exception:
        raise HTTPException(status_code=503, detail="Prediction unavailable")


@app.get("/day-type-effects")
def get_day_type_effects():
    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT n_obs, r_squared, day_type_effects, day_types_skipped, run_at
                    FROM day_type_model_runs
                    ORDER BY run_at DESC
                    LIMIT 1
                """)
                row = cursor.fetchone()
                return row if row else {}
    except psycopg2.Error:
        raise HTTPException(status_code=503, detail="Database unavailable")

