#!/usr/bin/env bash
# Apply the warehouse SQL in order. Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db  ./apply.sh
#   # or rely on PGHOST / PGUSER / PGDATABASE / PGPASSWORD
set -euo pipefail
cd "$(dirname "$0")/sql"
for f in 01_bronze.sql 02_silver.sql 03_gold_dims.sql 04_gold_facts.sql 05_refresh.sql; do
    echo "── $f"
    psql "${DATABASE_URL:-}" -v ON_ERROR_STOP=1 -f "$f"
done
echo "── done. Now run:  python -m backend.warehouse.ingest"
