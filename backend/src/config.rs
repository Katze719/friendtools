use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expiry_hours: i64,
    pub bind_addr: String,
    pub cors_origin: String,
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

        Ok(Self {
            database_url,
            jwt_secret,
            jwt_expiry_hours,
            bind_addr,
            cors_origin,
        })
    }
}
