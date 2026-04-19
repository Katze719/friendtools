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
    trips::trip::ensure_in_group,
};

#[derive(Debug, Serialize)]
pub struct PackingItem {
    pub id: Uuid,
    pub trip_id: Uuid,
    pub name: String,
    pub quantity: String,
    pub category: String,
    pub is_packed: bool,
    pub assigned_to: Option<Uuid>,
    pub assigned_to_display_name: Option<String>,
    pub position: i32,
    pub created_by: Uuid,
    pub created_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateRequest {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    #[validate(length(max = 80))]
    #[serde(default)]
    pub quantity: String,
    #[validate(length(max = 80))]
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub assigned_to: Option<Uuid>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateRequest {
    #[validate(length(min = 1, max = 200))]
    pub name: Option<String>,
    #[validate(length(max = 80))]
    pub quantity: Option<String>,
    #[validate(length(max = 80))]
    pub category: Option<String>,
    pub is_packed: Option<bool>,
    /// Set to `Some(None)` to clear the assignee. Distinguished from the key
    /// being omitted entirely via a manual wrapper below.
    #[serde(
        default,
        deserialize_with = "crate::trips::packing::deserialize_optional_uuid"
    )]
    pub assigned_to: Option<Option<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub ids: Vec<Uuid>,
}

pub fn deserialize_optional_uuid<'de, D>(de: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<Uuid>::deserialize(de)?))
}

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Vec<PackingItem>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;
    Ok(Json(fetch_all(&state.db, trip_id).await?))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<CreateRequest>,
) -> AppResult<Json<PackingItem>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;
    if let Some(assignee) = payload.assigned_to {
        ensure_member_of(&state, group_id, assignee).await?;
    }

    let next_position: (i32,) = sqlx::query_as(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM trip_packing_items WHERE trip_id = $1",
    )
    .bind(trip_id)
    .fetch_one(&state.db)
    .await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO trip_packing_items
            (trip_id, name, quantity, category, assigned_to, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id",
    )
    .bind(trip_id)
    .bind(payload.name.trim())
    .bind(payload.quantity.trim())
    .bind(payload.category.trim())
    .bind(payload.assigned_to)
    .bind(next_position.0)
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(fetch_one(&state.db, id.0).await?))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id, item_id)): Path<(Uuid, Uuid, Uuid)>,
    Json(payload): Json<UpdateRequest>,
) -> AppResult<Json<PackingItem>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;
    ensure_in_trip(&state.db, item_id, trip_id).await?;

    if let Some(name) = payload.name.as_deref() {
        sqlx::query("UPDATE trip_packing_items SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name.trim())
            .bind(item_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(quantity) = payload.quantity.as_deref() {
        sqlx::query(
            "UPDATE trip_packing_items SET quantity = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(quantity.trim())
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }
    if let Some(category) = payload.category.as_deref() {
        sqlx::query(
            "UPDATE trip_packing_items SET category = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(category.trim())
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }
    if let Some(is_packed) = payload.is_packed {
        sqlx::query(
            "UPDATE trip_packing_items SET is_packed = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(is_packed)
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }
    if let Some(assignee_opt) = payload.assigned_to {
        if let Some(assignee) = assignee_opt {
            ensure_member_of(&state, group_id, assignee).await?;
        }
        sqlx::query(
            "UPDATE trip_packing_items SET assigned_to = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(assignee_opt)
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }

    Ok(Json(fetch_one(&state.db, item_id).await?))
}

pub async fn toggle(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id, item_id)): Path<(Uuid, Uuid, Uuid)>,
) -> AppResult<Json<PackingItem>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;
    ensure_in_trip(&state.db, item_id, trip_id).await?;

    sqlx::query(
        "UPDATE trip_packing_items
           SET is_packed = NOT is_packed, updated_at = NOW()
           WHERE id = $1",
    )
    .bind(item_id)
    .execute(&state.db)
    .await?;

    Ok(Json(fetch_one(&state.db, item_id).await?))
}

pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id, item_id)): Path<(Uuid, Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;

    let res = sqlx::query("DELETE FROM trip_packing_items WHERE id = $1 AND trip_id = $2")
        .bind(item_id)
        .bind(trip_id)
        .execute(&state.db)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("packing item not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn reorder(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ReorderRequest>,
) -> AppResult<Json<Vec<PackingItem>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;

    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE trip_packing_items SET position = position + 100000 WHERE trip_id = $1")
        .bind(trip_id)
        .execute(&mut *tx)
        .await?;

    for (idx, id) in payload.ids.iter().enumerate() {
        let res = sqlx::query(
            "UPDATE trip_packing_items
                SET position = $1, updated_at = NOW()
                WHERE id = $2 AND trip_id = $3",
        )
        .bind(idx as i32)
        .bind(id)
        .bind(trip_id)
        .execute(&mut *tx)
        .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound("packing item not found".into()));
        }
    }
    tx.commit().await?;

    Ok(Json(fetch_all(&state.db, trip_id).await?))
}

// ---------- helpers ----------

async fn ensure_in_trip(pool: &PgPool, item_id: Uuid, trip_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM trip_packing_items WHERE id = $1 AND trip_id = $2")
            .bind(item_id)
            .bind(trip_id)
            .fetch_optional(pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("packing item not found".into()));
    }
    Ok(())
}

async fn ensure_member_of(state: &AppState, group_id: Uuid, user_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = $2")
            .bind(group_id)
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_none() {
        return Err(AppError::BadRequest(
            "assignee is not a member of this group".into(),
        ));
    }
    Ok(())
}

type Row = (
    Uuid,
    Uuid,
    String,
    String,
    String,
    bool,
    Option<Uuid>,
    Option<String>,
    i32,
    Uuid,
    String,
    DateTime<Utc>,
    DateTime<Utc>,
);

const SELECT: &str = "\
    SELECT p.id, p.trip_id, p.name, p.quantity, p.category, p.is_packed, \
           p.assigned_to, a.display_name, p.position, p.created_by, c.display_name, \
           p.created_at, p.updated_at \
      FROM trip_packing_items p \
      INNER JOIN users c ON c.id = p.created_by \
      LEFT JOIN users a ON a.id = p.assigned_to";

fn row_into_item(row: Row) -> PackingItem {
    PackingItem {
        id: row.0,
        trip_id: row.1,
        name: row.2,
        quantity: row.3,
        category: row.4,
        is_packed: row.5,
        assigned_to: row.6,
        assigned_to_display_name: row.7,
        position: row.8,
        created_by: row.9,
        created_by_display_name: row.10,
        created_at: row.11,
        updated_at: row.12,
    }
}

async fn fetch_all(pool: &PgPool, trip_id: Uuid) -> AppResult<Vec<PackingItem>> {
    let sql = format!(
        "{SELECT} \
         WHERE p.trip_id = $1 \
         ORDER BY p.position ASC, p.created_at ASC"
    );
    let rows: Vec<Row> = sqlx::query_as(&sql).bind(trip_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_item).collect())
}

async fn fetch_one(pool: &PgPool, id: Uuid) -> AppResult<PackingItem> {
    let sql = format!("{SELECT} WHERE p.id = $1");
    let row: Row = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_item(row))
}
