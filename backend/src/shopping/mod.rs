pub mod handlers;

use axum::{
    routing::{get, patch, post, put},
    Router,
};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/shopping/...`.
///
/// All item routes are list-scoped now. Groups get one or more shopping
/// lists; every item lives on exactly one list. `:list_id` appears between
/// the group segment and the item segment so permissions can be checked
/// per list without touching the item body.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/lists",
            get(handlers::list_group_lists).post(handlers::create_group_list),
        )
        .route(
            "/lists/:list_id",
            patch(handlers::rename_group_list).delete(handlers::delete_group_list),
        )
        .route(
            "/lists/:list_id/items",
            get(handlers::list_group_items).post(handlers::create_group_item),
        )
        .route(
            "/lists/:list_id/items/:item_id",
            patch(handlers::update_group_item).delete(handlers::delete_group_item),
        )
        .route(
            "/lists/:list_id/items/:item_id/toggle",
            put(handlers::toggle_group_item),
        )
        .route(
            "/lists/:list_id/items/clear-done",
            post(handlers::clear_group_done),
        )
}

/// Mounted under `/api/me/shopping/...`. Personal-scoped routes - lists
/// and items owned by the authenticated user, never shared with any
/// group.
pub fn personal_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/lists",
            get(handlers::list_personal_lists).post(handlers::create_personal_list),
        )
        .route(
            "/lists/:list_id",
            patch(handlers::rename_personal_list).delete(handlers::delete_personal_list),
        )
        .route(
            "/lists/:list_id/items",
            get(handlers::list_personal_items).post(handlers::create_personal_item),
        )
        .route(
            "/lists/:list_id/items/:item_id",
            patch(handlers::update_personal_item).delete(handlers::delete_personal_item),
        )
        .route(
            "/lists/:list_id/items/:item_id/toggle",
            put(handlers::toggle_personal_item),
        )
        .route(
            "/lists/:list_id/items/clear-done",
            post(handlers::clear_personal_done),
        )
}
