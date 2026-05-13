# Phase 6: Multi-User Support

## Summary

Shared listings DB + per-user saved searches & notification settings.
Auth: passwordless email magic link (JWT-based session cookies).
Scale target: hundreds of users.

## New dependencies

- `pyjwt` — sign/verify magic link tokens and session cookies

## Data model changes

### New: `User` document

- `email: str` (unique, indexed)
- `display_name: str = ''`
- `is_active: bool = True`
- `created_at: datetime`
- `last_login_at: datetime | None`

### Modified: `SavedSearch`

- Add `user_id: PydanticObjectId` (indexed) — FK to User

### Modified: `NotificationLog`

- Add `user_id: PydanticObjectId` (indexed)

### Modified: `UserSettings`

- Add `user_id: PydanticObjectId` (unique, indexed) — one per user
- Remove singleton pattern (`find_one()` → `find_one(user_id=...)`)

## Auth flow

1. User enters email at `/login`
2. Server generates JWT (sub=email, exp=15min), sends email with `/auth/verify?token=...`
3. On click: verify JWT, find-or-create User, set session cookie (JWT, httponly, 30 days)
4. Middleware extracts user from cookie → `request.state.user`
5. Protected routes use `get_current_user()` dependency

## Steps

### Phase 6a: User model + auth routes

1. Add `pyjwt` to pyproject.toml
2. Add `JWT_SECRET`, `SITE_URL` to `app/config.py` Settings
3. Create `User` document in `app/models.py`
4. Create `app/auth.py` — `create_magic_token(email)`, `verify_magic_token(token)`, `create_session_cookie(user)`, `get_current_user(request)` FastAPI dependency
5. Create auth routes: `GET /login`, `POST /login`, `GET /auth/verify?token=`, `POST /logout`
6. Create `app/templates/login.html`
7. Add `User` to `DOCUMENT_MODELS` in `app/db.py`

### Phase 6b: Middleware + route protection

8. Add `AuthMiddleware` to `app/main.py` — extracts user from cookie → `request.state.user`
9. Public routes: `/login`, `/auth/verify`, `/health`, `/static`
10. All other routes redirect to `/login` if unauthenticated
11. Pass `user` to all template contexts via `base.html` (show email, logout link)

### Phase 6c: Scope data to user (depends on 6a+6b)

12. Add `user_id: PydanticObjectId` (indexed) to `SavedSearch`, `UserSettings`, `NotificationLog`
13. Update `routes/pages.py` — dashboard queries filter by `user_id`
14. Update `routes/searches.py` — create/delete/settings filter by `user_id`
15. Update `notifications/dispatcher.py` — accept `user_id`, load that user's settings

### Phase 6d: Worker notification dispatch (depends on 6c)

16. Update `scheduler/jobs.py` `poll_listings_job` — iterate ALL users' saved searches, dispatch with per-user settings
17. `NotificationLog` entries carry `user_id`

### Phase 6e: Magic link email (parallel with 6b)

18. Add `send_magic_link_email(to, url)` to `app/notifications/email.py`
19. If SMTP not configured, log the magic link URL to stdout (dev mode)

### Phase 6f: Data migration (after 6c)

20. Worker startup: idempotent migration — create default "admin" User, backfill `user_id` on existing SavedSearch/NotificationLog/UserSettings docs

## Files to modify

- `app/models.py` — add `User` document, add `user_id` field to SavedSearch/NotificationLog/UserSettings
- `app/auth.py` — NEW: JWT token creation/verification, `get_current_user()` dependency
- `app/main.py` — add `AuthMiddleware`
- `app/config.py` — add `JWT_SECRET`, `SITE_URL`
- `app/db.py` — add `User` to `DOCUMENT_MODELS`
- `app/routes/pages.py` — filter by `user_id`, pass `user` to templates
- `app/routes/searches.py` — scope all operations to `user_id`
- `app/routes/api.py` — keep scrape global, scope status queries
- `app/notifications/dispatcher.py` — per-user settings lookup
- `app/scheduler/jobs.py` — multi-user notification loop in `poll_listings_job`
- `app/notifications/email.py` — add `send_magic_link_email()`
- `app/templates/base.html` — user display + logout
- `app/templates/login.html` — NEW
- `pyproject.toml` — add `pyjwt`

## Verification

1. `uv run python -m pytest` — all existing tests still pass (backwards-compat migration)
2. New tests: auth flow (login, verify, expired token, invalid token, logout)
3. New tests: scoped queries (user A can't see user B's searches)
4. New tests: worker dispatches to correct user's notification channels
5. Manual: full flow — login → create search → receive notification

## Decisions

- JWT in httponly secure cookie (not localStorage) — XSS-safe
- No passwords — passwordless magic-link only
- Listings + ScrapeJob remain global (shared infrastructure)
- `/api/scrape` — any authenticated user can trigger (it's global data)
- Session: 30 days, magic link: 15 min expiry
- Migration: existing data assigned to auto-created admin user

## Migration strategy

- Existing single-user data gets a "default admin" User created on first startup
- All existing SavedSearch/NotificationLog/UserSettings docs get that user's ID backfilled
- Migration runs once in worker startup (idempotent)
