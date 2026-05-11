# YaTwoToo - Yad2 Real Estate Aggregator

A self-hosted web app that continuously scrapes Yad2 (Israel's largest real estate marketplace), stores listings in MongoDB, and provides advanced filtering, map visualization, price-drop detection, and WhatsApp/Telegram notifications.

## What It Does

- **Scrapes Yad2** every 15 minutes for rent, sale, and new project listings across all Israeli regions
- **Map view** with clustered markers and geo-polygon search (Leaflet + MarkerCluster)
- **Saved searches** with configurable filters (city, rooms, price, sqm, amenities, geo-area)
- **Price-drop detection** - tracks price history and flags decreases
- **Notifications** via WhatsApp (Callmebot), Telegram, or Email when new matches appear
- **Amenity enrichment** - background job fetches detailed amenity data (parking, elevator, shelter, etc.)
- **Automated backups** - nightly mongodump with configurable retention
- **Auto-restore** - on first boot, restores from the latest backup if the DB is empty

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose                                     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  app (python:3.12-slim + uv)                  │  │
│  │                                               │  │
│  │  FastAPI + Uvicorn                            │  │
│  │  ├── routes/pages.py      (Jinja2 HTML)       │  │
│  │  ├── routes/api.py        (JSON endpoints)    │  │
│  │  ├── routes/searches.py   (saved searches)    │  │
│  │  ├── scraper/yad2_client  (httpx -> Yad2 API) │  │
│  │  ├── scraper/sync.py      (upsert logic)      │  │
│  │  ├── scheduler/jobs.py    (APScheduler tasks)  │  │
│  │  └── notifications/       (WhatsApp/TG/Email) │  │
│  │                                               │  │
│  │  Static: Tailwind CSS, Leaflet.js, HTMX,     │  │
│  │          TomSelect, Alpine.js                 │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │                               │
│  ┌──────────────────▼────────────────────────────┐  │
│  │  mongo (mongo:7)                              │  │
│  │  Database: yad2search                         │  │
│  │  Collections: listings, price_history,        │  │
│  │    saved_searches, scrape_jobs, user_settings │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Key technology choices:**

| Layer | Tech |
|-------|------|
| Web framework | FastAPI + Jinja2 templates |
| ODM | Beanie (async, on top of Motor) |
| Database | MongoDB 7 |
| Scheduler | APScheduler (AsyncIOScheduler) |
| HTTP client | httpx (async, with semaphore rate-limiting) |
| Frontend | HTMX, Tailwind CSS, Leaflet.js, TomSelect |
| Package manager | uv (fast Python installer) |
| Container | Docker multi-stage (copies mongodump/mongorestore from mongo:7) |

## Quick Start

### Prerequisites

- Docker & Docker Compose v2+

### 1. Clone and configure

```bash
git clone <repo-url> && cd yad22
cp .env.example .env
```

Edit `.env` if you want notifications:

```env
CALLMEBOT_PHONE=+972501234567
CALLMEBOT_APIKEY=your_key
POLL_INTERVAL_MINUTES=15
```

### 2. Start

```bash
docker compose up -d --build
```

The app will be available at **http://localhost:8000**.

On first start:
1. Entrypoint waits for MongoDB to become healthy
2. If a backup exists in `./backups/`, it auto-restores
3. Scrape and amenity-enrichment jobs fire immediately
4. Subsequent polls run every 15 minutes

### 3. Stop

```bash
docker compose down
```

Data persists in the `mongo_data` Docker volume. Backups persist in `./backups/`.

## Development

```bash
# Install dependencies (requires uv: https://docs.astral.sh/uv/)
uv sync

# Run locally (needs a local MongoDB on :27017)
uv run uvicorn app.main:app --reload --port 8000

# Run tests
uv run pytest tests/ -x -q
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGODB_DB` | `yad2search` | Database name |
| `POLL_INTERVAL_MINUTES` | `15` | Minutes between scrape cycles |
| `REQUEST_DELAY_MIN` | `0.3` | Min delay between API requests (seconds) |
| `REQUEST_DELAY_MAX` | `0.8` | Max delay between API requests (seconds) |
| `SCRAPE_CONCURRENCY` | `3` | Parallel scrape workers |
| `CALLMEBOT_PHONE` | | WhatsApp number for notifications |
| `CALLMEBOT_APIKEY` | | Callmebot API key |
| `BACKUP_RETENTION_DAYS` | `7` | Days to keep old backups |

## Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `poll_listings_job` | Every 15 min (immediate on start) | Incremental scrape of all regions/deal types |
| `enrich_amenities_job` | Every 30 min (immediate on start) | Fetches detail pages for amenity data |
| `cleanup_stale_listings_job` | Daily at 03:00 UTC | Marks listings not seen for 3 days as inactive |
| `backup_db_job` | Daily at 04:00 UTC | mongodump to `./backups/`, prunes old archives |

## Backup & Restore

Backups are gzipped mongodump archives stored in `./backups/`.

```bash
# Manual backup
mongodump --uri="mongodb://localhost:27017" --db=yad2search \
  --archive=backups/yad2search_$(date +%Y%m%d_%H%M%S).gz --gzip

# Manual restore (inside container)
docker compose exec app mongorestore --uri="mongodb://mongo:27017" \
  --archive=/app/backups/yad2search_20260507.gz --gzip --drop
```
