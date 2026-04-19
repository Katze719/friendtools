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

#[derive(Debug, Serialize)]
pub struct Task {
    pub id: Uuid,
    pub group_id: Uuid,
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

pub async fn list_tasks(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<Task>>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    Ok(Json(fetch_tasks(&state.db, group_id).await?))
}

pub async fn create_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateTaskRequest>,
) -> AppResult<Json<Task>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    if let Some(assignee) = payload.assigned_to {
        ensure_member_of(&state, group_id, assignee).await?;
    }
    let priority = match payload.priority.as_deref() {
        Some(p) => validate_priority(p)?,
        None => "normal",
    };

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO tasks
            (group_id, title, description, assigned_to, due_date, priority, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id",
    )
    .bind(group_id)
    .bind(payload.title.trim())
    .bind(payload.description.trim())
    .bind(payload.assigned_to)
    .bind(payload.due_date)
    .bind(priority)
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(fetch_task(&state.db, id.0).await?))
}

pub async fn update_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, task_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateTaskRequest>,
) -> AppResult<Json<Task>> {
    payload.validate()?;
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    if !task_exists(&state.db, group_id, task_id).await? {
        return Err(AppError::NotFound("task not found".into()));
    }

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
        if let Some(assignee) = assignee_opt {
            ensure_member_of(&state, group_id, assignee).await?;
        }
        sqlx::query("UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2")
            .bind(assignee_opt)
            .bind(task_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(due_opt) = payload.due_date {
        sqlx::query("UPDATE tasks SET due_date = $1, updated_at = NOW() WHERE id = $2")
            .bind(due_opt)
            .bind(task_id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(fetch_task(&state.db, task_id).await?))
}

pub async fn toggle_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, task_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<Task>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;

    let current: Option<(bool,)> =
        sqlx::query_as("SELECT is_done FROM tasks WHERE id = $1 AND group_id = $2")
            .bind(task_id)
            .bind(group_id)
            .fetch_optional(&state.db)
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
        .bind(user.id)
        .bind(task_id)
        .execute(&state.db)
        .await?;
    } else {
        sqlx::query(
            "UPDATE tasks
               SET is_done = FALSE, done_at = NULL, done_by = NULL, updated_at = NOW()
               WHERE id = $1",
        )
        .bind(task_id)
        .execute(&state.db)
        .await?;
    }

    Ok(Json(fetch_task(&state.db, task_id).await?))
}

pub async fn delete_task(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, task_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    if !task_exists(&state.db, group_id, task_id).await? {
        return Err(AppError::NotFound("task not found".into()));
    }
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn clear_done(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    crate::groups::ensure_member(&state, group_id, user.id).await?;
    let res = sqlx::query("DELETE FROM tasks WHERE group_id = $1 AND is_done = TRUE")
        .bind(group_id)
        .execute(&state.db)
        .await?;
    Ok(Json(
        serde_json::json!({ "ok": true, "removed": res.rows_affected() }),
    ))
}

// ---------- helpers ----------

async fn task_exists(pool: &PgPool, group_id: Uuid, task_id: Uuid) -> AppResult<bool> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT 1::BIGINT FROM tasks WHERE id = $1 AND group_id = $2")
            .bind(task_id)
            .bind(group_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.is_some())
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

type TaskRow = (
    Uuid,
    Uuid,
    String,
    String,
    String,
    Option<NaiveDate>,
    bool,
    Option<DateTime<Utc>>,
    Option<Uuid>,
    Option<String>,
    Option<Uuid>,
    Option<String>,
    Uuid,
    String,
    DateTime<Utc>,
    DateTime<Utc>,
);

const TASK_SELECT: &str = "\
    SELECT t.id, t.group_id, t.title, t.description, t.priority, t.due_date, \
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
        id: row.0,
        group_id: row.1,
        title: row.2,
        description: row.3,
        priority: row.4,
        due_date: row.5,
        is_done: row.6,
        done_at: row.7,
        done_by: row.8,
        done_by_display_name: row.9,
        assigned_to: row.10,
        assigned_to_display_name: row.11,
        created_by: row.12,
        created_by_display_name: row.13,
        created_at: row.14,
        updated_at: row.15,
    }
}

async fn fetch_tasks(pool: &PgPool, group_id: Uuid) -> AppResult<Vec<Task>> {
    // Open tasks first (sorted by due date asc with NULLs last, then
    // priority high->low, then newest first); done tasks last, most
    // recently completed first so the "Done" list feels recency-sorted.
    let sql = format!(
        "{TASK_SELECT} \
         WHERE t.group_id = $1 \
         ORDER BY t.is_done ASC, \
                  t.due_date ASC NULLS LAST, \
                  CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC, \
                  t.created_at DESC"
    );
    let rows: Vec<TaskRow> = sqlx::query_as(&sql).bind(group_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(row_into_task).collect())
}

async fn fetch_task(pool: &PgPool, id: Uuid) -> AppResult<Task> {
    let sql = format!("{TASK_SELECT} WHERE t.id = $1");
    let row: TaskRow = sqlx::query_as(&sql).bind(id).fetch_one(pool).await?;
    Ok(row_into_task(row))
}
