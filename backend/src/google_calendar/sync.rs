//! Push calendar events and trips to Google Calendar (Friendflow → Google).

use axum::http::StatusCode;
use chrono::{DateTime, Duration as ChDuration, NaiveDate, Utc};
use chrono_tz::Tz;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    config::GoogleCalendarOAuth,
    state::AppState,
};

use super::oauth;

/// Serializable snapshot for Google push (avoids importing `calendar::handlers` from here).
#[derive(Clone, Debug)]
pub struct CalendarEventPayload {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub location: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: Option<DateTime<Utc>>,
    pub all_day: bool,
}

#[derive(Clone, Debug)]
pub enum SyncEntity {
    Calendar(CalendarEventPayload),
    Trip {
        trip_id: Uuid,
        group_id: Uuid,
        name: String,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
        locations: Vec<String>,
    },
}

pub fn spawn_sync_calendar_event_saved(state: AppState, user_id: Uuid, ev: CalendarEventPayload) {
    let ent = SyncEntity::Calendar(ev);
    spawn_sync_inner(state, user_id, ent);
}

pub fn spawn_sync_trip_saved(state: AppState, user_id: Uuid, trip_sync: TripSyncPayload) {
    let ent = SyncEntity::Trip {
        trip_id: trip_sync.trip_id,
        group_id: trip_sync.group_id,
        name: trip_sync.name,
        start_date: trip_sync.start_date,
        end_date: trip_sync.end_date,
        locations: trip_sync.locations,
    };
    spawn_sync_inner(state, user_id, ent);
}

#[derive(Clone)]
pub struct TripSyncPayload {
    pub trip_id: Uuid,
    pub group_id: Uuid,
    pub name: String,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub locations: Vec<String>,
}

fn spawn_sync_inner(state: AppState, user_id: Uuid, entity: SyncEntity) {
    let Some(ref gcal) = state.cfg.google_calendar else {
        return;
    };
    let gcal = gcal.clone();
    tokio::spawn(async move {
        if let Err(e) = sync_entity(&state, &gcal, user_id, entity).await {
            tracing::warn!(error = %e, user_id = %user_id, "google calendar sync failed");
        }
    });
}

pub fn spawn_sync_calendar_deleted(state: AppState, user_id: Uuid, event_id: Uuid) {
    let Some(ref gcal) = state.cfg.google_calendar else {
        return;
    };
    let gcal = gcal.clone();
    tokio::spawn(async move {
        if let Err(e) =
            delete_mapped_event(&state, &gcal, user_id, "calendar_event", event_id).await
        {
            tracing::warn!(error = %e, "google calendar delete sync failed");
        }
    });
}

pub fn spawn_sync_trip_deleted(state: AppState, user_id: Uuid, trip_id: Uuid) {
    let Some(ref gcal) = state.cfg.google_calendar else {
        return;
    };
    let gcal = gcal.clone();
    tokio::spawn(async move {
        if let Err(e) = delete_mapped_event(&state, &gcal, user_id, "trip", trip_id).await {
            tracing::warn!(error = %e, "google calendar trip delete sync failed");
        }
    });
}

async fn sync_entity(
    state: &AppState,
    gcal: &GoogleCalendarOAuth,
    user_id: Uuid,
    entity: SyncEntity,
) -> anyhow::Result<()> {
    let row = sqlx::query_as::<_, (Vec<u8>, String)>(
        "SELECT refresh_token_enc, google_calendar_id FROM user_google_calendar WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let Some((enc, calendar_id)) = row else {
        return Ok(()); // user did not connect Google
    };

    let refresh_plain = super::crypto::decrypt_token(&gcal.token_encryption_key, &enc)?;
    let access = oauth::refresh_access_token(
        &state.http,
        &gcal.client_id,
        &gcal.client_secret,
        &refresh_plain,
    )
    .await?;

    let access_token = access.access_token;

    match entity {
        SyncEntity::Calendar(ev) => {
            upsert_calendar_event(state, gcal, user_id, &calendar_id, &access_token, &ev).await
        }
        SyncEntity::Trip {
            trip_id,
            group_id,
            name,
            start_date,
            end_date,
            locations,
        } => {
            upsert_trip_event(
                state,
                gcal,
                user_id,
                &calendar_id,
                &access_token,
                trip_id,
                group_id,
                &name,
                start_date,
                end_date,
                &locations,
            )
            .await
        }
    }
}

#[derive(Debug, Deserialize)]
struct GoogleInsertResponse {
    id: String,
}

async fn upsert_calendar_event(
    state: &AppState,
    _gcal: &GoogleCalendarOAuth,
    user_id: Uuid,
    calendar_id: &str,
    access_token: &str,
    ev: &CalendarEventPayload,
) -> anyhow::Result<()> {
    let body = calendar_event_json(ev, state.cfg.app_timezone)?;
    let entity_id = ev.id;

    let existing: Option<String> = sqlx::query_scalar(
        "SELECT google_event_id FROM google_calendar_sync_map WHERE user_id = $1 AND entity_kind = 'calendar_event' AND entity_id = $2",
    )
    .bind(user_id)
    .bind(entity_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(geid) = existing {
        patch_event(
            state.http.clone(),
            access_token,
            calendar_id,
            &geid,
            body,
        )
        .await?;
    } else {
        let id = insert_event(state.http.clone(), access_token, calendar_id, body).await?;
        sqlx::query(
            "INSERT INTO google_calendar_sync_map (user_id, entity_kind, entity_id, google_calendar_id, google_event_id)
             VALUES ($1, 'calendar_event', $2, $3, $4)
             ON CONFLICT (user_id, entity_kind, entity_id)
             DO UPDATE SET google_event_id = EXCLUDED.google_event_id, google_calendar_id = EXCLUDED.google_calendar_id, updated_at = NOW()",
        )
        .bind(user_id)
        .bind(entity_id)
        .bind(calendar_id)
        .bind(&id)
        .execute(&state.db)
        .await?;
    }
    Ok(())
}

async fn upsert_trip_event(
    state: &AppState,
    gcal: &GoogleCalendarOAuth,
    user_id: Uuid,
    calendar_id: &str,
    access_token: &str,
    trip_id: Uuid,
    _group_id: Uuid,
    name: &str,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    locations: &[String],
) -> anyhow::Result<()> {
    if start_date.is_none() && end_date.is_none() {
        return delete_mapped_event(state, gcal, user_id, "trip", trip_id).await;
    }

    let body = trip_event_json(name, start_date, end_date, locations)?;
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT google_event_id FROM google_calendar_sync_map WHERE user_id = $1 AND entity_kind = 'trip' AND entity_id = $2",
    )
    .bind(user_id)
    .bind(trip_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(geid) = existing {
        patch_event(
            state.http.clone(),
            access_token,
            calendar_id,
            &geid,
            body,
        )
        .await?;
    } else {
        let id = insert_event(state.http.clone(), access_token, calendar_id, body).await?;
        sqlx::query(
            "INSERT INTO google_calendar_sync_map (user_id, entity_kind, entity_id, google_calendar_id, google_event_id)
             VALUES ($1, 'trip', $2, $3, $4)
             ON CONFLICT (user_id, entity_kind, entity_id)
             DO UPDATE SET google_event_id = EXCLUDED.google_event_id, google_calendar_id = EXCLUDED.google_calendar_id, updated_at = NOW()",
        )
        .bind(user_id)
        .bind(trip_id)
        .bind(calendar_id)
        .bind(&id)
        .execute(&state.db)
        .await?;
    }
    Ok(())
}

fn calendar_event_json(ev: &CalendarEventPayload, tz: Tz) -> anyhow::Result<Value> {
    let summary = ev.title.trim();
    let description = ev.description.trim();
    let location = ev.location.trim();

    if ev.all_day {
        // Events are stored as UTC; the UI picks local calendar days. Use the same
        // zone as APP_TIMEZONE so Google all-day `date` matches what users chose.
        let start = ev.starts_at.with_timezone(&tz).date_naive();
        let end_day = ev
            .ends_at
            .map(|e| e.with_timezone(&tz).date_naive())
            .unwrap_or(start);
        let exclusive_end = if end_day <= start {
            start + ChDuration::days(1)
        } else {
            end_day + ChDuration::days(1)
        };
        Ok(json!({
            "summary": summary,
            "description": description,
            "location": location,
            "start": { "date": start.format("%Y-%m-%d").to_string() },
            "end": { "date": exclusive_end.format("%Y-%m-%d").to_string() },
        }))
    } else {
        let end = ev
            .ends_at
            .unwrap_or_else(|| ev.starts_at + ChDuration::hours(1));
        Ok(json!({
            "summary": summary,
            "description": description,
            "location": location,
            "start": { "dateTime": ev.starts_at.to_rfc3339(), "timeZone": "UTC" },
            "end": { "dateTime": end.to_rfc3339(), "timeZone": "UTC" },
        }))
    }
}

fn trip_event_json(
    name: &str,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    locations: &[String],
) -> anyhow::Result<Value> {
    let start = match (start_date, end_date) {
        (Some(s), Some(e)) => s.min(e),
        (Some(s), None) => s,
        (None, Some(e)) => e,
        (None, None) => anyhow::bail!("trip has no dates"),
    };
    let end_inclusive = match (start_date, end_date) {
        (Some(s), Some(e)) => s.max(e),
        (Some(s), None) => s,
        (None, Some(e)) => e,
        (None, None) => start,
    };
    let exclusive_end = end_inclusive + ChDuration::days(1);
    let loc = locations
        .iter()
        .filter(|s| !s.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    Ok(json!({
        "summary": name.trim(),
        "description": "Trip (Friendflow)",
        "location": loc,
        "start": { "date": start.format("%Y-%m-%d").to_string() },
        "end": { "date": exclusive_end.format("%Y-%m-%d").to_string() },
    }))
}

async fn insert_event(
    http: reqwest::Client,
    access_token: &str,
    calendar_id: &str,
    body: Value,
) -> anyhow::Result<String> {
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events",
        urlencoding::encode(calendar_id)
    );
    let res = http
        .post(url)
        .bearer_auth(access_token)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await?;
    let status = res.status();
    let text = res.text().await?;
    if status != StatusCode::OK && status != StatusCode::CREATED {
        anyhow::bail!("google insert {}: {}", status, text);
    }
    let parsed: GoogleInsertResponse = serde_json::from_str(&text)?;
    Ok(parsed.id)
}

async fn patch_event(
    http: reqwest::Client,
    access_token: &str,
    calendar_id: &str,
    event_id: &str,
    body: Value,
) -> anyhow::Result<()> {
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
        urlencoding::encode(calendar_id),
        urlencoding::encode(event_id)
    );
    let res = http
        .patch(url)
        .bearer_auth(access_token)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        anyhow::bail!("google patch {}: {}", status, text);
    }
    Ok(())
}

async fn delete_google_event_api(
    http: &reqwest::Client,
    access_token: &str,
    calendar_id: &str,
    google_event_id: &str,
) -> anyhow::Result<()> {
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
        urlencoding::encode(calendar_id),
        urlencoding::encode(google_event_id)
    );
    let res = http
        .delete(url)
        .bearer_auth(access_token)
        .send()
        .await?;
    let status = res.status();
    if status == StatusCode::NOT_FOUND || status == StatusCode::GONE {
        return Ok(());
    }
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        anyhow::bail!("google delete {}: {}", status, text);
    }
    Ok(())
}

async fn delete_mapped_event(
    state: &AppState,
    gcal: &GoogleCalendarOAuth,
    user_id: Uuid,
    entity_kind: &str,
    entity_id: Uuid,
) -> anyhow::Result<()> {
    let row = sqlx::query_as::<_, (Vec<u8>, String)>(
        "SELECT refresh_token_enc, google_calendar_id FROM user_google_calendar WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let mapped_ge: Option<String> = sqlx::query_scalar(
        "SELECT google_event_id FROM google_calendar_sync_map WHERE user_id = $1 AND entity_kind = $2 AND entity_id = $3",
    )
    .bind(user_id)
    .bind(entity_kind)
    .bind(entity_id)
    .fetch_optional(&state.db)
    .await?;

    sqlx::query(
        "DELETE FROM google_calendar_sync_map WHERE user_id = $1 AND entity_kind = $2 AND entity_id = $3",
    )
    .bind(user_id)
    .bind(entity_kind)
    .bind(entity_id)
    .execute(&state.db)
    .await?;

    let Some(geid) = mapped_ge else {
        return Ok(());
    };

    let Some((enc, calendar_id)) = row else {
        return Ok(());
    };

    let refresh_plain = super::crypto::decrypt_token(&gcal.token_encryption_key, &enc)?;
    let access = oauth::refresh_access_token(
        &state.http,
        &gcal.client_id,
        &gcal.client_secret,
        &refresh_plain,
    )
    .await?;

    let _ = delete_google_event_api(
        &state.http,
        &access.access_token,
        &calendar_id,
        &geid,
    )
    .await;

    Ok(())
}
