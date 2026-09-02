-- ============================================================================
-- Refresh procedure + schedule.
-- ============================================================================

CREATE OR REPLACE PROCEDURE gold.refresh_medallion()
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW gold.dim_date;
    REFRESH MATERIALIZED VIEW gold.fact_truck_hours;
    REFRESH MATERIALIZED VIEW gold.fact_wait_forecast;
    REFRESH MATERIALIZED VIEW gold.fact_border_delay_cost;
    -- switch to CONCURRENTLY once the unique indexes exist and reads must not block:
    --   REFRESH MATERIALIZED VIEW CONCURRENTLY gold.fact_border_delay_cost;
END $$;

-- --- pg_cron (Azure: add `pg_cron` to the `azure.extensions` server parameter,
--     then `CREATE EXTENSION pg_cron;` in the `postgres` database) --------------
-- SELECT cron.schedule('medallion-refresh', '15 * * * *', 'CALL gold.refresh_medallion()');
--
-- The Python ingestion (warehouse/ingest.py) writes bronze and then calls
-- gold.refresh_medallion() itself, so pg_cron is only needed if you schedule the
-- refresh independently of ingestion.
