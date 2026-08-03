# Border Wait Times App

Predicción de tiempos de espera en puentes fronterizos El Paso,  Ciudad Juárez desde el puente BOTA.


## 🔄 Pipeline

El pipeline ejecuta automáticamente cada hora:
1. Fetcha datos de CBP API
2. Parsea respuesta XML
3. Inserta en PostgreSQL
4. Registra ejecución

Logs: `logs/pipeline.log` y `logs/scheduler.log`

