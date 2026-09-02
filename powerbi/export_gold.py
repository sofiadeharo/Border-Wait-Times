"""
Export the warehouse gold schema to files so Power BI (or Excel, or Fabric) can
import a self-contained snapshot — no database connection, no gateway.

    DB_HOST=localhost DB_PORT=5544 DB_NAME=border_wait_times \
      DB_USER=postgres DB_PASSWORD=border_pass_2026 \
      python powerbi/export_gold.py

Writes:
  powerbi/data/dim_*.csv                  dimensions (small)
  powerbi/data/fact_border_delay_cost.parquet   last N years, hourly grain
"""
from __future__ import annotations

import os
import pathlib

import pandas as pd
import psycopg2

YEARS = int(os.getenv("EXPORT_YEARS", "3"))
OUT = pathlib.Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

# accepts DATABASE_URL (postgres://user:pass@host:port/db) or the DB_* vars
if os.getenv("DATABASE_URL"):
    DSN = os.environ["DATABASE_URL"]
    _shown = DSN.split("@")[-1]
else:
    DSN = dict(
        host=os.getenv("DB_HOST", "localhost"),
        dbname=os.getenv("DB_NAME", "border_wait_times"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        port=int(os.getenv("DB_PORT", "5432")),
    )
    _shown = f"{DSN['host']}:{DSN['port']}/{DSN['dbname']}"

DIMS = ["dim_port", "dim_scenario", "dim_cost_params", "dim_date"]


def _connect():
    return psycopg2.connect(DSN) if isinstance(DSN, str) else psycopg2.connect(**DSN)


def main() -> None:
    print(f"connecting to {_shown} …")
    with _connect() as conn:
        for d in DIMS:
            df = pd.read_sql(f"SELECT * FROM gold.{d}", conn)
            df.to_csv(OUT / f"{d}.csv", index=False)
            print(f"  {d:24s} {len(df):>9,} rows  -> {d}.csv")

        fact = pd.read_sql(
            f"""SELECT * FROM gold.fact_border_delay_cost
                WHERE date >= (current_date - interval '{YEARS} years')""",
            conn,
        )
    path = OUT / "fact_border_delay_cost.parquet"
    fact.to_parquet(path, index=False, compression="zstd")
    mb = path.stat().st_size / 1e6
    print(f"  fact_border_delay_cost   {len(fact):>9,} rows  -> "
          f"fact_border_delay_cost.parquet ({mb:.1f} MB, last {YEARS}y)")

    # also a tiny pre-aggregated view for quick Excel / preview use
    agg = (fact.groupby(["scenario_id", "scenario_name", "port_name", "year", "month"],
                        as_index=False)[["total_cost", "direct_cost", "inventory_cost",
                                         "reliability_cost", "cargo_value_at_risk"]].sum())
    agg.to_csv(OUT / "fact_monthly_summary.csv", index=False)
    print(f"  fact_monthly_summary     {len(agg):>9,} rows  -> fact_monthly_summary.csv")


if __name__ == "__main__":
    main()
