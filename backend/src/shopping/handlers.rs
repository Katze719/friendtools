use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct ShoppingItem {
    pub id: Uuid,
    pub group_id: Uuid,
    pub name: String,
    pub quantity: String,
    pub note: String,
    pub is_done: bool,
    pub done_at: Option<DateTime<Utc>>,
    pub done_by: Option<Uuid>,
    pub done_by_display_name: Option<String>,
    pub added_by: Uuid,
    pub added_by_display_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateItemRequest {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    #[validate(length(max = 80))]
    #[serde(default)]
    pub quantity: String,
    #[validate(length(max = 500))]
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateItemRequest {
    #[validate(length(min = 1, max = 200))]
    pub name: Option<String>,
    #[validate(length(max = 80))]
    pub quantity: Option<String>,
    #[validate(length(max = 500))]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    /// When omitted the state is flipped; otherwise forced to the given value.
    #[serde(default)]
    pub done: Option<bool>,
}

pub async fn list_items(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<ShoppingItem>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    let items = fetch_items(&state.db, group_id).await?;
    Ok(Json(items))
}

pub async fn create_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateItemRequest>,
) -> AppResult<Json<ShoppingItem>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO shopping_items (group_id, added_by, name, quantity, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(group_id)
    .bind(user.id)
    .bind(payload.name.trim())
    .bind(payload.quantity.trim())
    .bind(payload.note.trim())
    .fetch_one(&state.db)
    .await?;

    let item = fetch_item(&state.db, id.0).await?;
    Ok(Json(item))
}

pub async fn update_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, item_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateItemRequest>,
) -> AppResult<Json<ShoppingItem>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let exists = item_exists(&state.db, group_id, item_id).await?;
    if !exists {
        return Err(AppError::NotFound("item not found".into()));
    }

    sqlx::query(
        "UPDATE shopping_items
         SET name     = COALESCE($1, name),
             quantity = COALESCE($2, quantity),
             note     = COALESCE($3, note)
         WHERE id = $4",
    )
    .bind(payload.name.as_deref().map(str::trim))
    .bind(payload.quantity.as_deref().map(str::trim))
    .bind(payload.note.as_deref().map(str::trim))
    .bind(item_id)
    .execute(&state.db)
    .await?;

    let item = fetch_item(&state.db, item_id).await?;
    Ok(Json(item))
}

pub async fn toggle_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, item_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<ShoppingItem>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let current: Option<(bool,)> = sqlx::query_as(
        "SELECT is_done FROM shopping_items WHERE id = $1 AND group_id = $2",
    )
    .bind(item_id)
    .bind(group_id)
    .fetch_optional(&state.db)
    .await?;
    let Some((was_done,)) = current else {
        return Err(AppError::NotFound("item not found".into()));
    };

    let target = payload.done.unwrap_or(!was_done);

    if target {
        sqlx::query(
            "UPDATE shopping_items
             SET is_done = TRUE, done_at = NOW(), done_by = $1
             WHERE id = $2",
        )
        .bind(user.id)
        .bind(item_id)
        .execute(&state.db)
        .await?;
    } else {
        sqlx::query(
            "UPDATE shopping_items
             SET is_done = FALSE, done_at = NULL, done_by = NULL
             WHERE id = $1",
        )
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }

    let item = fetch_item(&state.db, item_id).await?;
    Ok(Json(item))
}

pub async fn delete_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, item_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    let exists = item_exists(&state.db, group_id, item_id).await?;
    if !exists {
        return Err(AppError::NotFound("item not found".into()));
    }
    sqlx::query("DELETE FROM shopping_items WHERE id = $1")
        .bind(item_id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn clear_done(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    let res = sqlx::query(
        "DELETE FROM shopping_items WHERE group_id = $1 AND is_done = TRUE",
    )
    .bind(group_id)
    .execute(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true, "removed": res.rows_affected() })))
}

// ---------- helpers ----------

async fn item_exists(pool: &PgPool, group_id: Uuid, item_id: Uuid) -> AppResult<bool> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT 1::BIGINT FROM shopping_items WHERE id = $1 AND group_id = $2",
    )
    .bind(item_id)
    .bind(group_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

type ItemRow = (
    Uuid,
    Uuid,
    String,
    String,
    String,
    bool,
    Option<DateTime<Utc>>,
    Option<Uuid>,
    Option<String>,
    Uuid,
    String,
    DateTime<Utc>,
);

const ITEM_SELECT: &str = "\
    SELECT si.id, si.group_id, si.name, si.quantity, si.note, \
           si.is_done, si.done_at, si.done_by, du.display_name AS done_by_display_name, \
           si.added_by, au.display_name AS added_by_display_name, si.created_at \
    FROM shopping_items si \
    INNER JOIN users au ON au.id = si.added_by \
    LEFT JOIN users du ON du.id = si.done_by";

fn row_into_item(row: ItemRow) -> ShoppingItem {
    ShoppingItem {
        id: row.0,
        group_id: row.1,
        name: row.2,
        quantity: row.3,
        note: row.4,
        is_done: row.5,
        done_at: row.6,
        done_by: row.7,
        done_by_display_name: row.8,
        added_by: row.9,
        added_by_display_name: row.10,
        created_at: row.11,
    }
}

async fn fetch_items(pool: &PgPool, group_id: Uuid) -> AppResult<Vec<ShoppingItem>> {
    let sql = format!(
        "{ITEM_SELECT} WHERE si.group_id = $1 \
         ORDER BY si.is_done ASC, si.created_at DESC"
    );
    let rows: Vec<ItemRow> = sqlx::query_as(&sql).bind(group_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_item).collect())
}

async fn fetch_item(pool: &PgPool, id: Uuid) -> AppResult<ShoppingItem> {
    let sql = format!("{ITEM_SELECT} WHERE si.id = $1");
    let row: ItemRow = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_item(row))
}
