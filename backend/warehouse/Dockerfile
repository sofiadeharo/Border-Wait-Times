# Warehouse ingestion job — build from the repo root:
#   az acr build -r <acr> -t bwt-warehouse:latest -f backend/warehouse/Dockerfile .
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

COPY backend/warehouse/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/warehouse/ ./backend/warehouse/
COPY backend/holiday_pipeline/holidays.csv ./backend/holiday_pipeline/holidays.csv

# fetch sources -> bronze upsert -> CALL gold.refresh_medallion()
CMD ["python", "-m", "backend.warehouse.ingest"]
