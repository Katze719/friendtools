# friendflow

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

## Quick start

```bash
./bootstrap.sh
docker compose up -d --build
```

`bootstrap.sh` is idempotent and sets up the host-local config files from
their committed templates:

- `docker-compose.example.yml` -> `docker-compose.yml` (gitignored, so your
  per-host tweaks won't conflict with future `git pull`s)
- `.env.example` -> `.env` (gitignored), with a freshly generated
  `JWT_SECRET`
- `./data/postgres` and `./data/tls` bind-mount targets

Review `.env` and `docker-compose.yml` before starting and adjust for your
host (domain, ports, CORS, ...).

- Frontend: http://localhost:8080
- Backend API: http://localhost:8080/api (proxied by nginx). The backend
  is not exposed on the host in the default compose setup.

### Upgrading an existing checkout (one-time)

`docker-compose.yml` used to be committed. It is now gitignored and
generated from `docker-compose.example.yml`. If you already have a working
checkout with local changes in `docker-compose.yml`, back it up before
pulling:

```bash
cp docker-compose.yml docker-compose.local.yml
git pull                         # removes the tracked docker-compose.yml
mv docker-compose.local.yml docker-compose.yml
# optionally merge any new defaults from docker-compose.example.yml by hand
```

From then on, `git pull` will never touch your compose file.

### Bootstrapping the first admin

New accounts always start as `pending` and cannot sign in. To unlock the
system, approve and promote yourself via the backend CLI:

```bash
# 1. Register a normal account via the web UI (you will land on "pending").
# 2. Promote that account to admin (this also approves it):
docker compose exec backend friendflow-backend admin promote you@example.com
```

From then on you can manage everyone else from the **Admin** page in the web
UI (the shield icon in the header, visible only for admins).

Other CLI commands:

```bash
docker compose exec backend friendflow-backend admin list
docker compose exec backend friendflow-backend admin approve someone@example.com
docker compose exec backend friendflow-backend admin demote someone@example.com
docker compose exec backend friendflow-backend admin delete someone@example.com
```

## TLS / HTTPS

The default compose stack serves plain HTTP on port `8080`. For a public
deployment you have three sensible options; pick whichever fits your setup.

### Option 1 — Cloudflare proxy + Cloudflare Origin Certificate (recommended)

If you front the domain with Cloudflare (orange cloud), create a free
**15-year Origin Certificate** under
*SSL/TLS -> Origin Server -> Create Certificate* and enable
*SSL/TLS -> Overview -> Full (strict)*.

1. Drop the two files from Cloudflare into `./data/tls/`:
   ```
   ./data/tls/origin.pem   # the certificate Cloudflare shows you
   ./data/tls/origin.key   # the private key; chmod 600
   ```
2. In your local `docker-compose.yml` (the one `bootstrap.sh` generated for
   you), uncomment the TLS block under the `frontend` service:
   ```yaml
   frontend:
     ports:
       - "8080:80"
       - "443:443"
     volumes:
       - ./data/tls:/etc/nginx/tls:ro
       - ./frontend/nginx.tls.conf:/etc/nginx/conf.d/default.conf:ro
   ```
   The mounted `nginx.tls.conf` replaces the default config and listens on
   both 80 (redirect) and 443 (TLS), proxying `/api/` to the backend as
   before.
3. `docker compose up -d` and hit `https://your-domain/`.
4. Consider restricting inbound 80/443 on the VPS to
   [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) so scanners
   can't reach your origin directly.
5. Update `CORS_ORIGIN` in `.env` to the public URL, e.g.
   `https://friendflow.site,https://www.friendflow.site`.

### Option 2 — Cloudflare Tunnel (no open inbound ports)

Run `cloudflared` as an additional compose service with a tunnel token and
point the public hostname at `http://frontend:80`. The origin keeps all
ports closed; TLS is fully handled by Cloudflare. No changes to the nginx
config are necessary, just remove the `ports:` mapping on the `frontend`
service (leave `expose: - "80"`).

### Option 3 — Let's Encrypt directly

If you're not using Cloudflare, put a TLS-terminating reverse proxy
(Caddy, Traefik, or nginx + certbot) in front of the frontend container
and let it obtain certificates via ACME. The frontend container itself can
stay HTTP-only in that case.

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
|   |-- nginx.conf        Default HTTP-only nginx config (baked into image)
|   |-- nginx.tls.conf    Optional HTTPS config (mounted, see TLS section)
|   `-- src/
|       |-- api/          Typed API client
|       |-- i18n/         Locale files (en is the source of truth)
|       |-- pages/        Top-level pages (dashboard, group, admin, auth)
|       `-- tools/        One subdirectory per tool
|-- bootstrap.sh                One-shot setup for fresh checkouts
|-- docker-compose.example.yml  Template (tracked)
`-- docker-compose.yml          Per-host copy (gitignored)
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
  then persisted in `localStorage` under `friendflow.lang`.
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
