"""Economic cost of border-crossing delay.

Two components, both expressed for ONE HOUR of the observed/predicted wait:

1. Time cost   - every vehicle in the queue loses (wait - OPTIMAL_WAIT_MINS)
                 minutes; valued at VALUE_OF_TIME_USD_PER_HOUR per occupant.
                 This is what makes any wait above OPTIMAL_WAIT_MINS count as a delay.
2. Retail loss - once the wait passes FRICTION_THRESHOLD_MINS, a share of
                 discretionary crossers abandon the trip and their retail spend
                 is lost (original elasticity model).

A wait is classified as a delay when wait_minutes > OPTIMAL_WAIT_MINS.

Commercial lanes (trucks) use the same structure with freight components - see
calculate_commercial_delay_cost():

1. Productivity  - truck + driver operating cost of the excess delay.
2. Cargo in transit - carrying cost of the goods sitting at the border.
3. Late delivery - above COMMERCIAL_FRICTION_THRESHOLD_MINS a share of loads miss
                   their delivery window (JIT / maquiladora supply chains).
"""
import csv
import calendar
import os
from functools import lru_cache
from typing import Optional

import numpy as np

# --- delay definition -------------------------------------------------------
OPTIMAL_WAIT_MINS = 60         # waits above this are a delay
FRICTION_THRESHOLD_MINS = 60    # waits above this start causing trip abandonment

# --- retail-abandonment model (original parameters) -------------------------
ELASTICITY_RATE = 0.015         # share of discretionary trips lost per 10 min over threshold
AVG_RETAIL_SPEND = 75.00        # USD per forgone crosser
DISCRETIONARY_RATIO = 0.30      # share of crossers whose trip is discretionary

# --- time-value model (ASSUMPTIONS - tune to your sources) ------------------
VALUE_OF_TIME_USD_PER_HOUR = 17.00   # USD per person-hour, approx. US DOT personal-travel VOT
AVG_VEHICLE_OCCUPANCY = 1.5          # people per passenger vehicle
HOURS_PER_DAY = 24                   # daily volume spread evenly across hours

# --- flow from CBP open lanes: flow_t = lanes_open_t x mu ---------------------
# mu = vehicles processed per open lane per hour (border traffic-engineering averages:
# standard 35-50 veh/h/lane, SENTRI / Ready Lane 60-80 veh/h/lane -> midpoints used).
PASSENGER_LANE_THROUGHPUT_VEH_PER_HOUR = {
    "Standard": 42.5,
    "Ready Lane": 70.0,
    "NEXUS/SENTRI": 70.0,
}
# Fallback BOTA open lanes per lane type, used for an hour of day until the pipeline has
# collected CBP `lanes_open` observations for it (CBP snapshot, 23-Nov-2026 4pm: 3 / 7).
DEFAULT_BOTA_LANES_OPEN = {"Standard": 3, "Ready Lane": 7}

# --- commercial (truck) model (ASSUMPTIONS - tune to your sources) ----------
COMMERCIAL_OPTIMAL_WAIT_MINS = 30        # truck waits above this are a delay
COMMERCIAL_FRICTION_THRESHOLD_MINS = 45  # above this, loads start missing delivery windows
TRUCK_OPERATING_COST_USD_PER_HOUR = 91.00  # driver + equipment, approx. ATRI operational cost per hour
AVG_CARGO_VALUE_PER_TRUCK_USD = 60000.00   # average value of goods per loaded truck
INVENTORY_CARRYING_RATE_ANNUAL = 0.20      # cost of capital + insurance + obsolescence
LATE_DELIVERY_RATE = 0.02                  # share of loads missing their window per 10 min over threshold
LATE_DELIVERY_COST_USD = 250.00            # rescheduling / detention / line-stoppage penalty per late load
COMMERCIAL_OPERATING_HOURS_PER_DAY = 16    # commercial lanes don't run 24h; trucks spread over these hours

# --- baseline volumes -------------------------------------------------------
_DIR = os.path.dirname(os.path.abspath(__file__))
VOLUMES_CSV = os.path.join(_DIR, "Personal_vehicles volumes.csv")
COMMERCIAL_VOLUMES_CSV = os.path.join(_DIR, "Commercial_vehicles volumes.csv")  # BTS trucks, see fetch_commercial_volumes.py
# CBP port_name -> column in the personal-vehicle volumes file
PORT_VOLUME_COLUMNS = {
    "Bridge of the Americas (BOTA)": "BOTA",
    "Paso Del Norte (PDN)": "PdN_Total",
    "Ysleta": "Ysleta_Total",
    "Santa Teresa": "Santa_Teresa",
}
# CBP port_name -> column in the commercial volumes file (PDN has no commercial lanes)
COMMERCIAL_VOLUME_COLUMNS = {
    "Bridge of the Americas (BOTA)": "BOTA",
    "Ysleta": "Ysleta",
    "Santa Teresa": "Santa_Teresa",
}


def is_delay(wait_minutes: float) -> bool:
    return wait_minutes is not None and wait_minutes > OPTIMAL_WAIT_MINS


def calculate_retail_impact(wait_minutes: float, daily_volume: float) -> float:
    """Estimated DAILY retail loss (USD) if this wait time persisted all day."""
    abandonment_delay = max(0.0, wait_minutes - FRICTION_THRESHOLD_MINS)
    forgone_pct = min(1.0, (abandonment_delay / 10) * ELASTICITY_RATE)
    forgone_crossers = daily_volume * DISCRETIONARY_RATIO * forgone_pct
    return round(float(forgone_crossers * AVG_RETAIL_SPEND), 2)


def estimated_flow(lane_type: str, lanes_open: Optional[float]) -> Optional[float]:
    """Vehicles/hour inferred from CBP open lanes: lanes_open x mu. None if unknown."""
    mu = PASSENGER_LANE_THROUGHPUT_VEH_PER_HOUR.get(lane_type)
    if mu is None or lanes_open is None or lanes_open <= 0:
        return None
    return lanes_open * mu


def calculate_delay_cost(wait_minutes: float, daily_volume: float = 0.0, lane_share: float = 1.0,
                         vehicles_per_hour: Optional[float] = None) -> dict:
    """Financial loss (USD) for one hour at `wait_minutes`.

    vehicles_per_hour: observed/estimated flow (e.g. estimated_flow()). When given it is
                       used directly; otherwise flow = daily_volume * lane_share / 24.
    daily_volume: passenger vehicles per day at the port.
    lane_share:   fraction of that volume using this lane (1.0 = whole port).
    """
    wait_minutes = max(0.0, float(wait_minutes or 0.0))
    flow_source = "lanes_open_x_mu" if vehicles_per_hour is not None else "daily_volume_average"
    if vehicles_per_hour is None:
        vehicles_per_hour = daily_volume * lane_share / HOURS_PER_DAY
    excess_delay_mins = max(0.0, wait_minutes - OPTIMAL_WAIT_MINS)

    # Time lost -> money: person-hours stuck past the threshold, valued at VALUE_OF_TIME_USD_PER_HOUR.
    person_hours_lost = vehicles_per_hour * AVG_VEHICLE_OCCUPANCY * (excess_delay_mins / 60)
    time_cost = person_hours_lost * VALUE_OF_TIME_USD_PER_HOUR
    # Same as calculate_retail_impact() on an hourly volume.
    retail_loss = calculate_retail_impact(wait_minutes, vehicles_per_hour)

    return {
        "flow_source": flow_source,
        "is_delay": is_delay(wait_minutes),
        "wait_minutes": round(wait_minutes, 1),
        "excess_delay_minutes": round(excess_delay_mins, 1),
        "delay_threshold_minutes": OPTIMAL_WAIT_MINS,
        "vehicles_per_hour": round(vehicles_per_hour, 1),
        "person_hours_lost": round(person_hours_lost, 2),
        "time_cost_usd": round(time_cost, 2),
        "retail_loss_usd": round(retail_loss, 2),
        "total_loss_usd": round(time_cost + retail_loss, 2),
        "delay_category": "passenger",
        "basis": "per_hour",
    }


def calculate_commercial_delay_cost(wait_minutes: float, daily_trucks: float, lane_share: float = 1.0) -> dict:
    """Financial loss (USD) for one hour of commercial (truck) wait at `wait_minutes`.

    daily_trucks: northbound trucks per day at the port.
    lane_share:   fraction of those trucks using this lane (1.0 = whole port).
    """
    wait_minutes = max(0.0, float(wait_minutes or 0.0))
    trucks_per_hour = daily_trucks * lane_share / COMMERCIAL_OPERATING_HOURS_PER_DAY
    excess_hours = max(0.0, wait_minutes - COMMERCIAL_OPTIMAL_WAIT_MINS) / 60

    productivity = trucks_per_hour * excess_hours * TRUCK_OPERATING_COST_USD_PER_HOUR
    cargo_in_transit = (trucks_per_hour * excess_hours * AVG_CARGO_VALUE_PER_TRUCK_USD
                        * INVENTORY_CARRYING_RATE_ANNUAL / (365 * 24))
    late_pct = min(1.0, max(0.0, wait_minutes - COMMERCIAL_FRICTION_THRESHOLD_MINS) / 10 * LATE_DELIVERY_RATE)
    late_delivery = trucks_per_hour * late_pct * LATE_DELIVERY_COST_USD

    total = productivity + cargo_in_transit + late_delivery
    return {
        "is_delay": wait_minutes > COMMERCIAL_OPTIMAL_WAIT_MINS,
        "wait_minutes": round(wait_minutes, 1),
        "excess_delay_minutes": round(excess_hours * 60, 1),
        "delay_threshold_minutes": COMMERCIAL_OPTIMAL_WAIT_MINS,
        "vehicles_per_hour": round(trucks_per_hour, 1),
        "productivity_cost_usd": round(productivity, 2),
        "cargo_in_transit_cost_usd": round(cargo_in_transit, 2),
        "late_delivery_cost_usd": round(late_delivery, 2),
        "total_loss_usd": round(total, 2),
        "delay_category": "commercial",
        "basis": "per_hour",
    }


@lru_cache(maxsize=2)
def _load_monthly_volumes(path: str = VOLUMES_CSV) -> dict:
    """{column: (year, month, monthly_volume)} for the latest month with data per column."""
    latest = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if not row.get("Year") or not row.get("Month"):
                continue
            year, month = int(row["Year"]), int(row["Month"])
            for col, value in row.items():
                raw = (value or "").replace(",", "").strip()
                if col not in ("Year", "Month") and raw:
                    latest[col] = (year, month, float(raw))  # rows are chronological
    return latest


def _daily_from_csv(path: str, col: Optional[str], default: float) -> float:
    try:
        year, month, monthly = _load_monthly_volumes(path)[col]
        return round(monthly / calendar.monthrange(year, month)[1], 1)
    except (KeyError, OSError, ValueError):
        return default


def baseline_daily_volume(port_name: str, default: float = 12500.0) -> float:
    """Average daily passenger vehicles for a port, from the latest month in the CSV."""
    return _daily_from_csv(VOLUMES_CSV, PORT_VOLUME_COLUMNS.get(port_name), default)


def baseline_daily_trucks(port_name: str, default: float = 0.0) -> float:
    """Average daily northbound trucks for a port, from the latest month of BTS data."""
    return _daily_from_csv(COMMERCIAL_VOLUMES_CSV, COMMERCIAL_VOLUME_COLUMNS.get(port_name), default)


def calculate_retail_impact_df(df):
    """Batch version for analysis on a DataFrame."""
    df = df.copy()
    df['is_delay'] = df['wait_time_minutes'] > OPTIMAL_WAIT_MINS
    df['excess_delay_mins'] = np.maximum(0, df['wait_time_minutes'] - OPTIMAL_WAIT_MINS)
    df['abandonment_delay_mins'] = np.maximum(0, df['wait_time_minutes'] - FRICTION_THRESHOLD_MINS)
    df['forgone_trip_pct'] = np.minimum(1.0, (df['abandonment_delay_mins'] / 10) * ELASTICITY_RATE)
    df['forgone_crossers'] = df['baseline_daily_volume_vehiculos_BOTA'] * DISCRETIONARY_RATIO * df['forgone_trip_pct']
    df['lost_retail_usd'] = df['forgone_crossers'] * AVG_RETAIL_SPEND
    vehicles_per_hour = df['baseline_daily_volume_vehiculos_BOTA'] / HOURS_PER_DAY
    df['time_cost_usd_hour'] = (vehicles_per_hour * AVG_VEHICLE_OCCUPANCY
                                * df['excess_delay_mins'] / 60 * VALUE_OF_TIME_USD_PER_HOUR)
    return df


if __name__ == "__main__":
    import pandas as pd
    dataset_ratios = pd.read_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'df_final-2.csv'))
    print(calculate_retail_impact_df(dataset_ratios).head())
    for port in PORT_VOLUME_COLUMNS:
        print(port, "cars/day", baseline_daily_volume(port), "| trucks/day", baseline_daily_trucks(port))
