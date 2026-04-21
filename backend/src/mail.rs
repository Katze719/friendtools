//! Thin wrapper around `lettre` that hides the rustls/STARTTLS dance
//! behind a single `send_mail` call. Only transactional mails go through
//! here (currently only password recovery); anything more elaborate
//! should get its own module.

use std::time::Duration;

use anyhow::{Context, Result};
use lettre::{
    message::{Mailbox, Message, MultiPart},
    transport::smtp::{
        authentication::Credentials,
        client::{Tls, TlsParameters},
        extension::ClientId,
    },
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};

use crate::config::{SmtpConfig, SmtpEncryption};

pub struct Mailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl Mailer {
    /// Opens the SMTP connection. Prefer this over a sync constructor so
    /// we can optionally resolve the relay to IPv4 only (`SMTP_FORCE_IPV4`),
    /// which avoids hanging TCP connects on broken IPv6 routes.
    pub async fn connect(cfg: &SmtpConfig, ehlo_domain: Option<&str>) -> Result<Self> {
        let from: Mailbox = cfg
            .from
            .parse()
            .with_context(|| format!("SMTP_FROM is not a valid mailbox: {:?}", cfg.from))?;

        let hello = ehlo_client_id(ehlo_domain);
        let timeout = Some(Duration::from_secs(30));

        let server = if cfg.force_ipv4 {
            let addr = resolve_first_ipv4(&cfg.host, cfg.port).await?;
            addr.ip().to_string()
        } else {
            cfg.host.clone()
        };

        // Certificate / SNI must still use the real relay hostname when we
        // connect by IP for TCP.
        let mut builder = match cfg.encryption {
            SmtpEncryption::Tls => {
                let tls = TlsParameters::new(cfg.host.clone())
                    .context("failed to build TLS parameters for SMTP")?;
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&server)
                    .port(cfg.port)
                    .tls(Tls::Wrapper(tls))
            }
            SmtpEncryption::StartTls => {
                let tls = TlsParameters::new(cfg.host.clone())
                    .context("failed to build TLS parameters for SMTP")?;
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&server)
                    .port(cfg.port)
                    .tls(Tls::Required(tls))
            }
            SmtpEncryption::None => {
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&server).port(cfg.port)
            }
        };

        builder = builder.hello_name(hello).timeout(timeout);

        let builder = match (&cfg.username, &cfg.password) {
            (Some(u), Some(p)) => builder.credentials(Credentials::new(u.clone(), p.clone())),
            _ => builder,
        };

        Ok(Self {
            transport: builder.build(),
            from,
        })
    }

    /// Sends a `multipart/alternative` message with both a plain-text
    /// and an HTML body. Mail clients that don't render HTML (or users
    /// with HTML disabled) fall back to the text variant, so we keep
    /// both complete and in sync at the call site.
    pub async fn send(
        &self,
        to: &str,
        subject: &str,
        body_text: &str,
        body_html: &str,
    ) -> Result<()> {
        let to: Mailbox = to
            .parse()
            .with_context(|| format!("recipient address is not valid: {to:?}"))?;

        let message = Message::builder()
            .from(self.from.clone())
            .to(to)
            .subject(subject)
            .multipart(MultiPart::alternative_plain_html(
                body_text.to_string(),
                body_html.to_string(),
            ))
            .context("failed to build email message")?;

        self.transport
            .send(message)
            .await
            .context("SMTP send failed")?;
        Ok(())
    }
}

fn ehlo_client_id(ehlo_domain: Option<&str>) -> ClientId {
    match ehlo_domain {
        Some(d) if !d.trim().is_empty() => ClientId::Domain(d.trim().to_string()),
        _ => ClientId::default(),
    }
}

async fn resolve_first_ipv4(host: &str, port: u16) -> Result<std::net::SocketAddr> {
    let addrs = tokio::net::lookup_host((host, port))
        .await
        .with_context(|| format!("SMTP DNS lookup failed for {host}:{port}"))?;
    for addr in addrs {
        if addr.is_ipv4() {
            return Ok(addr);
        }
    }
    anyhow::bail!(
        "SMTP_FORCE_IPV4 is set but no IPv4 (A) address was returned for {host} - check DNS"
    );
}
