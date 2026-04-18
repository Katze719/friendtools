use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::unfurl::fetch_preview;

#[derive(Debug, Serialize)]
pub struct TripLink {
    pub id: Uuid,
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub site_name: Option<String>,
    /// Manual overrides applied when the unfurl didn't produce a good title
    /// or image. The UI prefers these over the scraped values when set.
    pub title_override: Option<String>,
    pub image_override: Option<String>,
    pub note: String,
    pub added_by: Uuid,
    pub added_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub fetched_at: Option<DateTime<Utc>>,
    pub likes: i64,
    pub dislikes: i64,
    /// Current user's vote: 1, -1 or 0 (no vote).
    pub my_vote: i16,
    /// Folder this link is organized into. Null means "unsorted".
    pub folder_id: Option<Uuid>,
    pub folder_name: Option<String>,
    /// Sort key inside the folder (or inside the "unsorted" bucket).
    pub position: i32,
}

#[derive(Debug, Serialize)]
pub struct TripFolder {
    pub id: Uuid,
    pub name: String,
    pub created_by: Uuid,
    pub created_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub link_count: i64,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateFolderRequest {
    #[validate(length(min = 1, max = 80))]
    pub name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateFolderRequest {
    #[validate(length(min = 1, max = 80))]
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct MoveLinkRequest {
    /// Target folder id. `null` (or missing) moves the link back into
    /// the implicit "unsorted" bucket.
    #[serde(default)]
    pub folder_id: Option<Uuid>,
}

/// Reorder all links within a single folder (or the unsorted bucket when
/// `folder_id` is null). `ids` is the full ordered list; positions are 0..N.
#[derive(Debug, Deserialize)]
pub struct ReorderLinksRequest {
    #[serde(default)]
    pub folder_id: Option<Uuid>,
    pub ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct VoteRequest {
    /// 1 = like, -1 = dislike, 0 = remove vote.
    #[validate(range(min = -1, max = 1))]
    pub value: i16,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateLinkRequest {
    #[validate(url, length(max = 2048))]
    pub url: String,
    #[validate(length(max = 2000))]
    #[serde(default)]
    pub note: String,
    /// Optional folder to drop the new link into.
    #[serde(default)]
    pub folder_id: Option<Uuid>,
    /// When true, accept the link even if a link with the same URL already
    /// exists in the group. Default is `false`, which returns a conflict
    /// error so the UI can warn the user.
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateLinkRequest {
    #[validate(length(max = 2000))]
    pub note: Option<String>,
    /// Override fields: present-and-null clears the override, missing leaves
    /// it alone, present-and-string sets it. We use `Option<Option<T>>` plus
    /// a custom deserializer to distinguish the cases.
    #[serde(default, deserialize_with = "opt_opt_string")]
    pub title_override: Option<Option<String>>,
    #[serde(default, deserialize_with = "opt_opt_string")]
    pub image_override: Option<Option<String>>,
}

fn opt_opt_string<'de, D>(de: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<String>::deserialize(de)?))
}

pub async fn list_links(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<TripLink>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    let links = fetch_links(&state.db, group_id, user.id).await?;
    Ok(Json(links))
}

pub async fn create_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateLinkRequest>,
) -> AppResult<Json<TripLink>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    if let Some(folder_id) = payload.folder_id {
        ensure_folder_in_group(&state.db, folder_id, group_id).await?;
    }

    let trimmed_url = payload.url.trim();
    if !payload.force {
        // Same URL in the same group → warn instead of silently creating a
        // second card. The frontend surfaces this and lets the user retry
        // with `force: true`.
        let existing: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM trip_links WHERE group_id = $1 AND url = $2 LIMIT 1")
                .bind(group_id)
                .bind(trimmed_url)
                .fetch_optional(&state.db)
                .await?;
        if existing.is_some() {
            return Err(AppError::BadRequest(
                "duplicate_url: this link is already on the board".into(),
            ));
        }
    }

    // Best-effort metadata fetch. A failure here should NOT prevent the link
    // from being saved, so the user still gets a usable bare-URL entry.
    let preview = match fetch_preview(trimmed_url).await {
        Ok(p) => Some(p),
        Err(e) => {
            tracing::info!(url = %payload.url, error = %e, "unfurl failed");
            None
        }
    };

    // Append to the bottom of the target bucket so we never collide.
    let next_position: (i32,) = sqlx::query_as(
        "SELECT COALESCE(MAX(position), -1) + 1
           FROM trip_links
           WHERE group_id = $1 AND folder_id IS NOT DISTINCT FROM $2",
    )
    .bind(group_id)
    .bind(payload.folder_id)
    .fetch_one(&state.db)
    .await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO trip_links
            (group_id, added_by, url, title, description, image_url, site_name, note, fetched_at, folder_id, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id",
    )
    .bind(group_id)
    .bind(user.id)
    .bind(trimmed_url)
    .bind(preview.as_ref().and_then(|p| p.title.clone()))
    .bind(preview.as_ref().and_then(|p| p.description.clone()))
    .bind(preview.as_ref().and_then(|p| p.image_url.clone()))
    .bind(preview.as_ref().and_then(|p| p.site_name.clone()))
    .bind(payload.note.trim())
    .bind(preview.as_ref().map(|_| Utc::now()))
    .bind(payload.folder_id)
    .bind(next_position.0)
    .fetch_one(&state.db)
    .await?;

    let link = fetch_link(&state.db, id.0, user.id).await?;
    Ok(Json(link))
}

pub async fn update_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, link_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateLinkRequest>,
) -> AppResult<Json<TripLink>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    // Any group member may edit a link; we still need to make sure the link
    // exists within this group.
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM trip_links WHERE id = $1 AND group_id = $2")
            .bind(link_id)
            .bind(group_id)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("link not found".into()));
    }

    if let Some(note) = payload.note.as_deref() {
        sqlx::query("UPDATE trip_links SET note = $1 WHERE id = $2")
            .bind(note.trim())
            .bind(link_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(title_override) = payload.title_override {
        // Empty string is treated the same as null: "clear the override".
        let value = title_override
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        sqlx::query("UPDATE trip_links SET title_override = $1 WHERE id = $2")
            .bind(value)
            .bind(link_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(image_override) = payload.image_override {
        let value = image_override
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        sqlx::query("UPDATE trip_links SET image_override = $1 WHERE id = $2")
            .bind(value)
            .bind(link_id)
            .execute(&state.db)
            .await?;
    }

    let link = fetch_link(&state.db, link_id, user.id).await?;
    Ok(Json(link))
}

pub async fn delete_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, link_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    // Any group member can delete links inside their group. The group-id
    // filter guarantees we don't touch other groups' data.
    let result = sqlx::query("DELETE FROM trip_links WHERE id = $1 AND group_id = $2")
        .bind(link_id)
        .bind(group_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("link not found".into()));
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn refresh_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, link_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<TripLink>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let row: Option<(String,)> =
        sqlx::query_as("SELECT url FROM trip_links WHERE id = $1 AND group_id = $2")
            .bind(link_id)
            .bind(group_id)
            .fetch_optional(&state.db)
            .await?;
    let Some((url,)) = row else {
        return Err(AppError::NotFound("link not found".into()));
    };

    match fetch_preview(&url).await {
        Ok(p) => {
            sqlx::query(
                "UPDATE trip_links
                 SET title = $1, description = $2, image_url = $3, site_name = $4, fetched_at = NOW()
                 WHERE id = $5",
            )
            .bind(p.title)
            .bind(p.description)
            .bind(p.image_url)
            .bind(p.site_name)
            .bind(link_id)
            .execute(&state.db)
            .await?;
        }
        Err(e) => {
            tracing::info!(url = %url, error = %e, "refresh unfurl failed");
        }
    }

    let link = fetch_link(&state.db, link_id, user.id).await?;
    Ok(Json(link))
}

pub async fn vote_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, link_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<VoteRequest>,
) -> AppResult<Json<TripLink>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let exists: Option<(i64,)> =
        sqlx::query_as("SELECT 1::BIGINT FROM trip_links WHERE id = $1 AND group_id = $2")
            .bind(link_id)
            .bind(group_id)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("link not found".into()));
    }

    if payload.value == 0 {
        sqlx::query("DELETE FROM trip_link_votes WHERE link_id = $1 AND user_id = $2")
            .bind(link_id)
            .bind(user.id)
            .execute(&state.db)
            .await?;
    } else {
        sqlx::query(
            "INSERT INTO trip_link_votes (link_id, user_id, value)
             VALUES ($1, $2, $3)
             ON CONFLICT (link_id, user_id)
             DO UPDATE SET value = EXCLUDED.value, voted_at = NOW()",
        )
        .bind(link_id)
        .bind(user.id)
        .bind(payload.value)
        .execute(&state.db)
        .await?;
    }

    let link = fetch_link(&state.db, link_id, user.id).await?;
    Ok(Json(link))
}

// ---------- folder handlers ----------

pub async fn list_folders(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<TripFolder>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let rows: Vec<(Uuid, String, Uuid, String, DateTime<Utc>, i64)> = sqlx::query_as(
        "SELECT f.id, f.name, f.created_by, u.display_name, f.created_at,
                COALESCE(COUNT(tl.id), 0)::BIGINT AS link_count
         FROM trip_folders f
         INNER JOIN users u ON u.id = f.created_by
         LEFT JOIN trip_links tl ON tl.folder_id = f.id
         WHERE f.group_id = $1
         GROUP BY f.id, u.display_name
         ORDER BY f.created_at ASC",
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    let out = rows
        .into_iter()
        .map(
            |(id, name, created_by, created_by_display_name, created_at, link_count)| TripFolder {
                id,
                name,
                created_by,
                created_by_display_name,
                created_at,
                link_count,
            },
        )
        .collect();
    Ok(Json(out))
}

pub async fn create_folder(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateFolderRequest>,
) -> AppResult<Json<TripFolder>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let row: (Uuid, String, Uuid, DateTime<Utc>) = sqlx::query_as(
        "INSERT INTO trip_folders (group_id, name, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, name, created_by, created_at",
    )
    .bind(group_id)
    .bind(payload.name.trim())
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    let display: (String,) = sqlx::query_as("SELECT display_name FROM users WHERE id = $1")
        .bind(row.2)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(TripFolder {
        id: row.0,
        name: row.1,
        created_by: row.2,
        created_by_display_name: display.0,
        created_at: row.3,
        link_count: 0,
    }))
}

pub async fn update_folder(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, folder_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateFolderRequest>,
) -> AppResult<Json<TripFolder>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    ensure_folder_in_group(&state.db, folder_id, group_id).await?;

    sqlx::query("UPDATE trip_folders SET name = $1 WHERE id = $2")
        .bind(payload.name.trim())
        .bind(folder_id)
        .execute(&state.db)
        .await?;

    load_folder(&state.db, folder_id).await.map(Json)
}

pub async fn delete_folder(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, folder_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    // ON DELETE SET NULL moves the links back to the "unsorted" bucket.
    let result = sqlx::query("DELETE FROM trip_folders WHERE id = $1 AND group_id = $2")
        .bind(folder_id)
        .bind(group_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("folder not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn move_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, link_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<MoveLinkRequest>,
) -> AppResult<Json<TripLink>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM trip_links WHERE id = $1 AND group_id = $2")
            .bind(link_id)
            .bind(group_id)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("link not found".into()));
    }

    if let Some(folder_id) = payload.folder_id {
        ensure_folder_in_group(&state.db, folder_id, group_id).await?;
    }

    // Drop at the bottom of the target bucket so moving never collides with
    // an existing order.
    let next_position: (i32,) = sqlx::query_as(
        "SELECT COALESCE(MAX(position), -1) + 1
           FROM trip_links
           WHERE group_id = $1 AND folder_id IS NOT DISTINCT FROM $2",
    )
    .bind(group_id)
    .bind(payload.folder_id)
    .fetch_one(&state.db)
    .await?;

    sqlx::query("UPDATE trip_links SET folder_id = $1, position = $2 WHERE id = $3")
        .bind(payload.folder_id)
        .bind(next_position.0)
        .bind(link_id)
        .execute(&state.db)
        .await?;

    let link = fetch_link(&state.db, link_id, user.id).await?;
    Ok(Json(link))
}

pub async fn reorder_links(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<ReorderLinksRequest>,
) -> AppResult<Json<Vec<TripLink>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    if let Some(folder_id) = payload.folder_id {
        ensure_folder_in_group(&state.db, folder_id, group_id).await?;
    }

    let mut tx = state.db.begin().await?;
    // Temporarily bump everyone so we can freely rewrite positions.
    sqlx::query(
        "UPDATE trip_links SET position = position + 100000
           WHERE group_id = $1 AND folder_id IS NOT DISTINCT FROM $2",
    )
    .bind(group_id)
    .bind(payload.folder_id)
    .execute(&mut *tx)
    .await?;

    for (idx, id) in payload.ids.iter().enumerate() {
        let res = sqlx::query(
            "UPDATE trip_links SET position = $1
               WHERE id = $2 AND group_id = $3
                 AND folder_id IS NOT DISTINCT FROM $4",
        )
        .bind(idx as i32)
        .bind(id)
        .bind(group_id)
        .bind(payload.folder_id)
        .execute(&mut *tx)
        .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound("link not found in this folder".into()));
        }
    }
    tx.commit().await?;

    let links = fetch_links(&state.db, group_id, user.id).await?;
    Ok(Json(links))
}

async fn ensure_folder_in_group(pool: &PgPool, folder_id: Uuid, group_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM trip_folders WHERE id = $1 AND group_id = $2")
            .bind(folder_id)
            .bind(group_id)
            .fetch_optional(pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("folder not found".into()));
    }
    Ok(())
}

async fn load_folder(pool: &PgPool, folder_id: Uuid) -> AppResult<TripFolder> {
    let row: (Uuid, String, Uuid, String, DateTime<Utc>, i64) = sqlx::query_as(
        "SELECT f.id, f.name, f.created_by, u.display_name, f.created_at,
                COALESCE(COUNT(tl.id), 0)::BIGINT AS link_count
         FROM trip_folders f
         INNER JOIN users u ON u.id = f.created_by
         LEFT JOIN trip_links tl ON tl.folder_id = f.id
         WHERE f.id = $1
         GROUP BY f.id, u.display_name",
    )
    .bind(folder_id)
    .fetch_one(pool)
    .await?;

    Ok(TripFolder {
        id: row.0,
        name: row.1,
        created_by: row.2,
        created_by_display_name: row.3,
        created_at: row.4,
        link_count: row.5,
    })
}

// ---------- internal helpers ----------

// We used to use a huge tuple here but sqlx's FromRow is capped (around 17
// elements), and the query now fetches 19 columns. A named struct is also
// easier to maintain as more columns get added.
#[derive(sqlx::FromRow)]
struct LinkRow {
    id: Uuid,
    url: String,
    title: Option<String>,
    description: Option<String>,
    image_url: Option<String>,
    site_name: Option<String>,
    title_override: Option<String>,
    image_override: Option<String>,
    note: String,
    added_by: Uuid,
    added_by_display_name: String,
    created_at: DateTime<Utc>,
    fetched_at: Option<DateTime<Utc>>,
    likes: i64,
    dislikes: i64,
    my_vote: Option<i16>,
    folder_id: Option<Uuid>,
    folder_name: Option<String>,
    position: i32,
}

const LINK_SELECT: &str = "\
    SELECT tl.id, tl.url, tl.title, tl.description, tl.image_url, tl.site_name, \
           tl.title_override, tl.image_override, \
           tl.note, tl.added_by, u.display_name AS added_by_display_name, \
           tl.created_at, tl.fetched_at, \
           COALESCE(SUM(CASE WHEN v.value = 1 THEN 1 ELSE 0 END), 0)::BIGINT AS likes, \
           COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0)::BIGINT AS dislikes, \
           MAX(CASE WHEN v.user_id = $2 THEN v.value END) AS my_vote, \
           tl.folder_id, f.name AS folder_name, tl.position \
    FROM trip_links tl \
    INNER JOIN users u ON u.id = tl.added_by \
    LEFT JOIN trip_link_votes v ON v.link_id = tl.id \
    LEFT JOIN trip_folders f ON f.id = tl.folder_id";

fn row_into_link(row: LinkRow) -> TripLink {
    TripLink {
        id: row.id,
        url: row.url,
        title: row.title,
        description: row.description,
        image_url: row.image_url,
        site_name: row.site_name,
        title_override: row.title_override,
        image_override: row.image_override,
        note: row.note,
        added_by: row.added_by,
        added_by_display_name: row.added_by_display_name,
        created_at: row.created_at,
        fetched_at: row.fetched_at,
        likes: row.likes,
        dislikes: row.dislikes,
        my_vote: row.my_vote.unwrap_or(0),
        folder_id: row.folder_id,
        folder_name: row.folder_name,
        position: row.position,
    }
}

async fn fetch_links(pool: &PgPool, group_id: Uuid, me: Uuid) -> AppResult<Vec<TripLink>> {
    let sql = format!(
        "{LINK_SELECT} \
         WHERE tl.group_id = $1 \
         GROUP BY tl.id, u.display_name, f.name \
         ORDER BY tl.position ASC, tl.created_at ASC"
    );
    let rows: Vec<LinkRow> = sqlx::query_as(&sql)
        .bind(group_id)
        .bind(me)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(row_into_link).collect())
}

async fn fetch_link(pool: &PgPool, id: Uuid, me: Uuid) -> AppResult<TripLink> {
    let sql = format!(
        "{LINK_SELECT} \
         WHERE tl.id = $1 \
         GROUP BY tl.id, u.display_name, f.name"
    );
    let row: LinkRow = sqlx::query_as(&sql)
        .bind(id)
        .bind(me)
        .fetch_one(pool)
        .await?;
    Ok(row_into_link(row))
}
