"""
Raw source extractors for the warehouse bronze layer. Each returns a list of
dict rows. Dependency-light (requests only) so it runs as a container job.
"""
from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime, timezone

import requests

HISTORY_START = os.getenv("BWT_HISTORY_START", "2015-01-01")

EL_PASO_PORTS = {           # BTS port_name -> internal port_id
    "El Paso": "240201",
    "Ysleta": "240203",
    "Tornillo": "240204",
}
BTS_RESOURCE = "keg4-3bc2"
CBP_BWT_URL = "https://bwt.cbp.gov/api/waittimes"
WEATHER_POINTS = {"el_paso": (31.76, -106.49), "juarez": (31.74, -106.49)}
HOLIDAYS_CSV = os.getenv(
    "BWT_HOLIDAYS_CSV",
    os.path.join(os.path.dirname(__file__), "..", "holiday_pipeline", "holidays.csv"),
)


def fetch_bts_crossings() -> list[dict]:
    ports = ",".join(f"'{p}'" for p in EL_PASO_PORTS)
    params = {
        "$select": "date, port_name, measure, sum(value) as volume",
        "$where": f"port_name in ({ports}) and "
        "measure in ('Trucks','Personal Vehicles','Pedestrians','Bus Passengers')",
        "$group": "date, port_name, measure",
        "$limit": 500000,
    }
    r = requests.get(f"https://data.transportation.gov/resource/{BTS_RESOURCE}.json",
                     params=params, timeout=90)
    r.raise_for_status()
    rows = []
    for x in r.json():
        d = x["date"][:10]
        if d < HISTORY_START:
            continue
        rows.append({
            "date": d,
            "port_id": EL_PASO_PORTS[x["port_name"]],
            "port_name": x["port_name"],
            "measure": x["measure"],
            "volume": int(float(x["volume"])),
        })
    return rows


def fetch_weather() -> list[dict]:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = []
    for name, (lat, lon) in WEATHER_POINTS.items():
        r = requests.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={"latitude": lat, "longitude": lon,
                    "start_date": HISTORY_START, "end_date": today,
                    "daily": "temperature_2m_max,precipitation_sum,wind_speed_10m_max",
                    "timezone": "America/Denver"},
            timeout=90)
        r.raise_for_status()
        daily = r.json()["daily"]
        for i, day in enumerate(daily["time"]):
            rows.append({
                "date": day, "location": name,
                "temp_max_c": daily["temperature_2m_max"][i],
                "precip_mm": daily["precipitation_sum"][i],
                "wind_kph": daily["wind_speed_10m_max"][i],
            })
    return rows


def fetch_holidays() -> list[dict]:
    with open(HOLIDAYS_CSV, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cols = {c.strip(): c for c in reader.fieldnames}
        b = lambda row, key: str(row.get(cols.get(key, ""), "")).strip().upper() == "TRUE"  # noqa: E731
        rows = []
        for row in reader:
            fecha = row.get(cols.get("Fecha", ""), "").strip()
            if not fecha:
                continue
            rows.append({
                "date": fecha,
                "us_federal_holiday": b(row, "US - Es feriado federal"),
                "us_school_break": b(row, "US - Es receso escolar"),
                "us_summer_vacation": b(row, "US - Es vacaciones_verano"),
                "mx_official_holiday": b(row, "MX - Es feriado oficial"),
                "mx_bridge_day": b(row, "MX - Es puente"),
                "mx_summer_vacation": b(row, "MX - Es vacaciones_verano"),
            })
    return rows


def fetch_cbp_wait_snapshot() -> list[dict]:
    try:
        r = requests.get(CBP_BWT_URL, timeout=30,
                         headers={"User-Agent": "BorderplexWarehouse/1.0"})
        r.raise_for_status()
        ports = json.loads(r.text)
    except Exception:  # noqa: BLE001
        return []
    now = datetime.now(timezone.utc).replace(microsecond=0)
    wanted = {"240201", "240203", "240204"}
    groups = {"commercial_vehicle_lanes": "Commercial Vehicle",
              "passenger_vehicle_lanes": "Passenger Vehicle",
              "pedestrian_lanes": "Pedestrian"}
    lanes = {"standard_lanes": "Standard", "FAST_lanes": "FAST",
             "NEXUS_SENTRI_lanes": "NEXUS/SENTRI", "ready_lanes": "Ready Lane"}
    rows = []
    for port in ports:
        pid = port.get("port_number", "")
        if pid not in wanted:
            continue
        for gk, ctype in groups.items():
            for lk, ltype in lanes.items():
                lane = port.get(gk, {}).get(lk)
                if not lane:
                    continue
                delay = str(lane.get("delay_minutes", ""))
                rows.append({
                    "port_id": pid, "crossing_type": ctype, "lane_type": ltype,
                    "wait_minutes": int(delay) if delay.isdigit() else 0,
                    "status": lane.get("operational_status", "Unknown"),
                    "observed_at": now.isoformat(),
                })
    return rows
