# friendtools

A modular, self-hosted web app with genuinely useful tools for a circle of
friends. Every tool lives inside a **group** (your flat, trip, regular crew,
...), and every group has its own members and data. Ships with a Splitwise-style
expense ledger; further tools can be added as independent modules.

## Concepts

- **Users** self-register but must be **approved by an admin** before they can
  sign in.
- **Groups** are top-level circles of friends. A user can be in multiple
  groups and sees them as cards on their dashboard.
- **Tools** (e.g. the Ledger) live inside a group. Every tool operates on all
  members of that group.
- **Admins** are global: they can approve new registrations, promote other
  users to admin, and remove accounts. Group ownership is separate and local
  to each group.

## Stack

- **Backend**: Rust (Axum, sqlx, tokio, jsonwebtoken, argon2, clap)
- **Database**: PostgreSQL 16
- **Frontend**: React + TypeScript + Vite + TailwindCSS, served by nginx
- **i18n**: `react-i18next` with English (default) and German locales
- **Deployment**: Docker Compose

## Quick start (development)

```bash
cp .env.example .env
# Important: set JWT_SECRET to a long random string, e.g.:
#   openssl rand -hex 32
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:8080/api (proxied by nginx)
  or http://localhost:3000 directly

### Bootstrapping the first admin

New accounts always start as `pending` and cannot sign in. To unlock the
system, approve and promote yourself via the backend CLI:

```bash
# 1. Register a normal account via the web UI (you will land on "pending").
# 2. Promote that account to admin (this also approves it):
docker compose exec backend friendtools-backend admin promote you@example.com
```

From then on you can manage everyone else from the **Admin** page in the web
UI (the shield icon in the header, visible only for admins).

Other CLI commands:

```bash
docker compose exec backend friendtools-backend admin list
docker compose exec backend friendtools-backend admin approve someone@example.com
docker compose exec backend friendtools-backend admin demote someone@example.com
docker compose exec backend friendtools-backend admin delete someone@example.com
```

## Project layout

```
.
|-- backend/              Rust backend (Axum)
|   |-- migrations/       SQL migrations (sqlx)
|   `-- src/
|       |-- admin/        Admin endpoints (approve / promote / ...)
|       |-- auth/         Registration, login, JWT middleware
|       |-- cli.rs        `admin ...` subcommands (bootstrapping)
|       |-- groups/       Top-level groups (create/list/join/detail)
|       `-- splitwise/    Ledger tool (expenses scoped to a group)
|-- frontend/             React SPA (Vite)
|   `-- src/
|       |-- api/          Typed API client
|       |-- i18n/         Locale files (en is the source of truth)
|       |-- pages/        Top-level pages (dashboard, group, admin, auth)
|       `-- tools/        One subdirectory per tool
`-- docker-compose.yml
```

## Adding a new tool

1. **Backend**: create a new module under `backend/src/<tool>/` and nest its
   router inside `backend/src/groups/mod.rs` (under
   `/:id/<tool>`). Handlers receive the group id via `Path` from the parent
   route.
2. **Migrations**: add a file under `backend/migrations/` (e.g.
   `0002_<tool>.sql`). sqlx migrations run automatically on startup.
3. **Frontend**: create `frontend/src/tools/<tool>/` with your pages and
   register the tool in `frontend/src/tools/index.ts`. The group home page
   renders a card and the router mounts the routes automatically under
   `/groups/:groupId/<tool>/...`.
4. **Translations**: add the tool's strings to `frontend/src/i18n/en.ts` and
   `frontend/src/i18n/de.ts` (the German file is type-checked against the
   English one, so missing keys fail the build).

## Internationalisation

- Default language: English.
- Supported languages: English (`en`), German (`de`).
- The active language is auto-detected from the browser on first visit and
  then persisted in `localStorage` under `friendtools.lang`.
- Users can switch languages via the globe toggle in the header.

## Security

- Password hashing: argon2id (via the `argon2` crate).
- Auth: JWT (HS256); the signing secret is taken from `JWT_SECRET`. The auth
  middleware additionally verifies that the user still exists and is approved
  on every request - revoked/demoted users lose access even if their token
  has not expired yet.
- Registration: open, but accounts start as `pending` and cannot sign in
  until approved by an admin.
- CORS: configurable via `CORS_ORIGIN` (comma-separated list of allowed
  origins, or leave unset during local same-origin development).

## Later: Tauri v2 desktop/mobile app

The frontend is a standard SPA and can be embedded in Tauri v2 without
changes. Set `VITE_API_URL` at build time to point the app at your
production backend.
