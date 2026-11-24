"""Download monthly northbound truck crossings from BTS Border Crossing Entry Data
and save them as `Commercial_vehicles volumes.csv` (same layout as the personal-vehicle file).

BTS port names -> CBP bridges: "El Paso" = Bridge of the Americas (Paso del Norte has no
commercial lanes), "Ysleta" = Ysleta-Zaragoza, "Santa Teresa" = Santa Teresa.

Usage: python fetch_commercial_volumes.py
"""
import csv
import os

import requests

BTS_URL = "https://data.bts.gov/resource/keg4-3bc2.json"
BTS_PORTS = {"El Paso": "BOTA", "Ysleta": "Ysleta", "Santa Teresa": "Santa_Teresa"}
OUT_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Commercial_vehicles volumes.csv")


def main(since: str = "2023-01-01") -> None:
    ports = ",".join(f"'{p}'" for p in BTS_PORTS)
    r = requests.get(BTS_URL, params={
        "$select": "port_name,date,value",
        "$where": f"port_name in({ports}) AND measure='Trucks' AND date >= '{since}'",
        "$order": "date",
        "$limit": 5000,
    }, timeout=30)
    r.raise_for_status()

    by_month: dict = {}
    for row in r.json():
        key = (int(row["date"][:4]), int(row["date"][5:7]))
        by_month.setdefault(key, {})[BTS_PORTS[row["port_name"]]] = int(float(row["value"]))

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Year", "Month", *BTS_PORTS.values()])
        for (year, month), vals in sorted(by_month.items()):
            w.writerow([year, month, *(vals.get(c, "") for c in BTS_PORTS.values())])
    print(f"Wrote {len(by_month)} months to {OUT_CSV}")


if __name__ == "__main__":
    main()
