<p align="center">
  <img src="frontend/public/og-image.jpg" alt="friendflow" width="820" />
</p>

<h1 align="center">friendflow</h1>

<p align="center">
  <em>A modular, self-hosted web app with genuinely useful tools for a circle of friends.</em>
</p>

<p align="center">
  <img alt="Rust" src="https://img.shields.io/badge/backend-Rust%20%2B%20Axum-b7410e?logo=rust&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/frontend-React%20%2B%20Vite-0ea5e9?logo=react&logoColor=white">
  <img alt="Postgres" src="https://img.shields.io/badge/db-PostgreSQL%2016-336791?logo=postgresql&logoColor=white">
  <img alt="Docker Compose" src="https://img.shields.io/badge/deploy-Docker%20Compose-2496ED?logo=docker&logoColor=white">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-EN%20%7C%20DE-3f3f46">
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-yes-22c55e">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue">
</p>

Every tool lives inside a **group** (your flat, trip, regular crew, ...), and
every group has its own members and data. Ships with four tools out of the box
- a Splitwise-style expense ledger, trip planning, a shared calendar, and
shopping lists - and is designed so you can bolt on more as independent modules.

---

## Contents

- [Concepts](#concepts)
- [What you get](#what-you-get)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Bootstrapping the first admin](#bootstrapping-the-first-admin)
- [TLS / HTTPS](#tls--https)
- [Project layout](#project-layout)
- [Adding a new tool](#adding-a-new-tool)
- [Internationalisation](#internationalisation)
- [Security](#security)
- [Later: Tauri v2 desktop/mobile app](#later-tauri-v2-desktopmobile-app)
- [License](#license)

---

## Concepts

- **Users** self-register. Whether they need admin approval before signing
  in is controlled by `REGISTRATION_MODE` (see
  [Configuration](#configuration)).
- **Groups** are top-level circles of friends. A user can be in multiple
  groups and sees them as cards on their dashboard.
- **Tools** (e.g. the ledger) live inside a group. Every tool operates on
  all members of that group.
- **Admins** are global: they can approve new registrations, promote other
  users to admin, and remove accounts. Group ownership is separate and
  local to each group.

## What you get

| Tool                 | What it does                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| 💸 **Ledger**        | Splitwise-style shared expenses per group. Log who paid, split unevenly, settle up in a tap.              |
| ✈️ **Trips**         | Plan multiple trips per group. Collect links, build day-by-day itineraries, keep a shared packing list.   |
| 📅 **Calendar**      | Month & agenda views shared with the whole group. Trip itinerary entries show up here automatically.     |
| 🛒 **Shopping**      | Real-time lists for the flat or the next trip. Check things off together.                                |

Plus: installable as a PWA on iOS & Android, dark mode, English & German, an
optional public marketing landing page, and a CLI for bootstrapping admins.

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

- `docker-compose.example.yml` → `docker-compose.yml` (gitignored, so your
  per-host tweaks won't conflict with future `git pull`s)
- `.env.example` → `.env` (gitignored), with a freshly generated
  `JWT_SECRET`
- `./data/postgres` and `./data/tls` bind-mount targets

Review `.env` and `docker-compose.yml` before starting and adjust for your
host (domain, ports, CORS, ...).

- Frontend: <http://localhost:8080>
- Backend API: <http://localhost:8080/api> (proxied by nginx). The backend
  is not exposed on the host in the default compose setup.

## Configuration

All configuration lives in `.env`. The table below covers the knobs most
deployments need:

| Variable             | Default        | What it does                                                                                                                                                            |
| -------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`      | `friendflow`   | Postgres role used by the backend.                                                                                                                                      |
| `POSTGRES_PASSWORD`  | -              | Postgres password. **Change before exposing to the internet.**                                                                                                          |
| `POSTGRES_DB`        | `friendflow`   | Postgres database name.                                                                                                                                                 |
| `JWT_SECRET`         | -              | Min. 32 chars. `bootstrap.sh` generates one for you.                                                                                                                    |
| `JWT_EXPIRY_HOURS`   | `168`          | How long login tokens stay valid.                                                                                                                                       |
| `CORS_ORIGIN`        | localhost:8080 | Comma-separated list of allowed origins. Set this to your public URL in production.                                                                                     |
| `REGISTRATION_MODE`  | `approval`     | `approval` = new sign-ups wait for an admin; `open` = new sign-ups are auto-approved and can log in immediately.                                                        |
| `APP_BASE_URL`       | first `CORS_ORIGIN` | Public URL of the frontend. Used to build clickable links in outbound emails (currently only password reset).                                                     |
| `SMTP_HOST`          | *(empty)*      | Hostname of the SMTP relay for transactional emails. Leaving it empty disables password recovery; the "Forgot password?" link won't appear on the login screen.         |
| `SMTP_PORT`          | `587` / `465` / `25` | SMTP port. Defaults pick sensibly based on `SMTP_ENCRYPTION`.                                                                                                     |
| `SMTP_ENCRYPTION`    | `starttls`     | `starttls` (upgrade on port 587), `tls` (implicit TLS, usually 465) or `none` (plaintext, dev only).                                                                    |
| `SMTP_USERNAME`      | *(empty)*      | Optional SMTP auth user. Required by most providers.                                                                                                                    |
| `SMTP_PASSWORD`      | *(empty)*      | Optional SMTP auth password / API key.                                                                                                                                  |
| `SMTP_FROM`          | -              | Mandatory when SMTP is enabled. Bare address (`noreply@example.com`) or full mailbox (`friendflow <noreply@example.com>`).                                              |
| `LANDING_MODE`       | `login`        | `login` = unauthenticated visitors are sent straight to the sign-in form; `landing` = they see a public marketing page explaining friendflow, with sign-in / sign-up in the top right. |
| `VITE_API_URL`       | *(empty)*      | Leave empty when running the bundled nginx proxy. Only set for non-docker dev or a Tauri build.                                                                         |
| `RUST_LOG`           | `info`         | Standard `tracing`/`env_logger` filter string.                                                                                                                          |

> `REGISTRATION_MODE` and `LANDING_MODE` pair up nicely: for a private
> friends-only instance leave both at the default; for a public demo set
> `LANDING_MODE=landing` and `REGISTRATION_MODE=open`.

`LANDING_MODE` and `VITE_API_URL` are baked into the frontend at build
time, so changing them requires
`docker compose build frontend && docker compose up -d`. The others read
live from env on backend start - `docker compose restart backend` is
enough.

## Bootstrapping the first admin

With `REGISTRATION_MODE=approval` (the default), new accounts start as
`pending` and cannot sign in. To unlock the system, approve and promote
yourself via the backend CLI:

```bash
# 1. Register a normal account via the web UI (you will land on "pending").
# 2. Promote that account to admin (this also approves it):
docker compose exec backend friendflow-backend admin promote you@example.com
```

From then on you can manage everyone else from the **Admin** page in the
web UI (the shield icon in the header, visible only for admins).

Other CLI commands:

```bash
docker compose exec backend friendflow-backend admin list
docker compose exec backend friendflow-backend admin approve someone@example.com
docker compose exec backend friendflow-backend admin demote someone@example.com
docker compose exec backend friendflow-backend admin delete someone@example.com
```

With `REGISTRATION_MODE=open` you can skip the promote step - just
register, then promote your own account to admin with the CLI above to
unlock the Admin page.

## TLS / HTTPS

The default compose stack serves plain HTTP on port `8080`. For a public
deployment you have three sensible options; pick whichever fits your
setup.

### Option 1 - Cloudflare proxy + Cloudflare Origin Certificate (recommended)

If you front the domain with Cloudflare (orange cloud), create a free
**15-year Origin Certificate** under
*SSL/TLS → Origin Server → Create Certificate* and enable
*SSL/TLS → Overview → Full (strict)*.

1. Drop the two files from Cloudflare into `./data/tls/`:
   ```
   ./data/tls/origin.pem   # the certificate Cloudflare shows you
   ./data/tls/origin.key   # the private key; chmod 600
   ```
2. In your local `docker-compose.yml` (the one `bootstrap.sh` generated
   for you), extend the `frontend` service so that **both** HTTP and
   HTTPS are published and `nginx.tls.conf` is mounted:
   ```yaml
   frontend:
     ports:
       - "80:80"
       - "443:443"
     volumes:
       - ./data/tls:/etc/nginx/tls:ro
       - ./frontend/nginx.tls.conf:/etc/nginx/conf.d/default.conf:ro
   ```
   Both ports must be published. Depending on its SSL mode, Cloudflare
   may hit port 80 or 443; the mounted `nginx.tls.conf` terminates TLS on
   443 and 301-redirects port 80 to HTTPS. (Mapping port 80 only while
   running CF in "Flexible" mode is a common source of 521 errors.)
3. `docker compose up -d` and hit `https://your-domain/`.
4. Consider restricting inbound 80/443 on the VPS to
   [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) so scanners
   can't reach your origin directly.
5. Update `CORS_ORIGIN` in `.env` to the public URL, e.g.
   `https://friendflow.site,https://www.friendflow.site`.

### Option 2 - Cloudflare Tunnel (no open inbound ports)

Run `cloudflared` as an additional compose service with a tunnel token
and point the public hostname at `http://frontend:80`. The origin keeps
all ports closed; TLS is fully handled by Cloudflare. No changes to the
nginx config are necessary, just remove the `ports:` mapping on the
`frontend` service (leave `expose: - "80"`).

### Option 3 - Let's Encrypt directly

If you're not using Cloudflare, put a TLS-terminating reverse proxy
(Caddy, Traefik, or nginx + certbot) in front of the frontend container
and let it obtain certificates via ACME. The frontend container itself
can stay HTTP-only in that case.

## Project layout

```
.
├── backend/                       Rust backend (Axum)
│   ├── migrations/                SQL migrations (sqlx)
│   └── src/
│       ├── admin/                 Admin endpoints (approve / promote / ...)
│       ├── auth/                  Registration, login, JWT middleware
│       ├── calendar/              Group calendar tool
│       ├── cli.rs                 `admin ...` subcommands (bootstrapping)
│       ├── groups/                Top-level groups (create/list/join/detail)
│       ├── shopping/              Shopping-list tool
│       ├── splitwise/             Ledger tool (expenses scoped to a group)
│       └── trips/                 Trip planning tool
├── frontend/                      React SPA (Vite)
│   ├── nginx.conf                 Default HTTP-only nginx config (baked in)
│   ├── nginx.tls.conf             Optional HTTPS config (mounted, see TLS)
│   └── src/
│       ├── api/                   Typed API client
│       ├── i18n/                  Locale files (en is the source of truth)
│       ├── pages/                 Top-level pages (dashboard, group, admin, auth, landing)
│       └── tools/                 One subdirectory per tool
├── bootstrap.sh                   One-shot setup for fresh checkouts
├── docker-compose.example.yml     Template (tracked)
└── docker-compose.yml             Per-host copy (gitignored)
```

## Adding a new tool

1. **Backend**: create a new module under `backend/src/<tool>/` and nest
   its router inside `backend/src/groups/mod.rs` (under `/:id/<tool>`).
   Handlers receive the group id via `Path` from the parent route.
2. **Migrations**: add a file under `backend/migrations/` (e.g.
   `0009_<tool>.sql`). sqlx migrations run automatically on startup.
3. **Frontend**: create `frontend/src/tools/<tool>/` with your pages and
   register the tool in `frontend/src/tools/index.ts`. The group home
   page renders a card and the router mounts the routes automatically
   under `/groups/:groupId/<tool>/...`.
4. **Translations**: add the tool's strings to `frontend/src/i18n/en.ts`
   and `frontend/src/i18n/de.ts` (the German file is type-checked against
   the English one, so missing keys fail the build).

## Internationalisation

- Default language: English.
- Supported languages: English (`en`), German (`de`).
- The active language is auto-detected from the browser on first visit
  and then persisted in `localStorage` under `friendflow.lang`.
- Users can switch languages via the globe toggle in the header.

## Security

- **Password hashing**: argon2id (via the `argon2` crate).
- **Auth**: JWT (HS256); the signing secret is taken from `JWT_SECRET`.
  The auth middleware additionally verifies that the user still exists
  and is approved on every request - revoked/demoted users lose access
  even if their token has not expired yet.
- **Registration**: open, with admin approval gated by
  `REGISTRATION_MODE` (default `approval`). In `open` mode accounts are
  auto-approved; in `approval` mode they stay `pending` until an admin
  unlocks them.
- **CORS**: configurable via `CORS_ORIGIN` (comma-separated list of
  allowed origins, or leave unset during local same-origin development).

## Later: Tauri v2 desktop/mobile app

The frontend is a standard SPA and can be embedded in Tauri v2 without
changes. Set `VITE_API_URL` at build time to point the app at your
production backend.

## License

friendflow is licensed under the **GNU Affero General Public License v3.0
or later** (AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text.

In short: you are free to run, study, modify and redistribute friendflow.
If you run a **modified** version as a network service, you must make the
modified source code available to its users - typically by linking to a
public repository of your fork. Running an **unmodified** instance for
yourself and your friends imposes no such obligation.

If that doesn't fit your use-case, open an issue - dual-licensing can be
discussed on a case-by-case basis.
