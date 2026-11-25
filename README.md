# Border Wait Times App
## Tech stack
**Languages/libraries:** Python (psycopg2, pandas, openpyxl, APScheduler, statsmodels, scikit-learn/XGBoost, requests), SQL (PostgreSQL), React
**Infrastructure:** Docker, Docker Compose, PostgreSQL

##  Pipeline

The pipeline automatically executes every hour: 
1. CBP data fetch 
2. Parse the data to XML
3. Insert to PostrgresSQL
4. Logs the execution 

Logs: `logs/pipeline.log` y `logs/scheduler.log`

## Model 

The Random Forest Model takes the baseline crossing volumes, the wait times recorded in the month of July, the Mexican and US yearly holidays, and the peak hours for typical crossing (mornings 7-9, Afternoons 4-6)


## Data layer separation: 
Raw ingestion tables (wait_times, ingestion_logs) are kept architecturally separate from a feature-building layer (feature_building/unified_view.sql, refresh_features.py) using Postgres materialized views — this keeps modeling logic reproducible and decoupled from raw data changes

## API layer: 
a separate Docker service exposing read-only Postgres credentials to the frontend.

## Frontend: 
React dashboard (in progress), starting with a single-bridge MVP showing predicted vs. actual wait times

## Data sources
- **CBP Border Wait Times**: API	Real-time and historical wait time data
- **BTS Border Crossing/Entry Data**:	Historical crossing volumes (ports 2402/2403/2405/2408)
- **Custom binational calendar**: (feriados_2026.xlsx)	US federal holidays, Mexican official holidays (Art. 74 LFT), puentes, SEP/EPISD school breaks
**Known data limitation:** CBP's historical endpoint only provides hour/day-of-week averages, not exact timestamps.

**Security & infrastructure practices**
Read-only PostgreSQL roles for exploration and API access (least-privilege by default)
Docker secrets for credential handling rather than plaintext env vars
Isolated Docker network (cbp_network) between ingestion, database, and API services

**How did I use Claude for this?**
This project grew out of two years of exploring machine learning, data analysis, and economic research in a border context. Using Claude Code helped me understand web app development, specifically by walking me through my first deployment, integrating my economic analysis graphs into the frontend, and refining the interface for mobile screens. A useful tool for an analysis centered idea. 
