#!/usr/bin/env bash
# Idempotent one-shot bootstrap for fresh checkouts.
#
# Creates the local, gitignored copies of config files from their committed
# templates, so you can edit them per-host without getting merge conflicts on
# `git pull`:
#
#   docker-compose.example.yml  ->  docker-compose.yml
#   .env.example                ->  .env
#
# Also generates a random JWT_SECRET if it's still the placeholder. Re-running
# the script is safe; existing files are never overwritten.

set -euo pipefail

cd "$(dirname "$0")"

note() { printf '  \033[1;34m-\033[0m %s\n' "$*"; }
ok()   { printf '  \033[1;32mok\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$*" >&2; }

echo "friendflow bootstrap"
echo "--------------------"

# --- docker-compose.yml ------------------------------------------------------
if [[ -f docker-compose.yml ]]; then
    note "docker-compose.yml already exists - leaving it untouched"
else
    if [[ ! -f docker-compose.example.yml ]]; then
        warn "docker-compose.example.yml not found - aborting"
        exit 1
    fi
    cp docker-compose.example.yml docker-compose.yml
    ok "created docker-compose.yml from docker-compose.example.yml"
fi

# --- .env --------------------------------------------------------------------
if [[ -f .env ]]; then
    note ".env already exists - leaving it untouched"
else
    if [[ ! -f .env.example ]]; then
        warn ".env.example not found - aborting"
        exit 1
    fi
    cp .env.example .env
    ok "created .env from .env.example"

    # Replace the placeholder JWT secret with a strong random one.
    placeholder='please_generate_a_long_random_string_here_min_32_chars'
    if grep -q "JWT_SECRET=${placeholder}" .env; then
        if command -v openssl >/dev/null 2>&1; then
            secret="$(openssl rand -hex 32)"
        else
            # Fallback: /dev/urandom + base64, trimmed.
            secret="$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-64)"
        fi
        # Use | as sed delimiter because the secret is hex/base64 (no pipes).
        sed -i.bak "s|JWT_SECRET=${placeholder}|JWT_SECRET=${secret}|" .env
        rm -f .env.bak
        ok "generated a random JWT_SECRET"
    fi
fi

# --- data directories --------------------------------------------------------
# These are bind-mount targets for docker. If they already exist (possibly
# owned by root because docker wrote to them), just leave them alone.
for d in data/postgres data/tls; do
    if [[ -d "$d" ]]; then
        note "$d already exists"
    elif mkdir -p "$d" 2>/dev/null; then
        ok "created $d"
    else
        warn "could not create $d (will be created by docker on first run)"
    fi
done

echo
echo "Next steps:"
echo "  1. Review .env and docker-compose.yml and adjust for your host."
echo "  2. For TLS at the origin, drop origin.pem + origin.key into ./data/tls"
echo "     and follow the TLS section in README.md."
echo "  3. docker compose up -d --build"
