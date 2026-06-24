# Border Wait Times App

Predicción de tiempos de espera en puentes fronterizos El Paso ↔ Ciudad Juárez.

## 🚀 Quick Start

### Prerequisitos
- Docker Desktop instalado: https://docker.com/products/docker-desktop
- Terminal/Command Prompt

### Iniciar proyecto

```bash
# 1. Navegar a carpeta del proyecto
cd border-wait-times

# 2. Iniciar Docker
docker-compose up -d

# 3. Verificar que está corriendo
docker-compose ps

# 4. Ver logs del pipeline
docker-compose logs -f cbp_pipeline
```

### Acceder a la base de datos

```bash
psql -h localhost -U postgres -d border_wait_times

# Luego en psql:
SELECT COUNT(*) FROM wait_times;
```

### Detener Docker

```bash
docker-compose down
```

## 📁 Estructura

```
border-wait-times/
├── backend/
│   ├── cbp-pipeline/        # Recolección de datos
│   ├── database/            # Schema SQL
│   ├── api/                 # REST API (próximo)
│   └── ml/                  # Machine Learning (próximo)
├── frontend/
│   ├── mobile/              # React Native (próximo)
│   └── web/                 # React (próximo)
├── docker-compose.yml       # Configuración Docker
├── Dockerfile              # Imagen Python
└── .env                    # Variables de entorno
```

## 🔄 Pipeline

El pipeline ejecuta automáticamente cada hora:
1. Fetcha datos de CBP API
2. Parsea respuesta XML
3. Inserta en PostgreSQL
4. Registra ejecución

Logs: `logs/pipeline.log` y `logs/scheduler.log`

## 📊 Próximos pasos

1. [ ] Crear API REST (Flask/FastAPI)
2. [ ] Crear Frontend web (React)
3. [ ] Crear Frontend móvil (React Native)
4. [ ] Entrenar modelo ML (después de 2-4 semanas de datos)

## 📝 Notas

- Base de datos persiste en `postgres_data/`
- Logs guardados en `logs/`
- Variables configuradas en `.env`
