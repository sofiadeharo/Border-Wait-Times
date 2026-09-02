-- ============================================================================
-- Silver — cleaned, conformed, typed. Views (cheap; refresh via the bronze upserts).
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS silver;

CREATE OR REPLACE VIEW silver.crossings_monthly AS
SELECT date_trunc('month', date)::date            AS month,
       port_id,
       port_name,
       lower(replace(measure, ' ', '_'))          AS channel,
       sum(volume)::bigint                         AS volume
FROM bronze.bts_crossings
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW silver.weather_daily AS
SELECT date, location, temp_max_c, precip_mm, wind_kph
FROM bronze.weather;

CREATE OR REPLACE VIEW silver.holidays AS
SELECT date,
       us_federal_holiday                              AS is_us_holiday,
       (mx_official_holiday OR mx_bridge_day)          AS is_mx_holiday,
       us_school_break,
       us_summer_vacation,
       mx_summer_vacation
FROM bronze.holidays;

CREATE OR REPLACE VIEW silver.commercial_wait_hourly AS
SELECT port_id,
       observed_at::date                         AS date,
       extract(hour FROM observed_at)::int       AS hour,
       lane_type,
       avg(wait_minutes)                         AS wait_minutes,
       max(status)                               AS status
FROM bronze.cbp_wait_times
WHERE crossing_type = 'Commercial Vehicle'
GROUP BY 1, 2, 3, 4;
