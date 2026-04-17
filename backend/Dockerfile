# --- builder ---
FROM rust:1.90-slim-bookworm AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Cache deps
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src target/release/friendtools-backend target/release/deps/friendtools_backend*

COPY . .
ENV SQLX_OFFLINE=true
RUN cargo build --release

# --- runtime ---
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 app

COPY --from=builder /app/target/release/friendtools-backend /usr/local/bin/friendtools-backend
COPY --from=builder /app/migrations ./migrations

USER app
EXPOSE 3000
ENV RUST_LOG=info
CMD ["/usr/local/bin/friendtools-backend"]
