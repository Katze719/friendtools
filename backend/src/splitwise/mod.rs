pub mod handlers;

use axum::{
    routing::{delete, get},
    Router,
};

use crate::state::AppState;

/// Routes are mounted under `/api/groups/:id/splitwise/...`.
/// Handlers receive the group id via `Path` from the parent route.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/expenses",
            get(handlers::list_expenses).post(handlers::create_expense),
        )
        .route("/expenses/:expense_id", delete(handlers::delete_expense))
        .route("/summary", get(handlers::summary))
}
