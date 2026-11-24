#!/usr/bin/env bash
# Copy the CBP history (wait_times) and community reports (user_reported_wait_times) from the
# local Docker Postgres (container cbp_postgres) to the Azure server. Rows already present on
# Azure are skipped, so it is safe to run more than once. Run infra/azure/deploy.sh first so the
# tables exist.
#
#   infra/azure/migrate_local_data.sh
#
# Settings: PG_SERVER (borderplex-pg), PG_ADMIN (bwtadmin), PG_DB (border_wait_times),
#           PG_ADMIN_PASSWORD (prompted), TARGET_CONN (full libpq string; overrides the above).
set -euo pipefail

PG_SERVER="${PG_SERVER:-borderplex-pg}"
PG_ADMIN="${PG_ADMIN:-bwtadmin}"
PG_DB="${PG_DB:-border_wait_times}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-cbp_postgres}"
LOCAL_DB="${LOCAL_DB:-border_wait_times}"
TARGET_CONN="${TARGET_CONN:-host=${PG_SERVER}.postgres.database.azure.com port=5432 dbname=${PG_DB} user=${PG_ADMIN} sslmode=require}"

if [[ -z "${PG_ADMIN_PASSWORD:-}" ]]; then
  read -rsp "Postgres admin password for the target: " PG_ADMIN_PASSWORD; echo
fi

local_psql()  { docker exec -i "$LOCAL_CONTAINER" psql -U postgres -d "$LOCAL_DB" -v ON_ERROR_STOP=1 -qAt "$@"; }
# The local container's psql reaches the target too, so nothing needs installing on this machine.
target_psql() { docker exec -i -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$LOCAL_CONTAINER" psql "$TARGET_CONN" -v ON_ERROR_STOP=1 -qAt "$@"; }

WT_COLS="port_id, port_name, crossing_type, lane_type, wait_time_minutes, status, timestamp, lanes_open"
UR_COLS="port_name, crossing_type, lane_type, crossing_time, reported_wait_minutes, notes, submitter_ip, submitted_at"

echo "Target: ${TARGET_CONN}"
before_wt="$(target_psql -c "SELECT count(*) FROM wait_times")"
before_ur="$(target_psql -c "SELECT count(*) FROM user_reported_wait_times")"

# Stage in unlogged tables (no id column, so local ids never collide with Azure ids), then merge.
target_psql -c "
  DROP TABLE IF EXISTS _import_wait_times, _import_user_reports;
  CREATE UNLOGGED TABLE _import_wait_times AS SELECT ${WT_COLS} FROM wait_times WITH NO DATA;
  CREATE UNLOGGED TABLE _import_user_reports AS SELECT ${UR_COLS} FROM user_reported_wait_times WITH NO DATA;"

local_psql -c "\copy (SELECT ${WT_COLS} FROM wait_times) TO STDOUT WITH CSV" \
  | target_psql -c "\copy _import_wait_times FROM STDIN WITH CSV"
local_psql -c "\copy (SELECT ${UR_COLS} FROM user_reported_wait_times) TO STDOUT WITH CSV" \
  | target_psql -c "\copy _import_user_reports FROM STDIN WITH CSV"

target_psql -c "
  INSERT INTO wait_times (${WT_COLS})
  SELECT ${WT_COLS} FROM _import_wait_times
  ON CONFLICT (port_id, crossing_type, lane_type, timestamp) DO NOTHING;

  INSERT INTO user_reported_wait_times (${UR_COLS})
  SELECT ${UR_COLS} FROM _import_user_reports i
  WHERE NOT EXISTS (
    SELECT 1 FROM user_reported_wait_times r
    WHERE r.crossing_time = i.crossing_time AND r.lane_type = i.lane_type
      AND r.reported_wait_minutes = i.reported_wait_minutes
      AND r.submitted_at IS NOT DISTINCT FROM i.submitted_at
      AND r.submitter_ip IS NOT DISTINCT FROM i.submitter_ip);

  DROP TABLE _import_wait_times, _import_user_reports;"

after_wt="$(target_psql -c "SELECT count(*) FROM wait_times")"
after_ur="$(target_psql -c "SELECT count(*) FROM user_reported_wait_times")"
echo "wait_times:                $before_wt -> $after_wt (+$((after_wt - before_wt)))"
echo "user_reported_wait_times:  $before_ur -> $after_ur (+$((after_ur - before_ur)))"
