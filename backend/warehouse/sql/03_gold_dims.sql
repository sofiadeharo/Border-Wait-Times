-- ============================================================================
-- Gold — dimensions & reference tables (seeded; edit values here or via Power BI).
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS gold;

-- --- ports -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gold.dim_port (
    port_id                     TEXT PRIMARY KEY,
    port_name                   TEXT,
    city                        TEXT,
    free_flow_min               INTEGER,          -- commercial free-flow crossing time
    cargo_value_per_truck_usd   NUMERIC,          -- seeded; swap for BTS TransBorder monthly
    jit_share                   NUMERIC           -- fraction of trucks feeding just-in-time lines
);
INSERT INTO gold.dim_port VALUES
    ('240201', 'Bridge of the Americas', 'El Paso', 15, 120000, 0.55),
    ('240203', 'Ysleta–Zaragoza',        'El Paso', 20, 165000, 0.70),
    ('240204', 'Tornillo–Guadalupe',     'El Paso', 12,  95000, 0.35)
ON CONFLICT (port_id) DO UPDATE SET
    port_name = EXCLUDED.port_name, city = EXCLUDED.city,
    free_flow_min = EXCLUDED.free_flow_min,
    cargo_value_per_truck_usd = EXCLUDED.cargo_value_per_truck_usd,
    jit_share = EXCLUDED.jit_share;

-- --- scenarios --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gold.dim_scenario (
    scenario_id        TEXT PRIMARY KEY,
    scenario_name      TEXT,
    added_wait_min     NUMERIC,
    volume_multiplier  NUMERIC
);
INSERT INTO gold.dim_scenario VALUES
    ('baseline',              'Current wait times',                                  0,  1.00),
    ('plus_30',               'Sustained +30 min congestion',                       30,  1.00),
    ('commercial_disruption', 'Commercial lanes not shielded (2019-style, +75 min)', 75, 1.00),
    ('preclearance',          'New lanes / preclearance investment',               -12,  1.00),
    ('volume_growth',         '10% truck-volume growth, no capacity add',           18,  1.10)
ON CONFLICT (scenario_id) DO UPDATE SET
    scenario_name = EXCLUDED.scenario_name,
    added_wait_min = EXCLUDED.added_wait_min,
    volume_multiplier = EXCLUDED.volume_multiplier;

-- --- cost parameters ------------------------------------------------------
CREATE TABLE IF NOT EXISTS gold.dim_cost_params (param TEXT PRIMARY KEY, value NUMERIC);
INSERT INTO gold.dim_cost_params VALUES
    ('truck_hourly_cost_usd',        95),     -- ATRI Operational Costs of Trucking, all-in
    ('carrying_rate_annual',         0.20),   -- inventory carrying cost
    ('hours_per_year',               8760),
    ('reliability_threshold_min',    75),     -- wait above which JIT lines are at risk
    ('line_stoppage_cost_per_truck', 2500)    -- expected disruption per exposed JIT truck
ON CONFLICT (param) DO UPDATE SET value = EXCLUDED.value;

-- --- disaggregation profiles ---------------------------------------------
CREATE TABLE IF NOT EXISTS gold.ref_hour_profile (hour INTEGER PRIMARY KEY, hour_share NUMERIC);
INSERT INTO gold.ref_hour_profile VALUES
 (0,.002),(1,.001),(2,.001),(3,.002),(4,.006),(5,.020),(6,.050),(7,.075),
 (8,.085),(9,.090),(10,.095),(11,.092),(12,.085),(13,.080),(14,.072),(15,.060),
 (16,.045),(17,.030),(18,.018),(19,.010),(20,.006),(21,.004),(22,.003),(23,.003)
ON CONFLICT (hour) DO UPDATE SET hour_share = EXCLUDED.hour_share;

CREATE TABLE IF NOT EXISTS gold.ref_dow_profile (day_of_week INTEGER PRIMARY KEY, dow_weight NUMERIC);
INSERT INTO gold.ref_dow_profile VALUES        -- 0 = Monday
 (0,1.32),(1,1.34),(2,1.34),(3,1.32),(4,1.20),(5,0.22),(6,0.05)
ON CONFLICT (day_of_week) DO UPDATE SET dow_weight = EXCLUDED.dow_weight;

CREATE TABLE IF NOT EXISTS gold.ref_wait_base (port_id TEXT PRIMARY KEY, wait_base NUMERIC);
INSERT INTO gold.ref_wait_base VALUES ('240201',24),('240203',34),('240204',16)
ON CONFLICT (port_id) DO UPDATE SET wait_base = EXCLUDED.wait_base;

-- --- date dimension -----------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS gold.dim_date CASCADE;
CREATE MATERIALIZED VIEW gold.dim_date AS
SELECT d::date                                            AS date,
       extract(year  FROM d)::int                         AS year,
       extract(month FROM d)::int                         AS month,
       (extract(isodow FROM d)::int - 1)                  AS day_of_week,   -- 0 = Mon
       (extract(isodow FROM d)::int >= 6)                 AS is_weekend
FROM generate_series(
        (SELECT min(month) FROM silver.crossings_monthly),
        (SELECT (max(month) + interval '1 month - 1 day')::date FROM silver.crossings_monthly),
        interval '1 day') AS d;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dim_date ON gold.dim_date (date);
