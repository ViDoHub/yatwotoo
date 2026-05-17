# YaTwoToo - Yad2 Real Estate Aggregator

A real estate aggregator that scrapes Yad2 (Israel's largest property marketplace), stores listings, and provides advanced filtering, map visualization, price-drop detection, and notifications.

## What It Does

- **Scrapes Yad2** every 15 minutes for rent, sale, and new project listings across all Israeli regions
- **Kanban board** — drag-and-drop pipeline: Review → Get Contacts → Call → Visit
- **Visit scheduling** with Google Calendar sync
- **Map view** with clustered markers and geo-polygon search
- **Saved searches** with configurable filters (city, rooms, price, sqm, amenities, geo-area)
- **Price-drop detection** — tracks price history and flags decreases
- **Notifications** via WhatsApp (Callmebot), Telegram, or Email when new matches appear
- **Amenity enrichment** — background job fetches detailed amenity data (parking, elevator, shelter, etc.)
- **Stale listing cleanup** — marks inactive after 3 days, deletes after 7 days

## Project Structure

```
yatwotoo/
├── python/          ← Backend: FastAPI + MongoDB (Docker)
│   ├── app/         (routes, scraper, scheduler, notifications)
│   ├── tests/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── pyproject.toml
└── next/            ← Frontend: Next.js + Supabase (Vercel)
    ├── src/
    │   ├── app/         (pages, API routes, auth callback)
    │   ├── components/  (board, cards, map, navbar)
    │   ├── lib/         (supabase clients, scraper, search, notifications)
    │   └── types/       (TypeScript DB types)
    ├── supabase/
    │   ├── config.toml  (local Supabase config, Inbucket, auth)
    │   ├── migrations/  (SQL migrations)
    │   └── schema.sql   (reference schema)
    ├── tests/
    ├── vercel.json      (cron schedules)
    └── package.json
```

## Python App (Backend)

Self-hosted Docker stack with FastAPI, MongoDB, and background workers.

### Tech Stack

| Layer | Tech |
|-------|------|
| Web framework | FastAPI + Jinja2 templates |
| ODM | Beanie (async MongoDB) |
| Database | MongoDB 7 |
| Scheduler | APScheduler |
| HTTP client | httpx (async, rate-limited) |
| Frontend | HTMX, Tailwind CSS, Leaflet.js |
| Package manager | uv |

### Quick Start

```bash
cd python
cp .env.example .env
# Edit .env for notifications (optional)
docker compose up -d --build
```

Available at **http://localhost:8000**.

### Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `poll_listings_job` | Every 15 min | Incremental scrape of all regions/deal types |
| `enrich_amenities_job` | Every 30 min | Fetches detail pages for amenity data |
| `cleanup_stale_listings_job` | Daily 03:00 | Marks inactive (3d), removes stale (7d) |
| `backup_db_job` | Daily 04:00 | mongodump to `./backups/` |

### Development

```bash
cd python
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest tests/ -x -q
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `POLL_INTERVAL_MINUTES` | `15` | Minutes between scrape cycles |
| `SCRAPE_CONCURRENCY` | `3` | Parallel scrape workers |
| `CALLMEBOT_PHONE` | | WhatsApp number for notifications |
| `CALLMEBOT_APIKEY` | | Callmebot API key |
| `BACKUP_RETENTION_DAYS` | `7` | Days to keep old backups |

---

## Next.js App (Frontend)

Modern frontend deployed on Vercel with Supabase (PostgreSQL) as the database.

### Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Database | Supabase (PostgreSQL) |
| UI | shadcn/ui, Tailwind CSS 4 |
| Board | @dnd-kit (drag-and-drop) |
| Maps | Leaflet.js |
| Testing | Vitest |
| Deployment | Vercel |

### Prerequisites

- Node.js 18+
- Docker (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase` works without global install)

### Local Development Setup

1. **Start local Supabase** (applies migrations automatically):

   ```bash
   cd next
   npx supabase start
   ```

   First run pulls Docker images (~1 GB). On subsequent runs, it starts from backup instantly.

2. **Seed the database** (optional — for real listing data):

   Get `seed.sql` from a teammate (too large for git), or dump from the remote DB:

   ```bash
   npx supabase db dump --data-only -f supabase/seed.sql \
     --db-url "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[POOLER_HOST]:5432/postgres"
   ```

   Then reset to apply the seed:

   ```bash
   npx supabase db reset
   ```

3. **Configure environment**:

   ```bash
   cp .env.example .env.local
   ```

   Fill in the keys from `npx supabase status`:
   - `NEXT_PUBLIC_SUPABASE_URL` → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` → Secret key

4. **Install and run**:

   ```bash
   npm install
   npm run dev
   ```

   Available at **http://localhost:3000**.

### Authentication

The app uses Supabase Auth with **magic link (email OTP)** and **Google OAuth**.

- **Middleware** (`src/middleware.ts`) refreshes the session on every request and redirects unauthenticated users to `/login`. API routes handle auth themselves via `getAuthenticatedClient()`.
- **Row Level Security (RLS)** is enabled on user-scoped tables (`board_listings`, `saved_searches`, `notification_logs`, `user_settings`, `hidden_listings`). Each row has a `user_id` column filtered by `auth.uid()`.
- Shared data tables (`listings`, `price_history`, `scrape_jobs`) use the **admin client** (service role key, bypasses RLS).

#### Supabase Client Architecture

| Client | File | Usage |
|--------|------|-------|
| `createAuthClient()` | `lib/supabase/server.ts` | Server Components & API routes — cookie-based user sessions |
| `createBrowserClient()` | `lib/supabase/client.ts` | Client Components — browser-side auth |
| `createAdminClient()` | `lib/supabase/server.ts` | Cron jobs, scraper, shared data — bypasses RLS |
| `getAuthenticatedClient()` | `lib/supabase/auth-helper.ts` | API route guard — returns `{supabase, user}` or 401 |

#### Magic Link Login (Local Dev)

Magic link emails are **not actually sent** in local dev. They go to **Inbucket**, a built-in email testing server:

1. Go to `/login` and enter any email address
2. Open **http://localhost:54324** (Inbucket web UI)
3. Find the magic link email in the inbox
4. Click the link — it redirects to `/auth/callback` and logs you in

> **Tip:** Inbucket accepts any email address — no real mailbox needed. Use `test@test.com` or anything you like.

#### Google OAuth (Production)

Requires a GCP OAuth 2.0 client configured in the Supabase dashboard under Authentication → Providers → Google.

### Local Supabase Services

After running `npx supabase start`, these services are available:

| Service | URL | Description |
|---------|-----|-------------|
| API (PostgREST) | http://127.0.0.1:54321 | Supabase REST API |
| Database | postgresql://postgres:postgres@127.0.0.1:54322/postgres | Direct PostgreSQL connection |
| Studio | http://127.0.0.1:54323 | Database admin UI (tables, SQL editor, auth users) |
| Inbucket | http://127.0.0.1:54324 | Email testing (magic link emails land here) |

Run `npx supabase status` to see all URLs and API keys.

### Kanban Board

The board has 4 columns with special behaviors on drag-and-drop:

| Move | Behavior |
|------|----------|
| Review → Get Contacts | Opens Yad2 listing page + contact info popup (skipped if phone already saved) |
| Get Contacts → Call | Direct move (contact info was entered in previous step) |
| Any → Visit | Visit date/time picker popup + Google Calendar sync option |
| Edit contacts | Click "Edit" or "+ Add contact info" on any card (from Get Contacts onward) |

### Supabase Local Commands

| Command | Description |
|---------|-------------|
| `npx supabase start` | Start local Supabase containers |
| `npx supabase stop` | Stop containers (data persists in Docker volumes) |
| `npx supabase db reset` | Drop and recreate DB from migrations + seed |
| `npx supabase status` | Show local URLs, keys, and service status |
| `npx supabase db query "SELECT ..."` | Run SQL against local DB |
| `npx supabase migration new <name>` | Create a new migration file |
| `npx supabase stop --project-id yatwotoo-next` | Force stop if port conflicts |

### Database Migrations

Migrations live in `next/supabase/migrations/` and are applied automatically on `supabase start` or `supabase db reset`.

| Migration | Description |
|-----------|-------------|
| `20240101000000_init.sql` | Core schema: listings, price_history, scrape_jobs, saved_searches, etc. |
| `20250517000000_board_listings.sql` | Kanban board table with column/position tracking |
| `20250517100000_add_user_id_rls.sql` | Multi-user: adds `user_id` + RLS policies to user-scoped tables |

To create a new migration:

```bash
cd next
npx supabase migration new my_change_name
# Edit supabase/migrations/<timestamp>_my_change_name.sql
npx supabase db reset  # Apply locally
```

To push migrations to the remote (production) database:

```bash
npx supabase db push --db-url "postgresql://..."
```

### Production Deployment (Vercel)

Set these environment variables in Vercel (or in `.env.production` locally):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Remote Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Remote anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Remote service role/secret key |

### Cron Jobs (Vercel)

Configured in `next/vercel.json`:

| Job | Schedule | Description |
|-----|----------|-------------|
| `/api/cron/poll` | Every 15 min | Scrapes Yad2 and upserts to Supabase |
| `/api/cron/enrich` | :05, :35 past hour | Enriches amenities for 50 listings/batch |
| `/api/cron/cleanup` | Daily 03:00 | Marks inactive (3d), deletes stale (7d) |

### Environment Variables

---

## Data Flow

The Python and Next.js apps can run independently:

- **Python app**: Scrapes Yad2 → MongoDB → serves UI at :8000
- **Next.js app**: Scrapes Yad2 → Supabase → serves UI at :3000 (or Vercel)

Both use the same Yad2 API client logic and identical scraping schedules.

## Backup & Restore

### Python / MongoDB

```bash
# Manual backup
cd python
mongodump --uri="mongodb://localhost:27017" --db=yad2search \
  --archive=backups/yad2search_$(date +%Y%m%d_%H%M%S).gz --gzip

# Restore inside container
docker compose exec app mongorestore --uri="mongodb://mongo:27017" \
  --archive=/app/backups/yad2search_20260507.gz --gzip --drop
```

### Next.js / Supabase

```bash
# Dump data from remote to local seed file
cd next
npx supabase db dump --data-only -f supabase/seed.sql \
  --db-url "postgresql://postgres.[REF]:[PASS]@[POOLER]:5432/postgres"

# Reset local DB with latest migrations + seed
npx supabase db reset
```

---

## Testing

### Python

```bash
cd python
uv run pytest tests/ -x -q
```

Covers: API routes, scraper, search engine, sync, notifications, hidden listings, models, scheduler jobs.

### Next.js

```bash
cd next
npm test
```

Uses **Vitest** with mocked Supabase. Covers: API routes, scraper parsing, search engine filters/sorting/pagination/geo, sync & price history, notifications & dedup, hidden listings, board API, models & constants (133 tests across 9 files).
