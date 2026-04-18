use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
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
pub struct ItineraryItem {
    pub id: Uuid,
    pub group_id: Uuid,
    pub day_date: NaiveDate,
    pub title: String,
    pub start_time: Option<NaiveTime>,
    pub end_time: Option<NaiveTime>,
    pub location: String,
    pub note: String,
    pub link_id: Option<Uuid>,
    /// Convenience so the UI doesn't need a second call to render the linked
    /// preview title next to the plan entry.
    pub link_title: Option<String>,
    pub link_url: Option<String>,
    pub position: i32,
    pub created_by: Uuid,
    pub created_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateRequest {
    pub day_date: NaiveDate,
    #[validate(length(min = 1, max = 200))]
    pub title: String,
    #[serde(default)]
    pub start_time: Option<NaiveTime>,
    #[serde(default)]
    pub end_time: Option<NaiveTime>,
    #[validate(length(max = 200))]
    #[serde(default)]
    pub location: String,
    #[validate(length(max = 2000))]
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub link_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateRequest {
    pub day_date: Option<NaiveDate>,
    #[validate(length(min = 1, max = 200))]
    pub title: Option<String>,
    #[serde(default, deserialize_with = "crate::trips::itinerary::opt_time")]
    pub start_time: Option<Option<NaiveTime>>,
    #[serde(default, deserialize_with = "crate::trips::itinerary::opt_time")]
    pub end_time: Option<Option<NaiveTime>>,
    #[validate(length(max = 200))]
    pub location: Option<String>,
    #[validate(length(max = 2000))]
    pub note: Option<String>,
    #[serde(default, deserialize_with = "crate::trips::itinerary::opt_uuid")]
    pub link_id: Option<Option<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub day_date: NaiveDate,
    pub ids: Vec<Uuid>,
}

pub fn opt_time<'de, D>(de: D) -> Result<Option<Option<NaiveTime>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<NaiveTime>::deserialize(de)?))
}

pub fn opt_uuid<'de, D>(de: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<Uuid>::deserialize(de)?))
}

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<ItineraryItem>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    Ok(Json(fetch_all(&state.db, group_id).await?))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateRequest>,
) -> AppResult<Json<ItineraryItem>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    if let (Some(s), Some(e)) = (payload.start_time, payload.end_time) {
        if s > e {
            return Err(AppError::BadRequest(
                "start_time must not be after end_time".into(),
            ));
        }
    }
    if let Some(link_id) = payload.link_id {
        ensure_link_in_group(&state.db, link_id, group_id).await?;
    }

    let next_position: (i32,) = sqlx::query_as(
        "SELECT COALESCE(MAX(position), -1) + 1
           FROM trip_itinerary_items
           WHERE group_id = $1 AND day_date = $2",
    )
    .bind(group_id)
    .bind(payload.day_date)
    .fetch_one(&state.db)
    .await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO trip_itinerary_items
            (group_id, day_date, title, start_time, end_time, location, note, link_id, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id",
    )
    .bind(group_id)
    .bind(payload.day_date)
    .bind(payload.title.trim())
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.location.trim())
    .bind(payload.note.trim())
    .bind(payload.link_id)
    .bind(next_position.0)
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(fetch_one(&state.db, id.0).await?))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, item_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateRequest>,
) -> AppResult<Json<ItineraryItem>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, item_id, group_id).await?;

    if let Some(day_date) = payload.day_date {
        sqlx::query(
            "UPDATE trip_itinerary_items SET day_date = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(day_date)
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }
    if let Some(title) = payload.title.as_deref() {
        sqlx::query("UPDATE trip_itinerary_items SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title.trim())
            .bind(item_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(start_opt) = payload.start_time {
        sqlx::query(
            "UPDATE trip_itinerary_items SET start_time = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(start_opt)
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }
    if let Some(end_opt) = payload.end_time {
        sqlx::query(
            "UPDATE trip_itinerary_items SET end_time = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(end_opt)
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }
    if let Some(location) = payload.location.as_deref() {
        sqlx::query(
            "UPDATE trip_itinerary_items SET location = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(location.trim())
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }
    if let Some(note) = payload.note.as_deref() {
        sqlx::query("UPDATE trip_itinerary_items SET note = $1, updated_at = NOW() WHERE id = $2")
            .bind(note.trim())
            .bind(item_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(link_opt) = payload.link_id {
        if let Some(link_id) = link_opt {
            ensure_link_in_group(&state.db, link_id, group_id).await?;
        }
        sqlx::query(
            "UPDATE trip_itinerary_items SET link_id = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(link_opt)
        .bind(item_id)
        .execute(&state.db)
        .await?;
    }

    Ok(Json(fetch_one(&state.db, item_id).await?))
}

pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, item_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let res = sqlx::query("DELETE FROM trip_itinerary_items WHERE id = $1 AND group_id = $2")
        .bind(item_id)
        .bind(group_id)
        .execute(&state.db)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("itinerary item not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn reorder(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<ReorderRequest>,
) -> AppResult<Json<Vec<ItineraryItem>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE trip_itinerary_items SET position = position + 100000
           WHERE group_id = $1 AND day_date = $2",
    )
    .bind(group_id)
    .bind(payload.day_date)
    .execute(&mut *tx)
    .await?;

    for (idx, id) in payload.ids.iter().enumerate() {
        let res = sqlx::query(
            "UPDATE trip_itinerary_items
                SET position = $1, updated_at = NOW()
                WHERE id = $2 AND group_id = $3 AND day_date = $4",
        )
        .bind(idx as i32)
        .bind(id)
        .bind(group_id)
        .bind(payload.day_date)
        .execute(&mut *tx)
        .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound("itinerary item not found".into()));
        }
    }
    tx.commit().await?;

    Ok(Json(fetch_all(&state.db, group_id).await?))
}

// ---------- helpers ----------

async fn ensure_in_group(pool: &PgPool, item_id: Uuid, group_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM trip_itinerary_items WHERE id = $1 AND group_id = $2")
            .bind(item_id)
            .bind(group_id)
            .fetch_optional(pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("itinerary item not found".into()));
    }
    Ok(())
}

async fn ensure_link_in_group(pool: &PgPool, link_id: Uuid, group_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM trip_links WHERE id = $1 AND group_id = $2")
            .bind(link_id)
            .bind(group_id)
            .fetch_optional(pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::BadRequest(
            "referenced link does not belong to this group".into(),
        ));
    }
    Ok(())
}

type Row = (
    Uuid,
    Uuid,
    NaiveDate,
    String,
    Option<NaiveTime>,
    Option<NaiveTime>,
    String,
    String,
    Option<Uuid>,
    Option<String>,
    Option<String>,
    i32,
    Uuid,
    String,
    DateTime<Utc>,
    DateTime<Utc>,
);

const SELECT: &str = "\
    SELECT i.id, i.group_id, i.day_date, i.title, i.start_time, i.end_time, \
           i.location, i.note, i.link_id, l.title, l.url, i.position, \
           i.created_by, u.display_name, i.created_at, i.updated_at \
      FROM trip_itinerary_items i \
      INNER JOIN users u ON u.id = i.created_by \
      LEFT JOIN trip_links l ON l.id = i.link_id";

fn row_into_item(row: Row) -> ItineraryItem {
    ItineraryItem {
        id: row.0,
        group_id: row.1,
        day_date: row.2,
        title: row.3,
        start_time: row.4,
        end_time: row.5,
        location: row.6,
        note: row.7,
        link_id: row.8,
        link_title: row.9,
        link_url: row.10,
        position: row.11,
        created_by: row.12,
        created_by_display_name: row.13,
        created_at: row.14,
        updated_at: row.15,
    }
}

async fn fetch_all(pool: &PgPool, group_id: Uuid) -> AppResult<Vec<ItineraryItem>> {
    let sql = format!(
        "{SELECT} \
         WHERE i.group_id = $1 \
         ORDER BY i.day_date ASC, \
                  (i.start_time IS NULL), i.start_time ASC, \
                  i.position ASC, i.created_at ASC"
    );
    let rows: Vec<Row> = sqlx::query_as(&sql).bind(group_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_item).collect())
}

async fn fetch_one(pool: &PgPool, id: Uuid) -> AppResult<ItineraryItem> {
    let sql = format!("{SELECT} WHERE i.id = $1");
    let row: Row = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_item(row))
}
