# One-shot database initialisation: applies schema.sql and loads the holiday calendar
# (backend/holiday_pipeline/holidays.csv). Idempotent - safe to run on every deploy.
# Build from the repo root:  docker build -f backend/database/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

COPY backend/holiday_pipeline/requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# init_db.py resolves ../holiday_pipeline relative to itself, so keep the repo layout.
COPY backend/database/ ./backend/database/
COPY backend/holiday_pipeline/ ./backend/holiday_pipeline/

RUN mkdir -p logs

CMD ["python", "-u", "backend/database/init_db.py"]
