pub mod handlers;

use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/shopping/...`.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/items",
            get(handlers::list_items).post(handlers::create_item),
        )
        .route(
            "/items/:item_id",
            axum::routing::patch(handlers::update_item).delete(handlers::delete_item),
        )
        .route(
            "/items/:item_id/toggle",
            axum::routing::put(handlers::toggle_item),
        )
        .route("/items/clear-done", post(handlers::clear_done))
}
