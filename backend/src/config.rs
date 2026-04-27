use anyhow::{Context, Result};
use chrono_tz::Tz;

/// Controls what happens to new accounts right after registration.
///
/// - `Approval` (default): new users land in `pending` status and cannot
///   sign in until an admin explicitly approves them. Good for private
///   instances where you want to gate access.
/// - `Open`: new users are auto-approved and get a JWT immediately after
///   registration, so they can start using the app straight away.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationMode {
    Approval,
    Open,
}

impl RegistrationMode {
    fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "approval" | "admin" | "pending" | "closed" => Some(Self::Approval),
            "open" | "auto" | "public" => Some(Self::Open),
            _ => None,
        }
    }
}

/// Configuration for the outbound SMTP relay used for transactional
/// emails (currently only password recovery).
///
/// Every SMTP-capable provider we care about (Mailgun, SES, Fastmail,
/// Sendgrid, a plain Postfix box, ...) fits into this shape. When
/// `host` is empty we treat email as fully disabled and the password
/// recovery endpoints respond with 503; that way admins who don't want
/// to expose a reset flow can simply leave SMTP unset.
#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    /// `starttls` (default, port 587) upgrades a plain connection; `tls`
    /// (port 465) wraps the socket from the start; `none` is plaintext
    /// and really only useful for a dev relay like mailhog.
    pub encryption: SmtpEncryption,
    pub username: Option<String>,
    pub password: Option<String>,
    /// `From` header used on outbound mails. Can be a bare address
    /// (`noreply@example.com`) or a full mailbox with display name
    /// (`friendflow <noreply@example.com>`).
    pub from: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmtpEncryption {
    StartTls,
    Tls,
    None,
}

impl SmtpEncryption {
    fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "starttls" | "" => Some(Self::StartTls),
            "tls" | "implicit" | "ssl" => Some(Self::Tls),
            "none" | "plain" | "plaintext" => Some(Self::None),
            _ => None,
        }
    }
}

/// OAuth + Calendar API integration. When `None`, Google Calendar features
/// are disabled (handlers return a clear error if called).
#[derive(Debug, Clone)]
pub struct GoogleCalendarOAuth {
    pub client_id: String,
    pub client_secret: String,
    /// Full redirect URI registered in Google Cloud (must match exactly).
    pub redirect_uri: String,
    /// 32-byte key for AES-256-GCM encryption of refresh tokens at rest (hex).
    pub token_encryption_key: [u8; 32],
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expiry_hours: i64,
    pub bind_addr: String,
    pub cors_origin: String,
    pub registration_mode: RegistrationMode,
    /// Absolute public base URL of the frontend (e.g.
    /// `https://friendflow.example`), used to construct clickable
    /// password-reset links in outbound mails. When unset the first
    /// entry from `CORS_ORIGIN` is used as a best-effort fallback.
    pub app_base_url: String,
    /// SMTP relay. `None` disables email-dependent features (password
    /// recovery).
    pub smtp: Option<SmtpConfig>,
    pub google_calendar: Option<GoogleCalendarOAuth>,
    /// IANA timezone used when mapping all-day calendar instants (stored as UTC)
    /// to calendar dates for Google Calendar `date` fields. Align with where most
    /// users pick dates in the UI (browser local → UTC); default Europe/Berlin.
    pub app_timezone: Tz,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL is required")?;
        let jwt_secret = std::env::var("JWT_SECRET").context("JWT_SECRET is required")?;
        if jwt_secret.len() < 16 {
            anyhow::bail!("JWT_SECRET must be at least 16 characters");
        }
        let jwt_expiry_hours = std::env::var("JWT_EXPIRY_HOURS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(24 * 7);
        let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string());
        let cors_origin =
            std::env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:8080".to_string());

        let registration_mode = match std::env::var("REGISTRATION_MODE") {
            Ok(raw) if !raw.trim().is_empty() => RegistrationMode::parse(&raw).with_context(|| {
                format!(
                    "REGISTRATION_MODE must be one of 'approval' or 'open' (got: {raw:?})"
                )
            })?,
            _ => RegistrationMode::Approval,
        };

        // APP_BASE_URL lets mails link back to the exact public URL of
        // this instance. Falling back to the first CORS origin keeps
        // `bootstrap.sh`-generated configs working out of the box for
        // local docker setups.
        let app_base_url = std::env::var("APP_BASE_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                cors_origin
                    .split(',')
                    .map(|s| s.trim().trim_end_matches('/'))
                    .find(|s| !s.is_empty())
                    .unwrap_or("http://localhost:8080")
                    .to_string()
            });

        let smtp = parse_smtp_config()?;

        let google_calendar = parse_google_calendar_oauth()?;

        let app_timezone = parse_app_timezone()?;

        Ok(Self {
            database_url,
            jwt_secret,
            jwt_expiry_hours,
            bind_addr,
            cors_origin,
            registration_mode,
            app_base_url,
            smtp,
            google_calendar,
            app_timezone,
        })
    }
}

fn parse_app_timezone() -> Result<Tz> {
    match std::env::var("APP_TIMEZONE") {
        Ok(raw) if !raw.trim().is_empty() => raw
            .trim()
            .parse::<Tz>()
            .with_context(|| format!(
                "APP_TIMEZONE must be a valid IANA zone (e.g. Europe/Berlin, UTC); got {raw:?}"
            )),
        _ => Ok(chrono_tz::Europe::Berlin),
    }
}

fn parse_google_calendar_oauth() -> Result<Option<GoogleCalendarOAuth>> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let Some(client_id) = client_id else {
        return Ok(None);
    };

    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .context("GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set")?
        .trim()
        .to_string();
    if client_secret.is_empty() {
        anyhow::bail!("GOOGLE_CLIENT_SECRET must not be empty when GOOGLE_CLIENT_ID is set");
    }

    let redirect_uri = std::env::var("GOOGLE_OAUTH_REDIRECT_URI")
        .context(
            "GOOGLE_OAUTH_REDIRECT_URI is required when GOOGLE_CLIENT_ID is set (exact URL from Google Cloud console)",
        )?
        .trim()
        .to_string();

    let key_hex = std::env::var("GOOGLE_TOKEN_ENCRYPTION_KEY").context(
        "GOOGLE_TOKEN_ENCRYPTION_KEY is required when GOOGLE_CLIENT_ID is set (64 hex chars = 32 bytes)",
    )?;
    let key_hex = key_hex.trim();
    if key_hex.len() != 64 {
        anyhow::bail!("GOOGLE_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)");
    }
    let mut token_encryption_key = [0u8; 32];
    for (i, chunk) in key_hex.as_bytes().chunks(2).enumerate() {
        if i >= 32 {
            break;
        }
        let s = std::str::from_utf8(chunk).context("GOOGLE_TOKEN_ENCRYPTION_KEY must be hex")?;
        token_encryption_key[i] = u8::from_str_radix(s, 16)
            .map_err(|_| anyhow::anyhow!("GOOGLE_TOKEN_ENCRYPTION_KEY contains non-hex"))?;
    }

    Ok(Some(GoogleCalendarOAuth {
        client_id,
        client_secret,
        redirect_uri,
        token_encryption_key,
    }))
}

fn parse_smtp_config() -> Result<Option<SmtpConfig>> {
    let host = std::env::var("SMTP_HOST")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let Some(host) = host else {
        return Ok(None);
    };

    let encryption = match std::env::var("SMTP_ENCRYPTION") {
        Ok(raw) if !raw.trim().is_empty() => SmtpEncryption::parse(&raw).with_context(|| {
            format!("SMTP_ENCRYPTION must be one of 'starttls', 'tls' or 'none' (got: {raw:?})")
        })?,
        _ => SmtpEncryption::StartTls,
    };

    let port = match std::env::var("SMTP_PORT") {
        Ok(raw) if !raw.trim().is_empty() => raw
            .trim()
            .parse::<u16>()
            .with_context(|| format!("SMTP_PORT must be a valid port number (got: {raw:?})"))?,
        _ => match encryption {
            SmtpEncryption::Tls => 465,
            SmtpEncryption::StartTls => 587,
            SmtpEncryption::None => 25,
        },
    };

    let username = std::env::var("SMTP_USERNAME")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let password = std::env::var("SMTP_PASSWORD")
        .ok()
        .filter(|v| !v.is_empty());

    let from = std::env::var("SMTP_FROM")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .context(
            "SMTP_FROM is required when SMTP_HOST is set - e.g. 'friendflow <noreply@example.com>'",
        )?;

    Ok(Some(SmtpConfig {
        host,
        port,
        encryption,
        username,
        password,
        from,
    }))
}
