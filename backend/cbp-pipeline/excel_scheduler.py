"""
Excel Export Scheduler
Triggers an Excel export to the project_exports folder after each hourly
CBP pipeline run. Writes to a temp file first; the original is replaced only
once the full write succeeds with no errors.
"""

import logging
import os
import sys
import time

import pytz
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from export_to_excel import export_to_excel

os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/excel_scheduler.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


class ExcelExportScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler(
            jobstores={"default": MemoryJobStore()},
            executors={"default": ThreadPoolExecutor(max_workers=1)},
            timezone=pytz.UTC,
        )

    def _job_wrapper(self, job_name: str):
        def wrapper():
            logger.info("=" * 70)
            logger.info(f"Starting job: {job_name}")
            start_time = time.time()

            try:
                output_path = export_to_excel()
                duration = time.time() - start_time
                logger.info(
                    f"Job '{job_name}' completed successfully in {duration:.2f}s | "
                    f"File: {output_path}"
                )

            except Exception as e:
                duration = time.time() - start_time
                logger.error(
                    f"Job '{job_name}' failed after {duration:.2f}s: {e}",
                    exc_info=True,
                )
                raise

            logger.info("=" * 70)

        return wrapper

    def schedule_after_pipeline(self):
        """Runs at minute 5 each hour — 5 minutes after the pipeline fires at minute 0."""
        self.scheduler.add_job(
            func=self._job_wrapper("Excel Export"),
            trigger=CronTrigger(minute=5),
            id="excel_export_hourly",
            name="Excel Export — post-pipeline trigger",
            replace_existing=True,
            max_instances=1,
        )
        logger.info("Scheduled: Excel Export — every hour at minute 5 (after pipeline at minute 0)")

    def start(self):
        try:
            self.scheduler.start()
            logger.info("Excel Export Scheduler started successfully")
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
            raise

    def shutdown(self):
        self.scheduler.shutdown(wait=True)
        logger.info("Excel Export Scheduler shut down")


def main():
    logger.info("Starting Excel Export Scheduler")
    logger.info("=" * 70)

    scheduler = ExcelExportScheduler()
    scheduler.schedule_after_pipeline()
    scheduler.start()

    try:
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Received interrupt signal, shutting down...")
        scheduler.shutdown()
        sys.exit(0)

    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        scheduler.shutdown()
        sys.exit(1)


if __name__ == "__main__":
    main()
