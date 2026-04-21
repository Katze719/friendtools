use anyhow::{Context, Result};

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

        Ok(Self {
            database_url,
            jwt_secret,
            jwt_expiry_hours,
            bind_addr,
            cors_origin,
            registration_mode,
            app_base_url,
            smtp,
        })
    }
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
