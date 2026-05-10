import logging
from contextlib import asynccontextmanager
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from beanie import init_beanie
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.models import Listing, NotificationLog, PriceHistory, SavedSearch, ScrapeJob, UserSettings
from app.routes.pages import router as pages_router
from app.routes.searches import router as searches_router
from app.routes.api import router as api_router
from app.scheduler.jobs import backup_db_job, cleanup_stale_listings_job, enrich_amenities_job, poll_listings_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _auto_restore_from_backup():
    """Restore DB from most recent backup if one exists."""
    import asyncio
    from pathlib import Path

    backup_dir = Path(settings.backup_dir)
    if not backup_dir.exists():
        return

    archives = sorted(backup_dir.glob(f"{settings.mongodb_db}_*.gz"))
    if not archives:
        logger.info("No backup archives found for auto-restore")
        return

    latest = archives[-1]
    logger.info(f"DB empty - restoring from {latest}")

    cmd = [
        "mongorestore",
        f"--uri={settings.mongodb_url}",
        f"--archive={latest}",
        "--gzip",
        "--drop",
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()

    if proc.returncode != 0:
        logger.error(f"mongorestore failed: {stderr.decode()}")
    else:
        logger.info("DB restored successfully from backup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: connect to MongoDB and init Beanie
    client = AsyncIOMotorClient(settings.mongodb_url)
    await init_beanie(
        database=client[settings.mongodb_db],
        document_models=[Listing, SavedSearch, PriceHistory, NotificationLog, UserSettings, ScrapeJob],
    )
    logger.info(f"Connected to MongoDB at {settings.mongodb_url}/{settings.mongodb_db}")

    # Auto-restore from backup if DB is empty
    listing_count = await Listing.count()
    if listing_count == 0:
        await _auto_restore_from_backup()

    # Mark any orphaned "running" jobs as failed (from previous server crash/restart)
    orphaned = await ScrapeJob.find(ScrapeJob.status == "running").to_list()
    for job in orphaned:
        job.status = "failed"
        job.error = "Server restarted - background task lost"
        job.completed_at = datetime.utcnow()
        await job.save()
        logger.warning(f"Marked orphaned scrape job {job.id} as failed")

    # Start scheduler
    scheduler.add_job(
        poll_listings_job,
        "interval",
        minutes=settings.poll_interval_minutes,
        id="poll_listings",
        replace_existing=True,
        next_run_time=datetime.now(),
    )
    scheduler.add_job(
        cleanup_stale_listings_job,
        "cron",
        hour=3,
        id="cleanup_stale",
        replace_existing=True,
    )
    scheduler.add_job(
        backup_db_job,
        "cron",
        hour=4,
        id="backup_db",
        replace_existing=True,
    )
    scheduler.add_job(
        enrich_amenities_job,
        "interval",
        minutes=30,
        id="enrich_amenities",
        replace_existing=True,
        next_run_time=datetime.now(),
    )
    scheduler.start()
    logger.info(f"Scheduler started (poll every {settings.poll_interval_minutes} min)")

    yield

    # Shutdown
    scheduler.shutdown()
    client.close()


app = FastAPI(title="Yad2 Search", lifespan=lifespan)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(pages_router)
app.include_router(searches_router)
app.include_router(api_router)
