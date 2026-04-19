use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    config::RegistrationMode,
    error::{AppError, AppResult},
    state::AppState,
};

use super::{jwt::create_token, middleware::AuthUser, password};

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 2, max = 64))]
    pub display_name: String,
    #[validate(length(min = 8, max = 200))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1))]
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub status: String,
    pub is_admin: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub status: String,
    /// Only present when the user is immediately approved (status = "approved").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    pub user: UserResponse,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserResponse,
}

/// Public instance metadata returned to unauthenticated clients so the
/// login and register screens can show whether this instance gates
/// sign-ups behind an admin. Intentionally tiny - only ship information
/// that's useful for the UI, nothing that could leak operational
/// details.
#[derive(Debug, Serialize)]
pub struct AuthConfigResponse {
    pub registration_mode: &'static str,
}

pub async fn config(State(state): State<AppState>) -> Json<AuthConfigResponse> {
    Json(AuthConfigResponse {
        registration_mode: match state.cfg.registration_mode {
            RegistrationMode::Approval => "approval",
            RegistrationMode::Open => "open",
        },
    })
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> AppResult<Json<RegisterResponse>> {
    payload.validate()?;

    let email = payload.email.trim().to_lowercase();
    let display_name = payload.display_name.trim().to_string();

    let existing: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if existing.is_some() {
        return Err(AppError::Conflict("email already registered".into()));
    }

    let hash = password::hash_password(&payload.password)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("hash error: {e}")))?;

    // Depending on REGISTRATION_MODE either leave the user pending (default;
    // an admin has to approve them before they can log in) or auto-approve
    // them so they can start using the app immediately.
    let row: (Uuid, String, String, String, bool, DateTime<Utc>) =
        match state.cfg.registration_mode {
            RegistrationMode::Approval => {
                sqlx::query_as(
                    "INSERT INTO users (email, display_name, password_hash)
                     VALUES ($1, $2, $3)
                     RETURNING id, email, display_name, status, is_admin, created_at",
                )
                .bind(&email)
                .bind(&display_name)
                .bind(&hash)
                .fetch_one(&state.db)
                .await?
            }
            RegistrationMode::Open => {
                sqlx::query_as(
                    "INSERT INTO users (email, display_name, password_hash, status, approved_at)
                     VALUES ($1, $2, $3, 'approved', NOW())
                     RETURNING id, email, display_name, status, is_admin, created_at",
                )
                .bind(&email)
                .bind(&display_name)
                .bind(&hash)
                .fetch_one(&state.db)
                .await?
            }
        };

    let user = UserResponse {
        id: row.0,
        email: row.1,
        display_name: row.2,
        status: row.3.clone(),
        is_admin: row.4,
        created_at: row.5,
    };

    // Only approved users get a token; pending users still need an admin
    // to unlock their account before they can sign in.
    let token = if user.status == "approved" {
        Some(create_token(
            user.id,
            &state.cfg.jwt_secret,
            state.cfg.jwt_expiry_hours,
        )?)
    } else {
        None
    };

    Ok(Json(RegisterResponse {
        status: user.status.clone(),
        token,
        user,
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    payload.validate()?;
    let email = payload.email.trim().to_lowercase();

    let row: Option<(Uuid, String, String, String, String, bool, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, email, display_name, password_hash, status, is_admin, created_at
         FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;

    let Some((id, email, display_name, password_hash, status, is_admin, created_at)) = row else {
        return Err(AppError::Unauthorized);
    };

    let ok = password::verify_password(&payload.password, &password_hash)
        .map_err(|_| AppError::Unauthorized)?;
    if !ok {
        return Err(AppError::Unauthorized);
    }

    // Correct credentials, but the account still needs admin approval.
    if status != "approved" {
        return Err(AppError::AccountPending);
    }

    let user = UserResponse {
        id,
        email,
        display_name,
        status,
        is_admin,
        created_at,
    };
    let token = create_token(user.id, &state.cfg.jwt_secret, state.cfg.jwt_expiry_hours)?;

    Ok(Json(LoginResponse { token, user }))
}

pub async fn me(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<UserResponse>> {
    let row: Option<(Uuid, String, String, String, bool, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, email, display_name, status, is_admin, created_at
         FROM users WHERE id = $1",
    )
    .bind(user.id)
    .fetch_optional(&state.db)
    .await?;

    let Some((id, email, display_name, status, is_admin, created_at)) = row else {
        return Err(AppError::Unauthorized);
    };

    Ok(Json(UserResponse {
        id,
        email,
        display_name,
        status,
        is_admin,
        created_at,
    }))
}
