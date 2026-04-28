use axum::{
    extract::{Query, State},
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    auth::{
        jwt::{create_google_oauth_state_token, decode_google_oauth_state_token},
        middleware::AuthUser,
    },
    error::{AppError, AppResult},
    state::AppState,
};

use super::crypto::encrypt_token;
use super::oauth;

#[derive(Serialize)]
pub struct StatusResponse {
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calendar_id: Option<String>,
}

#[derive(Serialize)]
pub struct AuthorizeResponse {
    pub url: String,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/status", get(status))
        .route("/authorize", get(authorize))
        .route("/disconnect", post(disconnect))
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Browser redirect target for Google OAuth (no JWT — validates `state`).
pub async fn oauth_callback(
    State(state): State<AppState>,
    Query(q): Query<CallbackQuery>,
) -> Result<Redirect, AppError> {
    let base = state.cfg.app_base_url.trim_end_matches('/');
    let err_redirect =
        |msg: &str| format!("{}/me/integrations/google-calendar?error={}", base, urlencoding::encode(msg));

    if let Some(err) = q.error {
        return Ok(Redirect::temporary(&err_redirect(&format!("google: {err}"))));
    }

    let Some(code) = q.code.filter(|c| !c.is_empty()) else {
        return Ok(Redirect::temporary(&err_redirect("missing code")));
    };
    let Some(state_jwt) = q.state.filter(|s| !s.is_empty()) else {
        return Ok(Redirect::temporary(&err_redirect("missing state")));
    };

    let claims = match decode_google_oauth_state_token(&state_jwt, &state.cfg.jwt_secret) {
        Ok(c) => c,
        Err(_) => {
            return Ok(Redirect::temporary(&err_redirect(
                "invalid or expired OAuth state — try connecting again",
            )));
        }
    };
    if claims.purpose != "google_calendar_oauth" {
        return Ok(Redirect::temporary(&err_redirect("invalid OAuth state")));
    }
    let user_id = claims.sub;

    let Some(ref gcal) = state.cfg.google_calendar else {
        return Ok(Redirect::temporary(&err_redirect(
            "Google Calendar is not configured",
        )));
    };

    let tokens = oauth::exchange_code_for_tokens(
        &state.http,
        &gcal.client_id,
        &gcal.client_secret,
        &gcal.redirect_uri,
        &code,
    )
    .await
    .map_err(|e| AppError::BadRequest(format!("token exchange failed: {e}")))?;

    let refresh = tokens
        .refresh_token
        .ok_or_else(|| AppError::BadRequest("Google did not return a refresh token".into()))?;

    let enc = encrypt_token(&gcal.token_encryption_key, &refresh)
        .map_err(|e| AppError::BadRequest(format!("encrypt token: {e}")))?;

    sqlx::query(
        "INSERT INTO user_google_calendar (user_id, refresh_token_enc, google_calendar_id, updated_at)
         VALUES ($1, $2, 'primary', NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           refresh_token_enc = EXCLUDED.refresh_token_enc,
           google_calendar_id = EXCLUDED.google_calendar_id,
           updated_at = NOW()",
    )
    .bind(user_id)
    .bind(&enc)
    .execute(&state.db)
    .await?;

    super::sync::spawn_backfill_existing_entities(state.clone(), user_id);

    Ok(Redirect::temporary(&format!(
        "{}/me/integrations/google-calendar?connected=1",
        base
    )))
}

async fn status(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<StatusResponse>> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT google_calendar_id FROM user_google_calendar WHERE user_id = $1")
            .bind(user.id)
            .fetch_optional(&state.db)
            .await?;

    Ok(Json(StatusResponse {
        connected: row.is_some(),
        calendar_id: row.map(|r| r.0),
    }))
}

async fn authorize(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<AuthorizeResponse>> {
    let Some(ref gcal) = state.cfg.google_calendar else {
        return Err(AppError::BadRequest(
            "Google Calendar integration is not configured on this server.".into(),
        ));
    };

    let state_token = create_google_oauth_state_token(user.id, &state.cfg.jwt_secret)
        .map_err(AppError::Jwt)?;

    let scope = "https://www.googleapis.com/auth/calendar.events";
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
        urlencoding::encode(&gcal.client_id),
        urlencoding::encode(&gcal.redirect_uri),
        urlencoding::encode(scope),
        urlencoding::encode(&state_token),
    );

    Ok(Json(AuthorizeResponse { url }))
}

async fn disconnect(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let _ = state.cfg.google_calendar.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "Google Calendar integration is not configured on this server.".into(),
        )
    })?;

    sqlx::query("DELETE FROM google_calendar_sync_map WHERE user_id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    sqlx::query("DELETE FROM user_google_calendar WHERE user_id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    Ok(Json(json!({ "ok": true })))
}
