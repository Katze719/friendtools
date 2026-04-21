//! Thin wrapper around `lettre` that hides the rustls/STARTTLS dance
//! behind a single `send_mail` call. Only transactional mails go through
//! here (currently only password recovery); anything more elaborate
//! should get its own module.

use anyhow::{Context, Result};
use lettre::{
    message::{Mailbox, Message, MultiPart},
    transport::smtp::{
        authentication::Credentials,
        client::{Tls, TlsParameters},
    },
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};

use crate::config::{SmtpConfig, SmtpEncryption};

pub struct Mailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl Mailer {
    pub fn new(cfg: &SmtpConfig) -> Result<Self> {
        let from: Mailbox = cfg
            .from
            .parse()
            .with_context(|| format!("SMTP_FROM is not a valid mailbox: {:?}", cfg.from))?;

        let builder = match cfg.encryption {
            SmtpEncryption::Tls => {
                let tls = TlsParameters::new(cfg.host.clone())
                    .context("failed to build TLS parameters for SMTP")?;
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&cfg.host)
                    .port(cfg.port)
                    .tls(Tls::Wrapper(tls))
            }
            SmtpEncryption::StartTls => {
                let tls = TlsParameters::new(cfg.host.clone())
                    .context("failed to build TLS parameters for SMTP")?;
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&cfg.host)
                    .port(cfg.port)
                    .tls(Tls::Required(tls))
            }
            SmtpEncryption::None => {
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&cfg.host).port(cfg.port)
            }
        };

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
