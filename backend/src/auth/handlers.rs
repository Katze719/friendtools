use axum::{extract::State, Json};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use validator::Validate;

use crate::{
    config::RegistrationMode,
    error::{AppError, AppResult},
    mail::Mailer,
    state::AppState,
};

use super::{jwt::create_token, middleware::AuthUser, password};

/// How long a password-reset link stays valid. Short enough to limit
/// the blast radius if an inbox is compromised, long enough that a user
/// who opens the mail on another device still has time to click.
const RESET_TOKEN_TTL: Duration = Duration::hours(1);

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
    /// Whether the instance has an outbound SMTP relay configured, so
    /// the UI knows whether to render the "forgot password?" link at
    /// all. Hiding the entry point on unconfigured instances saves
    /// users from a dead-end 503.
    pub password_reset_enabled: bool,
}

pub async fn config(State(state): State<AppState>) -> Json<AuthConfigResponse> {
    Json(AuthConfigResponse {
        registration_mode: match state.cfg.registration_mode {
            RegistrationMode::Approval => "approval",
            RegistrationMode::Open => "open",
        },
        password_reset_enabled: state.cfg.smtp.is_some(),
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

#[derive(Debug, Deserialize, Validate)]
pub struct ForgotPasswordRequest {
    #[validate(email)]
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct ForgotPasswordResponse {
    pub status: &'static str,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ResetPasswordRequest {
    #[validate(length(min = 16, max = 256))]
    pub token: String,
    #[validate(length(min = 8, max = 200))]
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct ResetPasswordResponse {
    pub status: &'static str,
}

/// Kicks off the "forgot my password" flow.
///
/// The response is intentionally constant regardless of whether the
/// email exists, so an attacker can't use this endpoint to enumerate
/// registered users. The only non-"ok" response is 503, and only when
/// SMTP is not configured on this instance at all (in which case the
/// UI should not have offered the form in the first place - see
/// `AuthConfigResponse::password_reset_enabled`).
pub async fn forgot_password(
    State(state): State<AppState>,
    Json(payload): Json<ForgotPasswordRequest>,
) -> AppResult<Json<ForgotPasswordResponse>> {
    payload.validate()?;

    let Some(smtp) = state.cfg.smtp.clone() else {
        return Err(AppError::BadRequest(
            "password recovery is not configured on this instance".into(),
        ));
    };

    let email = payload.email.trim().to_lowercase();

    // Only approved accounts can reset - pending accounts can't sign in
    // anyway, and we don't want admins to "reset" a password they never
    // actually vouched for.
    let user: Option<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, email, display_name FROM users WHERE email = $1 AND status = 'approved'",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;

    if let Some((user_id, user_email, display_name)) = user {
        let raw_token = generate_reset_token();
        let token_hash = hash_reset_token(&raw_token);
        let expires_at = Utc::now() + RESET_TOKEN_TTL;

        // Invalidate any older outstanding tokens for this user - only
        // the latest link should work, otherwise the mailbox history
        // becomes a long-lived skeleton key.
        sqlx::query(
            "UPDATE password_reset_tokens
             SET used_at = NOW()
             WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()",
        )
        .bind(user_id)
        .execute(&state.db)
        .await?;

        sqlx::query(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3)",
        )
        .bind(user_id)
        .bind(&token_hash)
        .bind(expires_at)
        .execute(&state.db)
        .await?;

        let reset_url = format!(
            "{}/reset-password?token={}",
            state.cfg.app_base_url.trim_end_matches('/'),
            raw_token
        );

        // Sending the mail runs in the request task so failures surface
        // as a 500 during development - in production an admin sees the
        // error in the logs and can fix their SMTP setup. We do NOT
        // leak SMTP errors to the client, again to avoid enumeration.
        match Mailer::new(&smtp) {
            Ok(mailer) => {
                let subject = "Reset your friendflow password";
                let text = render_reset_email_text(&display_name, &reset_url);
                let html = render_reset_email_html(&display_name, &reset_url);
                if let Err(e) = mailer.send(&user_email, subject, &text, &html).await {
                    tracing::error!(error = ?e, user_id = %user_id, "failed to send password reset email");
                }
            }
            Err(e) => {
                tracing::error!(error = ?e, "failed to build SMTP mailer");
            }
        }
    } else {
        // Unknown / unapproved email: do nothing, but take a similar
        // amount of wall-clock time as the success path would. A full
        // argon2 round trip is overkill; a short sleep keeps the timing
        // signal weak without slowing real traffic noticeably.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    Ok(Json(ForgotPasswordResponse { status: "ok" }))
}

/// Finalises the reset flow. Verifies the single-use token, updates the
/// password hash and marks the token consumed. Any previously issued
/// (but now stale) tokens for the same user are invalidated as well so
/// opening an older mail cannot undo a fresh reset.
pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> AppResult<Json<ResetPasswordResponse>> {
    payload.validate()?;

    let token_hash = hash_reset_token(payload.token.trim());

    let row: Option<(Uuid, Uuid, DateTime<Utc>, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
         WHERE token_hash = $1",
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await?;

    let Some((token_id, user_id, expires_at, used_at)) = row else {
        return Err(AppError::BadRequest(
            "this password reset link is invalid or has expired".into(),
        ));
    };

    if used_at.is_some() || expires_at <= Utc::now() {
        return Err(AppError::BadRequest(
            "this password reset link is invalid or has expired".into(),
        ));
    }

    let new_hash = password::hash_password(&payload.password)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("hash error: {e}")))?;

    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1")
        .bind(token_id)
        .execute(&mut *tx)
        .await?;
    // Kill any sibling tokens for this user so a leaked older mail
    // can't roll the password forward again.
    sqlx::query(
        "UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(ResetPasswordResponse { status: "ok" }))
}

fn generate_reset_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn hash_reset_token(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    hex::encode(digest)
}

fn render_reset_email_text(display_name: &str, reset_url: &str) -> String {
    format!(
        "Hi {name},\n\n\
         Somebody (hopefully you) asked to reset the password on your \
         friendflow account. Open the link below to choose a new \
         password:\n\n\
         {url}\n\n\
         The link is valid for 1 hour and can only be used once. If you \
         did not request this, you can safely ignore this email - your \
         current password will keep working.\n\n\
         - friendflow\n",
        name = display_name,
        url = reset_url,
    )
}

/// Renders the HTML version of the reset mail. Styling is inlined and
/// table-based on purpose: Gmail, Outlook.com and most corporate
/// gateways strip `<style>` blocks and flex/grid layouts. Everything
/// here renders identically in 15-year-old mail clients as well.
///
/// Both arguments are user-supplied content and therefore HTML-escaped
/// before being dropped into the template. A stray `<` in a display
/// name would otherwise let an account break the layout, and an `&` in
/// the URL would double-encode the token.
fn render_reset_email_html(display_name: &str, reset_url: &str) -> String {
    let name = html_escape(display_name);
    let url_attr = html_escape(reset_url);
    let url_text = html_escape(reset_url);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reset your friendflow password</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,0.04),0 1px 3px rgba(15,23,42,0.06);overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 0 32px;text-align:center;">
              <div style="display:inline-block;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">friendflow</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a;">Reset your password</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#334155;">
                Hi {name}, somebody (hopefully you) asked to reset the password on your friendflow account. Tap the button below to pick a new one.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="{url_attr}" target="_blank" rel="noopener" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;line-height:1;padding:14px 24px;border-radius:10px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#64748b;">
                Or copy this link into your browser:
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="{url_attr}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;">{url_text}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.55;color:#64748b;">
                The link is valid for <strong>1 hour</strong> and can only be used once. If you didn't request this, you can safely ignore this email - your current password will keep working.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px 0;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                Sent by friendflow - self-hosted for you and your people.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"#,
        name = name,
        url_attr = url_attr,
        url_text = url_text,
    )
}

fn html_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
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
