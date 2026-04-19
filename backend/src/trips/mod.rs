pub mod handlers;
pub mod itinerary;
pub mod packing;
pub mod trip;
mod unfurl;

use axum::{
    routing::{get, post, put},
    Router,
};

use crate::state::AppState;

/// Mounted under `/api/groups/:id/trips/...`.
///
/// Trip CRUD lives at the root of this nested router; every child resource
/// (links, folders, itinerary, packing) is keyed by `:trip_id` so multiple
/// trips per group are fully isolated.
pub fn routes() -> Router<AppState> {
    Router::new()
        // --- Trip collection ------------------------------------------
        .route("/", get(trip::list).post(trip::create))
        .route(
            "/:trip_id",
            get(trip::get)
                .patch(trip::update)
                .delete(trip::delete),
        )
        // --- Link board -----------------------------------------------
        .route(
            "/:trip_id/links",
            get(handlers::list_links).post(handlers::create_link),
        )
        .route(
            "/:trip_id/links/reorder",
            put(handlers::reorder_links),
        )
        .route(
            "/:trip_id/links/:link_id",
            axum::routing::patch(handlers::update_link).delete(handlers::delete_link),
        )
        .route(
            "/:trip_id/links/:link_id/refresh",
            post(handlers::refresh_link),
        )
        .route(
            "/:trip_id/links/:link_id/vote",
            put(handlers::vote_link),
        )
        .route(
            "/:trip_id/links/:link_id/folder",
            put(handlers::move_link),
        )
        .route(
            "/:trip_id/folders",
            get(handlers::list_folders).post(handlers::create_folder),
        )
        .route(
            "/:trip_id/folders/:folder_id",
            axum::routing::patch(handlers::update_folder).delete(handlers::delete_folder),
        )
        // --- Packing list ---------------------------------------------
        .route(
            "/:trip_id/packing",
            get(packing::list).post(packing::create),
        )
        .route(
            "/:trip_id/packing/reorder",
            put(packing::reorder),
        )
        .route(
            "/:trip_id/packing/:item_id",
            axum::routing::patch(packing::update).delete(packing::delete),
        )
        .route(
            "/:trip_id/packing/:item_id/toggle",
            post(packing::toggle),
        )
        // --- Itinerary -------------------------------------------------
        .route(
            "/:trip_id/itinerary",
            get(itinerary::list).post(itinerary::create),
        )
        .route(
            "/:trip_id/itinerary/reorder",
            put(itinerary::reorder),
        )
        .route(
            "/:trip_id/itinerary/:item_id",
            axum::routing::patch(itinerary::update).delete(itinerary::delete),
        )
}
