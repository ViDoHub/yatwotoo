"""Tests for the background worker functions and run_deep_scrape."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.models import ScrapeJob
from app.scheduler.jobs import run_deep_scrape
from app.worker import _mark_orphaned_jobs, _poll_pending_jobs

pytestmark = pytest.mark.asyncio


class TestMarkOrphanedJobs:
    """Test _mark_orphaned_jobs marks stale RUNNING/PENDING jobs as FAILED."""

    @pytest.mark.parametrize('status', ['running', 'pending'])
    async def test_marks_orphaned_status_as_failed(self, status):
        job = await ScrapeJob(status=status).insert()

        await _mark_orphaned_jobs()

        refreshed = await ScrapeJob.get(job.id)
        assert refreshed.status == 'failed'
        assert refreshed.error is not None
        assert refreshed.completed_at is not None

    async def test_leaves_completed_jobs_alone(self):
        job = await ScrapeJob(status='completed', completed_at=datetime.now(tz=UTC)).insert()

        await _mark_orphaned_jobs()

        refreshed = await ScrapeJob.get(job.id)
        assert refreshed.status == 'completed'

    async def test_no_orphans_is_noop(self):
        """Should not error when there are no orphaned jobs."""
        await _mark_orphaned_jobs()


class TestPollPendingJobs:
    """Test _poll_pending_jobs picks up PENDING scrape jobs."""

    @pytest.fixture()
    def mock_run_deep_scrape(self):
        with patch('app.worker.run_deep_scrape', new_callable=AsyncMock) as mock_scrape:
            yield mock_scrape

    async def test_picks_up_pending_job(self, mock_run_deep_scrape):
        job = await ScrapeJob(status='pending').insert()

        await _poll_pending_jobs()
        mock_run_deep_scrape.assert_called_once_with(str(job.id))

    async def test_picks_oldest_pending_first(self, mock_run_deep_scrape):
        job1 = await ScrapeJob(status='pending', started_at=datetime(2024, 1, 1, tzinfo=UTC)).insert()
        await ScrapeJob(status='pending', started_at=datetime(2024, 6, 1, tzinfo=UTC)).insert()

        await _poll_pending_jobs()
        mock_run_deep_scrape.assert_called_once_with(str(job1.id))

    @pytest.mark.parametrize('status', ['completed', 'running', 'failed'])
    async def test_skips_non_pending_status(self, mock_run_deep_scrape, status):
        kwargs = {'status': status}
        if status == 'completed':
            kwargs['completed_at'] = datetime.now(tz=UTC)
        await ScrapeJob(**kwargs).insert()

        await _poll_pending_jobs()
        mock_run_deep_scrape.assert_not_called()


class TestRunDeepScrape:
    """Test run_deep_scrape job lifecycle."""

    async def test_transitions_pending_to_completed(self):
        """Job should go PENDING → RUNNING → COMPLETED when scrape succeeds."""
        job = await ScrapeJob(status='pending').insert()

        with (
            patch('app.scheduler.jobs._deep_fetch_region', new_callable=AsyncMock) as mock_fetch,
        ):
            mock_fetch.return_value = None

            await run_deep_scrape(str(job.id))

        refreshed = await ScrapeJob.get(job.id)
        assert refreshed.status == 'completed'
        assert refreshed.completed_at is not None

    async def test_transitions_to_failed_on_error(self):
        """Job should go to FAILED when _deep_fetch_region raises."""
        job = await ScrapeJob(status='pending').insert()

        with patch('app.scheduler.jobs._deep_fetch_region', new_callable=AsyncMock) as mock_fetch:
            mock_fetch.side_effect = RuntimeError('API down')

            await run_deep_scrape(str(job.id))

        refreshed = await ScrapeJob.get(job.id)
        assert refreshed.status == 'failed'
        assert refreshed.error is not None
        assert 'API down' in refreshed.error
        assert refreshed.completed_at is not None

    async def test_nonexistent_job_id_is_noop(self):
        """Should return silently for a missing job ID."""
        await run_deep_scrape('000000000000000000000000')

    async def test_sets_running_before_scrape(self):
        """Job status should be RUNNING while scraping is in progress."""
        job = await ScrapeJob(status='pending').insert()
        observed_status: list[str] = []

        original_deep_fetch = AsyncMock()

        async def capture_status(*args, **kwargs):
            mid_job = await ScrapeJob.get(job.id)
            observed_status.append(mid_job.status)

        original_deep_fetch.side_effect = capture_status

        with patch('app.scheduler.jobs._deep_fetch_region', original_deep_fetch):
            await run_deep_scrape(str(job.id))

        assert 'running' in observed_status
