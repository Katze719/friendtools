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
    google_calendar,
    state::AppState,
};

/// Owner axis for calendar rows. A calendar event (or category) is either
/// shared with a group or private to a single user - never both. The SQL
/// side enforces this via a CHECK constraint; Rust-side we thread it as a
/// small enum so handlers stay small and per-column predicates are
/// derived centrally.
#[derive(Debug, Clone, Copy)]
pub enum Scope {
    Group { group_id: Uuid, user_id: Uuid },
    Personal { user_id: Uuid },
}

impl Scope {
    pub fn acting_user(&self) -> Uuid {
        match self {
            Scope::Group { user_id, .. } | Scope::Personal { user_id } => *user_id,
        }
    }

    /// Resolve from the URL prefix plus the authenticated user. The group
    /// variant additionally verifies membership so every handler gets a
    /// single access check.
    pub async fn for_group(state: &AppState, group_id: Uuid, user: &AuthUser) -> AppResult<Self> {
        crate::groups::ensure_member(state, group_id, user.id).await?;
        Ok(Scope::Group {
            group_id,
            user_id: user.id,
        })
    }

    pub fn for_personal(user: &AuthUser) -> Self {
        Scope::Personal { user_id: user.id }
    }
}

#[derive(Debug, Serialize)]
pub struct CalendarEvent {
    pub id: Uuid,
    pub group_id: Option<Uuid>,
    pub owner_user_id: Option<Uuid>,
    pub title: String,
    pub description: String,
    pub location: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: Option<DateTime<Utc>>,
    pub all_day: bool,
    pub category: Option<CategoryRef>,
    pub created_by: Uuid,
    pub created_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl CalendarEvent {
    pub(crate) fn google_sync_payload(&self) -> crate::google_calendar::CalendarEventPayload {
        crate::google_calendar::CalendarEventPayload {
            id: self.id,
            title: self.title.clone(),
            description: self.description.clone(),
            location: self.location.clone(),
            starts_at: self.starts_at,
            ends_at: self.ends_at,
            all_day: self.all_day,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CategoryRef {
    pub id: Uuid,
    pub name: String,
    pub color: String,
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
    #[serde(default)]
    pub category_id: Option<Uuid>,
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
    /// Same double-option trick: `Some(None)` clears the category,
    /// `None` means "leave it alone".
    #[serde(default, deserialize_with = "double_option")]
    pub category_id: Option<Option<Uuid>>,
}

/// Allow `{ "ends_at": null }` to mean "clear it" vs. missing field = leave it.
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(de).map(Some)
}

// ---------- group-scoped handlers ----------

pub async fn list_group_events(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<CalendarEvent>>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    Ok(Json(fetch_events(&state.db, scope).await?))
}

pub async fn create_group_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateEventRequest>,
) -> AppResult<Json<CalendarEvent>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    let ev = create_event(&state.db, scope, payload).await?;
    let g = ev.google_sync_payload();
    google_calendar::spawn_sync_calendar_event_saved(state.clone(), user.id, g);
    Ok(Json(ev))
}

pub async fn update_group_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, event_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateEventRequest>,
) -> AppResult<Json<CalendarEvent>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    let ev = update_event(&state.db, scope, event_id, payload).await?;
    let g = ev.google_sync_payload();
    google_calendar::spawn_sync_calendar_event_saved(state.clone(), user.id, g);
    Ok(Json(ev))
}

pub async fn delete_group_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, event_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    google_calendar::spawn_sync_calendar_deleted(state.clone(), user.id, event_id);
    delete_event(&state.db, scope, event_id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ---------- personal-scoped handlers ----------

pub async fn list_personal_events(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<CalendarEvent>>> {
    let scope = Scope::for_personal(&user);
    Ok(Json(fetch_events(&state.db, scope).await?))
}

pub async fn create_personal_event(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateEventRequest>,
) -> AppResult<Json<CalendarEvent>> {
    let scope = Scope::for_personal(&user);
    let ev = create_event(&state.db, scope, payload).await?;
    let g = ev.google_sync_payload();
    google_calendar::spawn_sync_calendar_event_saved(state.clone(), user.id, g);
    Ok(Json(ev))
}

pub async fn update_personal_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(payload): Json<UpdateEventRequest>,
) -> AppResult<Json<CalendarEvent>> {
    let scope = Scope::for_personal(&user);
    let ev = update_event(&state.db, scope, event_id, payload).await?;
    let g = ev.google_sync_payload();
    google_calendar::spawn_sync_calendar_event_saved(state.clone(), user.id, g);
    Ok(Json(ev))
}

pub async fn delete_personal_event(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_personal(&user);
    google_calendar::spawn_sync_calendar_deleted(state.clone(), user.id, event_id);
    delete_event(&state.db, scope, event_id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ---------- core CRUD (scope-agnostic) ----------

async fn create_event(
    pool: &PgPool,
    scope: Scope,
    payload: CreateEventRequest,
) -> AppResult<CalendarEvent> {
    payload.validate()?;
    validate_range(payload.starts_at, payload.ends_at)?;
    if let Some(cat_id) = payload.category_id {
        ensure_category_in_scope(pool, scope, cat_id).await?;
    }

    let (group_id, owner_user_id) = match scope {
        Scope::Group { group_id, .. } => (Some(group_id), None),
        Scope::Personal { user_id } => (None, Some(user_id)),
    };

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO calendar_events
            (group_id, owner_user_id, created_by, title, description, location,
             starts_at, ends_at, all_day, category_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id",
    )
    .bind(group_id)
    .bind(owner_user_id)
    .bind(scope.acting_user())
    .bind(payload.title.trim())
    .bind(payload.description.trim())
    .bind(payload.location.trim())
    .bind(payload.starts_at)
    .bind(payload.ends_at)
    .bind(payload.all_day)
    .bind(payload.category_id)
    .fetch_one(pool)
    .await?;

    fetch_event(pool, scope, id.0).await
}

async fn update_event(
    pool: &PgPool,
    scope: Scope,
    event_id: Uuid,
    payload: UpdateEventRequest,
) -> AppResult<CalendarEvent> {
    payload.validate()?;

    // Confirm the target exists in-scope before touching it; also gives us
    // the current range for validation.
    let (scope_sql, owner) = scope_filter(scope);
    let existing: Option<(DateTime<Utc>, Option<DateTime<Utc>>)> = sqlx::query_as(&format!(
        "SELECT starts_at, ends_at FROM calendar_events WHERE id = $1 AND {scope_sql}",
    ))
    .bind(event_id)
    .bind(owner)
    .fetch_optional(pool)
    .await?;

    let Some((cur_start, cur_end)) = existing else {
        return Err(AppError::NotFound("event not found".into()));
    };

    let new_start = payload.starts_at.unwrap_or(cur_start);
    let new_end = match &payload.ends_at {
        Some(v) => *v,
        None => cur_end,
    };
    validate_range(new_start, new_end)?;

    if let Some(Some(cat_id)) = payload.category_id {
        ensure_category_in_scope(pool, scope, cat_id).await?;
    }

    sqlx::query(
        "UPDATE calendar_events
         SET title       = COALESCE($1, title),
             description = COALESCE($2, description),
             location    = COALESCE($3, location),
             starts_at   = COALESCE($4, starts_at),
             ends_at     = CASE WHEN $5::BOOLEAN THEN $6 ELSE ends_at END,
             all_day     = COALESCE($7, all_day),
             category_id = CASE WHEN $8::BOOLEAN THEN $9 ELSE category_id END,
             updated_at  = NOW()
         WHERE id = $10",
    )
    .bind(payload.title.as_deref().map(str::trim))
    .bind(payload.description.as_deref().map(str::trim))
    .bind(payload.location.as_deref().map(str::trim))
    .bind(payload.starts_at)
    .bind(payload.ends_at.is_some())
    .bind(payload.ends_at.unwrap_or(None))
    .bind(payload.all_day)
    .bind(payload.category_id.is_some())
    .bind(payload.category_id.unwrap_or(None))
    .bind(event_id)
    .execute(pool)
    .await?;

    fetch_event(pool, scope, event_id).await
}

async fn delete_event(pool: &PgPool, scope: Scope, event_id: Uuid) -> AppResult<()> {
    let (scope_sql, owner) = scope_filter(scope);
    let result = sqlx::query(&format!(
        "DELETE FROM calendar_events WHERE id = $1 AND {scope_sql}",
    ))
    .bind(event_id)
    .bind(owner)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("event not found".into()));
    }
    Ok(())
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

/// Returns the WHERE fragment identifying this scope's rows, plus the
/// matching UUID bind. The fragment always references `$2` because it is
/// concatenated after a primary-key match at `$1`.
fn scope_filter(scope: Scope) -> (&'static str, Uuid) {
    match scope {
        Scope::Group { group_id, .. } => ("group_id = $2", group_id),
        Scope::Personal { user_id } => ("owner_user_id = $2", user_id),
    }
}

type EventRow = (
    Uuid,
    Option<Uuid>,
    Option<Uuid>,
    String,
    String,
    String,
    DateTime<Utc>,
    Option<DateTime<Utc>>,
    bool,
    Option<Uuid>,
    Option<String>,
    Option<String>,
    Uuid,
    String,
    DateTime<Utc>,
    DateTime<Utc>,
);

const EVENT_SELECT: &str = "\
    SELECT ce.id, ce.group_id, ce.owner_user_id, ce.title, ce.description, ce.location, \
           ce.starts_at, ce.ends_at, ce.all_day, \
           cc.id, cc.name, cc.color, \
           ce.created_by, u.display_name, ce.created_at, ce.updated_at \
    FROM calendar_events ce \
    INNER JOIN users u ON u.id = ce.created_by \
    LEFT JOIN calendar_categories cc ON cc.id = ce.category_id";

fn row_into_event(row: EventRow) -> CalendarEvent {
    let category = match (row.9, row.10, row.11) {
        (Some(id), Some(name), Some(color)) => Some(CategoryRef { id, name, color }),
        _ => None,
    };
    CalendarEvent {
        id: row.0,
        group_id: row.1,
        owner_user_id: row.2,
        title: row.3,
        description: row.4,
        location: row.5,
        starts_at: row.6,
        ends_at: row.7,
        all_day: row.8,
        category,
        created_by: row.12,
        created_by_display_name: row.13,
        created_at: row.14,
        updated_at: row.15,
    }
}

async fn fetch_events(pool: &PgPool, scope: Scope) -> AppResult<Vec<CalendarEvent>> {
    let (sql, owner) = match scope {
        Scope::Group { group_id, .. } => (
            format!("{EVENT_SELECT} WHERE ce.group_id = $1 ORDER BY ce.starts_at ASC"),
            group_id,
        ),
        Scope::Personal { user_id } => (
            format!("{EVENT_SELECT} WHERE ce.owner_user_id = $1 ORDER BY ce.starts_at ASC"),
            user_id,
        ),
    };
    let rows: Vec<EventRow> = sqlx::query_as(&sql).bind(owner).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_event).collect())
}

async fn fetch_event(pool: &PgPool, scope: Scope, id: Uuid) -> AppResult<CalendarEvent> {
    let (sql, owner) = match scope {
        Scope::Group { group_id, .. } => (
            format!("{EVENT_SELECT} WHERE ce.id = $1 AND ce.group_id = $2"),
            group_id,
        ),
        Scope::Personal { user_id } => (
            format!("{EVENT_SELECT} WHERE ce.id = $1 AND ce.owner_user_id = $2"),
            user_id,
        ),
    };
    let row: Option<EventRow> = sqlx::query_as(&sql)
        .bind(id)
        .bind(owner)
        .fetch_optional(pool)
        .await?;
    row.map(row_into_event)
        .ok_or_else(|| AppError::NotFound("event not found".into()))
}

/// Rejects a `category_id` that doesn't belong to the same calendar as the
/// event is being written to. The DB alone can't express this because the
/// FK is unconditional; we add this check so private events can't borrow a
/// group category (and vice versa).
async fn ensure_category_in_scope(pool: &PgPool, scope: Scope, cat_id: Uuid) -> AppResult<()> {
    let row: Option<(Option<Uuid>, Option<Uuid>)> = sqlx::query_as(
        "SELECT group_id, owner_user_id FROM calendar_categories WHERE id = $1",
    )
    .bind(cat_id)
    .fetch_optional(pool)
    .await?;
    let Some((g, o)) = row else {
        return Err(AppError::NotFound("category not found".into()));
    };
    let matches = match scope {
        Scope::Group { group_id, .. } => g == Some(group_id),
        Scope::Personal { user_id } => o == Some(user_id),
    };
    if !matches {
        return Err(AppError::BadRequest(
            "category does not belong to this calendar".into(),
        ));
    }
    Ok(())
}
