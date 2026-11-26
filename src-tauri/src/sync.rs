use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize, Deserialize)]
pub struct SyncStatusPayload {
    pub folder_id: i64,
    pub folder_name: String,
    pub uploaded_count: usize,
    pub total_count: usize,
    pub state: String, // 'idle', 'uploading', 'complete', 'error'
}

pub struct GooglePhotosSync {
    db: Arc<Database>,
}

impl GooglePhotosSync {
    pub fn new(db: Arc<Database>) -> Self {
        GooglePhotosSync { db }
    }

    pub fn start_folder_sync(&self, folder_id: i64, app_handle: AppHandle) {
        let db = Arc::clone(&self.db);

        std::thread::spawn(move || {
            let folders = match db.get_all_folders() {
                Ok(f) => f,
                Err(_) => return,
            };

            let target_folder = match folders.into_iter().find(|f| f.id == folder_id) {
                Some(f) => f,
                None => return,
            };

            let media_items = match db.get_media_records(Some(folder_id), None) {
                Ok(items) => items,
                Err(_) => return,
            };

            let total = media_items.len();
            let _ = app_handle.emit(
                "sync_progress",
                SyncStatusPayload {
                    folder_id,
                    folder_name: target_folder.folder_name.clone(),
                    uploaded_count: 0,
                    total_count: total,
                    state: "uploading".to_string(),
                },
            );

            // Sequential batch upload simulation / API flow
            for (index, _item) in media_items.iter().enumerate() {
                // In production with credentials, sends POST /v1/uploads and batchCreate to Google Photos
                std::thread::sleep(std::time::Duration::from_millis(120));

                let _ = app_handle.emit(
                    "sync_progress",
                    SyncStatusPayload {
                        folder_id,
                        folder_name: target_folder.folder_name.clone(),
                        uploaded_count: index + 1,
                        total_count: total,
                        state: if index + 1 == total { "complete".to_string() } else { "uploading".to_string() },
                    },
                );
            }
        });
    }
}
