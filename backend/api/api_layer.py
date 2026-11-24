import csv
import os
import sys
import traceback
from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import joblib
import pandas as pd
import psycopg2
import psycopg2.extras
import requests
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel, Field

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# In Docker, Economic_Ratios/ sits next to this file (/app). Locally it lives in backend/.
sys.path.insert(0, os.path.abspath(os.path.join(CURRENT_DIR, "..")))

from Economic_Ratios.getting_ratios import (  # noqa: E402
    COMMERCIAL_OPTIMAL_WAIT_MINS,
    DEFAULT_BOTA_LANES_OPEN,
    AVG_RETAIL_SPEND,
    AVG_VEHICLE_OCCUPANCY,
    DISCRETIONARY_RATIO,
    ELASTICITY_RATE,
    FRICTION_THRESHOLD_MINS,
    HOURS_PER_DAY,
    OPTIMAL_WAIT_MINS,
    VALUE_OF_TIME_USD_PER_HOUR,
    baseline_daily_trucks,
    baseline_daily_volume,
    calculate_commercial_delay_cost,
    calculate_delay_cost,
    estimated_flow,
)

app = FastAPI()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "dbname": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "border_pass_2026"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

MODEL_FILENAME = "modelo_bota_waittimes_passengerlanes_sintetico_rf2.joblib"
_MODEL_CANDIDATES = [
    os.path.join(CURRENT_DIR, MODEL_FILENAME),               # Docker: /app/<model>
    os.path.join(CURRENT_DIR, "..", "ml", MODEL_FILENAME),   # local: backend/ml/<model>
]
MODEL_PATH = next((os.path.abspath(p) for p in _MODEL_CANDIDATES if os.path.exists(p)), None)
if MODEL_PATH is None:
    raise FileNotFoundError(f"Model not found in: {_MODEL_CANDIDATES}")
print(f"--- LOADING MODEL FROM: {MODEL_PATH} ---")
# NOTE: the model was trained with xgboost 3.x. Loading it with xgboost 2.x silently
# drops its base_score (~55 min) and every prediction comes out ~55 min too low.
model = joblib.load(MODEL_PATH)

BOTA_PORT_NAME = "Bridge of the Americas (BOTA)"
BASELINE_DAILY_VOLUME_BOTA = 12500.0  # model feature default (training data used 9.5k-12k)
LOCAL_TZ = ZoneInfo("America/Denver")
EP_LAT, EP_LON = 31.76, -106.49
NON_OPERATIONAL_STATUSES = {"Lanes Closed", "N/A"}
MAX_REPORTS_PER_IP = 5


# ---------- holiday calendar ----------
# The model was trained with es_feriado = 1 on US federal holidays, Mexican official holidays
# AND every day of El Paso ISD summer vacation (all of July plus Aug 1-3, 2026 are flagged in
# the training data; Mexican summer vacation is not). Predictions must use the same definition.
HOLIDAY_FIELDS = {
    # holidays-table column -> holidays.csv column
    "us_is_federal_holiday": "US - Es feriado federal",
    "us_federal_holiday_name": "US - Nombre feriado federal",
    "us_is_school_break": "US - Es receso escolar",
    "us_school_break_name": "US - Nombre receso escolar",
    "us_is_summer_vacation": "US - Es vacaciones_verano",
    "mx_is_official_holiday": "MX - Es feriado oficial",
    "mx_official_holiday_name": "MX - Nombre feriado oficial",
    "mx_is_bridge_day": "MX - Es puente",
    "mx_bridge_day_name": "MX - Nombre puente",
    "mx_is_summer_vacation": "MX - Es vacaciones_verano",
}
HOLIDAYS_CSV_CANDIDATES = [
    os.path.join(CURRENT_DIR, "holidays.csv"),                                # Docker: /app/holidays.csv
    os.path.join(CURRENT_DIR, "..", "holiday_pipeline", "holidays.csv"),      # repo / Render
]
CALENDAR_CACHE_SECONDS = 3600
_calendar_cache: dict = {"loaded_at": 0.0, "days": {}, "source": None}


def _model_holiday(ctx: dict) -> bool:
    """es_feriado exactly as the model was trained."""
    return bool(ctx["us_is_federal_holiday"] or ctx["mx_is_official_holiday"] or ctx["us_is_summer_vacation"])


def _normalize_day(raw: dict) -> dict:
    ctx = {}
    for key in HOLIDAY_FIELDS:
        value = raw.get(key)
        if key.endswith("_name"):
            ctx[key] = (value or "").strip() or None
        elif isinstance(value, str):
            ctx[key] = value.strip().upper() == "TRUE"
        else:
            ctx[key] = bool(value)
    ctx["is_holiday"] = ctx["us_is_federal_holiday"] or ctx["mx_is_official_holiday"]
    ctx["es_feriado"] = _model_holiday(ctx)
    return ctx


def _load_calendar_from_db() -> dict:
    with psycopg2.connect(**DB_CONFIG, connect_timeout=3) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(f"SELECT date_value, {', '.join(HOLIDAY_FIELDS)} FROM holidays")
            return {row["date_value"]: _normalize_day(row) for row in cursor.fetchall()}


def _load_calendar_from_csv() -> dict:
    path = next((p for p in HOLIDAYS_CSV_CANDIDATES if os.path.exists(p)), None)
    if path is None:
        return {}
    days = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if not (row.get("Dia (dia del anio)") or "").strip().isdigit():
                continue  # source / note rows at the bottom of the file
            raw = {key: row.get(csv_col, "") for key, csv_col in HOLIDAY_FIELDS.items()}
            days[date_cls.fromisoformat(row["Fecha"].strip())] = _normalize_day(raw)
    return days


def _holiday_calendar() -> dict:
    """{date: day context} from the holidays table, falling back to holidays.csv. Cached 1h."""
    now = datetime.now().timestamp()
    if _calendar_cache["days"] and now - _calendar_cache["loaded_at"] < CALENDAR_CACHE_SECONDS:
        return _calendar_cache["days"]
    days, source = {}, None
    try:
        days, source = _load_calendar_from_db(), "database"
    except Exception as e:
        print(f"Holiday table unavailable ({e}); trying holidays.csv")
    if not days:
        try:
            days, source = _load_calendar_from_csv(), "holidays.csv"
        except Exception as e:
            print(f"holidays.csv unavailable: {e}")
    if days:
        _calendar_cache.update(loaded_at=now, days=days, source=source)
    return days


def _get_day_context(day: date_cls) -> dict:
    ctx = _holiday_calendar().get(day)
    if ctx is None:
        # Date not in the calendar: no holiday information -> treated as a normal day.
        ctx = _normalize_day({})
        ctx["calendar_covers_date"] = False
        return ctx
    return {**ctx, "calendar_covers_date": True}


def _semestre_activo(month: int) -> int:
    return int(month in (2, 3, 4, 5, 9, 10, 11))


_weather_cache: dict = {}


def get_weather(day: date_cls, hour: int):
    """Return (temp_f, precip_in) for El Paso, or None if unavailable."""
    key = (day, hour)
    if key in _weather_cache:
        return _weather_cache[key]
    today = date_cls.today()
    if day > today + timedelta(days=15):
        return None
    url = ("https://archive-api.open-meteo.com/v1/archive"
           if day < today - timedelta(days=5)
           else "https://api.open-meteo.com/v1/forecast")
    try:
        r = requests.get(url, params={
            "latitude": EP_LAT, "longitude": EP_LON,
            "hourly": "temperature_2m,precipitation",
            "temperature_unit": "fahrenheit",
            "precipitation_unit": "inch",
            "timezone": "America/Denver",
            "start_date": day.isoformat(), "end_date": day.isoformat(),
        }, timeout=5)
        r.raise_for_status()
        h = r.json()["hourly"]
        i = h["time"].index(f"{day.isoformat()}T{hour:02d}:00")
        result = (h["temperature_2m"][i], h["precipitation"][i] or 0.0)
        _weather_cache[key] = result
        return result
    except Exception as e:
        print(f"Weather lookup failed: {e}")
        return None


def _weather_features(temp_f: float, precip_in: float) -> dict:
    return {
        "hourly_temp_f": temp_f,
        "precip_in": precip_in,
        "is_over_80": int(temp_f > 80),
        "is_under_80": int(temp_f <= 80),
        "is_raining": int(precip_in > 0),
    }


def _build_features(day: date_cls, hour: int, es_ready_lane: int, daily_volume: float,
                    temp_f: Optional[float] = None, precip_in: Optional[float] = None) -> tuple:
    dia_semana = day.weekday()
    day_context = _get_day_context(day)
    if temp_f is None or precip_in is None:
        w = get_weather(day, hour)
        default_t, default_p = w if w else (75.0, 0.0)
        day_context["weather_source"] = (
            "Open-Meteo (observed or forecast)" if w else "default 75°F, no rain (no forecast for this date)")
        temp_f = default_t if temp_f is None else temp_f
        precip_in = default_p if precip_in is None else precip_in
    else:
        day_context["weather_source"] = "entered manually"
    features = {
        "month": day.month,
        "hour": hour,
        "es_fin_semana": int(dia_semana >= 5),
        "hora_pico_matutina": int(6 <= hour <= 9),
        "hora_pico_vespertina": int(16 <= hour <= 19),
        "dia_semana": dia_semana,
        "es_ready_lane": es_ready_lane,
        "semestre_activo": _semestre_activo(day.month),
        "es_feriado": int(day_context["es_feriado"]),
        "baseline_daily_volume_vehiculos_BOTA": daily_volume,
        **_weather_features(temp_f, precip_in),
    }
    return features, day_context


def _predict_wait_time(feature_values: dict) -> dict:
    features = pd.DataFrame([feature_values])[list(model.feature_names_in_)]
    predicted_minutes = max(0.0, float(model.predict(features)[0]))
    return {
        "predicted_wait_minutes": round(predicted_minutes, 1),
        "features_used": {k: (v.item() if hasattr(v, "item") else v)
                          for k, v in features.iloc[0].to_dict().items()},
    }


def _fetch_latest_wait_times(port_id: Optional[str] = None) -> list:
    """Latest CBP row per (port, crossing_type, lane_type)."""
    sql = """
        SELECT DISTINCT ON (port_id, crossing_type, lane_type)
            port_id, port_name, crossing_type, lane_type,
            wait_time_minutes, status, timestamp, lanes_open
        FROM wait_times
        {where}
        ORDER BY port_id, crossing_type, lane_type, timestamp DESC
    """
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            if port_id is None:
                cursor.execute(sql.format(where=""))
            else:
                cursor.execute(sql.format(where="WHERE port_id = %s"), (str(port_id),))
            return [dict(r) for r in cursor.fetchall()]


# crossing_type -> (daily volume lookup, cost function)
IMPACT_MODELS = {
    "Passenger Vehicle": (baseline_daily_volume, calculate_delay_cost),
    "Commercial Vehicle": (baseline_daily_trucks, calculate_commercial_delay_cost),
}


def _is_open_lane(row: dict) -> bool:
    return row["status"] not in NON_OPERATIONAL_STATUSES and row["wait_time_minutes"] is not None


def _attach_economic_impact(rows: list) -> list:
    """Add `economic_impact` (USD per hour) to every open passenger or commercial lane.

    Passenger lanes -> retail / time loss; commercial lanes -> productivity / freight loss.
    Each port's daily volume is split evenly across its open lanes of that crossing type,
    so lane losses add up to the port total. Other rows get `economic_impact = None`.
    """
    def has_model(r):
        return r["crossing_type"] in IMPACT_MODELS and _is_open_lane(r)

    open_lanes: dict = {}
    for r in rows:
        if has_model(r):
            key = (r["port_name"], r["crossing_type"])
            open_lanes[key] = open_lanes.get(key, 0) + 1

    for r in rows:
        r["economic_impact"] = None
        if not has_model(r):
            continue
        volume_fn, cost_fn = IMPACT_MODELS[r["crossing_type"]]
        daily_volume = volume_fn(r["port_name"])
        if daily_volume <= 0:
            continue
        share = 1.0 / open_lanes[(r["port_name"], r["crossing_type"])]
        if r["crossing_type"] == "Passenger Vehicle":
            # Prefer the flow inferred from CBP's open lanes (lanes_open x mu).
            r["economic_impact"] = cost_fn(r["wait_time_minutes"], daily_volume, lane_share=share,
                                           vehicles_per_hour=estimated_flow(r["lane_type"], r.get("lanes_open")))
        else:
            r["economic_impact"] = cost_fn(r["wait_time_minutes"], daily_volume, lane_share=share)
    return rows


def _summarize(lanes: list) -> dict:
    return {
        "lanes": lanes,
        "lanes_in_delay": sum(1 for r in lanes if r["economic_impact"]["is_delay"]),
        "total_loss_usd_per_hour": round(sum(r["economic_impact"]["total_loss_usd"] for r in lanes), 2),
    }


# ---------- root / health ----------
@app.get("/")
def read_root():
    return {"status": "success", "message": "FastAPI is running!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# ---------- current CBP wait times (dashboard) ----------
@app.get("/wait-times")
def get_wait_times():
    try:
        return _attach_economic_impact(_fetch_latest_wait_times())
    except psycopg2.Error:
        traceback.print_exc()
        raise HTTPException(status_code=503, detail="Database unavailable")


class UserWaitReport(BaseModel):
    # Lane types the report form offers (CBP naming). Pedestrian reports are stored under
    # the Pedestrian crossing type; the rest are passenger-vehicle lanes.
    lane_type: str = Field(..., pattern="^(Standard|Ready Lane|NEXUS/SENTRI|Pedestrian)$")
    crossing_time: datetime
    reported_wait_minutes: int = Field(..., ge=0, le=600)
    notes: Optional[str] = None


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
                    # Stored like CBP rows: pedestrians = crossing "Pedestrian", lane "Standard".
                    (BOTA_PORT_NAME,
                     "Pedestrian" if report.lane_type == "Pedestrian" else "Passenger Vehicle",
                     "Standard" if report.lane_type == "Pedestrian" else report.lane_type,
                     report.crossing_time,
                     report.reported_wait_minutes, report.notes, client_ip),
                )
        return {"status": "success"}
    except HTTPException:
        raise
    except psycopg2.Error:
        raise HTTPException(status_code=503, detail="Database unavailable")


# ---------- playground: predicted wait + its economic cost ----------
@app.get("/predict")
def predict_wait_time(
    date: str = Query(..., description="YYYY-MM-DD"),
    hour: int = Query(12, ge=0, le=23),
    es_ready_lane: int = Query(0, ge=0, le=1),
    baseline_daily_volume_vehiculos_bota: float = Query(BASELINE_DAILY_VOLUME_BOTA, gt=0),
    temp_f: Optional[float] = Query(None, description="Override temperature (°F)"),
    precip_in: Optional[float] = Query(None, ge=0, description="Override precipitation (in)"),
):
    try:
        scenario_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    try:
        features, day_context = _build_features(
            scenario_date, hour, es_ready_lane, baseline_daily_volume_vehiculos_bota, temp_f, precip_in)
        result = _predict_wait_time(features)
        result["day_context"] = day_context
        # Scenario: every BOTA passenger vehicle in that hour faces the predicted wait.
        result["economic_impact"] = calculate_delay_cost(
            result["predicted_wait_minutes"], baseline_daily_volume_vehiculos_bota)
        # Everything the Playground needs to show how the numbers were produced.
        result["assumptions"] = {
            "model": "XGBoost regressor trained on synthetic BOTA passenger-lane wait times",
            "holiday_definition": "US federal holiday, Mexican official holiday, or El Paso ISD summer vacation",
            "daily_volume": baseline_daily_volume_vehiculos_bota,
            "hours_per_day": HOURS_PER_DAY,
            "delay_threshold_minutes": OPTIMAL_WAIT_MINS,
            "value_of_time_usd_per_hour": VALUE_OF_TIME_USD_PER_HOUR,
            "avg_vehicle_occupancy": AVG_VEHICLE_OCCUPANCY,
            "friction_threshold_minutes": FRICTION_THRESHOLD_MINS,
            "abandonment_rate_per_10_min": ELASTICITY_RATE,
            "discretionary_ratio": DISCRETIONARY_RATIO,
            "avg_retail_spend_usd": AVG_RETAIL_SPEND,
        }
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=503, detail=f"Prediction unavailable: {type(e).__name__}: {e}")


# ---------- dashboard: actual (CBP) vs predicted for a port, right now ----------
@app.get("/api/dashboard/current-impact/{port_id}")
def get_current_economic_impact(port_id: str):
    try:
        rows = _attach_economic_impact(_fetch_latest_wait_times(port_id))
    except psycopg2.Error:
        traceback.print_exc()
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not rows:
        raise HTTPException(status_code=404, detail="No wait time data found for this port")
    lanes = [r for r in rows if r["economic_impact"] is not None and r["crossing_type"] == "Passenger Vehicle"]
    commercial_lanes = [r for r in rows if r["economic_impact"] is not None and r["crossing_type"] == "Commercial Vehicle"]

    port_name = rows[0]["port_name"]
    response = {
        "port_id": port_id,
        "port_name": port_name,
        "as_of": max(r["timestamp"] for r in rows),
        "delay_threshold_minutes": OPTIMAL_WAIT_MINS,
        "commercial_delay_threshold_minutes": COMMERCIAL_OPTIMAL_WAIT_MINS,
        "baseline_daily_volume": baseline_daily_volume(port_name),
        "baseline_daily_trucks": baseline_daily_trucks(port_name),
        "actual": _summarize(lanes),                    # passenger lanes (retail / time loss)
        "commercial": _summarize(commercial_lanes),     # commercial lanes (productivity / freight loss)
        "predicted": None,                              # model covers passenger lanes only
    }

    # The model is trained for BOTA passenger Standard / Ready Lane only.
    model_lanes = [r for r in lanes if r["lane_type"] in ("Standard", "Ready Lane")]
    if port_name == BOTA_PORT_NAME and model_lanes:
        try:
            now = datetime.now(LOCAL_TZ)
            share = 1.0 / len(lanes)  # same split as the actual lanes, so totals are comparable
            predicted_lanes = []
            for r in model_lanes:
                features, _ = _build_features(
                    now.date(), now.hour, int(r["lane_type"] == "Ready Lane"), BASELINE_DAILY_VOLUME_BOTA)
                minutes = _predict_wait_time(features)["predicted_wait_minutes"]
                predicted_lanes.append({
                    "lane_type": r["lane_type"],
                    "predicted_wait_minutes": minutes,
                    "economic_impact": calculate_delay_cost(
                        minutes, baseline_daily_volume(port_name), lane_share=share),
                })
            response["predicted"] = {
                "for_hour": now.replace(minute=0, second=0, microsecond=0).isoformat(),
                "lanes": predicted_lanes,
                "total_loss_usd_per_hour": round(
                    sum(p["economic_impact"]["total_loss_usd"] for p in predicted_lanes), 2),
            }
        except Exception:
            traceback.print_exc()  # actual numbers are still useful without the prediction

    return response


# ---------- annual compound loss (BOTA passenger vehicles) ----------
_annual_cache: dict = {}
ANNUAL_CACHE_SECONDS = 6 * 3600
MODEL_LANE_TYPES = ("Standard", "Ready Lane")


def _fetch_weather_range(start: date_cls, end: date_cls) -> dict:
    """{(date, hour): (temp_f, precip_in)} from the Open-Meteo archive; {} on failure."""
    if end < start:
        return {}
    try:
        r = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
            "latitude": EP_LAT, "longitude": EP_LON,
            "hourly": "temperature_2m,precipitation",
            "temperature_unit": "fahrenheit", "precipitation_unit": "inch",
            "timezone": "America/Denver",
            "start_date": start.isoformat(), "end_date": end.isoformat(),
        }, timeout=30)
        r.raise_for_status()
        h = r.json()["hourly"]
        out = {}
        for t, temp, precip in zip(h["time"], h["temperature_2m"], h["precipitation"]):
            if temp is not None:
                out[(date_cls.fromisoformat(t[:10]), int(t[11:13]))] = (temp, precip or 0.0)
        return out
    except Exception as e:
        print(f"Weather range lookup failed ({start}..{end}): {e}")
        return {}


def _bota_lanes_open_profile() -> tuple:
    """Average CBP-reported open lanes by (lane_type, local hour) at BOTA.

    Hours without observations fall back to the lane's all-hours average, then to
    DEFAULT_BOTA_LANES_OPEN. Returns (profile, observations_used).
    """
    observed, lane_avg, n_obs = {}, {}, 0
    try:
        with psycopg2.connect(**DB_CONFIG, connect_timeout=3) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT lane_type,
                           EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/Denver')::int AS hr,
                           AVG(lanes_open)::float, COUNT(*)
                    FROM wait_times
                    WHERE port_name = %s AND crossing_type = 'Passenger Vehicle'
                      AND lanes_open IS NOT NULL AND status NOT IN ('Lanes Closed', 'N/A')
                    GROUP BY 1, 2
                """, (BOTA_PORT_NAME,))
                for lane, hr, avg, n in cursor.fetchall():
                    observed[(lane, hr)] = avg
                    n_obs += n
                    lane_avg.setdefault(lane, []).append(avg)
    except Exception as e:
        print(f"lanes_open profile lookup failed, using defaults: {e}")

    profile = {}
    for lane in MODEL_LANE_TYPES:
        fallback = (sum(lane_avg[lane]) / len(lane_avg[lane])) if lane in lane_avg else DEFAULT_BOTA_LANES_OPEN[lane]
        for hr in range(24):
            profile[(lane, hr)] = observed.get((lane, hr), fallback)
    return profile, n_obs


def _holiday_flags(year: int) -> dict:
    """{date: es_feriado} for every calendar day of `year` (model definition)."""
    return {d: ctx["es_feriado"] for d, ctx in _holiday_calendar().items() if d.year == year}


@app.get("/economic-impact/annual")
def get_annual_economic_impact(year: int = Query(None, ge=2020, le=2100)):
    """Compound (cumulative) cost of passenger-vehicle delays at BOTA over a year.

    For every hour of the year and each model lane type (Standard, Ready Lane):
      wait_t  = model prediction (calendar, holidays, weather)
      flow_t  = lanes_open_t x mu   (lanes_open from CBP observations by hour of day)
      loss_t  = calculate_delay_cost(wait_t, vehicles_per_hour=flow_t)
    """
    year = year or datetime.now(LOCAL_TZ).year
    lanes_profile, n_obs = _bota_lanes_open_profile()
    cache_key = (year, tuple(sorted(lanes_profile.items())))
    cached = _annual_cache.get(cache_key)
    if cached and (datetime.now().timestamp() - cached[0]) < ANNUAL_CACHE_SECONDS:
        return cached[1]

    try:
        start, end = date_cls(year, 1, 1), date_cls(year, 12, 31)
        archive_end = min(end, date_cls.today() - timedelta(days=6))
        weather = _fetch_weather_range(start, archive_end)
        # Days without observed weather (future / archive lag) use the same day of the previous
        # year. The archive rejects ranges that reach past its latest day, so clamp the request.
        latest_archived = date_cls.today() - timedelta(days=6)
        prev = _fetch_weather_range(date_cls(year - 1, 1, 1), min(date_cls(year - 1, 12, 31), latest_archived))
        # Last resort: average of everything fetched for the same month and hour.
        climatology: dict = {}
        for (day_, hr_), (t_, p_) in {**prev, **weather}.items():
            climatology.setdefault((day_.month, hr_), []).append((t_, p_))
        climatology = {k: (sum(t for t, _ in v) / len(v), sum(p for _, p in v) / len(v))
                       for k, v in climatology.items()}
        holidays = _holiday_flags(year)

        hours = pd.date_range(f"{year}-01-01 00:00", f"{year}-12-31 23:00", freq="h")
        rows = []
        for ts in hours:
            d, hr = ts.date(), ts.hour
            try:
                prev_key = (d.replace(year=year - 1), hr)
            except ValueError:  # Feb 29
                prev_key = (date_cls(year - 1, 2, 28), hr)
            temp_f, precip_in = (weather.get((d, hr)) or prev.get(prev_key)
                                 or climatology.get((d.month, hr)) or (75.0, 0.0))
            dia_semana = d.weekday()
            base = {
                "month": d.month, "hour": hr,
                "es_fin_semana": int(dia_semana >= 5),
                "hora_pico_matutina": int(6 <= hr <= 9),
                "hora_pico_vespertina": int(16 <= hr <= 19),
                "dia_semana": dia_semana,
                "semestre_activo": _semestre_activo(d.month),
                "es_feriado": int(holidays.get(d, False)),
                "baseline_daily_volume_vehiculos_BOTA": BASELINE_DAILY_VOLUME_BOTA,
                **_weather_features(temp_f, precip_in),
            }
            for lane in MODEL_LANE_TYPES:
                rows.append({**base, "es_ready_lane": int(lane == "Ready Lane"), "_date": d, "_lane": lane})

        df = pd.DataFrame(rows)
        df["wait"] = model.predict(df[list(model.feature_names_in_)]).clip(min=0)

        impacts = [
            calculate_delay_cost(w, vehicles_per_hour=estimated_flow(lane, lanes_profile[(lane, hr)]))
            for w, lane, hr in zip(df["wait"], df["_lane"], df["hour"])
        ]
        df["time_cost"] = [i["time_cost_usd"] for i in impacts]
        df["person_hours"] = [i["person_hours_lost"] for i in impacts]
        df["retail"] = [i["retail_loss_usd"] for i in impacts]
        df["delay"] = [i["is_delay"] for i in impacts]

        # An hour is "in delay" if any lane type is over the threshold.
        hourly = df.groupby(["_date", "hour"]).agg(time_cost=("time_cost", "sum"), retail=("retail", "sum"),
                                                   person_hours=("person_hours", "sum"),
                                                   delay=("delay", "any"), month=("month", "first"))
        daily = hourly.groupby(level=0).agg(time_cost=("time_cost", "sum"), retail=("retail", "sum"),
                                            person_hours=("person_hours", "sum"), delay_hours=("delay", "sum"))
        daily["total"] = daily["time_cost"] + daily["retail"]
        daily["cumulative"] = daily["total"].cumsum()
        monthly = hourly.groupby("month").agg(time_cost=("time_cost", "sum"), retail=("retail", "sum"),
                                              person_hours=("person_hours", "sum"), delay_hours=("delay", "sum"))
        monthly["total"] = monthly["time_cost"] + monthly["retail"]

        result = {
            "year": year,
            "port_name": BOTA_PORT_NAME,
            "crossing_type": "Passenger Vehicle",
            "summary": {
                "total_loss_usd": round(float(daily["total"].sum()), 2),
                "time_cost_usd": round(float(daily["time_cost"].sum()), 2),
                "retail_loss_usd": round(float(daily["retail"].sum()), 2),
                "person_hours_lost": round(float(daily["person_hours"].sum()), 1),
                "hours_in_delay": int(daily["delay_hours"].sum()),
                "avg_predicted_wait_minutes": round(float(df["wait"].mean()), 1),
                "worst_month": int(monthly["total"].idxmax()),
            },
            "daily": [
                {"date": d.isoformat(), "time_cost_usd": round(r.time_cost, 2), "retail_loss_usd": round(r.retail, 2),
                 "person_hours_lost": round(r.person_hours, 1),
                 "total_loss_usd": round(r.total, 2), "cumulative_loss_usd": round(r.cumulative, 2),
                 "delay_hours": int(r.delay_hours)}
                for d, r in daily.iterrows()
            ],
            "monthly": [
                {"month": int(m), "time_cost_usd": round(r.time_cost, 2), "retail_loss_usd": round(r.retail, 2),
                 "person_hours_lost": round(r.person_hours, 1),
                 "total_loss_usd": round(r.total, 2), "delay_hours": int(r.delay_hours)}
                for m, r in monthly.iterrows()
            ],
            "assumptions": {
                "delay_threshold_minutes": OPTIMAL_WAIT_MINS,
                "friction_threshold_minutes": FRICTION_THRESHOLD_MINS,
                "value_of_time_usd_per_hour": VALUE_OF_TIME_USD_PER_HOUR,
                "avg_vehicle_occupancy": AVG_VEHICLE_OCCUPANCY,
                "discretionary_ratio": DISCRETIONARY_RATIO,
                "abandonment_rate_per_10_min": ELASTICITY_RATE,
                "avg_retail_spend_usd": AVG_RETAIL_SPEND,
                "throughput_veh_per_lane_hour": {l: estimated_flow(l, 1) for l in MODEL_LANE_TYPES},
                "lanes_open_by_hour": {l: [round(lanes_profile[(l, h)], 2) for h in range(24)]
                                       for l in MODEL_LANE_TYPES},
                "lanes_open_source": "cbp_observed" if n_obs else "default",
                "lanes_open_observations": n_obs,
                "weather_observed_through": archive_end.isoformat() if weather else None,
                "holiday_calendar_source": _calendar_cache["source"],
                "holiday_days": sum(holidays.values()),
                "holiday_definition": "US federal holiday, Mexican official holiday, or El Paso ISD summer vacation",
            },
        }
        _annual_cache[cache_key] = (datetime.now().timestamp(), result)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=503, detail=f"Annual impact unavailable: {type(e).__name__}: {e}")


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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
