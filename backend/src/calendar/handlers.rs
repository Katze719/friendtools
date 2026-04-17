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
pub struct CalendarEvent {
    pub id: Uuid,
    pub group_id: Uuid,
    pub title: String,
    pub description: String,
    pub location: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: Option<DateTime<Utc>>,
    pub all_day: bool,
    pub created_by: Uuid,
    pub created_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateEventRequest {
    #[validate(length(min = 1, max = 200))]
    pub title: String,
    #[validate(length(max = 2000))]
    #[serde(default)]
    pub description: String,
    #[validate(length(max = 200))]
    #[serde(default)]
    pub location: String,
    pub starts_at: DateTime<Utc>,
    #[serde(default)]
    pub ends_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub all_day: bool,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateEventRequest {
    #[validate(length(min = 1, max = 200))]
    pub title: Option<String>,
    #[validate(length(max = 2000))]
    pub description: Option<String>,
    #[validate(length(max = 200))]
    pub location: Option<String>,
    pub starts_at: Option<DateTime<Utc>>,
    /// Use `Some(None)` to explicitly clear; `None` leaves untouched.
    #[serde(default, deserialize_with = "double_option")]
    pub ends_at: Option<Option<DateTime<Utc>>>,
    pub all_day: Option<bool>,
}

/// Allow `{ "ends_at": null }` to mean "clear it" vs. missing field = leave it.
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(de).map(Some)
}

pub async fn list_events(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<CalendarEvent>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    let events = fetch_events(&state.db, group_id).await?;
    Ok(Json(events))
}

pub async fn create_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateEventRequest>,
) -> AppResult<Json<CalendarEvent>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    validate_range(payload.starts_at, payload.ends_at)?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO calendar_events
            (group_id, created_by, title, description, location, starts_at, ends_at, all_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id",
    )
    .bind(group_id)
    .bind(user.id)
    .bind(payload.title.trim())
    .bind(payload.description.trim())
    .bind(payload.location.trim())
    .bind(payload.starts_at)
    .bind(payload.ends_at)
    .bind(payload.all_day)
    .fetch_one(&state.db)
    .await?;

    let event = fetch_event(&state.db, id.0).await?;
    Ok(Json(event))
}

pub async fn update_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, event_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateEventRequest>,
) -> AppResult<Json<CalendarEvent>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let existing: Option<(Uuid, DateTime<Utc>, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT created_by, starts_at, ends_at FROM calendar_events \
         WHERE id = $1 AND group_id = $2",
    )
    .bind(event_id)
    .bind(group_id)
    .fetch_optional(&state.db)
    .await?;
    let Some((created_by, cur_start, cur_end)) = existing else {
        return Err(AppError::NotFound("event not found".into()));
    };
    if created_by != user.id {
        return Err(AppError::Forbidden);
    }

    let new_start = payload.starts_at.unwrap_or(cur_start);
    let new_end = match &payload.ends_at {
        Some(v) => *v,
        None => cur_end,
    };
    validate_range(new_start, new_end)?;

    sqlx::query(
        "UPDATE calendar_events
         SET title       = COALESCE($1, title),
             description = COALESCE($2, description),
             location    = COALESCE($3, location),
             starts_at   = COALESCE($4, starts_at),
             ends_at     = CASE WHEN $5::BOOLEAN THEN $6 ELSE ends_at END,
             all_day     = COALESCE($7, all_day),
             updated_at  = NOW()
         WHERE id = $8",
    )
    .bind(payload.title.as_deref().map(str::trim))
    .bind(payload.description.as_deref().map(str::trim))
    .bind(payload.location.as_deref().map(str::trim))
    .bind(payload.starts_at)
    .bind(payload.ends_at.is_some())
    .bind(payload.ends_at.unwrap_or(None))
    .bind(payload.all_day)
    .bind(event_id)
    .execute(&state.db)
    .await?;

    let event = fetch_event(&state.db, event_id).await?;
    Ok(Json(event))
}

pub async fn delete_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, event_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let owner: Option<(Uuid,)> = sqlx::query_as(
        "SELECT created_by FROM calendar_events WHERE id = $1 AND group_id = $2",
    )
    .bind(event_id)
    .bind(group_id)
    .fetch_optional(&state.db)
    .await?;
    let Some((created_by,)) = owner else {
        return Err(AppError::NotFound("event not found".into()));
    };
    if created_by != user.id {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM calendar_events WHERE id = $1")
        .bind(event_id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ---------- helpers ----------

fn validate_range(
    starts_at: DateTime<Utc>,
    ends_at: Option<DateTime<Utc>>,
) -> Result<(), AppError> {
    if let Some(end) = ends_at {
        if end < starts_at {
            return Err(AppError::BadRequest(
                "ends_at must be greater than or equal to starts_at".into(),
            ));
        }
    }
    Ok(())
}

type EventRow = (
    Uuid,
    Uuid,
    String,
    String,
    String,
    DateTime<Utc>,
    Option<DateTime<Utc>>,
    bool,
    Uuid,
    String,
    DateTime<Utc>,
    DateTime<Utc>,
);

const EVENT_SELECT: &str = "\
    SELECT ce.id, ce.group_id, ce.title, ce.description, ce.location, \
           ce.starts_at, ce.ends_at, ce.all_day, \
           ce.created_by, u.display_name, ce.created_at, ce.updated_at \
    FROM calendar_events ce \
    INNER JOIN users u ON u.id = ce.created_by";

fn row_into_event(row: EventRow) -> CalendarEvent {
    CalendarEvent {
        id: row.0,
        group_id: row.1,
        title: row.2,
        description: row.3,
        location: row.4,
        starts_at: row.5,
        ends_at: row.6,
        all_day: row.7,
        created_by: row.8,
        created_by_display_name: row.9,
        created_at: row.10,
        updated_at: row.11,
    }
}

async fn fetch_events(pool: &PgPool, group_id: Uuid) -> AppResult<Vec<CalendarEvent>> {
    let sql = format!("{EVENT_SELECT} WHERE ce.group_id = $1 ORDER BY ce.starts_at ASC");
    let rows: Vec<EventRow> = sqlx::query_as(&sql).bind(group_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_event).collect())
}

async fn fetch_event(pool: &PgPool, id: Uuid) -> AppResult<CalendarEvent> {
    let sql = format!("{EVENT_SELECT} WHERE ce.id = $1");
    let row: EventRow = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_event(row))
}
