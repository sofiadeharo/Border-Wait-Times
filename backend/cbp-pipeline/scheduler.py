"""
CBP Data Pipeline Scheduler
Ejecuta el pipeline en intervalos usando APScheduler
"""

import logging
from datetime import datetime
import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.memory import MemoryJobStore
import time
import sys

from cbp_data_pipeline import CBPDataPipeline

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/scheduler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class CBPScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler(
            jobstores={
                'default': MemoryJobStore()
            },
            executors={
                'default': ThreadPoolExecutor(max_workers=3)
            },
            timezone=pytz.UTC
        )
    
    def job_wrapper(self, job_name: str):
        def wrapper():
            logger.info(f"Starting job: {job_name}")
            start_time = time.time()
            
            try:
                pipeline = CBPDataPipeline()
                stats = pipeline.run()
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
    
    def schedule_hourly(self):
        """Ejecuta cada hora en el minuto 0"""
        self.scheduler.add_job(
            func=self.job_wrapper('CBP Pipeline Hourly'),
            trigger=CronTrigger(minute=0),
            id='cbp_pipeline_hourly',
            name='CBP Pipeline Hourly Execution',
            replace_existing=True,
            max_instances=1
        )
        logger.info("Scheduled: CBP Pipeline - Every hour (at minute 0)")
    
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
    logger.info("Starting CBP Data Pipeline Scheduler")
    logger.info("=" * 70)
    
    scheduler = CBPScheduler()
    scheduler.schedule_hourly()
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
