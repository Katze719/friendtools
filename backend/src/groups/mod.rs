pub mod handlers;

use axum::{
    routing::{get, post},
    Router,
};
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list).post(handlers::create))
        .route("/join", post(handlers::join))
        .route("/:id", get(handlers::detail).delete(handlers::delete_group))
        .route("/:id/leave", post(handlers::leave))
        // Tool-specific nested routes live under `/:id/<tool>/...`.
        .nest("/:id/splitwise", crate::splitwise::routes())
        .nest("/:id/trips", crate::trips::routes())
        .nest("/:id/calendar", crate::calendar::routes())
        .nest("/:id/shopping", crate::shopping::routes())
        .nest("/:id/tasks", crate::tasks::routes())
}

/// Returns Ok if the user is a member of the group, else Forbidden / NotFound.
pub async fn ensure_member(
    state: &AppState,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT 1::BIGINT FROM group_members WHERE group_id = $1 AND user_id = $2")
            .bind(group_id)
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    if row.is_none() {
        return Err(AppError::Forbidden);
    }
    Ok(())
}
