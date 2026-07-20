FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/weather_pipeline/requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

COPY backend/weather_pipeline/weather_pipeline.py .
COPY backend/weather_pipeline/scheduler.py .

RUN mkdir -p logs

CMD ["python", "-u", "scheduler.py"]
