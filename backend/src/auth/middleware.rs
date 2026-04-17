use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

use super::jwt::decode_token;

/// Authenticated user extracted from `Authorization: Bearer <jwt>`.
///
/// Requires the account to be approved. Revoked/deleted users are rejected
/// even if they present a still-valid token.
#[derive(Debug, Clone, Copy)]
pub struct AuthUser {
    pub id: Uuid,
    pub is_admin: bool,
}

/// Wrapper that requires `is_admin = true`. Reject otherwise.
#[derive(Debug, Clone, Copy)]
pub struct AdminUser(pub AuthUser);

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;

        let token = header
            .strip_prefix("Bearer ")
            .or_else(|| header.strip_prefix("bearer "))
            .ok_or(AppError::Unauthorized)?
            .trim();

        if token.is_empty() {
            return Err(AppError::Unauthorized);
        }

        let claims = decode_token(token, &state.cfg.jwt_secret)
            .map_err(|_| AppError::Unauthorized)?;

        let row: Option<(Uuid, String, bool)> =
            sqlx::query_as("SELECT id, status, is_admin FROM users WHERE id = $1")
                .bind(claims.sub)
                .fetch_optional(&state.db)
                .await?;

        let Some((id, status, is_admin)) = row else {
            return Err(AppError::Unauthorized);
        };

        if status != "approved" {
            return Err(AppError::AccountPending);
        }

        Ok(AuthUser { id, is_admin })
    }
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if !user.is_admin {
            return Err(AppError::Forbidden);
        }
        Ok(AdminUser(user))
    }
}
