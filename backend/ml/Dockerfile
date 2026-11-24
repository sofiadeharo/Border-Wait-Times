FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ml/requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

COPY backend/ml/modelo_bota_waittimes_passengerlanes_sintetico_rf2.joblib .

RUN mkdir -p logs

# Model is available at /app/modelo_bota_waittimes_passengerlanes_sintetico_rf2.joblib
# Container keeps running for model availability
CMD ["sleep", "infinity"]
