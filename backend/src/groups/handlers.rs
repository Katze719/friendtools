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
    /// `None` means invites are currently closed (nobody can join).
    /// Owners can regenerate one via the open-invite endpoint.
    pub invite_code: Option<String>,
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
    /// `None` when invites are closed. See [`GroupSummary::invite_code`].
    pub invite_code: Option<String>,
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

    // New groups start with invites closed (invite_code = NULL). The owner
    // explicitly opens invites when they want to share the group, which
    // generates a fresh code on demand.
    let row: (Uuid, String, Option<String>, String, DateTime<Utc>) = sqlx::query_as(
        "INSERT INTO groups (name, invite_code, currency, created_by)
         VALUES ($1, NULL, $2, $3)
         RETURNING id, name, invite_code, currency, created_at",
    )
    .bind(&name)
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

    // Seed a default shopping list. The UI is list-centric and would show
    // an empty state (with a "+ New list" prompt) for a fresh group
    // otherwise; having one ready means day-one usage is frictionless.
    sqlx::query(
        "INSERT INTO shopping_lists (group_id, name, created_by)
         VALUES ($1, 'Einkaufsliste', $2)",
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
    if code.is_empty() {
        return Err(AppError::NotFound("invalid invite code".into()));
    }

    // NULL invite_code means the group is closed for new members, and no
    // value of `$1` will match it, so closed groups are silently treated
    // the same as a wrong code.
    let row: Option<(Uuid, String, Option<String>, String, DateTime<Utc>)> = sqlx::query_as(
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

    let my_role: (String,) =
        sqlx::query_as("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2")
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
    let rows: Vec<(Uuid, String, Option<String>, String, DateTime<Utc>, i64, String)> = sqlx::query_as(
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

    let group: Option<(Uuid, String, Option<String>, String, Uuid, DateTime<Utc>)> = sqlx::query_as(
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
        .map(|(id, display_name, email, role, joined_at)| Member {
            id,
            display_name,
            email,
            role,
            joined_at,
        })
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

/// Removes the current user from a group they're a member of. If they were
/// the group's only owner but members remain, the earliest-joined remaining
/// member is promoted to owner so the group never ends up ownerless. If the
/// leaving user was the very last member, the (now empty) group is deleted.
pub async fn leave(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let mut tx = state.db.begin().await?;

    let row: Option<(String,)> =
        sqlx::query_as("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2")
            .bind(id)
            .bind(user.id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some((role,)) = row else {
        return Err(AppError::NotFound(
            "you are not a member of this group".into(),
        ));
    };

    sqlx::query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;

    let remaining: (i64,) =
        sqlx::query_as("SELECT COUNT(*)::BIGINT FROM group_members WHERE group_id = $1")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;

    if remaining.0 == 0 {
        sqlx::query("DELETE FROM groups WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(Json(
            serde_json::json!({ "ok": true, "group_deleted": true }),
        ));
    }

    if role == "owner" {
        let has_owner: (i64,) = sqlx::query_as(
            "SELECT COUNT(*)::BIGINT FROM group_members WHERE group_id = $1 AND role = 'owner'",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

        if has_owner.0 == 0 {
            sqlx::query(
                "UPDATE group_members SET role = 'owner' \
                 WHERE user_id = ( \
                     SELECT user_id FROM group_members \
                     WHERE group_id = $1 \
                     ORDER BY joined_at ASC \
                     LIMIT 1 \
                 ) AND group_id = $1",
            )
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    Ok(Json(
        serde_json::json!({ "ok": true, "group_deleted": false }),
    ))
}

/// Returns the caller's role in the given group, erroring with
/// `Forbidden` if they are not a member at all.
async fn role_in_group(
    state: &AppState,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<String, AppError> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2")
            .bind(group_id)
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    row.map(|(r,)| r).ok_or(AppError::Forbidden)
}

/// Opens the group for new joiners by generating a fresh invite code.
///
/// Always generates a *new* code - reopening a previously-closed group
/// invalidates any older shared link/QR, which is the whole point of being
/// able to close and reopen. Retries on the extremely rare UNIQUE collision
/// against another group's code.
pub async fn open_invites(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let role = role_in_group(&state, id, user.id).await?;
    if role != "owner" && !user.is_admin {
        return Err(AppError::Forbidden);
    }

    // Up to a few retries in the vanishingly unlikely case two groups pick
    // the same 8-char code at the same time.
    for _ in 0..5 {
        let code = generate_invite_code();
        let res = sqlx::query("UPDATE groups SET invite_code = $1 WHERE id = $2")
            .bind(&code)
            .bind(id)
            .execute(&state.db)
            .await;
        match res {
            Ok(_) => return Ok(Json(serde_json::json!({ "invite_code": code }))),
            Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(AppError::Internal(anyhow::anyhow!(
        "could not generate a unique invite code after 5 tries"
    )))
}

/// Closes the group so nobody new can join. Clears the invite code - any
/// previously shared link/QR stops working immediately. Existing members
/// are unaffected.
pub async fn close_invites(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let role = role_in_group(&state, id, user.id).await?;
    if role != "owner" && !user.is_admin {
        return Err(AppError::Forbidden);
    }

    sqlx::query("UPDATE groups SET invite_code = NULL WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_group(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let row: Option<(Uuid,)> = sqlx::query_as("SELECT created_by FROM groups WHERE id = $1")
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
