-- Unified feature table: hourly wait times per bridge/lane, enriched with
-- weather (both sides of the border) and holiday/school-break context.
-- Run from repo root so the CSV lands in backend/feature_building/:
--   psql -h localhost -U postgres -d border_wait_times -f backend/feature_building/unified_table.sql

DROP TABLE IF EXISTS unified_table;

CREATE TEMP TABLE unified_table AS

WITH hourly_series AS (
    SELECT generate_series(
        date_trunc('hour', (SELECT MIN(timestamp) FROM wait_times)),
        date_trunc('hour', (SELECT MAX(timestamp) FROM wait_times)),
        INTERVAL '1 hour'
    ) AS ts
),

bridges AS (
    SELECT * FROM (VALUES
        ('240201', 'Bridge of the Americas (BOTA)'),
        ('240202', 'Paso Del Norte (PDN)'),
        ('240203', 'Ysleta'),
        ('240801', 'Santa Teresa')
    ) AS b(port_id, port_name)
),

lane_combos AS (
    SELECT DISTINCT crossing_type, lane_type FROM wait_times
),

grid AS (
    SELECT hs.ts, b.port_id, b.port_name, lc.crossing_type, lc.lane_type
    FROM hourly_series hs
    CROSS JOIN bridges b
    CROSS JOIN lane_combos lc
),

wait_times_hourly AS (
    SELECT
        port_id,
        crossing_type,
        lane_type,
        date_trunc('hour', timestamp) AS ts,
        ROUND(AVG(wait_time_minutes), 1) AS wait_time_minutes,
        (ARRAY_AGG(status ORDER BY timestamp DESC))[1] AS status
    FROM wait_times
    GROUP BY port_id, crossing_type, lane_type, date_trunc('hour', timestamp)
),

weather_hourly AS (
    SELECT DISTINCT ON (location_key, date_trunc('hour', observed_at))
        location_key,
        date_trunc('hour', observed_at) AS ts,
        temp_c, feelslike_c, condition_text, wind_kph, wind_dir,
        pressure_mb, precip_mm, humidity, cloud, vis_km, uv
    FROM weather_data
    ORDER BY location_key, date_trunc('hour', observed_at), observed_at DESC
)

SELECT
    g.ts AS timestamp,
    g.port_id,
    g.port_name,
    g.crossing_type,
    g.lane_type,
    wt.wait_time_minutes,
    wt.status,

    ep.temp_c AS el_paso_temp_c,
    ep.feelslike_c AS el_paso_feelslike_c,
    ep.condition_text AS el_paso_condition_text,
    ep.wind_kph AS el_paso_wind_kph,
    ep.wind_dir AS el_paso_wind_dir,
    ep.pressure_mb AS el_paso_pressure_mb,
    ep.precip_mm AS el_paso_precip_mm,
    ep.humidity AS el_paso_humidity,
    ep.cloud AS el_paso_cloud,
    ep.vis_km AS el_paso_vis_km,
    ep.uv AS el_paso_uv,

    jz.temp_c AS juarez_temp_c,
    jz.feelslike_c AS juarez_feelslike_c,
    jz.condition_text AS juarez_condition_text,
    jz.wind_kph AS juarez_wind_kph,
    jz.wind_dir AS juarez_wind_dir,
    jz.pressure_mb AS juarez_pressure_mb,
    jz.precip_mm AS juarez_precip_mm,
    jz.humidity AS juarez_humidity,
    jz.cloud AS juarez_cloud,
    jz.vis_km AS juarez_vis_km,
    jz.uv AS juarez_uv,

    h.day_of_week,
    h.us_is_federal_holiday,
    h.us_federal_holiday_name,
    h.us_is_school_break,
    h.us_school_break_name,
    h.us_is_summer_vacation,
    h.mx_is_official_holiday,
    h.mx_official_holiday_name,
    h.mx_is_bridge_day,
    h.mx_bridge_day_name,
    h.mx_is_summer_vacation

FROM grid g
LEFT JOIN wait_times_hourly wt
    ON wt.port_id = g.port_id
    AND wt.crossing_type = g.crossing_type
    AND wt.lane_type = g.lane_type
    AND wt.ts = g.ts
LEFT JOIN weather_hourly ep
    ON ep.location_key = 'el_paso'
    AND ep.ts = g.ts
LEFT JOIN weather_hourly jz
    ON jz.location_key = 'juarez'
    AND jz.ts = g.ts
LEFT JOIN holidays h
    ON h.date_value = g.ts::date
ORDER BY g.ts, g.port_name, g.crossing_type, g.lane_type;

\copy unified_table TO 'backend/feature_building/unified_table.csv' WITH (FORMAT csv, HEADER true);
