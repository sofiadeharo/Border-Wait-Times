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
    UNIQUE (port_id, crossing_type, lane_type, timestamp)
);

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
