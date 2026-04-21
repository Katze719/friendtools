pub mod handlers;

use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/tasks/...`. Group-scoped todo list
/// where any member can see and complete tasks, and tasks can be
/// assigned to specific members.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(handlers::list_group_tasks).post(handlers::create_group_task),
        )
        .route(
            "/:task_id",
            axum::routing::patch(handlers::update_group_task).delete(handlers::delete_group_task),
        )
        .route(
            "/:task_id/toggle",
            axum::routing::put(handlers::toggle_group_task),
        )
        .route("/clear-done", post(handlers::clear_group_done))
}

/// Mounted under `/api/me/tasks/...`. Personal todo list owned by the
/// authenticated user; `assigned_to` is always `NULL` here since the
/// owner is implicit.
pub fn personal_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(handlers::list_personal_tasks).post(handlers::create_personal_task),
        )
        .route(
            "/:task_id",
            axum::routing::patch(handlers::update_personal_task)
                .delete(handlers::delete_personal_task),
        )
        .route(
            "/:task_id/toggle",
            axum::routing::put(handlers::toggle_personal_task),
        )
        .route("/clear-done", post(handlers::clear_personal_done))
}
