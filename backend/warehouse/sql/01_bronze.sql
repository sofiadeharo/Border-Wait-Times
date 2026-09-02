-- ============================================================================
-- Bronze — raw source data, as ingested. Populated by warehouse/ingest.py.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS bronze;

CREATE TABLE IF NOT EXISTS bronze.bts_crossings (
    date          DATE        NOT NULL,
    port_id       TEXT        NOT NULL,
    port_name     TEXT        NOT NULL,
    measure       TEXT        NOT NULL,   -- Trucks / Personal Vehicles / Pedestrians / Bus Passengers
    volume        BIGINT      NOT NULL,
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (date, port_id, measure)
);

CREATE TABLE IF NOT EXISTS bronze.weather (
    date          DATE        NOT NULL,
    location      TEXT        NOT NULL,   -- el_paso / juarez
    temp_max_c    NUMERIC,
    precip_mm     NUMERIC,
    wind_kph      NUMERIC,
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (date, location)
);

CREATE TABLE IF NOT EXISTS bronze.holidays (
    date                 DATE PRIMARY KEY,
    us_federal_holiday   BOOLEAN DEFAULT FALSE,
    us_school_break      BOOLEAN DEFAULT FALSE,
    us_summer_vacation   BOOLEAN DEFAULT FALSE,
    mx_official_holiday  BOOLEAN DEFAULT FALSE,
    mx_bridge_day        BOOLEAN DEFAULT FALSE,
    mx_summer_vacation   BOOLEAN DEFAULT FALSE
);

-- Live CBP commercial-lane wait snapshots — accumulates hourly.
CREATE TABLE IF NOT EXISTS bronze.cbp_wait_times (
    port_id       TEXT        NOT NULL,
    crossing_type TEXT        NOT NULL,
    lane_type     TEXT        NOT NULL,
    wait_minutes  INTEGER,
    status        TEXT,
    observed_at   TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (port_id, crossing_type, lane_type, observed_at)
);
CREATE INDEX IF NOT EXISTS idx_cbp_wait_observed ON bronze.cbp_wait_times (observed_at DESC);
