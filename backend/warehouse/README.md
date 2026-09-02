# Warehouse — border-delay cost model (PostgreSQL)

A bronze → silver → gold medallion built entirely in **Azure Database for PostgreSQL**
(Flexible Server). The gold fact, `gold.fact_border_delay_cost`, is the projected
economic cost of border-crossing delay to the El Paso–Ciudad Juárez cross-border
freight supply chain — the table Power BI reports on.

No Spark, no lakehouse: the data is small (gold fact ≈ 1M rows) and every transform
is SQL. Runs on a Burstable **B1ms** instance (~$15–20/mo).

## Layout

```
sql/
  01_bronze.sql     raw tables            bts_crossings · weather · holidays · cbp_wait_times
  02_silver.sql     conform views         crossings_monthly · weather_daily · holidays · commercial_wait_hourly
  03_gold_dims.sql  dims + reference      dim_port · dim_scenario · dim_cost_params · dim_date · ref_* profiles
  04_gold_facts.sql matviews              fact_truck_hours · fact_wait_forecast · fact_border_delay_cost · v_cost_by_scenario
  05_refresh.sql    gold.refresh_medallion() + pg_cron note
ingest.py           fetch sources -> bronze (upsert) -> CALL gold.refresh_medallion()
sources.py          BTS / Open-Meteo / holiday CSV / live CBP fetchers (requests only)
apply.sh            psql runner for sql/ in order
```

## The cost model (`04_gold_facts.sql`)

```
excess_delay_min  = max(0, predicted_wait + scenario_added_wait − free_flow_min)
trucks            = hourly truck estimate × scenario volume multiplier
delay_truck_hours = trucks × excess_delay_min / 60

direct_cost       = delay_truck_hours × truck_hourly_cost            (ATRI ~$95/hr all-in)
inventory_cost    = delay_truck_hours × cargo_value_per_truck × carrying_rate / 8760
reliability_cost  = trucks × jit_share × P(line stoppage | wait) × stoppage_cost_per_truck
total_cost        = direct + inventory + reliability
```

Parameters live in `gold.dim_cost_params` (editable in place, or exposed as Power BI
what-if). Cargo value per truck (`gold.dim_port`) is seeded from published El Paso
averages — swap in monthly **BTS TransBorder Freight** values when wired up.

## Run locally

```bash
docker run -d --rm --name pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=border_wait_times \
  -p 5599:5432 postgres:16-alpine

export DATABASE_URL=postgres://postgres:test@localhost:5599/border_wait_times
./apply.sh                                             # create schema + matviews

pip install -r requirements.txt
DB_HOST=localhost DB_PORT=5599 DB_NAME=border_wait_times DB_USER=postgres DB_PASSWORD=test \
  python -m backend.warehouse.ingest                   # bronze + refresh gold

psql "$DATABASE_URL" -c "SELECT * FROM gold.v_cost_by_scenario"
```

Verified output (El Paso commercial ports, BTS data 2015–, 1,026,240 fact rows):

| scenario | annualised cost | direct | inventory | reliability |
|---|---|---|---|---|
| baseline | **$22.5 M/yr** | $21.8 M | $0.75 M | $0 |
| +30 min congestion | $59.4 M/yr | $56.6 M | $1.9 M | $0.9 M |
| commercial lanes not shielded (+75 min) | $456 M/yr | $110 M | $3.7 M | $343 M |
| preclearance (−12 min) | $8.6 M/yr | — | — | — |

*(matches the Spark implementation on branch `fabric-migration` exactly.)*

## Deploy to Azure

See [`../../docs/azure-postgres.md`](../../docs/azure-postgres.md).
