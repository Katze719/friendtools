//! Trip CRUD: a "trip" is a concrete vacation or event belonging to a
//! group. Every child resource (links, folders, packing items, itinerary
//! items) now hangs off a trip_id.

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    google_calendar::{self, TripSyncPayload},
    state::AppState,
};

/// One destination in a trip. All fields besides `name` are optional so
/// users can drop in a rough "Lisbon" without needing coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Destination {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lat: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lng: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct Trip {
    pub id: Uuid,
    pub group_id: Uuid,
    pub name: String,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub destinations: Vec<Destination>,
    pub budget_cents: Option<i64>,
    /// Sum of all expenses explicitly tied to this trip. Expenses without
    /// a `trip_id` don't contribute - those are general group expenses.
    pub spent_cents: i64,
    pub position: i32,
    pub created_by: Uuid,
    pub created_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateTripRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
    #[serde(default)]
    pub start_date: Option<NaiveDate>,
    #[serde(default)]
    pub end_date: Option<NaiveDate>,
    #[serde(default)]
    pub destinations: Vec<DestinationInput>,
    #[serde(default)]
    pub budget_cents: Option<i64>,
}

/// All fields optional: only the keys present in the payload are applied.
/// Explicit `null` clears the value where that makes sense (dates, budget).
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateTripRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "opt_opt_date")]
    pub start_date: Option<Option<NaiveDate>>,
    #[serde(default, deserialize_with = "opt_opt_date")]
    pub end_date: Option<Option<NaiveDate>>,
    #[serde(default)]
    pub destinations: Option<Vec<DestinationInput>>,
    #[serde(default, deserialize_with = "opt_opt_i64")]
    pub budget_cents: Option<Option<i64>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct DestinationInput {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
    #[validate(range(min = -90.0, max = 90.0))]
    pub lat: Option<f64>,
    #[validate(range(min = -180.0, max = 180.0))]
    pub lng: Option<f64>,
}

fn opt_opt_date<'de, D>(de: D) -> Result<Option<Option<NaiveDate>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<NaiveDate>::deserialize(de)?))
}
fn opt_opt_i64<'de, D>(de: D) -> Result<Option<Option<i64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<i64>::deserialize(de)?))
}

// -------------------------------------------------------------------------

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<Trip>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    Ok(Json(fetch_all(&state.db, group_id).await?))
}

pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Trip>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;
    Ok(Json(fetch_one(&state.db, trip_id).await?))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateTripRequest>,
) -> AppResult<Json<Trip>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    for d in &payload.destinations {
        d.validate()?;
    }

    if let (Some(s), Some(e)) = (payload.start_date, payload.end_date) {
        if s > e {
            return Err(AppError::BadRequest(
                "start_date must not be after end_date".into(),
            ));
        }
    }
    if let Some(b) = payload.budget_cents {
        if b < 0 {
            return Err(AppError::BadRequest("budget must not be negative".into()));
        }
    }

    let destinations: Vec<Destination> = payload
        .destinations
        .into_iter()
        .map(|d| Destination {
            name: d.name.trim().to_string(),
            lat: d.lat,
            lng: d.lng,
        })
        .collect();
    let destinations_json =
        serde_json::to_value(&destinations).unwrap_or_else(|_| serde_json::json!([]));

    // Append at the bottom so existing trips keep their order.
    let next_position: (i32,) =
        sqlx::query_as("SELECT COALESCE(MAX(position), -1) + 1 FROM trips WHERE group_id = $1")
            .bind(group_id)
            .fetch_one(&state.db)
            .await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO trips (group_id, name, start_date, end_date, destinations, budget_cents, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id",
    )
    .bind(group_id)
    .bind(payload.name.trim())
    .bind(payload.start_date)
    .bind(payload.end_date)
    .bind(&destinations_json)
    .bind(payload.budget_cents)
    .bind(next_position.0)
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    let t = fetch_one(&state.db, id.0).await?;
    google_calendar::spawn_sync_trip_saved(state.clone(), user.id, trip_sync_payload(&t));
    Ok(Json(t))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateTripRequest>,
) -> AppResult<Json<Trip>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_in_group(&state.db, trip_id, group_id).await?;

    // Load the current row so we can cross-validate start_date vs end_date
    // even if only one side of the pair is being updated.
    let current = fetch_one(&state.db, trip_id).await?;
    let start = match &payload.start_date {
        Some(v) => *v,
        None => current.start_date,
    };
    let end = match &payload.end_date {
        Some(v) => *v,
        None => current.end_date,
    };
    if let (Some(s), Some(e)) = (start, end) {
        if s > e {
            return Err(AppError::BadRequest(
                "start_date must not be after end_date".into(),
            ));
        }
    }
    if let Some(Some(b)) = payload.budget_cents {
        if b < 0 {
            return Err(AppError::BadRequest("budget must not be negative".into()));
        }
    }
    if let Some(list) = &payload.destinations {
        for d in list {
            d.validate()?;
        }
    }

    if let Some(name) = payload.name.as_deref() {
        sqlx::query("UPDATE trips SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name.trim())
            .bind(trip_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(start_opt) = payload.start_date {
        sqlx::query("UPDATE trips SET start_date = $1, updated_at = NOW() WHERE id = $2")
            .bind(start_opt)
            .bind(trip_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(end_opt) = payload.end_date {
        sqlx::query("UPDATE trips SET end_date = $1, updated_at = NOW() WHERE id = $2")
            .bind(end_opt)
            .bind(trip_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(budget_opt) = payload.budget_cents {
        sqlx::query("UPDATE trips SET budget_cents = $1, updated_at = NOW() WHERE id = $2")
            .bind(budget_opt)
            .bind(trip_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(dest_list) = payload.destinations {
        let destinations: Vec<Destination> = dest_list
            .into_iter()
            .map(|d| Destination {
                name: d.name.trim().to_string(),
                lat: d.lat,
                lng: d.lng,
            })
            .collect();
        let destinations_json =
            serde_json::to_value(&destinations).unwrap_or_else(|_| serde_json::json!([]));
        sqlx::query("UPDATE trips SET destinations = $1, updated_at = NOW() WHERE id = $2")
            .bind(&destinations_json)
            .bind(trip_id)
            .execute(&state.db)
            .await?;
    }

    let t = fetch_one(&state.db, trip_id).await?;
    google_calendar::spawn_sync_trip_saved(state.clone(), user.id, trip_sync_payload(&t));
    Ok(Json(t))
}

pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, trip_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    google_calendar::spawn_sync_trip_deleted(state.clone(), user.id, trip_id);

    let res = sqlx::query("DELETE FROM trips WHERE id = $1 AND group_id = $2")
        .bind(trip_id)
        .bind(group_id)
        .execute(&state.db)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("trip not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

fn trip_sync_payload(trip: &Trip) -> TripSyncPayload {
    TripSyncPayload {
        trip_id: trip.id,
        group_id: trip.group_id,
        name: trip.name.clone(),
        start_date: trip.start_date,
        end_date: trip.end_date,
        locations: trip.destinations.iter().map(|d| d.name.clone()).collect(),
    }
}

// -------------------------------------------------------------------------
// Shared helpers (used by link/packing/itinerary handlers).

/// Verify that the given trip belongs to the given group. Handlers should
/// pair this with `ensure_member` so that a member of group A can't peek at
/// trip ids they guessed from group B.
pub async fn ensure_in_group(pool: &PgPool, trip_id: Uuid, group_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM trips WHERE id = $1 AND group_id = $2")
            .bind(trip_id)
            .bind(group_id)
            .fetch_optional(pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("trip not found".into()));
    }
    Ok(())
}

// -------------------------------------------------------------------------

type Row = (
    Uuid,
    Uuid,
    String,
    Option<NaiveDate>,
    Option<NaiveDate>,
    serde_json::Value,
    Option<i64>,
    i32,
    Uuid,
    String,
    DateTime<Utc>,
    DateTime<Utc>,
    i64,
);

// `spent_cents` comes from a correlated subquery so each trip carries its
// precomputed budget usage without a separate round-trip. COALESCE keeps it
// at 0 for trips that have no expenses yet.
const SELECT: &str = "\
    SELECT t.id, t.group_id, t.name, t.start_date, t.end_date, t.destinations, \
           t.budget_cents, t.position, t.created_by, u.display_name, \
           t.created_at, t.updated_at, \
           COALESCE((SELECT SUM(e.amount_cents) FROM expenses e WHERE e.trip_id = t.id), 0)::BIGINT AS spent_cents \
      FROM trips t \
      INNER JOIN users u ON u.id = t.created_by";

fn row_into_trip(row: Row) -> Trip {
    let destinations: Vec<Destination> = serde_json::from_value(row.5).unwrap_or_default();
    Trip {
        id: row.0,
        group_id: row.1,
        name: row.2,
        start_date: row.3,
        end_date: row.4,
        destinations,
        budget_cents: row.6,
        position: row.7,
        created_by: row.8,
        created_by_display_name: row.9,
        created_at: row.10,
        updated_at: row.11,
        spent_cents: row.12,
    }
}

async fn fetch_all(pool: &PgPool, group_id: Uuid) -> AppResult<Vec<Trip>> {
    let sql = format!(
        "{SELECT} WHERE t.group_id = $1 \
         ORDER BY t.position ASC, t.created_at ASC"
    );
    let rows: Vec<Row> = sqlx::query_as(&sql).bind(group_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_trip).collect())
}

async fn fetch_one(pool: &PgPool, id: Uuid) -> AppResult<Trip> {
    let sql = format!("{SELECT} WHERE t.id = $1");
    let row: Row = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_trip(row))
}
