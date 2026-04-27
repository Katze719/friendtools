use sqlx::PgPool;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub cfg: Config,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(db: PgPool, cfg: Config) -> Self {
        Self {
            db,
            cfg,
            http: reqwest::Client::new(),
        }
    }
}
