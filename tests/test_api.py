"""Smoke tests for the FastAPI serving layer."""
import importlib

import pytest
from fastapi.testclient import TestClient

api_layer = importlib.import_module("backend.api.api_layer")
client = TestClient(api_layer.app)


def test_root_ok():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "success"


def test_openapi_served():
    assert client.get("/openapi.json").status_code == 200


@pytest.mark.parametrize("month,expected", [
    (1, 0), (2, 1), (3, 1), (6, 0), (7, 0), (9, 1), (12, 0),
])
def test_semestre_activo(month, expected):
    assert api_layer._semestre_activo(month) == expected


def test_predict_rejects_bad_date():
    r = client.get("/predict", params={"date": "not-a-date"})
    assert r.status_code == 422


def test_predict_requires_date():
    assert client.get("/predict").status_code == 422


def test_predict_valid_date_without_db_is_unavailable():
    # no database reachable in CI -> the endpoint degrades to 503, never 500
    r = client.get("/predict", params={"date": "2024-01-01", "hour": 12})
    assert r.status_code in (200, 503)


def test_wait_times_without_db_is_unavailable():
    assert client.get("/wait-times").status_code in (200, 503)


def test_user_report_validation():
    r = client.post("/wait-times/user-report", json={
        "lane_type": "Standard", "crossing_time": "2024-01-01T08:00:00",
        "reported_wait_minutes": 9999,   # > 600 -> 422
    })
    assert r.status_code == 422
