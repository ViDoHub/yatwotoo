import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from beanie import init_beanie
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.consts import (
    SCHEDULER_JOB_BACKUP,
    SCHEDULER_JOB_CLEANUP,
    SCHEDULER_JOB_ENRICH,
    SCHEDULER_JOB_POLL,
    JobStatus,
)
from app.models import Listing, NotificationLog, PriceHistory, SavedSearch, ScrapeJob, UserSettings
from app.routes.api import router as api_router
from app.routes.pages import router as pages_router
from app.routes.searches import router as searches_router
from app.scheduler.jobs import backup_db_job, cleanup_stale_listings_job, enrich_amenities_job, poll_listings_job


def _build_log_handler() -> logging.Handler:
    """Return a stderr handler with JSON or text formatting based on config."""
    handler: logging.StreamHandler = logging.StreamHandler()  # type: ignore[type-arg]
    if settings.log_format == 'json':
        from pythonjsonlogger.json import JsonFormatter

        handler.setFormatter(fmt=JsonFormatter('%(asctime)s %(levelname)s %(name)s %(message)s'))
    else:
        handler.setFormatter(fmt=logging.Formatter(fmt='%(asctime)s [%(levelname)s] %(name)s: %(message)s'))
    return handler


logging.basicConfig(
    level=logging.INFO,
    handlers=[_build_log_handler()],
)
logger: logging.Logger = logging.getLogger(name=__name__)

scheduler: AsyncIOScheduler = AsyncIOScheduler()


async def _auto_restore_from_backup() -> None:
    """Restore DB from most recent backup if one exists."""
    import asyncio
    from pathlib import Path

    backup_dir: Path = Path(settings.backup_dir)
    if not backup_dir.exists():
        return

    archives: list[Path] = sorted(backup_dir.glob(pattern=f'{settings.mongodb_db}_*.gz'))
    if not archives:
        logger.info(msg='No backup archives found for auto-restore')
        return

    latest: Path = archives[-1]
    logger.info(msg=f'DB empty - restoring from {latest}')

    cmd: list[str] = [
        'mongorestore',
        f'--uri={settings.mongodb_url}',
        f'--archive={latest}',
        '--gzip',
        '--drop',
    ]

    proc: asyncio.subprocess.Process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()

    if proc.returncode != 0:
        logger.error(msg=f'mongorestore failed: {stderr.decode()}')
    else:
        logger.info(msg='DB restored successfully from backup')


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: connect to MongoDB and init Beanie
    client: AsyncIOMotorClient = AsyncIOMotorClient(host=settings.mongodb_url)
    await init_beanie(
        database=client[settings.mongodb_db],
        document_models=[
            Listing,
            SavedSearch,
            PriceHistory,
            NotificationLog,
            UserSettings,
            ScrapeJob,
        ],
    )
    logger.info(msg=f'Connected to MongoDB at {settings.mongodb_url}/{settings.mongodb_db}')
    app.state.started_at = datetime.now(tz=UTC)
    app.state.motor_client = client

    # Auto-restore from backup if DB is empty
    listing_count: int = await Listing.count()
    if listing_count == 0:
        await _auto_restore_from_backup()

    # Mark any orphaned "running" jobs as failed (from previous server crash/restart)
    orphaned: list[ScrapeJob] = await ScrapeJob.find(ScrapeJob.status == JobStatus.RUNNING).to_list()
    for job in orphaned:
        job.status = JobStatus.FAILED
        job.error = 'Server restarted - background task lost'
        job.completed_at = datetime.now(tz=UTC)
        await job.save()
        logger.warning(msg=f'Marked orphaned scrape job {job.id} as failed')

    # Start scheduler
    scheduler.add_job(
        func=poll_listings_job,
        trigger='interval',
        minutes=settings.poll_interval_minutes,
        id=SCHEDULER_JOB_POLL,
        replace_existing=True,
        next_run_time=datetime.now(tz=UTC),
    )
    scheduler.add_job(
        func=cleanup_stale_listings_job,
        trigger='cron',
        hour=3,
        id=SCHEDULER_JOB_CLEANUP,
        replace_existing=True,
    )
    scheduler.add_job(
        func=backup_db_job,
        trigger='cron',
        hour=4,
        id=SCHEDULER_JOB_BACKUP,
        replace_existing=True,
    )
    scheduler.add_job(
        func=enrich_amenities_job,
        trigger='interval',
        minutes=30,
        id=SCHEDULER_JOB_ENRICH,
        replace_existing=True,
        next_run_time=datetime.now(tz=UTC),
    )
    scheduler.start()
    logger.info(msg=f'Scheduler started (poll every {settings.poll_interval_minutes} min)')

    yield

    # Shutdown
    scheduler.shutdown()
    client.close()


app = FastAPI(title='Yad2 Search', lifespan=lifespan)

app.mount(path='/static', app=StaticFiles(directory='app/static'), name='static')

app.include_router(router=pages_router)
app.include_router(router=searches_router)
app.include_router(router=api_router)


@app.get(path='/health')
async def health() -> JSONResponse:
    """Return service health: DB connectivity and uptime."""
    status: str = 'ok'
    db_ok: bool = False

    try:
        result: dict[str, Any] = await app.state.motor_client[settings.mongodb_db].command('ping')
        db_ok: Any | bool = result.get('ok') == 1
    except Exception:
        status = 'degraded'

    uptime_seconds: float = (datetime.now(tz=UTC) - app.state.started_at).total_seconds()

    return JSONResponse(
        content={
            'status': status,
            'db': 'connected' if db_ok else 'unreachable',
            'uptime_seconds': round(number=uptime_seconds, ndigits=1),
        },
    )
