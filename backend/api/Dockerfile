FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/api/requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

COPY backend/api/api_layer.py .
COPY backend/Economic_Ratios/ ./Economic_Ratios/
COPY backend/ml/modelo_bota_waittimes_passengerlanes_sintetico_rf2.joblib .

EXPOSE 8000

CMD ["uvicorn", "api_layer:app", "--host", "0.0.0.0", "--port", "8000"]
