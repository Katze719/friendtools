pub mod handlers;

use axum::{
    routing::{delete, get, post},
    Router,
};

use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/users", get(handlers::list_users))
        .route("/users/:id/approve", post(handlers::approve_user))
        .route("/users/:id/promote", post(handlers::promote_user))
        .route("/users/:id/demote", post(handlers::demote_user))
        .route("/users/:id", delete(handlers::delete_user))
}
