CREATE TABLE IF NOT EXISTS wait_times (
    id SERIAL PRIMARY KEY,
    port_id VARCHAR(50) NOT NULL,
    port_name VARCHAR(255) NOT NULL,
    crossing_type VARCHAR(100),
    lane_type VARCHAR(100),
    wait_time_minutes INTEGER,
    status VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    lanes_open INTEGER,
    UNIQUE (port_id, crossing_type, lane_type, timestamp)
);
ALTER TABLE wait_times ADD COLUMN IF NOT EXISTS lanes_open INTEGER;

CREATE INDEX IF NOT EXISTS idx_port_id_timestamp 
    ON wait_times(port_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_timestamp 
    ON wait_times(timestamp DESC);

CREATE TABLE IF NOT EXISTS ingestion_logs (
    id SERIAL PRIMARY KEY,
    execution_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    records_processed INTEGER,
    records_inserted INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    execution_duration_seconds FLOAT
);

CREATE TABLE IF NOT EXISTS weather_data (
    id SERIAL PRIMARY KEY,
    location_key VARCHAR(50) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    region VARCHAR(255),
    country VARCHAR(100),
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    local_time TIMESTAMP WITH TIME ZONE,
    temp_c NUMERIC(5,2),
    feelslike_c NUMERIC(5,2),
    condition_text VARCHAR(100),
    wind_kph NUMERIC(5,2),
    wind_dir VARCHAR(10),
    pressure_mb NUMERIC(6,2),
    precip_mm NUMERIC(6,2),
    humidity INTEGER,
    cloud INTEGER,
    vis_km NUMERIC(5,2),
    uv NUMERIC(4,1),
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (location_key, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_weather_location_observed
    ON weather_data(location_key, observed_at DESC);

CREATE TABLE IF NOT EXISTS weather_ingestion_logs (
    id SERIAL PRIMARY KEY,
    execution_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    records_processed INTEGER,
    records_inserted INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    execution_duration_seconds FLOAT
);

CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    day_of_year INTEGER NOT NULL,
    date_value DATE NOT NULL,
    day_of_week VARCHAR(20),
    us_is_federal_holiday BOOLEAN DEFAULT FALSE,
    us_federal_holiday_name VARCHAR(255),
    us_is_school_break BOOLEAN DEFAULT FALSE,
    us_school_break_name VARCHAR(255),
    us_is_summer_vacation BOOLEAN DEFAULT FALSE,
    us_school_data_available BOOLEAN DEFAULT FALSE,
    mx_is_official_holiday BOOLEAN DEFAULT FALSE,
    mx_official_holiday_name VARCHAR(255),
    mx_is_bridge_day BOOLEAN DEFAULT FALSE,
    mx_bridge_day_name VARCHAR(255),
    mx_is_summer_vacation BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (date_value)
);

CREATE INDEX IF NOT EXISTS idx_holidays_date
    ON holidays(date_value);

CREATE TABLE IF NOT EXISTS holiday_ingestion_logs (
    id SERIAL PRIMARY KEY,
    execution_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    records_processed INTEGER,
    records_inserted INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    execution_duration_seconds FLOAT
);

CREATE TABLE IF NOT EXISTS day_type_model_runs (
    id SERIAL PRIMARY KEY,
    run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    n_obs INTEGER,
    r_squared NUMERIC(5,3),
    day_type_effects JSONB,
    day_types_skipped JSONB
);

CREATE INDEX IF NOT EXISTS idx_day_type_model_runs_run_at
    ON day_type_model_runs(run_at DESC);

CREATE TABLE IF NOT EXISTS user_reported_wait_times (
    id SERIAL PRIMARY KEY,
    port_name VARCHAR(255) NOT NULL DEFAULT 'Bridge of the Americas (BOTA)',
    crossing_type VARCHAR(100) NOT NULL DEFAULT 'Passenger Vehicle',
    lane_type VARCHAR(100) NOT NULL,
    crossing_time TIMESTAMP WITH TIME ZONE NOT NULL,
    reported_wait_minutes INTEGER NOT NULL CHECK (reported_wait_minutes >= 0 AND reported_wait_minutes <= 600),
    notes TEXT,
    submitter_ip VARCHAR(64),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reported_wait_times_crossing_time
    ON user_reported_wait_times(crossing_time DESC);

CREATE INDEX IF NOT EXISTS idx_user_reported_wait_times_submitter_ip
    ON user_reported_wait_times(submitter_ip);

-- Community reports next to the nearest official CBP reading for the same lane
-- (within +/- 90 min of the reported crossing). Excludes submitter_ip on purpose.
CREATE OR REPLACE VIEW user_reports_vs_cbp AS
SELECT
    r.id,
    r.port_name,
    r.crossing_type,
    r.lane_type,
    r.crossing_time,
    r.reported_wait_minutes,
    c.wait_time_minutes                         AS cbp_wait_minutes,
    c.timestamp                                 AS cbp_reading_at,
    r.reported_wait_minutes - c.wait_time_minutes AS difference_minutes,
    r.notes,
    r.submitted_at
FROM user_reported_wait_times r
LEFT JOIN LATERAL (
    SELECT w.wait_time_minutes, w.timestamp
    FROM wait_times w
    WHERE w.port_name = r.port_name
      AND w.crossing_type = r.crossing_type
      AND w.lane_type = r.lane_type
      AND w.timestamp BETWEEN r.crossing_time - INTERVAL '90 minutes'
                          AND r.crossing_time + INTERVAL '90 minutes'
    ORDER BY ABS(EXTRACT(EPOCH FROM (w.timestamp - r.crossing_time)))
    LIMIT 1
) c ON TRUE;
