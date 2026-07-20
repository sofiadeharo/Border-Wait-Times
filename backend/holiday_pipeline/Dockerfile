FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/holiday_pipeline/requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

COPY backend/holiday_pipeline/holiday_pipeline.py .
COPY backend/holiday_pipeline/holidays.csv .

RUN mkdir -p logs

CMD ["python", "-u", "holiday_pipeline.py"]
