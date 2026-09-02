"""
Feature engineering + data cleaning for the commercial-lane wait model.

Pure, side-effect-free functions — unit-tested in tests/test_features.py.
"""
from __future__ import annotations

from datetime import date

import pandas as pd

# months that fall in an active US/MX school semester
_ACTIVE_SEMESTER_MONTHS = frozenset({2, 3, 4, 5, 9, 10, 11})


def clean_wait_minutes(raw) -> int:
    """CBP `delay_minutes` -> non-negative int. Handles '', None, 'Lanes Closed',
    stray whitespace, floats-as-strings and negatives."""
    if raw is None:
        return 0
    s = str(raw).strip()
    if not s:
        return 0
    try:
        value = int(float(s))
    except (ValueError, TypeError):
        return 0
    return max(0, value)


def normalize_channel(measure: str) -> str:
    """'Personal Vehicles' -> 'personal_vehicles'."""
    return "_".join(str(measure).strip().lower().split())


def to_bool(value) -> bool:
    """CSV 'TRUE'/'FALSE'/'true'/1/'' -> bool."""
    if isinstance(value, bool):
        return value
    return str(value).strip().upper() in {"TRUE", "1", "YES", "Y", "T"}


def parse_bts_row(row: dict) -> dict | None:
    """Validate + coerce one BTS crossing record; return None if unusable."""
    try:
        volume = int(float(row["volume"]))
    except (KeyError, ValueError, TypeError):
        return None
    if volume < 0 or not row.get("port_id") or not row.get("date"):
        return None
    return {
        "date": str(row["date"])[:10],
        "port_id": str(row["port_id"]),
        "channel": normalize_channel(row.get("measure", "")),
        "volume": volume,
    }


def is_active_semester(month: int) -> int:
    return int(month in _ACTIVE_SEMESTER_MONTHS)


def is_morning_peak(hour: int) -> int:
    return int(6 <= hour <= 9)


def is_evening_peak(hour: int) -> int:
    return int(16 <= hour <= 19)


def calendar_features(d: date, hour: int) -> dict:
    dow = d.weekday()  # Mon=0
    return {
        "month": d.month,
        "hour": hour,
        "day_of_week": dow,
        "is_weekend": int(dow >= 5),
        "is_morning_peak": is_morning_peak(hour),
        "is_evening_peak": is_evening_peak(hour),
        "active_semester": is_active_semester(d.month),
    }


FEATURE_COLUMNS = [
    "month", "hour", "day_of_week", "is_weekend",
    "is_morning_peak", "is_evening_peak", "active_semester",
    "precip_mm", "temp_max_c",
    "is_us_holiday", "is_mx_holiday",
]


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Assemble the model matrix from a joined wait/weather/holiday frame.

    Expects columns: date, hour, precip_mm, temp_max_c, is_us_holiday, is_mx_holiday.
    Returns exactly FEATURE_COLUMNS, numeric, no NaN.
    """
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"])
    out["month"] = out["date"].dt.month
    out["day_of_week"] = out["date"].dt.dayofweek
    out["is_weekend"] = (out["day_of_week"] >= 5).astype(int)
    out["is_morning_peak"] = out["hour"].between(6, 9).astype(int)
    out["is_evening_peak"] = out["hour"].between(16, 19).astype(int)
    out["active_semester"] = out["month"].isin(_ACTIVE_SEMESTER_MONTHS).astype(int)

    for col in ("precip_mm", "temp_max_c"):
        out[col] = pd.to_numeric(out.get(col), errors="coerce").fillna(0.0)
    for col in ("is_us_holiday", "is_mx_holiday"):
        out[col] = out.get(col, False).apply(to_bool).astype(int)

    return out[FEATURE_COLUMNS].astype(float)
