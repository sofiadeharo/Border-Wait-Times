"""Unit tests for the data-cleaning / feature-engineering functions."""
from datetime import date

import pandas as pd
import pytest

from backend.ml import features as F


@pytest.mark.parametrize("raw,expected", [
    ("45", 45), ("45.0", 45), ("  12 ", 12), ("", 0), (None, 0),
    ("Lanes Closed", 0), ("N/A", 0), ("-5", 0), (30, 30), (7.9, 7),
])
def test_clean_wait_minutes(raw, expected):
    assert F.clean_wait_minutes(raw) == expected


def test_normalize_channel():
    assert F.normalize_channel("Personal Vehicles") == "personal_vehicles"
    assert F.normalize_channel("  TRUCKS ") == "trucks"


@pytest.mark.parametrize("value,expected", [
    ("TRUE", True), ("true", True), ("FALSE", False), ("", False),
    (True, True), (1, True), ("0", False), ("yes", True),
])
def test_to_bool(value, expected):
    assert F.to_bool(value) is expected


def test_parse_bts_row_valid():
    row = {"date": "2024-05-01T00:00:00", "port_id": "240201",
           "measure": "Trucks", "volume": "1234.0"}
    assert F.parse_bts_row(row) == {
        "date": "2024-05-01", "port_id": "240201", "channel": "trucks", "volume": 1234,
    }


@pytest.mark.parametrize("row", [
    {"date": "2024-05-01", "port_id": "240201", "measure": "Trucks", "volume": "-1"},
    {"date": "2024-05-01", "port_id": "", "measure": "Trucks", "volume": "10"},
    {"port_id": "240201", "measure": "Trucks", "volume": "10"},
    {"date": "2024-05-01", "port_id": "240201", "measure": "Trucks", "volume": "abc"},
])
def test_parse_bts_row_rejects_bad_input(row):
    assert F.parse_bts_row(row) is None


def test_calendar_features():
    f = F.calendar_features(date(2024, 3, 5), 8)   # Tuesday, 08:00, March
    assert f["day_of_week"] == 1
    assert f["is_weekend"] == 0
    assert f["is_morning_peak"] == 1
    assert f["is_evening_peak"] == 0
    assert f["active_semester"] == 1


def test_calendar_features_weekend_offpeak():
    f = F.calendar_features(date(2024, 7, 6), 3)   # Saturday, 03:00, July
    assert f["is_weekend"] == 1
    assert f["is_morning_peak"] == 0
    assert f["active_semester"] == 0


def test_build_feature_frame_shape_and_no_nan():
    df = pd.DataFrame({
        "date": ["2024-03-05", "2024-07-06"],
        "hour": [8, 3],
        "precip_mm": [1.2, None],
        "temp_max_c": [None, 30.0],
        "is_us_holiday": ["FALSE", "TRUE"],
        "is_mx_holiday": [False, True],
    })
    out = F.build_feature_frame(df)
    assert list(out.columns) == F.FEATURE_COLUMNS
    assert not out.isna().any().any()
    assert out.loc[0, "is_morning_peak"] == 1
    assert out.loc[1, "is_weekend"] == 1
    assert out.loc[1, "is_mx_holiday"] == 1
    assert out.loc[0, "precip_mm"] == 1.2
    assert out.loc[1, "temp_max_c"] == 30.0
