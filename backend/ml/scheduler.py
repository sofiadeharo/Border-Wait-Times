"""
Day-Type Model Scheduler
Reajusta el modelo de regresion cada semana para incorporar los datos
mas recientes (feriados/puentes que hayan ocurrido, mas historia).
"""
import logging
import sys
import time

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.memory import MemoryJobStore
import pytz

from day_type_model import run

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/ml_scheduler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class MLScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler(
            jobstores={
                'default': MemoryJobStore()
            },
            executors={
                'default': ThreadPoolExecutor(max_workers=1)
            },
            timezone=pytz.UTC
        )

    def job_wrapper(self, job_name: str):
        def wrapper():
            logger.info(f"Starting job: {job_name}")
            start_time = time.time()

            try:
                stats = run()
                duration = time.time() - start_time
                logger.info(
                    f"Job '{job_name}' completed successfully in {duration:.2f}s. "
                    f"Stats: {stats}"
                )
                return stats

            except Exception as e:
                logger.error(f"Job '{job_name}' failed: {str(e)}", exc_info=True)
                raise

        return wrapper

    def schedule_weekly(self):
        """Cada lunes a las 06:00 UTC"""
        self.scheduler.add_job(
            func=self.job_wrapper('Day-Type Model Weekly Refit'),
            trigger=CronTrigger(day_of_week='mon', hour=6, minute=0),
            id='day_type_model_weekly',
            name='Day-Type Model Weekly Refit',
            replace_existing=True,
            max_instances=1
        )
        logger.info("Scheduled: Day-Type Model - every Monday at 06:00 UTC")

    def start(self):
        try:
            self.scheduler.start()
            logger.info("Scheduler started successfully")
        except Exception as e:
            logger.error(f"Failed to start scheduler: {str(e)}")
            raise

    def shutdown(self):
        self.scheduler.shutdown(wait=True)
        logger.info("Scheduler shut down")


def main():
    logger.info("Starting Day-Type Model Scheduler")
    logger.info("=" * 70)

    scheduler = MLScheduler()
    scheduler.schedule_weekly()
    scheduler.start()

    try:
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Received interrupt signal, shutting down...")
        scheduler.shutdown()
        sys.exit(0)

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        scheduler.shutdown()
        sys.exit(1)


if __name__ == "__main__":
    main()
