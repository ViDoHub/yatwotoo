"""Background worker process — runs scheduler and picks up pending scrape jobs.

Usage:
    python -m app.worker
"""

import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings
from app.consts import (
    SCHEDULER_JOB_BACKUP,
    SCHEDULER_JOB_CLEANUP,
    SCHEDULER_JOB_ENRICH,
    SCHEDULER_JOB_POLL,
    JobStatus,
)
from app.db import init_db
from app.models import Listing, ScrapeJob
from app.scheduler.jobs import (
    backup_db_job,
    cleanup_stale_listings_job,
    enrich_amenities_job,
    poll_listings_job,
    run_deep_scrape,
)

logger: logging.Logger = logging.getLogger(name=__name__)

JOB_POLL_INTERVAL_SECONDS = 5


async def _auto_restore_from_backup() -> None:
    """Restore DB from most recent backup if DB is empty."""
    backup_dir: Path = Path(settings.backup_dir)
    if not backup_dir.exists():
        return

    archives: list[Path] = sorted(backup_dir.glob(pattern=f'{settings.mongodb_db}_*.gz'))
    if not archives:
        logger.info(msg='No backup archives found for auto-restore')
        return

    latest: Path = archives[-1]
    logger.info(msg=f'DB empty — restoring from {latest}')

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


async def _mark_orphaned_jobs() -> None:
    """Mark jobs left in RUNNING/PENDING state as FAILED (from a previous crash)."""
    orphaned: list[ScrapeJob] = await ScrapeJob.find(
        {'status': {'$in': [JobStatus.RUNNING, JobStatus.PENDING]}},
    ).to_list()
    for job in orphaned:
        job.status = JobStatus.FAILED
        job.error = 'Worker restarted — background task lost'
        job.completed_at = datetime.now(tz=UTC)
        await job.save()
        logger.warning(msg=f'Marked orphaned scrape job {job.id} as failed')


async def _poll_pending_jobs() -> None:
    """Check for PENDING scrape jobs and execute them one at a time."""
    job: ScrapeJob | None = await ScrapeJob.find_one(
        ScrapeJob.status == JobStatus.PENDING,
        sort=[('started_at', 1)],
    )
    if job:
        logger.info(msg=f'Picking up pending scrape job {job.id}')
        await run_deep_scrape(str(job.id))


async def main() -> None:
    """Worker entrypoint: init DB, start scheduler, poll for pending jobs."""
    # Reuse the same log configuration as the web process
    from app.main import _build_log_handler

    logging.basicConfig(level=logging.INFO, handlers=[_build_log_handler()], force=True)

    client = await init_db()

    # Startup housekeeping
    listing_count: int = await Listing.count()
    if listing_count == 0:
        await _auto_restore_from_backup()

    await _mark_orphaned_jobs()

    # Start scheduler
    scheduler: AsyncIOScheduler = AsyncIOScheduler()
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
    logger.info(msg=f'Worker started (poll every {settings.poll_interval_minutes} min)')

    try:
        while True:
            await _poll_pending_jobs()
            await asyncio.sleep(delay=JOB_POLL_INTERVAL_SECONDS)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info(msg='Worker shutting down')
    finally:
        scheduler.shutdown()
        client.close()


if __name__ == '__main__':
    asyncio.run(main())
