pub mod handlers;

use axum::{routing::get, Router};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/calendar/...`.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/events",
            get(handlers::list_events).post(handlers::create_event),
        )
        .route(
            "/events/:event_id",
            axum::routing::patch(handlers::update_event).delete(handlers::delete_event),
        )
}
