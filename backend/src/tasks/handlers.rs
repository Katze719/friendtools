use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

/// Owner axis for task rows. A task either belongs to a group (shared
/// with every member, assignable to anyone in the group) or to a single
/// user (personal todo, never assignable). The SQL side enforces
/// exactly-one owner via a CHECK constraint.
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

#[derive(Debug, Serialize)]
pub struct Task {
    pub id: Uuid,
    pub group_id: Option<Uuid>,
    pub owner_user_id: Option<Uuid>,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub due_date: Option<NaiveDate>,
    pub is_done: bool,
    pub done_at: Option<DateTime<Utc>>,
    pub done_by: Option<Uuid>,
    pub done_by_display_name: Option<String>,
    pub assigned_to: Option<Uuid>,
    pub assigned_to_display_name: Option<String>,
    pub created_by: Uuid,
    pub created_by_display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateTaskRequest {
    #[validate(length(min = 1, max = 200))]
    pub title: String,
    #[validate(length(max = 2000))]
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub assigned_to: Option<Uuid>,
    #[serde(default)]
    pub due_date: Option<NaiveDate>,
    /// "low" | "normal" | "high". Defaults to "normal".
    #[serde(default)]
    pub priority: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateTaskRequest {
    #[validate(length(min = 1, max = 200))]
    pub title: Option<String>,
    #[validate(length(max = 2000))]
    pub description: Option<String>,
    /// `Some(None)` clears the assignee; `None` (key omitted) keeps the
    /// existing value.
    #[serde(
        default,
        deserialize_with = "deserialize_optional_uuid",
        skip_serializing_if = "Option::is_none"
    )]
    pub assigned_to: Option<Option<Uuid>>,
    /// Same double-option trick for the optional due date.
    #[serde(
        default,
        deserialize_with = "deserialize_optional_date",
        skip_serializing_if = "Option::is_none"
    )]
    pub due_date: Option<Option<NaiveDate>>,
    pub priority: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    /// When omitted the state is flipped; otherwise forced to the given value.
    #[serde(default)]
    pub done: Option<bool>,
}

fn deserialize_optional_uuid<'de, D>(de: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<Uuid>::deserialize(de)?))
}

fn deserialize_optional_date<'de, D>(de: D) -> Result<Option<Option<NaiveDate>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<NaiveDate>::deserialize(de)?))
}

fn validate_priority(value: &str) -> AppResult<&'static str> {
    match value {
        "low" => Ok("low"),
        "normal" => Ok("normal"),
        "high" => Ok("high"),
        _ => Err(AppError::BadRequest(
            "priority must be low, normal or high".into(),
        )),
    }
}

// ---------- group-scoped handlers ----------

pub async fn list_group_tasks(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<Task>>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    Ok(Json(fetch_tasks(&state.db, scope).await?))
}

pub async fn create_group_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateTaskRequest>,
) -> AppResult<Json<Task>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    create_task(&state, scope, payload).await.map(Json)
}

pub async fn update_group_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, task_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateTaskRequest>,
) -> AppResult<Json<Task>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    update_task(&state, scope, task_id, payload).await.map(Json)
}

pub async fn toggle_group_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, task_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<Task>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    toggle_task(&state.db, scope, task_id, payload).await.map(Json)
}

pub async fn delete_group_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, task_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    delete_task(&state.db, scope, task_id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn clear_group_done(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_group(&state, group_id, &user).await?;
    let removed = clear_done(&state.db, scope).await?;
    Ok(Json(serde_json::json!({ "ok": true, "removed": removed })))
}

// ---------- personal-scoped handlers ----------

pub async fn list_personal_tasks(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<Task>>> {
    let scope = Scope::for_personal(&user);
    Ok(Json(fetch_tasks(&state.db, scope).await?))
}

pub async fn create_personal_task(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateTaskRequest>,
) -> AppResult<Json<Task>> {
    let scope = Scope::for_personal(&user);
    create_task(&state, scope, payload).await.map(Json)
}

pub async fn update_personal_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdateTaskRequest>,
) -> AppResult<Json<Task>> {
    let scope = Scope::for_personal(&user);
    update_task(&state, scope, task_id, payload).await.map(Json)
}

pub async fn toggle_personal_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<Task>> {
    let scope = Scope::for_personal(&user);
    toggle_task(&state.db, scope, task_id, payload).await.map(Json)
}

pub async fn delete_personal_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_personal(&user);
    delete_task(&state.db, scope, task_id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn clear_personal_done(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let scope = Scope::for_personal(&user);
    let removed = clear_done(&state.db, scope).await?;
    Ok(Json(serde_json::json!({ "ok": true, "removed": removed })))
}

// ---------- core CRUD (scope-agnostic) ----------

async fn create_task(state: &AppState, scope: Scope, payload: CreateTaskRequest) -> AppResult<Task> {
    payload.validate()?;

    // Personal tasks have no assignee concept (the owner is implicit).
    // Reject callers that try to set one so the data stays clean.
    let assignee = match scope {
        Scope::Group { group_id, .. } => {
            if let Some(id) = payload.assigned_to {
                ensure_member_of(state, group_id, id).await?;
            }
            payload.assigned_to
        }
        Scope::Personal { .. } => {
            if payload.assigned_to.is_some() {
                return Err(AppError::BadRequest(
                    "personal tasks cannot have an assignee".into(),
                ));
            }
            None
        }
    };

    let priority = match payload.priority.as_deref() {
        Some(p) => validate_priority(p)?,
        None => "normal",
    };

    let (group_id, owner_user_id) = split_scope(scope);

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO tasks
            (group_id, owner_user_id, title, description, assigned_to,
             due_date, priority, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id",
    )
    .bind(group_id)
    .bind(owner_user_id)
    .bind(payload.title.trim())
    .bind(payload.description.trim())
    .bind(assignee)
    .bind(payload.due_date)
    .bind(priority)
    .bind(scope.acting_user())
    .fetch_one(&state.db)
    .await?;

    fetch_task(&state.db, id.0).await
}

async fn update_task(
    state: &AppState,
    scope: Scope,
    task_id: Uuid,
    payload: UpdateTaskRequest,
) -> AppResult<Task> {
    payload.validate()?;
    ensure_task_in_scope(&state.db, task_id, scope).await?;

    if let Some(title) = payload.title.as_deref() {
        sqlx::query("UPDATE tasks SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title.trim())
            .bind(task_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(description) = payload.description.as_deref() {
        sqlx::query("UPDATE tasks SET description = $1, updated_at = NOW() WHERE id = $2")
            .bind(description.trim())
            .bind(task_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(priority) = payload.priority.as_deref() {
        let canonical = validate_priority(priority)?;
        sqlx::query("UPDATE tasks SET priority = $1, updated_at = NOW() WHERE id = $2")
            .bind(canonical)
            .bind(task_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(assignee_opt) = payload.assigned_to {
        match scope {
            Scope::Group { group_id, .. } => {
                if let Some(id) = assignee_opt {
                    ensure_member_of(state, group_id, id).await?;
                }
                sqlx::query(
                    "UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2",
                )
                .bind(assignee_opt)
                .bind(task_id)
                .execute(&state.db)
                .await?;
            }
            Scope::Personal { .. } => {
                if assignee_opt.is_some() {
                    return Err(AppError::BadRequest(
                        "personal tasks cannot have an assignee".into(),
                    ));
                }
                // Explicit-null on personal tasks is a no-op: the column
                // is already NULL and stays that way.
            }
        }
    }
    if let Some(due_opt) = payload.due_date {
        sqlx::query("UPDATE tasks SET due_date = $1, updated_at = NOW() WHERE id = $2")
            .bind(due_opt)
            .bind(task_id)
            .execute(&state.db)
            .await?;
    }

    fetch_task(&state.db, task_id).await
}

async fn toggle_task(
    pool: &PgPool,
    scope: Scope,
    task_id: Uuid,
    payload: ToggleRequest,
) -> AppResult<Task> {
    let (scope_sql, owner) = scope_filter(scope, "t", 2);
    let sql = format!(
        "SELECT t.is_done FROM tasks t WHERE t.id = $1 AND {scope_sql}",
    );
    let current: Option<(bool,)> = sqlx::query_as(&sql)
        .bind(task_id)
        .bind(owner)
        .fetch_optional(pool)
        .await?;
    let Some((was_done,)) = current else {
        return Err(AppError::NotFound("task not found".into()));
    };

    let target = payload.done.unwrap_or(!was_done);

    if target {
        sqlx::query(
            "UPDATE tasks
               SET is_done = TRUE, done_at = NOW(), done_by = $1, updated_at = NOW()
               WHERE id = $2",
        )
        .bind(scope.acting_user())
        .bind(task_id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "UPDATE tasks
               SET is_done = FALSE, done_at = NULL, done_by = NULL, updated_at = NOW()
               WHERE id = $1",
        )
        .bind(task_id)
        .execute(pool)
        .await?;
    }

    fetch_task(pool, task_id).await
}

async fn delete_task(pool: &PgPool, scope: Scope, task_id: Uuid) -> AppResult<()> {
    ensure_task_in_scope(pool, task_id, scope).await?;
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(task_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn clear_done(pool: &PgPool, scope: Scope) -> AppResult<u64> {
    let (scope_sql, owner) = scope_filter(scope, "tasks", 1);
    let sql = format!("DELETE FROM tasks WHERE is_done = TRUE AND {scope_sql}");
    let res = sqlx::query(&sql).bind(owner).execute(pool).await?;
    Ok(res.rows_affected())
}

// ---------- helpers ----------

async fn ensure_task_in_scope(pool: &PgPool, task_id: Uuid, scope: Scope) -> AppResult<()> {
    let (scope_sql, owner) = scope_filter(scope, "t", 2);
    let sql = format!(
        "SELECT t.id FROM tasks t WHERE t.id = $1 AND {scope_sql}",
    );
    let row: Option<(Uuid,)> = sqlx::query_as(&sql)
        .bind(task_id)
        .bind(owner)
        .fetch_optional(pool)
        .await?;
    if row.is_none() {
        return Err(AppError::NotFound("task not found".into()));
    }
    Ok(())
}

async fn ensure_member_of(state: &AppState, group_id: Uuid, user_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = $2")
            .bind(group_id)
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_none() {
        return Err(AppError::BadRequest(
            "assignee is not a member of this group".into(),
        ));
    }
    Ok(())
}

fn split_scope(scope: Scope) -> (Option<Uuid>, Option<Uuid>) {
    match scope {
        Scope::Group { group_id, .. } => (Some(group_id), None),
        Scope::Personal { user_id } => (None, Some(user_id)),
    }
}

/// See `shopping::handlers::scope_filter` for the same pattern.
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

// sqlx's tuple FromRow impl is capped at 16 elements; with the extra
// `owner_user_id` column we have 17, so use a named struct.
#[derive(sqlx::FromRow)]
struct TaskRow {
    id: Uuid,
    group_id: Option<Uuid>,
    owner_user_id: Option<Uuid>,
    title: String,
    description: String,
    priority: String,
    due_date: Option<NaiveDate>,
    is_done: bool,
    done_at: Option<DateTime<Utc>>,
    done_by: Option<Uuid>,
    done_by_display_name: Option<String>,
    assigned_to: Option<Uuid>,
    assigned_to_display_name: Option<String>,
    created_by: Uuid,
    created_by_display_name: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

const TASK_SELECT: &str = "\
    SELECT t.id, t.group_id, t.owner_user_id, t.title, t.description, t.priority, t.due_date, \
           t.is_done, t.done_at, t.done_by, du.display_name AS done_by_display_name, \
           t.assigned_to, au.display_name AS assigned_to_display_name, \
           t.created_by, cu.display_name AS created_by_display_name, \
           t.created_at, t.updated_at \
      FROM tasks t \
      INNER JOIN users cu ON cu.id = t.created_by \
      LEFT JOIN users du ON du.id = t.done_by \
      LEFT JOIN users au ON au.id = t.assigned_to";

fn row_into_task(row: TaskRow) -> Task {
    Task {
        id: row.id,
        group_id: row.group_id,
        owner_user_id: row.owner_user_id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        due_date: row.due_date,
        is_done: row.is_done,
        done_at: row.done_at,
        done_by: row.done_by,
        done_by_display_name: row.done_by_display_name,
        assigned_to: row.assigned_to,
        assigned_to_display_name: row.assigned_to_display_name,
        created_by: row.created_by,
        created_by_display_name: row.created_by_display_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

async fn fetch_tasks(pool: &PgPool, scope: Scope) -> AppResult<Vec<Task>> {
    // Open tasks first (sorted by due date asc with NULLs last, then
    // priority high->low, then newest first); done tasks last, most
    // recently completed first so the "Done" list feels recency-sorted.
    let (scope_sql, owner) = scope_filter(scope, "t", 1);
    let sql = format!(
        "{TASK_SELECT} \
         WHERE {scope_sql} \
         ORDER BY t.is_done ASC, \
                  t.due_date ASC NULLS LAST, \
                  CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC, \
                  t.created_at DESC",
    );
    let rows: Vec<TaskRow> = sqlx::query_as(&sql).bind(owner).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_task).collect())
}

async fn fetch_task(pool: &PgPool, id: Uuid) -> AppResult<Task> {
    let sql = format!("{TASK_SELECT} WHERE t.id = $1");
    let row: TaskRow = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_task(row))
}
