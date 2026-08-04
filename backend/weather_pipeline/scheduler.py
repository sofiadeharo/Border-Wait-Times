import logging
import sys
import time
from apscheduler.schedulers.blocking import BlockingScheduler

# Assuming 'weather_pipeline.py' contains a main() function with the pipeline logic.
from weather_pipeline import main as run_weather_pipeline

# Configure logging to be visible in Docker logs.
logging.basicConfig(stream=sys.stdout, level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def scheduled_job():
    """Wrapper function for the pipeline job to add logging and error handling."""
    logger.info("Starting scheduled weather pipeline run...")
    try:
        run_weather_pipeline()
        logger.info("Weather pipeline run completed successfully.")
    except Exception as e:
        logger.error(f"An error occurred during the weather pipeline run: {e}", exc_info=True)

if __name__ == "__main__":
    logger.info("Initializing scheduler...")
    scheduler = BlockingScheduler(timezone="UTC")

    # Schedule the job to run every hour.
    scheduler.add_job(scheduled_job, 'interval', hours=1, id='weather_pipeline_job')
    logger.info("Scheduler started. The weather pipeline will run every hour.")

    scheduler.start()