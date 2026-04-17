use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct GroupSummary {
    pub id: Uuid,
    pub name: String,
    pub invite_code: String,
    pub currency: String,
    pub created_at: DateTime<Utc>,
    pub member_count: i64,
    pub my_role: String,
}

#[derive(Debug, Serialize)]
pub struct Member {
    pub id: Uuid,
    pub display_name: String,
    pub email: String,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct GroupDetail {
    pub id: Uuid,
    pub name: String,
    pub invite_code: String,
    pub currency: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub members: Vec<Member>,
    pub my_role: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateRequest {
    #[validate(length(min = 1, max = 80))]
    pub name: String,
    #[validate(length(min = 3, max = 3))]
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct JoinRequest {
    #[validate(length(min = 1, max = 64))]
    pub invite_code: String,
}

fn generate_invite_code() -> String {
    use rand::{distributions::Alphanumeric, Rng};
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(8)
        .map(char::from)
        .collect::<String>()
        .to_uppercase()
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateRequest>,
) -> AppResult<Json<GroupSummary>> {
    payload.validate()?;
    let name = payload.name.trim().to_string();
    let currency = payload.currency.as_deref().unwrap_or("EUR").to_uppercase();

    let mut tx = state.db.begin().await?;

    let invite_code = generate_invite_code();
    let row: (Uuid, String, String, String, DateTime<Utc>) = sqlx::query_as(
        "INSERT INTO groups (name, invite_code, currency, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, invite_code, currency, created_at",
    )
    .bind(&name)
    .bind(&invite_code)
    .bind(&currency)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO group_members (group_id, user_id, role)
         VALUES ($1, $2, 'owner')",
    )
    .bind(row.0)
    .bind(user.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(GroupSummary {
        id: row.0,
        name: row.1,
        invite_code: row.2,
        currency: row.3,
        created_at: row.4,
        member_count: 1,
        my_role: "owner".into(),
    }))
}

pub async fn join(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<JoinRequest>,
) -> AppResult<Json<GroupSummary>> {
    payload.validate()?;
    let code = payload.invite_code.trim().to_uppercase();

    let row: Option<(Uuid, String, String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, name, invite_code, currency, created_at
         FROM groups WHERE invite_code = $1",
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await?;

    let Some((id, name, invite_code, currency, created_at)) = row else {
        return Err(AppError::NotFound("invalid invite code".into()));
    };

    sqlx::query(
        "INSERT INTO group_members (group_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (group_id, user_id) DO NOTHING",
    )
    .bind(id)
    .bind(user.id)
    .execute(&state.db)
    .await?;

    let member_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::BIGINT FROM group_members WHERE group_id = $1")
            .bind(id)
            .fetch_one(&state.db)
            .await?;

    let my_role: (String,) = sqlx::query_as(
        "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(GroupSummary {
        id,
        name,
        invite_code,
        currency,
        created_at,
        member_count: member_count.0,
        my_role: my_role.0,
    }))
}

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<GroupSummary>>> {
    let rows: Vec<(Uuid, String, String, String, DateTime<Utc>, i64, String)> = sqlx::query_as(
        r#"
        SELECT
            g.id, g.name, g.invite_code, g.currency, g.created_at,
            COALESCE((SELECT COUNT(*)::BIGINT FROM group_members gm2 WHERE gm2.group_id = g.id), 0),
            gm.role
        FROM groups g
        INNER JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
        ORDER BY g.created_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(
                |(id, name, invite_code, currency, created_at, member_count, my_role)| {
                    GroupSummary {
                        id,
                        name,
                        invite_code,
                        currency,
                        created_at,
                        member_count,
                        my_role,
                    }
                },
            )
            .collect(),
    ))
}

pub async fn detail(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<GroupDetail>> {
    super::ensure_member(&state, id, user.id).await?;

    let group: Option<(Uuid, String, String, String, Uuid, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, name, invite_code, currency, created_by, created_at
         FROM groups WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;
    let Some((gid, name, invite_code, currency, created_by, created_at)) = group else {
        return Err(AppError::NotFound("group not found".into()));
    };

    let member_rows: Vec<(Uuid, String, String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT u.id, u.display_name, u.email, gm.role, gm.joined_at
         FROM group_members gm
         INNER JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1
         ORDER BY u.display_name",
    )
    .bind(gid)
    .fetch_all(&state.db)
    .await?;

    let my_role = member_rows
        .iter()
        .find(|(mid, _, _, _, _)| *mid == user.id)
        .map(|(_, _, _, role, _)| role.clone())
        .unwrap_or_else(|| "member".to_string());

    let members = member_rows
        .into_iter()
        .map(
            |(id, display_name, email, role, joined_at)| Member {
                id,
                display_name,
                email,
                role,
                joined_at,
            },
        )
        .collect();

    Ok(Json(GroupDetail {
        id: gid,
        name,
        invite_code,
        currency,
        created_by,
        created_at,
        members,
        my_role,
    }))
}

pub async fn delete_group(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let row: Option<(Uuid,)> =
        sqlx::query_as("SELECT created_by FROM groups WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let Some((created_by,)) = row else {
        return Err(AppError::NotFound("group not found".into()));
    };
    if created_by != user.id && !user.is_admin {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
