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

/// Owner axis for shopping rows. Lists and items either belong to a
/// group (shared with every member) or to a single user (personal list,
/// only visible to its owner). Membership/ownership is enforced
/// centrally here so individual handlers stay small.
#[derive(Debug, Clone, Copy)]
pub enum Scope {
    Group { group_id: Uuid, user_id: Uuid },
    Personal { user_id: Uuid },
}

impl Scope {
    pub fn acting_user(&self) -> Uuid {
        match self {
            Scope::Group { user_id, .. } | Scope::Personal { user_id } => *user_id,
        }
    }

    pub async fn for_group(state: &AppState, group_id: Uuid, user: &AuthUser) -> AppResult<Self> {
        crate::groups::ensure_member(state, group_id, user.id).await?;
        Ok(Scope::Group {
            group_id,
            user_id: user.id,
        })
    }

    pub fn for_personal(user: &AuthUser) -> Self {
        Scope::Personal { user_id: user.id }
    }
}

// -------------------------------------------------------------------------
// Shopping lists
// -------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct ShoppingList {
    pub id: Uuid,
    pub group_id: Option<Uuid>,
    pub owner_user_id: Option<Uuid>,
    pub name: String,
    /// Number of unchecked items on this list. Precomputed so the UI can
    /// show a "3 open" badge in the dropdown without a second round-trip.
    pub items_open: i64,
    /// Number of items already ticked off.
    pub items_done: i64,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateListRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RenameListRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
}

// ---------- group-scoped list handlers ----------

pub async fn list_group_lists(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<ShoppingList>>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    Ok(Json(fetch_lists(&state.db, scope).await?))
}

pub async fn create_group_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateListRequest>,
) -> AppResult<Json<ShoppingList>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    create_list(&state.db, scope, payload).await.map(Json)
}

pub async fn rename_group_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<RenameListRequest>,
) -> AppResult<Json<ShoppingList>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    rename_list(&state.db, scope, list_id, payload).await.map(Json)
}

pub async fn delete_group_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<ShoppingList>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    delete_list(&state.db, scope, list_id).await.map(Json)
}

// ---------- personal-scoped list handlers ----------

pub async fn list_personal_lists(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<ShoppingList>>> {
    let scope = Scope::for_personal(&user);
    Ok(Json(fetch_lists(&state.db, scope).await?))
}

pub async fn create_personal_list(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateListRequest>,
) -> AppResult<Json<ShoppingList>> {
    let scope = Scope::for_personal(&user);
    create_list(&state.db, scope, payload).await.map(Json)
}

pub async fn rename_personal_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<Uuid>,
    Json(payload): Json<RenameListRequest>,
) -> AppResult<Json<ShoppingList>> {
    let scope = Scope::for_personal(&user);
    rename_list(&state.db, scope, list_id, payload).await.map(Json)
}

pub async fn delete_personal_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<Uuid>,
) -> AppResult<Json<ShoppingList>> {
    let scope = Scope::for_personal(&user);
    delete_list(&state.db, scope, list_id).await.map(Json)
}

// ---------- core list CRUD (scope-agnostic) ----------

async fn create_list(
    pool: &PgPool,
    scope: Scope,
    payload: CreateListRequest,
) -> AppResult<ShoppingList> {
    payload.validate()?;
    let (group_id, owner_user_id) = split_scope(scope);

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO shopping_lists (group_id, owner_user_id, name, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id",
    )
    .bind(group_id)
    .bind(owner_user_id)
    .bind(payload.name.trim())
    .bind(scope.acting_user())
    .fetch_one(pool)
    .await?;

    fetch_list(pool, id.0).await
}

async fn rename_list(
    pool: &PgPool,
    scope: Scope,
    list_id: Uuid,
    payload: RenameListRequest,
) -> AppResult<ShoppingList> {
    payload.validate()?;
    ensure_list_in_scope(pool, list_id, scope).await?;

    sqlx::query("UPDATE shopping_lists SET name = $1 WHERE id = $2")
        .bind(payload.name.trim())
        .bind(list_id)
        .execute(pool)
        .await?;

    fetch_list(pool, list_id).await
}

async fn delete_list(pool: &PgPool, scope: Scope, list_id: Uuid) -> AppResult<ShoppingList> {
    ensure_list_in_scope(pool, list_id, scope).await?;

    // Safeguard: never leave a scope without a list. The frontend is
    // list-centric and would render a broken empty state otherwise. If
    // we're deleting the last list for this scope, synthesise a fresh
    // empty default in the same transaction so the UI always has
    // something to switch to.
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM shopping_lists WHERE id = $1")
        .bind(list_id)
        .execute(&mut *tx)
        .await?;

    let (scope_sql, owner) = scope_filter(scope, "sl", 1);
    let count_sql = format!("SELECT COUNT(*)::BIGINT FROM shopping_lists sl WHERE {scope_sql}");
    let remaining: (i64,) = sqlx::query_as(&count_sql)
        .bind(owner)
        .fetch_one(&mut *tx)
        .await?;

    let fallback_id: Uuid = if remaining.0 == 0 {
        let (group_id, owner_user_id) = split_scope(scope);
        let row: (Uuid,) = sqlx::query_as(
            "INSERT INTO shopping_lists (group_id, owner_user_id, name, created_by)
             VALUES ($1, $2, 'Einkaufsliste', $3)
             RETURNING id",
        )
        .bind(group_id)
        .bind(owner_user_id)
        .bind(scope.acting_user())
        .fetch_one(&mut *tx)
        .await?;
        row.0
    } else {
        // Any remaining list works as the follow-up selection; the
        // frontend will switch to whatever list_id comes back.
        let pick_sql = format!(
            "SELECT sl.id FROM shopping_lists sl WHERE {scope_sql} \
             ORDER BY sl.created_at ASC LIMIT 1",
        );
        let row: (Uuid,) = sqlx::query_as(&pick_sql)
            .bind(owner)
            .fetch_one(&mut *tx)
            .await?;
        row.0
    };

    tx.commit().await?;

    fetch_list(pool, fallback_id).await
}

// -------------------------------------------------------------------------
// Shopping items (scoped to a list)
// -------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct ShoppingItem {
    pub id: Uuid,
    pub group_id: Option<Uuid>,
    pub owner_user_id: Option<Uuid>,
    pub list_id: Uuid,
    pub name: String,
    pub quantity: String,
    pub note: String,
    pub is_done: bool,
    pub done_at: Option<DateTime<Utc>>,
    pub done_by: Option<Uuid>,
    pub done_by_display_name: Option<String>,
    pub added_by: Uuid,
    pub added_by_display_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateItemRequest {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    #[validate(length(max = 80))]
    #[serde(default)]
    pub quantity: String,
    #[validate(length(max = 500))]
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateItemRequest {
    #[validate(length(min = 1, max = 200))]
    pub name: Option<String>,
    #[validate(length(max = 80))]
    pub quantity: Option<String>,
    #[validate(length(max = 500))]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    /// When omitted the state is flipped; otherwise forced to the given value.
    #[serde(default)]
    pub done: Option<bool>,
}

// ---------- group-scoped item handlers ----------

pub async fn list_group_items(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Vec<ShoppingItem>>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    ensure_list_in_scope(&state.db, list_id, scope).await?;
    Ok(Json(fetch_items(&state.db, list_id).await?))
}

pub async fn create_group_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<CreateItemRequest>,
) -> AppResult<Json<ShoppingItem>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    create_item(&state.db, scope, list_id, payload).await.map(Json)
}

pub async fn update_group_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id, item_id)): Path<(Uuid, Uuid, Uuid)>,
    Json(payload): Json<UpdateItemRequest>,
) -> AppResult<Json<ShoppingItem>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    update_item(&state.db, scope, list_id, item_id, payload)
        .await
        .map(Json)
}

pub async fn toggle_group_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id, item_id)): Path<(Uuid, Uuid, Uuid)>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<ShoppingItem>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    toggle_item(&state.db, scope, list_id, item_id, payload)
        .await
        .map(Json)
}

pub async fn delete_group_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id, item_id)): Path<(Uuid, Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    delete_item(&state.db, scope, list_id, item_id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn clear_group_done(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, list_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    let removed = clear_done(&state.db, scope, list_id).await?;
    Ok(Json(serde_json::json!({ "ok": true, "removed": removed })))
}

// ---------- personal-scoped item handlers ----------

pub async fn list_personal_items(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<Uuid>,
) -> AppResult<Json<Vec<ShoppingItem>>> {
    let scope = Scope::for_personal(&user);
    ensure_list_in_scope(&state.db, list_id, scope).await?;
    Ok(Json(fetch_items(&state.db, list_id).await?))
}

pub async fn create_personal_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<Uuid>,
    Json(payload): Json<CreateItemRequest>,
) -> AppResult<Json<ShoppingItem>> {
    let scope = Scope::for_personal(&user);
    create_item(&state.db, scope, list_id, payload).await.map(Json)
}

pub async fn update_personal_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((list_id, item_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateItemRequest>,
) -> AppResult<Json<ShoppingItem>> {
    let scope = Scope::for_personal(&user);
    update_item(&state.db, scope, list_id, item_id, payload)
        .await
        .map(Json)
}

pub async fn toggle_personal_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((list_id, item_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<ShoppingItem>> {
    let scope = Scope::for_personal(&user);
    toggle_item(&state.db, scope, list_id, item_id, payload)
        .await
        .map(Json)
}

pub async fn delete_personal_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((list_id, item_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_personal(&user);
    delete_item(&state.db, scope, list_id, item_id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn clear_personal_done(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_personal(&user);
    let removed = clear_done(&state.db, scope, list_id).await?;
    Ok(Json(serde_json::json!({ "ok": true, "removed": removed })))
}

// ---------- core item CRUD (scope-agnostic) ----------

async fn create_item(
    pool: &PgPool,
    scope: Scope,
    list_id: Uuid,
    payload: CreateItemRequest,
) -> AppResult<ShoppingItem> {
    payload.validate()?;
    ensure_list_in_scope(pool, list_id, scope).await?;
    let (group_id, owner_user_id) = split_scope(scope);

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO shopping_items
            (group_id, owner_user_id, list_id, added_by, name, quantity, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id",
    )
    .bind(group_id)
    .bind(owner_user_id)
    .bind(list_id)
    .bind(scope.acting_user())
    .bind(payload.name.trim())
    .bind(payload.quantity.trim())
    .bind(payload.note.trim())
    .fetch_one(pool)
    .await?;

    fetch_item(pool, id.0).await
}

async fn update_item(
    pool: &PgPool,
    scope: Scope,
    list_id: Uuid,
    item_id: Uuid,
    payload: UpdateItemRequest,
) -> AppResult<ShoppingItem> {
    payload.validate()?;
    ensure_list_in_scope(pool, list_id, scope).await?;
    ensure_item_in_list(pool, item_id, list_id).await?;

    sqlx::query(
        "UPDATE shopping_items
         SET name     = COALESCE($1, name),
             quantity = COALESCE($2, quantity),
             note     = COALESCE($3, note)
         WHERE id = $4",
    )
    .bind(payload.name.as_deref().map(str::trim))
    .bind(payload.quantity.as_deref().map(str::trim))
    .bind(payload.note.as_deref().map(str::trim))
    .bind(item_id)
    .execute(pool)
    .await?;

    fetch_item(pool, item_id).await
}

async fn toggle_item(
    pool: &PgPool,
    scope: Scope,
    list_id: Uuid,
    item_id: Uuid,
    payload: ToggleRequest,
) -> AppResult<ShoppingItem> {
    ensure_list_in_scope(pool, list_id, scope).await?;

    let current: Option<(bool,)> =
        sqlx::query_as("SELECT is_done FROM shopping_items WHERE id = $1 AND list_id = $2")
            .bind(item_id)
            .bind(list_id)
            .fetch_optional(pool)
            .await?;
    let Some((was_done,)) = current else {
        return Err(AppError::NotFound("item not found".into()));
    };

    let target = payload.done.unwrap_or(!was_done);

    if target {
        sqlx::query(
            "UPDATE shopping_items
             SET is_done = TRUE, done_at = NOW(), done_by = $1
             WHERE id = $2",
        )
        .bind(scope.acting_user())
        .bind(item_id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "UPDATE shopping_items
             SET is_done = FALSE, done_at = NULL, done_by = NULL
             WHERE id = $1",
        )
        .bind(item_id)
        .execute(pool)
        .await?;
    }

    fetch_item(pool, item_id).await
}

async fn delete_item(
    pool: &PgPool,
    scope: Scope,
    list_id: Uuid,
    item_id: Uuid,
) -> AppResult<()> {
    ensure_list_in_scope(pool, list_id, scope).await?;
    ensure_item_in_list(pool, item_id, list_id).await?;
    sqlx::query("DELETE FROM shopping_items WHERE id = $1")
        .bind(item_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn clear_done(pool: &PgPool, scope: Scope, list_id: Uuid) -> AppResult<u64> {
    ensure_list_in_scope(pool, list_id, scope).await?;
    let res = sqlx::query("DELETE FROM shopping_items WHERE list_id = $1 AND is_done = TRUE")
        .bind(list_id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected())
}

// -------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------

/// Verify the list belongs to the given scope. Replaces the old
/// `ensure_list_in_group` check; for personal scope it matches
/// `owner_user_id`, for group scope it matches `group_id`.
pub async fn ensure_list_in_scope(
    pool: &PgPool,
    list_id: Uuid,
    scope: Scope,
) -> AppResult<()> {
    let (scope_sql, owner) = scope_filter(scope, "sl", 2);
    let sql = format!(
        "SELECT sl.id FROM shopping_lists sl WHERE sl.id = $1 AND {scope_sql}",
    );
    let exists: Option<(Uuid,)> = sqlx::query_as(&sql)
        .bind(list_id)
        .bind(owner)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("shopping list not found".into()));
    }
    Ok(())
}

async fn ensure_item_in_list(pool: &PgPool, item_id: Uuid, list_id: Uuid) -> AppResult<()> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT 1::BIGINT FROM shopping_items WHERE id = $1 AND list_id = $2")
            .bind(item_id)
            .bind(list_id)
            .fetch_optional(pool)
            .await?;
    if row.is_none() {
        return Err(AppError::NotFound("item not found".into()));
    }
    Ok(())
}

fn split_scope(scope: Scope) -> (Option<Uuid>, Option<Uuid>) {
    match scope {
        Scope::Group { group_id, .. } => (Some(group_id), None),
        Scope::Personal { user_id } => (None, Some(user_id)),
    }
}

/// Returns the WHERE fragment identifying this scope's rows (already
/// qualified with the caller's table alias), plus the matching UUID
/// bind. `placeholder` is the positional index the caller will bind
/// this value at (varies between helpers - e.g. `$1` for list queries
/// that only carry the owner, `$2` for lookups that match a primary
/// key first).
fn scope_filter(scope: Scope, alias: &str, placeholder: u32) -> (String, Uuid) {
    match scope {
        Scope::Group { group_id, .. } => {
            (format!("{alias}.group_id = ${placeholder}"), group_id)
        }
        Scope::Personal { user_id } => {
            (format!("{alias}.owner_user_id = ${placeholder}"), user_id)
        }
    }
}

type ListRow = (
    Uuid,
    Option<Uuid>,
    Option<Uuid>,
    String,
    i64,
    i64,
    Uuid,
    DateTime<Utc>,
);

const LIST_SELECT: &str = "\
    SELECT sl.id, sl.group_id, sl.owner_user_id, sl.name, \
           COALESCE((SELECT COUNT(*) FROM shopping_items si \
                     WHERE si.list_id = sl.id AND si.is_done = FALSE), 0)::BIGINT AS items_open, \
           COALESCE((SELECT COUNT(*) FROM shopping_items si \
                     WHERE si.list_id = sl.id AND si.is_done = TRUE), 0)::BIGINT AS items_done, \
           sl.created_by, sl.created_at \
    FROM shopping_lists sl";

fn row_into_list(row: ListRow) -> ShoppingList {
    ShoppingList {
        id: row.0,
        group_id: row.1,
        owner_user_id: row.2,
        name: row.3,
        items_open: row.4,
        items_done: row.5,
        created_by: row.6,
        created_at: row.7,
    }
}

async fn fetch_lists(pool: &PgPool, scope: Scope) -> AppResult<Vec<ShoppingList>> {
    let (scope_sql, owner) = scope_filter(scope, "sl", 1);
    let sql = format!("{LIST_SELECT} WHERE {scope_sql} ORDER BY sl.created_at ASC");
    let rows: Vec<ListRow> = sqlx::query_as(&sql).bind(owner).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_list).collect())
}

async fn fetch_list(pool: &PgPool, id: Uuid) -> AppResult<ShoppingList> {
    let sql = format!("{LIST_SELECT} WHERE sl.id = $1");
    let row: ListRow = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_list(row))
}

type ItemRow = (
    Uuid,
    Option<Uuid>,
    Option<Uuid>,
    Uuid,
    String,
    String,
    String,
    bool,
    Option<DateTime<Utc>>,
    Option<Uuid>,
    Option<String>,
    Uuid,
    String,
    DateTime<Utc>,
);

const ITEM_SELECT: &str = "\
    SELECT si.id, si.group_id, si.owner_user_id, si.list_id, si.name, si.quantity, si.note, \
           si.is_done, si.done_at, si.done_by, du.display_name AS done_by_display_name, \
           si.added_by, au.display_name AS added_by_display_name, si.created_at \
    FROM shopping_items si \
    INNER JOIN users au ON au.id = si.added_by \
    LEFT JOIN users du ON du.id = si.done_by";

fn row_into_item(row: ItemRow) -> ShoppingItem {
    ShoppingItem {
        id: row.0,
        group_id: row.1,
        owner_user_id: row.2,
        list_id: row.3,
        name: row.4,
        quantity: row.5,
        note: row.6,
        is_done: row.7,
        done_at: row.8,
        done_by: row.9,
        done_by_display_name: row.10,
        added_by: row.11,
        added_by_display_name: row.12,
        created_at: row.13,
    }
}

async fn fetch_items(pool: &PgPool, list_id: Uuid) -> AppResult<Vec<ShoppingItem>> {
    let sql = format!(
        "{ITEM_SELECT} WHERE si.list_id = $1 \
         ORDER BY si.is_done ASC, si.created_at DESC"
    );
    let rows: Vec<ItemRow> = sqlx::query_as(&sql).bind(list_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_item).collect())
}

async fn fetch_item(pool: &PgPool, id: Uuid) -> AppResult<ShoppingItem> {
    let sql = format!("{ITEM_SELECT} WHERE si.id = $1");
    let row: ItemRow = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_item(row))
}
