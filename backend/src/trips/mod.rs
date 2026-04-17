pub mod handlers;
mod unfurl;

use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/trips/...`.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/links",
            get(handlers::list_links).post(handlers::create_link),
        )
        .route(
            "/links/:link_id",
            axum::routing::patch(handlers::update_link)
                .delete(handlers::delete_link),
        )
        .route("/links/:link_id/refresh", post(handlers::refresh_link))
        .route(
            "/links/:link_id/vote",
            axum::routing::put(handlers::vote_link),
        )
}
