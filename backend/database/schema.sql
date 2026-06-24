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
