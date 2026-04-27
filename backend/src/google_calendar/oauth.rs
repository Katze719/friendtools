//! OAuth token exchange and access-token refresh.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // expires_in/token_type omitted when testing token exchange locally
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub expires_in: Option<i64>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub token_type: String,
}

pub async fn exchange_code_for_tokens(
    http: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
) -> anyhow::Result<TokenResponse> {
    let body = format!(
        "code={}&client_id={}&client_secret={}&redirect_uri={}&grant_type=authorization_code",
        urlencoding::encode(code),
        urlencoding::encode(client_id),
        urlencoding::encode(client_secret),
        urlencoding::encode(redirect_uri),
    );
    let res = http
        .post("https://oauth2.googleapis.com/token")
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(body)
        .send()
        .await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        anyhow::bail!("token exchange failed: {} {}", status, text);
    }
    Ok(serde_json::from_str(&text)?)
}

pub async fn refresh_access_token(
    http: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> anyhow::Result<TokenResponse> {
    let body = format!(
        "refresh_token={}&client_id={}&client_secret={}&grant_type=refresh_token",
        urlencoding::encode(refresh_token),
        urlencoding::encode(client_id),
        urlencoding::encode(client_secret),
    );
    let res = http
        .post("https://oauth2.googleapis.com/token")
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(body)
        .send()
        .await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        anyhow::bail!("refresh failed: {} {}", status, text);
    }
    Ok(serde_json::from_str(&text)?)
}
