"""
CBP Data Pipeline Scheduler
Runs the pipeline at regular intervals using APScheduler.
"""

import logging
import sys
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from cbp_data_pipeline import CBPDataPipeline

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/scheduler.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


def scheduled_job():
    """Wrapper function for the pipeline job to add logging and error handling."""
    logger.info("Starting scheduled CBP data pipeline run...")
    try:
        pipeline = CBPDataPipeline()
        pipeline.run()
        logger.info("CBP data pipeline run completed successfully.")
    except Exception as e:
        logger.error(f"An error occurred during the CBP data pipeline run: {e}", exc_info=True)


if __name__ == "__main__":
    logger.info("Initializing CBP data pipeline scheduler...")
    scheduler = BlockingScheduler(timezone="UTC")

    # Schedule the job to run every hour at the 0th minute.
    scheduler.add_job(
        scheduled_job, CronTrigger(minute=0), id='cbp_pipeline_hourly_job', name='CBP Pipeline Hourly Execution', replace_existing=True
    )
    logger.info("Scheduler started. The CBP data pipeline will run every hour at the top of the hour.")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")
