mod db;
mod scanner;
mod sync;
mod thumbnailer;

use db::{CharacterRecord, Database, FolderRecord, MediaRecord};
use scanner::Scanner;
use sync::GooglePhotosSync;
use thumbnailer::Thumbnailer;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub db: Arc<Database>,
    pub thumbnailer: Arc<Thumbnailer>,
    pub scanner: Arc<Scanner>,
    pub sync_mgr: Arc<GooglePhotosSync>,
}

#[tauri::command]
fn get_default_scan_paths() -> Vec<String> {
    let mut paths = Vec::new();

    // 1. Scan user specific photo directories
    if let Some(pic_dir) = dirs::picture_dir() {
        paths.push(pic_dir.to_string_lossy().to_string());
    }
    if let Some(desktop) = dirs::desktop_dir() {
        paths.push(desktop.to_string_lossy().to_string());
    }
    if let Some(download) = dirs::download_dir() {
        paths.push(download.to_string_lossy().to_string());
    }

    // 2. Discover all mounted drives on Windows (C:\, D:\, E:\, etc.)
    for letter in b'C'..=b'Z' {
        let drive = format!("{}:\\\\", letter as char);
        let drive_path = std::path::Path::new(&drive);
        if drive_path.exists() {
            let photos_on_drive = drive_path.join("Photos");
            let images_on_drive = drive_path.join("Images");
            let pictures_on_drive = drive_path.join("Pictures");

            if photos_on_drive.exists() {
                paths.push(photos_on_drive.to_string_lossy().to_string());
            }
            if images_on_drive.exists() {
                paths.push(images_on_drive.to_string_lossy().to_string());
            }
            if pictures_on_drive.exists() {
                paths.push(pictures_on_drive.to_string_lossy().to_string());
            }

            if letter != b'C' {
                paths.push(drive);
            }
        }
    }

    paths.sort();
    paths.dedup();
    paths
}

#[tauri::command]
fn scan_directories(roots: Vec<String>, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let paths: Vec<PathBuf> = roots.into_iter().map(PathBuf::from).collect();
    state.scanner.scan_directories(paths, app);
    Ok(())
}

#[tauri::command]
fn get_folders(state: State<AppState>) -> Result<Vec<FolderRecord>, String> {
    state.db.get_all_folders().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_media(
    folder_id: Option<i64>,
    character_tag: Option<String>,
    state: State<AppState>,
) -> Result<Vec<MediaRecord>, String> {
    state
        .db
        .get_media_records(folder_id, character_tag.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_thumbnail(file_path: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let thumbnailer = Arc::clone(&state.thumbnailer);
    tokio::task::spawn_blocking(move || {
        thumbnailer.get_or_generate_thumbnail(&file_path)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_folder_sync(
    folder_id: i64,
    enabled: bool,
    state: State<AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.db.toggle_sync(folder_id, enabled).map_err(|e| e.to_string())?;
    if enabled {
        state.sync_mgr.start_folder_sync(folder_id, app);
    }
    Ok(())
}

#[tauri::command]
fn assign_character(
    file_path: String,
    character_name: String,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .db
        .set_character(&file_path, &character_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_characters(state: State<AppState>) -> Result<Vec<CharacterRecord>, String> {
    state.db.get_characters().map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_catalog(state: State<AppState>) -> Result<(), String> {
    state.db.clear_all().map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn hide_detector_toast(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("detector") {
        let _ = window.hide();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data_dir = dirs::data_local_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("RedCaso");
            let _ = std::fs::create_dir_all(&app_data_dir);

            let db_path = app_data_dir.join("catalog.db");
            let database = Arc::new(Database::new(db_path).expect("Failed to initialize database"));
            let thumbnailer = Arc::new(Thumbnailer::new(app_data_dir.clone()));

            // Launch background thumbnail worker paced at <5% CPU
            Arc::clone(&thumbnailer).start_background_worker(Arc::clone(&database));

            let scanner = Arc::new(Scanner::new(Arc::clone(&database), Arc::clone(&thumbnailer)));
            let sync_mgr = Arc::new(GooglePhotosSync::new(Arc::clone(&database)));

            app.manage(AppState {
                db: database,
                thumbnailer,
                scanner,
                sync_mgr,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_default_scan_paths,
            scan_directories,
            get_folders,
            get_media,
            get_thumbnail,
            toggle_folder_sync,
            assign_character,
            get_characters,
            clear_catalog,
            restore_main_window,
            hide_detector_toast
        ])
        .run(tauri::generate_context!())
        .expect("error while running RedCaso application");
}
