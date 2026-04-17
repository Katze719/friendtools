use std::collections::HashMap;

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
    groups::ensure_member,
    state::AppState,
};

// ---------- response models ----------

#[derive(Debug, Serialize)]
pub struct Balance {
    pub user_id: Uuid,
    pub display_name: String,
    pub balance_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct Settlement {
    pub from_user_id: Uuid,
    pub from_display_name: String,
    pub to_user_id: Uuid,
    pub to_display_name: String,
    pub amount_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct Summary {
    pub currency: String,
    pub balances: Vec<Balance>,
    pub settlements: Vec<Settlement>,
    pub my_balance_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct ExpenseSplit {
    pub user_id: Uuid,
    pub display_name: String,
    pub amount_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct Expense {
    pub id: Uuid,
    pub group_id: Uuid,
    pub paid_by: Uuid,
    pub paid_by_display_name: String,
    pub description: String,
    pub amount_cents: i64,
    pub happened_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub splits: Vec<ExpenseSplit>,
}

// ---------- request models ----------

#[derive(Debug, Deserialize)]
pub struct SplitInput {
    pub user_id: Uuid,
    pub amount_cents: i64,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateExpenseRequest {
    #[validate(length(min = 1, max = 200))]
    pub description: String,
    #[validate(range(min = 1))]
    pub amount_cents: i64,
    pub paid_by: Uuid,
    pub happened_at: Option<DateTime<Utc>>,
    pub splits: Vec<SplitInput>,
}

// ---------- helpers ----------

/// Greedy settlement: at each step, match the largest creditor with the
/// largest debtor until every balance is zero. Produces at most N-1
/// transactions and is good enough for small friend groups.
fn simplify_debts(balances: &[(Uuid, i64)]) -> Vec<(Uuid, Uuid, i64)> {
    let mut entries: Vec<(Uuid, i64)> = balances.iter().copied().filter(|(_, b)| *b != 0).collect();
    let mut out = Vec::new();
    loop {
        entries.retain(|(_, b)| *b != 0);
        if entries.is_empty() {
            break;
        }
        entries.sort_by_key(|(_, b)| *b);
        let (debtor_id, debtor_balance) = entries.first().copied().unwrap();
        let (creditor_id, creditor_balance) = entries.last().copied().unwrap();
        if debtor_balance >= 0 || creditor_balance <= 0 {
            break;
        }
        let amount = (-debtor_balance).min(creditor_balance);
        out.push((debtor_id, creditor_id, amount));
        if let Some(e) = entries.iter_mut().find(|(u, _)| *u == debtor_id) {
            e.1 += amount;
        }
        if let Some(e) = entries.iter_mut().find(|(u, _)| *u == creditor_id) {
            e.1 -= amount;
        }
    }
    out
}

// ---------- handlers ----------

pub async fn summary(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Summary>> {
    ensure_member(&state, group_id, user.id).await?;

    let group_currency: (String,) = sqlx::query_as("SELECT currency FROM groups WHERE id = $1")
        .bind(group_id)
        .fetch_one(&state.db)
        .await?;

    let members: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT u.id, u.display_name
         FROM group_members gm
         INNER JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1
         ORDER BY u.display_name",
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    let paid_rows: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT paid_by, COALESCE(SUM(amount_cents), 0)::BIGINT
         FROM expenses WHERE group_id = $1 GROUP BY paid_by",
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    let owed_rows: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT es.user_id, COALESCE(SUM(es.amount_cents), 0)::BIGINT
         FROM expense_splits es
         INNER JOIN expenses e ON e.id = es.expense_id
         WHERE e.group_id = $1
         GROUP BY es.user_id",
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    let mut paid: HashMap<Uuid, i64> = HashMap::new();
    for (u, v) in paid_rows {
        paid.insert(u, v);
    }
    let mut owed: HashMap<Uuid, i64> = HashMap::new();
    for (u, v) in owed_rows {
        owed.insert(u, v);
    }

    let balances: Vec<Balance> = members
        .iter()
        .map(|(id, display_name)| {
            let p = paid.get(id).copied().unwrap_or(0);
            let o = owed.get(id).copied().unwrap_or(0);
            Balance {
                user_id: *id,
                display_name: display_name.clone(),
                balance_cents: p - o,
            }
        })
        .collect();

    let my_balance_cents = balances
        .iter()
        .find(|b| b.user_id == user.id)
        .map(|b| b.balance_cents)
        .unwrap_or(0);

    let name_of: HashMap<Uuid, String> =
        members.iter().map(|(id, name)| (*id, name.clone())).collect();
    let pairs: Vec<(Uuid, i64)> = balances.iter().map(|b| (b.user_id, b.balance_cents)).collect();
    let settlements = simplify_debts(&pairs)
        .into_iter()
        .map(|(from, to, amount)| Settlement {
            from_user_id: from,
            from_display_name: name_of.get(&from).cloned().unwrap_or_default(),
            to_user_id: to,
            to_display_name: name_of.get(&to).cloned().unwrap_or_default(),
            amount_cents: amount,
        })
        .collect();

    Ok(Json(Summary {
        currency: group_currency.0,
        balances,
        settlements,
        my_balance_cents,
    }))
}

pub async fn list_expenses(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
) -> AppResult<Json<Vec<Expense>>> {
    ensure_member(&state, group_id, user.id).await?;

    let expense_rows: Vec<(Uuid, Uuid, String, i64, DateTime<Utc>, DateTime<Utc>, Uuid, String)> =
        sqlx::query_as(
            "SELECT e.id, e.group_id, e.description, e.amount_cents, e.happened_at, e.created_at,
                    e.paid_by, u.display_name
             FROM expenses e
             INNER JOIN users u ON u.id = e.paid_by
             WHERE e.group_id = $1
             ORDER BY e.happened_at DESC, e.created_at DESC",
        )
        .bind(group_id)
        .fetch_all(&state.db)
        .await?;

    let split_rows: Vec<(Uuid, Uuid, String, i64)> = sqlx::query_as(
        "SELECT es.expense_id, es.user_id, u.display_name, es.amount_cents
         FROM expense_splits es
         INNER JOIN users u ON u.id = es.user_id
         INNER JOIN expenses e ON e.id = es.expense_id
         WHERE e.group_id = $1",
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    let mut splits_by_expense: HashMap<Uuid, Vec<ExpenseSplit>> = HashMap::new();
    for (expense_id, user_id, display_name, amount_cents) in split_rows {
        splits_by_expense
            .entry(expense_id)
            .or_default()
            .push(ExpenseSplit {
                user_id,
                display_name,
                amount_cents,
            });
    }

    let out = expense_rows
        .into_iter()
        .map(
            |(id, group_id, description, amount_cents, happened_at, created_at, paid_by, paid_by_display_name)| {
                Expense {
                    id,
                    group_id,
                    paid_by,
                    paid_by_display_name,
                    description,
                    amount_cents,
                    happened_at,
                    created_at,
                    splits: splits_by_expense.remove(&id).unwrap_or_default(),
                }
            },
        )
        .collect();

    Ok(Json(out))
}

pub async fn create_expense(
    State(state): State<AppState>,
    user: AuthUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateExpenseRequest>,
) -> AppResult<Json<Expense>> {
    payload.validate()?;
    ensure_member(&state, group_id, user.id).await?;

    if payload.splits.is_empty() {
        return Err(AppError::BadRequest("splits must not be empty".into()));
    }
    let total: i64 = payload.splits.iter().map(|s| s.amount_cents).sum();
    if total != payload.amount_cents {
        return Err(AppError::BadRequest(
            "sum of splits must equal amount_cents".into(),
        ));
    }
    for s in &payload.splits {
        if s.amount_cents < 0 {
            return Err(AppError::BadRequest("split amounts must be >= 0".into()));
        }
    }

    let member_ids: Vec<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM group_members WHERE group_id = $1")
            .bind(group_id)
            .fetch_all(&state.db)
            .await?;
    let member_set: std::collections::HashSet<Uuid> =
        member_ids.into_iter().map(|(u,)| u).collect();
    if !member_set.contains(&payload.paid_by) {
        return Err(AppError::BadRequest("paid_by is not a member".into()));
    }
    for s in &payload.splits {
        if !member_set.contains(&s.user_id) {
            return Err(AppError::BadRequest("split user is not a member".into()));
        }
    }

    let happened_at = payload.happened_at.unwrap_or_else(Utc::now);

    let mut tx = state.db.begin().await?;
    let exp: (Uuid, Uuid, String, i64, DateTime<Utc>, DateTime<Utc>, Uuid) = sqlx::query_as(
        "INSERT INTO expenses (group_id, paid_by, description, amount_cents, happened_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, group_id, description, amount_cents, happened_at, created_at, paid_by",
    )
    .bind(group_id)
    .bind(payload.paid_by)
    .bind(payload.description.trim())
    .bind(payload.amount_cents)
    .bind(happened_at)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;

    for s in &payload.splits {
        sqlx::query(
            "INSERT INTO expense_splits (expense_id, user_id, amount_cents)
             VALUES ($1, $2, $3)",
        )
        .bind(exp.0)
        .bind(s.user_id)
        .bind(s.amount_cents)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let paid_by_name: (String,) = sqlx::query_as("SELECT display_name FROM users WHERE id = $1")
        .bind(exp.6)
        .fetch_one(&state.db)
        .await?;

    let split_rows: Vec<(Uuid, String, i64)> = sqlx::query_as(
        "SELECT es.user_id, u.display_name, es.amount_cents
         FROM expense_splits es INNER JOIN users u ON u.id = es.user_id
         WHERE es.expense_id = $1",
    )
    .bind(exp.0)
    .fetch_all(&state.db)
    .await?;

    let splits = split_rows
        .into_iter()
        .map(|(user_id, display_name, amount_cents)| ExpenseSplit {
            user_id,
            display_name,
            amount_cents,
        })
        .collect();

    Ok(Json(Expense {
        id: exp.0,
        group_id: exp.1,
        paid_by: exp.6,
        paid_by_display_name: paid_by_name.0,
        description: exp.2,
        amount_cents: exp.3,
        happened_at: exp.4,
        created_at: exp.5,
        splits,
    }))
}

pub async fn delete_expense(
    State(state): State<AppState>,
    user: AuthUser,
    Path((group_id, expense_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    ensure_member(&state, group_id, user.id).await?;

    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT created_by FROM expenses WHERE id = $1 AND group_id = $2",
    )
    .bind(expense_id)
    .bind(group_id)
    .fetch_optional(&state.db)
    .await?;

    let Some((created_by,)) = row else {
        return Err(AppError::NotFound("expense not found".into()));
    };
    if created_by != user.id && !user.is_admin {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM expenses WHERE id = $1")
        .bind(expense_id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
