// sqlx's `query_as::<_, (Col1, Col2, ...)>()` pattern produces big tuple
// types that are only used at the call-site to destructure into local
// variables. Extracting a type alias per query adds noise without aiding
// readability, so we opt out of this lint crate-wide.
#![allow(clippy::type_complexity)]

use std::net::SocketAddr;

use axum::{http::HeaderValue, routing::get, Router};
use clap::Parser;
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod admin;
mod auth;
mod calendar;
mod cli;
mod config;
mod db;
mod error;
mod groups;
mod mail;
mod shopping;
mod splitwise;
mod state;
mod tasks;
mod trips;

use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cfg = config::Config::from_env()?;
    let parsed = cli::Cli::parse();

    if let Some(command) = parsed.command {
        return cli::run(command, &cfg).await;
    }

    serve(cfg).await
}

async fn serve(cfg: config::Config) -> anyhow::Result<()> {
    let pool = db::connect(&cfg.database_url).await?;
    db::migrate(&pool).await?;

    warn_if_no_admin(&pool).await;

    let state = AppState::new(pool, cfg.clone());

    let cors = build_cors(&cfg.cors_origin);

    let app = Router::new()
        .route("/api/health", get(health))
        .nest("/api/auth", auth::routes())
        .nest("/api/admin", admin::routes())
        .nest("/api/groups", groups::routes())
        .nest("/api/me/calendar", calendar::personal_routes())
        .nest("/api/me/shopping", shopping::personal_routes())
        .nest("/api/me/tasks", tasks::personal_routes())
        .with_state(state)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr: SocketAddr = cfg.bind_addr.parse()?;
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn health() -> &'static str {
    "ok"
}

async fn warn_if_no_admin(pool: &sqlx::PgPool) {
    match sqlx::query_scalar::<_, i64>("SELECT COUNT(*)::BIGINT FROM users WHERE is_admin = TRUE")
        .fetch_one(pool)
        .await
    {
        Ok(0) => {
            tracing::warn!(
                "no admin user exists yet. Bootstrap one with: \
                 `friendflow-backend admin promote <email>` \
                 (for docker: `docker compose exec backend friendflow-backend admin promote <email>`)"
            );
        }
        Ok(_) => {}
        Err(e) => tracing::warn!(error = ?e, "could not check for admin presence"),
    }
}

fn build_cors(origin: &str) -> CorsLayer {
    let origins: Vec<HeaderValue> = origin
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .filter_map(|s| HeaderValue::from_str(s).ok())
        .collect();

    let allow_origin = if origins.is_empty() {
        AllowOrigin::any()
    } else {
        AllowOrigin::list(origins)
    };

    CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_credentials(false)
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ])
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::PATCH,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received");
}
