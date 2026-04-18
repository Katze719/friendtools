pub mod handlers;
pub mod info;
pub mod itinerary;
pub mod packing;
mod unfurl;

use axum::{
    routing::{get, post, put},
    Router,
};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/trips/...`.
pub fn routes() -> Router<AppState> {
    Router::new()
        // --- Link board -------------------------------------------------
        .route(
            "/links",
            get(handlers::list_links).post(handlers::create_link),
        )
        .route(
            "/links/:link_id",
            axum::routing::patch(handlers::update_link).delete(handlers::delete_link),
        )
        .route("/links/:link_id/refresh", post(handlers::refresh_link))
        .route("/links/:link_id/vote", put(handlers::vote_link))
        .route("/links/:link_id/folder", put(handlers::move_link))
        .route("/links/reorder", put(handlers::reorder_links))
        .route(
            "/folders",
            get(handlers::list_folders).post(handlers::create_folder),
        )
        .route(
            "/folders/:folder_id",
            axum::routing::patch(handlers::update_folder).delete(handlers::delete_folder),
        )
        // --- Trip metadata ---------------------------------------------
        .route("/info", get(info::get_info).put(info::update_info))
        // --- Packing list ----------------------------------------------
        .route("/packing", get(packing::list).post(packing::create))
        .route("/packing/reorder", put(packing::reorder))
        .route(
            "/packing/:item_id",
            axum::routing::patch(packing::update).delete(packing::delete),
        )
        .route("/packing/:item_id/toggle", post(packing::toggle))
        // --- Itinerary --------------------------------------------------
        .route("/itinerary", get(itinerary::list).post(itinerary::create))
        .route("/itinerary/reorder", put(itinerary::reorder))
        .route(
            "/itinerary/:item_id",
            axum::routing::patch(itinerary::update).delete(itinerary::delete),
        )
}
