pub mod handlers;

use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/tasks/...`.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_tasks).post(handlers::create_task))
        .route(
            "/:task_id",
            axum::routing::patch(handlers::update_task).delete(handlers::delete_task),
        )
        .route(
            "/:task_id/toggle",
            axum::routing::put(handlers::toggle_task),
        )
        .route("/clear-done", post(handlers::clear_done))
}
