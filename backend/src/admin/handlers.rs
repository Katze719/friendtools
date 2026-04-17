use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::middleware::AdminUser,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct AdminUserRow {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub status: String,
    pub is_admin: bool,
    pub approved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    /// Optional filter by status: "pending" or "approved".
    pub status: Option<String>,
}

pub async fn list_users(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<AdminUserRow>>> {
    let (sql, bind_status): (&str, Option<String>) = match q.status.as_deref() {
        Some(s) if s == "pending" || s == "approved" => (
            "SELECT id, email, display_name, status, is_admin, approved_at, created_at
             FROM users WHERE status = $1 ORDER BY created_at DESC",
            Some(s.to_string()),
        ),
        _ => (
            "SELECT id, email, display_name, status, is_admin, approved_at, created_at
             FROM users ORDER BY created_at DESC",
            None,
        ),
    };

    let rows: Vec<(Uuid, String, String, String, bool, Option<DateTime<Utc>>, DateTime<Utc>)> =
        if let Some(s) = bind_status {
            sqlx::query_as(sql).bind(s).fetch_all(&state.db).await?
        } else {
            sqlx::query_as(sql).fetch_all(&state.db).await?
        };

    let out = rows
        .into_iter()
        .map(
            |(id, email, display_name, status, is_admin, approved_at, created_at)| AdminUserRow {
                id,
                email,
                display_name,
                status,
                is_admin,
                approved_at,
                created_at,
            },
        )
        .collect();

    Ok(Json(out))
}

pub async fn approve_user(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AdminUserRow>> {
    let row: Option<(Uuid, String, String, String, bool, Option<DateTime<Utc>>, DateTime<Utc>)> =
        sqlx::query_as(
            "UPDATE users
             SET status = 'approved', approved_at = COALESCE(approved_at, NOW())
             WHERE id = $1
             RETURNING id, email, display_name, status, is_admin, approved_at, created_at",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    let Some((id, email, display_name, status, is_admin, approved_at, created_at)) = row else {
        return Err(AppError::NotFound("user not found".into()));
    };
    Ok(Json(AdminUserRow {
        id,
        email,
        display_name,
        status,
        is_admin,
        approved_at,
        created_at,
    }))
}

pub async fn promote_user(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AdminUserRow>> {
    let row: Option<(Uuid, String, String, String, bool, Option<DateTime<Utc>>, DateTime<Utc>)> =
        sqlx::query_as(
            "UPDATE users
             SET is_admin = TRUE,
                 status = 'approved',
                 approved_at = COALESCE(approved_at, NOW())
             WHERE id = $1
             RETURNING id, email, display_name, status, is_admin, approved_at, created_at",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    let Some((id, email, display_name, status, is_admin, approved_at, created_at)) = row else {
        return Err(AppError::NotFound("user not found".into()));
    };
    Ok(Json(AdminUserRow {
        id,
        email,
        display_name,
        status,
        is_admin,
        approved_at,
        created_at,
    }))
}

pub async fn demote_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AdminUserRow>> {
    // Prevent admins from demoting themselves into a state with no admins.
    // If this user is the last admin, refuse.
    let admin_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::BIGINT FROM users WHERE is_admin = TRUE")
            .fetch_one(&state.db)
            .await?;

    let target_is_admin: Option<(bool,)> = sqlx::query_as("SELECT is_admin FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;
    let Some((target_is_admin,)) = target_is_admin else {
        return Err(AppError::NotFound("user not found".into()));
    };
    if target_is_admin && admin_count.0 <= 1 {
        return Err(AppError::BadRequest(
            "cannot demote the last remaining admin".into(),
        ));
    }
    if id == admin.0.id && admin_count.0 <= 1 {
        return Err(AppError::BadRequest("cannot demote yourself as last admin".into()));
    }

    let row: Option<(Uuid, String, String, String, bool, Option<DateTime<Utc>>, DateTime<Utc>)> =
        sqlx::query_as(
            "UPDATE users SET is_admin = FALSE
             WHERE id = $1
             RETURNING id, email, display_name, status, is_admin, approved_at, created_at",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    let Some((id, email, display_name, status, is_admin, approved_at, created_at)) = row else {
        return Err(AppError::NotFound("user not found".into()));
    };
    Ok(Json(AdminUserRow {
        id,
        email,
        display_name,
        status,
        is_admin,
        approved_at,
        created_at,
    }))
}

pub async fn delete_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    if id == admin.0.id {
        return Err(AppError::BadRequest("cannot delete yourself".into()));
    }

    let res = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            // Most common reason: user owns groups or expenses that cannot be cascaded.
            AppError::Conflict(format!(
                "cannot delete user (they may own groups or expenses): {e}"
            ))
        })?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("user not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
