"""
Weather Data Pipeline Trigger Listener
En lugar de correr en su propio intervalo, este proceso escucha (LISTEN/NOTIFY
de Postgres) la senal que envia el pipeline de CBP al terminar cada corrida, y
dispara el pipeline de clima justo despues. Esto mantiene ambos datasets
alineados en el tiempo en vez de competir en relojes independientes.
"""

import logging
import select
import sys
import time

import psycopg2

from weather_pipeline import WeatherDataPipeline, DB_CONFIG

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/weather_scheduler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Must match WEATHER_TRIGGER_CHANNEL in backend/cbp-pipeline/cbp_data_pipeline.py
TRIGGER_CHANNEL = "cbp_pipeline_complete"

# How often to wake up even without a notification, so shutdown signals and a
# dropped connection get noticed instead of blocking forever.
POLL_TIMEOUT_SECONDS = 30


class WeatherTriggerListener:
    def __init__(self):
        self.conn = psycopg2.connect(**DB_CONFIG)
        self.conn.autocommit = True

    def listen(self):
        with self.conn.cursor() as cursor:
            cursor.execute(f"LISTEN {TRIGGER_CHANNEL};")
        logger.info(f"Listening for '{TRIGGER_CHANNEL}' notifications on Postgres")

    def run_pipeline(self):
        logger.info("Trigger received - starting weather pipeline run")
        start_time = time.time()
        try:
            pipeline = WeatherDataPipeline()
            stats = pipeline.run()
            duration = time.time() - start_time
            logger.info(
                f"Weather pipeline completed in {duration:.2f}s. Stats: {stats}"
            )
        except Exception as e:
            logger.error(f"Weather pipeline failed: {str(e)}", exc_info=True)

    def wait_loop(self):
        while True:
            ready, _, _ = select.select([self.conn], [], [], POLL_TIMEOUT_SECONDS)
            if not ready:
                continue

            self.conn.poll()
            while self.conn.notifies:
                notify = self.conn.notifies.pop(0)
                logger.info(
                    f"Notification received on '{notify.channel}' from pid {notify.pid}"
                )
                self.run_pipeline()

    def close(self):
        if self.conn:
            self.conn.close()
            logger.info("Listener connection closed")


def main():
    logger.info("Starting Weather Pipeline Trigger Listener")
    logger.info("=" * 70)

    pipeline = WeatherDataPipeline()
    pipeline.db.create_tables()
    pipeline.db.close()

    listener = WeatherTriggerListener()
    listener.listen()

    try:
        listener.wait_loop()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal, shutting down...")
        listener.close()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        listener.close()
        sys.exit(1)


if __name__ == "__main__":
    main()
