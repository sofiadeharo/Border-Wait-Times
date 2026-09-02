-- ============================================================================
-- Gold — facts.
--   fact_truck_hours        monthly BTS truck counts -> port x date x hour
--   fact_wait_forecast      calendar/weather commercial wait forecast  (Azure ML slot)
--   fact_border_delay_cost  port x date x hour x scenario  -> the Power BI fact
-- ============================================================================

-- --- truck volume disaggregation -----------------------------------------
DROP MATERIALIZED VIEW IF EXISTS gold.fact_truck_hours CASCADE;
CREATE MATERIALIZED VIEW gold.fact_truck_hours AS
WITH trucks_m AS (
    SELECT month, port_id, volume AS month_trucks
    FROM silver.crossings_monthly
    WHERE channel = 'trucks'
),
daily AS (
    SELECT d.date,
           d.day_of_week,
           t.port_id,
           t.month_trucks,
           w.dow_weight,
           sum(w.dow_weight) OVER (
               PARTITION BY t.port_id, date_trunc('month', d.date)
           ) AS w_sum
    FROM gold.dim_date d
    JOIN trucks_m t              ON date_trunc('month', d.date)::date = t.month
    JOIN gold.ref_dow_profile w  ON w.day_of_week = d.day_of_week
)
SELECT dy.port_id,
       dy.date,
       h.hour,
       dy.day_of_week,
       (dy.month_trucks * dy.dow_weight / dy.w_sum) * h.hour_share AS trucks
FROM daily dy
CROSS JOIN gold.ref_hour_profile h;
CREATE UNIQUE INDEX IF NOT EXISTS idx_truck_hours
    ON gold.fact_truck_hours (port_id, date, hour);

-- --- wait forecast (replace body with a read of the Azure ML output) -----
DROP MATERIALIZED VIEW IF EXISTS gold.fact_wait_forecast CASCADE;
CREATE MATERIALIZED VIEW gold.fact_wait_forecast AS
SELECT b.port_id,
       d.date,
       h.hour,
       round(
         greatest(0,
           (b.wait_base
            + sin(least(greatest(h.hour - 4, 0), 16)::numeric / 16 * pi()) * 10   -- hour curve
            + coalesce(w.precip_mm, 0) * 0.7                                       -- weather
            + CASE WHEN coalesce(hol.is_mx_holiday, false) THEN -8
                   WHEN coalesce(hol.is_us_holiday, false) THEN -5
                   ELSE 0 END
           ) * CASE WHEN d.day_of_week <= 4 THEN 1.0 ELSE 0.18 END               -- weekday factor
         )::numeric, 2) AS predicted_wait_min,
       'calendar-baseline-v0' AS model_version
FROM gold.dim_date d
CROSS JOIN generate_series(0, 23) AS h(hour)
CROSS JOIN gold.ref_wait_base b
LEFT JOIN silver.holidays hol     ON hol.date = d.date
LEFT JOIN silver.weather_daily w  ON w.date = d.date AND w.location = 'el_paso';
CREATE UNIQUE INDEX IF NOT EXISTS idx_wait_forecast
    ON gold.fact_wait_forecast (port_id, date, hour);

-- --- the border-delay cost model ---------------------------------------
DROP MATERIALIZED VIEW IF EXISTS gold.fact_border_delay_cost CASCADE;
CREATE MATERIALIZED VIEW gold.fact_border_delay_cost AS
WITH p AS (
    SELECT
        max(value) FILTER (WHERE param = 'truck_hourly_cost_usd')        AS truck_hourly_cost,
        max(value) FILTER (WHERE param = 'carrying_rate_annual')         AS carrying_rate,
        max(value) FILTER (WHERE param = 'hours_per_year')               AS hours_per_year,
        max(value) FILTER (WHERE param = 'reliability_threshold_min')    AS threshold_min,
        max(value) FILTER (WHERE param = 'line_stoppage_cost_per_truck') AS stoppage_cost
    FROM gold.dim_cost_params
),
calc AS (
    SELECT th.port_id, dp.port_name, dp.city, th.date, th.hour, th.day_of_week,
           extract(year  FROM th.date)::int AS year,
           extract(month FROM th.date)::int AS month,
           s.scenario_id, s.scenario_name,
           th.trucks * s.volume_multiplier                                        AS trucks,
           f.predicted_wait_min,
           f.predicted_wait_min + s.added_wait_min                                AS wait_min,
           greatest(0, f.predicted_wait_min + s.added_wait_min - dp.free_flow_min) AS excess_delay_min,
           dp.cargo_value_per_truck_usd, dp.jit_share,
           p.*
    FROM gold.fact_truck_hours th
    JOIN gold.fact_wait_forecast f USING (port_id, date, hour)
    JOIN gold.dim_port dp           USING (port_id)
    CROSS JOIN gold.dim_scenario s
    CROSS JOIN p
),
cost AS (
    SELECT c.*,
           c.trucks * c.excess_delay_min / 60.0                          AS delay_truck_hours,
           least(1, greatest(0, (c.wait_min - c.threshold_min) / 120.0)) AS stoppage_prob
    FROM calc c
)
SELECT
    port_id, port_name, city, date, year, month, hour, day_of_week,
    scenario_id, scenario_name,
    round(trucks::numeric, 1)              AS trucks,
    round(predicted_wait_min::numeric, 1)  AS predicted_wait_min,
    round(wait_min::numeric, 1)            AS wait_min,
    round(excess_delay_min::numeric, 1)    AS excess_delay_min,
    round(delay_truck_hours::numeric, 2)   AS delay_truck_hours,
    round((delay_truck_hours * truck_hourly_cost)::numeric, 2) AS direct_cost,
    round((delay_truck_hours * cargo_value_per_truck_usd * carrying_rate
           / hours_per_year)::numeric, 2)                      AS inventory_cost,
    round((trucks * jit_share * stoppage_prob * stoppage_cost)::numeric, 2) AS reliability_cost,
    round((delay_truck_hours * truck_hourly_cost
           + delay_truck_hours * cargo_value_per_truck_usd * carrying_rate / hours_per_year
           + trucks * jit_share * stoppage_prob * stoppage_cost)::numeric, 2) AS total_cost,
    round((trucks * cargo_value_per_truck_usd)::numeric, 0)    AS cargo_value_at_risk
FROM cost;

CREATE INDEX IF NOT EXISTS idx_delay_cost_scenario ON gold.fact_border_delay_cost (scenario_id);
CREATE INDEX IF NOT EXISTS idx_delay_cost_port_year ON gold.fact_border_delay_cost (port_id, year);
CREATE INDEX IF NOT EXISTS idx_delay_cost_date      ON gold.fact_border_delay_cost (date);

-- convenience: annualised cost by scenario (what the Power BI hero card shows)
CREATE OR REPLACE VIEW gold.v_cost_by_scenario AS
SELECT scenario_id, scenario_name,
       sum(total_cost)      / count(DISTINCT date) * 365 / 1e6 AS annualised_cost_musd,
       sum(direct_cost)     / count(DISTINCT date) * 365 / 1e6 AS direct_musd,
       sum(inventory_cost)  / count(DISTINCT date) * 365 / 1e6 AS inventory_musd,
       sum(reliability_cost)/ count(DISTINCT date) * 365 / 1e6 AS reliability_musd,
       avg(excess_delay_min)                                   AS avg_excess_delay_min
FROM gold.fact_border_delay_cost
GROUP BY 1, 2
ORDER BY 1;
