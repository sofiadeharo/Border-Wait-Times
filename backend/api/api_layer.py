import os
from datetime import date as date_cls
from datetime import datetime, timezone

import joblib
import pandas as pd
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel, Field

app = FastAPI()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "dbname": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "border_pass_2026"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "ml", "modelo_bota_waittimes_passengerlanes_sintetico_rf2.joblib"
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


class UserWaitReport(BaseModel):
    lane_type: str = Field(..., pattern="^(Standard|Ready Lane)$")
    crossing_time: datetime
    reported_wait_minutes: int = Field(..., ge=0, le=600)
    notes: str | None = None


MAX_REPORTS_PER_IP = 5


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


@app.post("/wait-times/user-report", status_code=201)
def submit_user_wait_report(report: UserWaitReport, request: Request):
    client_ip = _get_client_ip(request)
    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM user_reported_wait_times WHERE submitter_ip = %s",
                    (client_ip,),
                )
                if cursor.fetchone()[0] >= MAX_REPORTS_PER_IP:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Report limit reached ({MAX_REPORTS_PER_IP} per IP address)",
                    )
                cursor.execute(
                    """
                    INSERT INTO user_reported_wait_times
                        (port_name, crossing_type, lane_type, crossing_time, reported_wait_minutes, notes, submitter_ip)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        "Bridge of the Americas (BOTA)",
                        "Passenger Vehicle",
                        report.lane_type,
                        report.crossing_time,
                        report.reported_wait_minutes,
                        report.notes,
                        client_ip,
                    ),
                )
        return {"status": "success"}
    except HTTPException:
        raise
    except psycopg2.Error:
        raise HTTPException(status_code=503, detail="Database unavailable")


def _get_day_context(day: date_cls) -> dict:
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT us_is_federal_holiday, mx_is_official_holiday, mx_is_bridge_day,
                       us_is_summer_vacation, mx_is_summer_vacation
                FROM holidays
                WHERE date_value = %s
                """,
                (day,),
            )
            row = cursor.fetchone()
    context = {k: bool(v) for k, v in row.items()} if row else {
        "us_is_federal_holiday": False,
        "mx_is_official_holiday": False,
        "mx_is_bridge_day": False,
        "us_is_summer_vacation": False,
        "mx_is_summer_vacation": False,
    }
    context["is_holiday"] = context["us_is_federal_holiday"] or context["mx_is_official_holiday"]
    return context


def _semestre_activo(month: int) -> int:
    return int(month in (2, 3, 4, 5, 9, 10, 11))


def _predict_wait_time(feature_values: dict) -> dict:
    features = pd.DataFrame([feature_values])
    predicted_minutes = max(0.0, float(rf_model_bota.predict(features)[0]))
    return {
        "predicted_wait_minutes": round(predicted_minutes, 1),
        "features_used": features.iloc[0].to_dict(),
    }


@app.get("/predict/bota-wait-time")
def predict_bota_wait_time():
    try:
        now = datetime.now(timezone.utc)
        dia_semana = now.weekday()  # Monday=0 ... Sunday=6
        day_context = _get_day_context(now.date())
        result = _predict_wait_time({
            "month": now.month,
            "hour": now.hour,
            "es_fin_semana": int(dia_semana >= 5),
            "hora_pico_matutina": int(6 <= now.hour <= 9),
            "hora_pico_vespertina": int(16 <= now.hour <= 19),
            "dia_semana": dia_semana,
            "es_ready_lane": 0,
            "semestre_activo": _semestre_activo(now.month),
            "es_feriado": int(day_context["is_holiday"]),
            "baseline_daily_volume_vehiculos_BOTA": BASELINE_DAILY_VOLUME_BOTA,
        })
        result["predicted_at"] = now.isoformat()
        result["day_context"] = day_context
        return result
    except Exception:
        raise HTTPException(status_code=503, detail="Prediction unavailable")


@app.get("/predict") # Changed path to match frontend's /api/predict
def predict_wait_time( # Renamed function for clarity
    date: str = Query(..., description="YYYY-MM-DD"),
    hour: int = Query(12, ge=0, le=23),
    es_ready_lane: int = Query(0, ge=0, le=1),
    baseline_daily_volume_vehiculos_bota: float = Query(BASELINE_DAILY_VOLUME_BOTA, gt=0),
):
    try:
        scenario_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    try:
        dia_semana = scenario_date.weekday()  # Monday=0 ... Sunday=6
        day_context = _get_day_context(scenario_date)
        result = _predict_wait_time({
            "month": scenario_date.month,
            "hour": hour,
            "es_fin_semana": int(dia_semana >= 5),
            "hora_pico_matutina": int(6 <= hour <= 9),
            "hora_pico_vespertina": int(16 <= hour <= 19),
            "dia_semana": dia_semana,
            "es_ready_lane": es_ready_lane,
            "semestre_activo": _semestre_activo(scenario_date.month),
            "es_feriado": int(day_context["is_holiday"]),
            "baseline_daily_volume_vehiculos_BOTA": baseline_daily_volume_vehiculos_bota,
        })
        result["day_context"] = day_context
        return result
    except HTTPException:
        raise
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

        
