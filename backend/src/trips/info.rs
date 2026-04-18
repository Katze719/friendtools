use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

/// One destination in a trip. All fields besides `name` are optional so users
/// can drop in a rough "Lisbon" without needing coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Destination {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lat: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lng: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct TripInfo {
    pub group_id: Uuid,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub destinations: Vec<Destination>,
    pub budget_cents: Option<i64>,
    pub updated_at: DateTime<Utc>,
}

/// PUT /trips/info is an "upsert": any member can overwrite the metadata.
/// Every field is optional; missing fields are cleared to keep semantics
/// obvious (this is how the UI presents them).
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateInfoRequest {
    #[serde(default)]
    pub start_date: Option<NaiveDate>,
    #[serde(default)]
    pub end_date: Option<NaiveDate>,
    #[serde(default)]
    pub destinations: Vec<DestinationInput>,
    #[serde(default)]
    pub budget_cents: Option<i64>,
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

pub async fn get_info(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<TripInfo>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    let info = load_or_default(&state, group_id).await?;
    Ok(Json(info))
}

pub async fn update_info(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<UpdateInfoRequest>,
) -> AppResult<Json<TripInfo>> {
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

    sqlx::query(
        "INSERT INTO trip_info (group_id, start_date, end_date, destinations, budget_cents, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (group_id) DO UPDATE
           SET start_date = EXCLUDED.start_date,
               end_date = EXCLUDED.end_date,
               destinations = EXCLUDED.destinations,
               budget_cents = EXCLUDED.budget_cents,
               updated_at = NOW()",
    )
    .bind(group_id)
    .bind(payload.start_date)
    .bind(payload.end_date)
    .bind(&destinations_json)
    .bind(payload.budget_cents)
    .execute(&state.db)
    .await?;

    let info = load_or_default(&state, group_id).await?;
    Ok(Json(info))
}

async fn load_or_default(state: &AppState, group_id: Uuid) -> AppResult<TripInfo> {
    let row: Option<(
        Option<NaiveDate>,
        Option<NaiveDate>,
        serde_json::Value,
        Option<i64>,
        DateTime<Utc>,
    )> = sqlx::query_as(
        "SELECT start_date, end_date, destinations, budget_cents, updated_at
         FROM trip_info WHERE group_id = $1",
    )
    .bind(group_id)
    .fetch_optional(&state.db)
    .await?;

    let Some((start_date, end_date, destinations_json, budget_cents, updated_at)) = row else {
        return Ok(TripInfo {
            group_id,
            start_date: None,
            end_date: None,
            destinations: Vec::new(),
            budget_cents: None,
            updated_at: Utc::now(),
        });
    };

    let destinations: Vec<Destination> =
        serde_json::from_value(destinations_json).unwrap_or_default();

    Ok(TripInfo {
        group_id,
        start_date,
        end_date,
        destinations,
        budget_cents,
        updated_at,
    })
}
