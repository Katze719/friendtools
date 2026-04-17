//! Fetch a URL and extract a lightweight link preview (Open Graph / Twitter /
//! `<title>` + `<meta description>`).
//!
//! This is intentionally a best-effort extractor: if the remote host is slow,
//! unreachable, returns non-HTML or doesn't expose metadata, we simply persist
//! the link with whatever fields we could find. The caller decides what to do
//! with empty fields (typically show the bare URL).
//!
//! Safety:
//! - only `http` / `https` schemes are allowed
//! - a short timeout bounds server-side blocking
//! - response bodies are capped in size so a hostile host cannot OOM us
//! - redirects are followed up to a small limit

use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use scraper::{Html, Selector};
use url::Url;

const TIMEOUT: Duration = Duration::from_secs(8);
const MAX_BYTES: usize = 2 * 1024 * 1024; // 2 MiB of HTML is plenty
const USER_AGENT: &str =
    "friendtools-unfurl/0.1 (+https://github.com/Katze719/friendtools)";

#[derive(Debug, Default, Clone)]
pub struct Preview {
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub site_name: Option<String>,
}

/// Fetches `url` and extracts a preview. Validates the URL format and scheme
/// up-front; any network or parsing error is surfaced so the caller can log
/// or ignore it.
pub async fn fetch_preview(url_str: &str) -> Result<Preview> {
    let url = Url::parse(url_str).context("invalid URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(anyhow!("only http/https URLs are supported"));
    }

    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(USER_AGENT)
        .build()?;

    let resp = client
        .get(url.clone())
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
        .send()
        .await?
        .error_for_status()?;

    // Abort early on non-HTML responses (images, PDFs, JSON APIs, ...).
    let is_html = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_ascii_lowercase())
        .map(|s| s.contains("html"))
        .unwrap_or(true); // unknown content-type: try anyway
    if !is_html {
        return Ok(Preview::default());
    }

    // Read up to MAX_BYTES.
    let mut buf: Vec<u8> = Vec::new();
    let mut stream = resp;
    while let Some(chunk) = stream.chunk().await? {
        if buf.len() + chunk.len() > MAX_BYTES {
            let take = MAX_BYTES - buf.len();
            buf.extend_from_slice(&chunk[..take]);
            break;
        }
        buf.extend_from_slice(&chunk);
    }

    let html = String::from_utf8_lossy(&buf).into_owned();
    Ok(extract(&html, &url))
}

fn extract(html: &str, base: &Url) -> Preview {
    let doc = Html::parse_document(html);
    let mut p = Preview::default();

    // Collect all <meta> tags once; avoids re-traversing the tree per key.
    let meta_sel = Selector::parse("meta").unwrap();
    for el in doc.select(&meta_sel) {
        let v = el.value();
        let content = match v.attr("content") {
            Some(c) if !c.trim().is_empty() => c.trim().to_string(),
            _ => continue,
        };
        let key = v
            .attr("property")
            .or_else(|| v.attr("name"))
            .unwrap_or("")
            .to_ascii_lowercase();

        match key.as_str() {
            "og:title" | "twitter:title" => {
                if p.title.is_none() {
                    p.title = Some(content);
                }
            }
            "og:description" | "twitter:description" | "description" => {
                if p.description.is_none() {
                    p.description = Some(content);
                }
            }
            "og:image" | "og:image:url" | "og:image:secure_url" | "twitter:image" => {
                if p.image_url.is_none() {
                    p.image_url = Some(content);
                }
            }
            "og:site_name" => {
                if p.site_name.is_none() {
                    p.site_name = Some(content);
                }
            }
            _ => {}
        }
    }

    // Fallbacks from `<title>` / hostname.
    if p.title.is_none() {
        let title_sel = Selector::parse("title").unwrap();
        if let Some(el) = doc.select(&title_sel).next() {
            let text: String = el.text().collect::<Vec<_>>().concat();
            let text = text.trim();
            if !text.is_empty() {
                p.title = Some(text.to_string());
            }
        }
    }
    if p.site_name.is_none() {
        if let Some(host) = base.host_str() {
            p.site_name = Some(host.trim_start_matches("www.").to_string());
        }
    }

    // Resolve relative image URLs against the page URL.
    if let Some(img) = p.image_url.as_deref() {
        if let Ok(abs) = base.join(img) {
            p.image_url = Some(abs.to_string());
        }
    }

    // Truncate overly long strings; DB can handle it but the UI shouldn't.
    if let Some(ref mut s) = p.title {
        truncate(s, 300);
    }
    if let Some(ref mut s) = p.description {
        truncate(s, 600);
    }
    if let Some(ref mut s) = p.site_name {
        truncate(s, 120);
    }

    p
}

fn truncate(s: &mut String, max: usize) {
    if s.chars().count() <= max {
        return;
    }
    let cut: String = s.chars().take(max).collect();
    *s = format!("{cut}...");
}
