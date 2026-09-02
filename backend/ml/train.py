"""
Train the commercial-lane wait-time model (XGBoost) with MLflow tracking.

    pip install -r backend/ml/requirements.txt
    mlflow ui                       # http://localhost:5000  (separate terminal)
    python -m backend.ml.train      # logs a run + registers the model

Reads features from the warehouse gold schema when DB_* env vars point at a live
Postgres; otherwise generates a synthetic frame with the same columns so the
script (and CI) run without a database.
"""
from __future__ import annotations

import os

import mlflow
import mlflow.xgboost
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from .features import FEATURE_COLUMNS, build_feature_frame

EXPERIMENT = os.getenv("MLFLOW_EXPERIMENT", "border-wait-commercial")
TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")


def _load_from_warehouse() -> pd.DataFrame | None:
    if not os.getenv("DB_HOST"):
        return None
    try:
        import psycopg2
    except ImportError:
        return None
    dsn = dict(
        host=os.environ["DB_HOST"], dbname=os.getenv("DB_NAME", "border_wait_times"),
        user=os.getenv("DB_USER", "postgres"), password=os.getenv("DB_PASSWORD", ""),
        port=int(os.getenv("DB_PORT", "5432")),
    )
    sql = """
        SELECT f.date, f.hour, f.predicted_wait_min AS wait_min,
               w.precip_mm, w.temp_max_c,
               h.is_us_holiday, h.is_mx_holiday
        FROM gold.fact_wait_forecast f
        LEFT JOIN silver.weather_daily w ON w.date = f.date AND w.location = 'el_paso'
        LEFT JOIN silver.holidays h      ON h.date = f.date
    """
    with psycopg2.connect(**dsn) as conn:
        return pd.read_sql(sql, conn)


def _synthetic(n: int = 40_000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.to_datetime("2020-01-01") + pd.to_timedelta(rng.integers(0, 2000, n), "D")
    hour = rng.integers(0, 24, n)
    precip = rng.gamma(0.3, 2.0, n)
    us_hol = rng.random(n) < 0.03
    mx_hol = rng.random(n) < 0.04
    dow = dates.dayofweek.to_numpy()
    wait = (
        18
        + 10 * np.sin(np.clip(hour - 4, 0, 16) / 16 * np.pi)
        + 0.7 * precip
        - 6 * mx_hol - 4 * us_hol
        - 12 * (dow >= 5)
        + rng.normal(0, 4, n)
    ).clip(0)
    return pd.DataFrame({
        "date": dates, "hour": hour, "wait_min": wait,
        "precip_mm": precip, "temp_max_c": rng.normal(24, 9, n),
        "is_us_holiday": us_hol, "is_mx_holiday": mx_hol,
    })


def main() -> None:
    raw = _load_from_warehouse()
    source = "warehouse"
    if raw is None or raw.empty:
        raw, source = _synthetic(), "synthetic"

    X = build_feature_frame(raw)
    y = raw["wait_min"].astype(float).to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

    mlflow.set_tracking_uri(TRACKING_URI)
    mlflow.set_experiment(EXPERIMENT)
    mlflow.xgboost.autolog()  # hyperparameters, per-iteration metrics, feature importance, model

    with mlflow.start_run(run_name=f"xgb-{source}") as run:
        mlflow.set_tag("training_data", source)
        mlflow.log_param("feature_columns", ",".join(FEATURE_COLUMNS))

        model = xgb.XGBRegressor(
            n_estimators=500, max_depth=6, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9, random_state=42,
            early_stopping_rounds=25, eval_metric="mae",
        )
        model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)

        pred = model.predict(X_te)
        mlflow.log_metric("test_mae", float(mean_absolute_error(y_te, pred)))
        mlflow.log_metric("test_r2", float(r2_score(y_te, pred)))

        print(f"run {run.info.run_id}  MAE={mean_absolute_error(y_te, pred):.2f}  "
              f"R2={r2_score(y_te, pred):.3f}  ({source})")


if __name__ == "__main__":
    main()
