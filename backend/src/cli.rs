use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use sqlx::PgPool;

use crate::config::Config;

#[derive(Debug, Parser)]
#[command(name = "friendtools-backend", version, about = "friendtools backend server & admin CLI")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Administrative commands that operate directly on the database.
    Admin {
        #[command(subcommand)]
        cmd: AdminCmd,
    },
}

#[derive(Debug, Subcommand)]
pub enum AdminCmd {
    /// List all users with their status and admin flag.
    List,
    /// Approve a pending user so they can log in.
    Approve { email: String },
    /// Promote a user to admin. Also approves them if still pending.
    Promote { email: String },
    /// Remove the admin flag from a user. They keep their account.
    Demote { email: String },
    /// Delete a user permanently.
    Delete { email: String },
}

pub async fn run(cmd: Command, cfg: &Config) -> Result<()> {
    let pool = crate::db::connect(&cfg.database_url).await?;
    crate::db::migrate(&pool).await?;

    match cmd {
        Command::Admin { cmd } => run_admin(cmd, &pool).await,
    }
}

async fn run_admin(cmd: AdminCmd, pool: &PgPool) -> Result<()> {
    match cmd {
        AdminCmd::List => list_users(pool).await,
        AdminCmd::Approve { email } => approve(pool, &email).await,
        AdminCmd::Promote { email } => promote(pool, &email).await,
        AdminCmd::Demote { email } => demote(pool, &email).await,
        AdminCmd::Delete { email } => delete(pool, &email).await,
    }
}

async fn list_users(pool: &PgPool) -> Result<()> {
    let rows: Vec<(String, String, String, bool)> = sqlx::query_as(
        "SELECT email, display_name, status, is_admin FROM users ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        println!("no users yet.");
        return Ok(());
    }

    println!(
        "{:<40} {:<24} {:<10} {}",
        "EMAIL", "DISPLAY NAME", "STATUS", "ADMIN"
    );
    for (email, display_name, status, is_admin) in rows {
        println!(
            "{:<40} {:<24} {:<10} {}",
            email,
            display_name,
            status,
            if is_admin { "yes" } else { "no" }
        );
    }
    Ok(())
}

async fn approve(pool: &PgPool, email: &str) -> Result<()> {
    let email = email.trim().to_lowercase();
    let res = sqlx::query(
        "UPDATE users
         SET status = 'approved', approved_at = COALESCE(approved_at, NOW())
         WHERE email = $1",
    )
    .bind(&email)
    .execute(pool)
    .await?;
    if res.rows_affected() == 0 {
        anyhow::bail!("no user with email '{email}'");
    }
    println!("approved {email}");
    Ok(())
}

async fn promote(pool: &PgPool, email: &str) -> Result<()> {
    let email = email.trim().to_lowercase();
    let res = sqlx::query(
        "UPDATE users
         SET is_admin = TRUE,
             status = 'approved',
             approved_at = COALESCE(approved_at, NOW())
         WHERE email = $1",
    )
    .bind(&email)
    .execute(pool)
    .await?;
    if res.rows_affected() == 0 {
        anyhow::bail!("no user with email '{email}'");
    }
    println!("promoted {email} to admin (and approved)");
    Ok(())
}

async fn demote(pool: &PgPool, email: &str) -> Result<()> {
    let email = email.trim().to_lowercase();
    let res = sqlx::query("UPDATE users SET is_admin = FALSE WHERE email = $1")
        .bind(&email)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        anyhow::bail!("no user with email '{email}'");
    }
    println!("demoted {email}");
    Ok(())
}

async fn delete(pool: &PgPool, email: &str) -> Result<()> {
    let email = email.trim().to_lowercase();
    let res = sqlx::query("DELETE FROM users WHERE email = $1")
        .bind(&email)
        .execute(pool)
        .await
        .context("delete failed (user may still own groups or expenses)")?;
    if res.rows_affected() == 0 {
        anyhow::bail!("no user with email '{email}'");
    }
    println!("deleted {email}");
    Ok(())
}
