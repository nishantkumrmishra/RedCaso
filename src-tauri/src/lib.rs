mod db;
mod face_engine;
mod scanner;
mod sync;
mod thumbnailer;

use db::{CharacterRecord, Database, FaceGroupRecord, FaceRecord, FolderRecord, MediaRecord};
use face_engine::{FaceEngine, FaceScanProgressPayload};
use scanner::Scanner;
use sync::GooglePhotosSync;
use thumbnailer::Thumbnailer;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub db: Arc<Database>,
    pub thumbnailer: Arc<Thumbnailer>,
    pub scanner: Arc<Scanner>,
    pub sync_mgr: Arc<GooglePhotosSync>,
    pub face_engine: Arc<FaceEngine>,
    pub is_scanning: Arc<AtomicBool>,
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
fn scan_directories(
    roots: Vec<String>,
    state: State<AppState>,
    app: AppHandle,
) -> Result<(), String> {
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
async fn get_thumbnail(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let thumbnailer = Arc::clone(&state.thumbnailer);
    let db = Arc::clone(&state.db);
    let fp = file_path.clone();
    tokio::task::spawn_blocking(move || {
        if let Some(thumb) = thumbnailer.get_or_generate_thumbnail(&fp) {
            let _ = db.update_thumbnail_by_path(&fp, &thumb);
            Some(thumb)
        } else {
            None
        }
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
    state
        .db
        .toggle_sync(folder_id, enabled)
        .map_err(|e| e.to_string())?;
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

#[tauri::command]
fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let clean_path = file_path.replace('/', "\\");
        Command::new("explorer")
            .args(["/select,", &clean_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_folder_in_explorer(folder_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let clean_path = folder_path.replace('/', "\\");
        Command::new("explorer")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn rename_character(
    old_name: String,
    new_name: String,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .db
        .rename_character(&old_name, &new_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_character(character_name: String, state: State<AppState>) -> Result<(), String> {
    state
        .db
        .delete_character(&character_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_media(file_path: String, state: State<AppState>) -> Result<(), String> {
    state
        .db
        .delete_media_record(&file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn rotate_image(file_path: String, degrees: i32, state: State<AppState>) -> Result<(), String> {
    let p = std::path::Path::new(&file_path);
    if !p.exists() {
        return Err("File does not exist".into());
    }
    let img = image::open(p).map_err(|e| e.to_string())?;
    let rotated = match degrees {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 | -90 => img.rotate270(),
        _ => img,
    };
    rotated.save(p).map_err(|e| e.to_string())?;
    let _ = state.thumbnailer.get_or_generate_thumbnail(&file_path);
    Ok(())
}

// ================= FACE RECOGNITION COMMANDS =================

#[tauri::command]
fn get_unnamed_faces(
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<FaceRecord>, String> {
    let lim = limit.unwrap_or(300);
    state.db.get_unnamed_faces(lim).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_unnamed_face_groups(
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<FaceGroupRecord>, String> {
    let lim = limit.unwrap_or(200);
    state
        .db
        .get_unnamed_face_groups(lim)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn assign_face_name(face_id: i64, name: String, state: State<AppState>) -> Result<(), String> {
    state
        .db
        .assign_face_name(face_id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn assign_face_group_name(
    group_id: i64,
    name: String,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .db
        .assign_group_name(group_id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn ignore_face(face_id: i64, state: State<AppState>) -> Result<(), String> {
    state.db.ignore_face(face_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn ignore_face_group(group_id: i64, state: State<AppState>) -> Result<(), String> {
    state.db.ignore_group(group_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn separate_face_from_group(face_id: i64, state: State<AppState>) -> Result<(), String> {
    state
        .db
        .separate_face_from_group(face_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_face_scan_stats(state: State<AppState>) -> Result<FaceScanProgressPayload, String> {
    let (scanned, total, faces_found, groups_count) =
        state.db.get_face_scan_stats().map_err(|e| e.to_string())?;
    let percentage = if total > 0 {
        ((scanned as f64 / total as f64) * 100.0).round() as i32
    } else {
        100
    };
    Ok(FaceScanProgressPayload {
        scanned,
        total,
        faces_found,
        groups_count,
        percentage,
        is_complete: scanned >= total,
    })
}

#[tauri::command]
fn trigger_face_rescan(state: State<AppState>) -> Result<(), String> {
    state.face_engine.request_rescan();
    Ok(())
}

#[tauri::command]
fn get_face_engine_enabled(state: State<AppState>) -> Result<bool, String> {
    Ok(state.face_engine.is_enabled())
}

#[tauri::command]
fn set_face_engine_enabled(enabled: bool, state: State<AppState>) -> Result<(), String> {
    state.face_engine.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
fn get_faces_for_media(
    file_path: String,
    state: State<AppState>,
) -> Result<Vec<FaceRecord>, String> {
    state
        .db
        .get_faces_for_media(&file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_face_counts(
    state: State<AppState>,
) -> Result<std::collections::HashMap<String, i64>, String> {
    state.db.get_face_counts().map_err(|e| e.to_string())
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

            let is_scanning = Arc::new(AtomicBool::new(false));
            let db_path = app_data_dir.join("catalog.db");
            let database = Arc::new(Database::new(db_path).expect("Failed to initialize database"));
            let thumbnailer = Arc::new(Thumbnailer::new(app_data_dir.clone()));

            // Launch background thumbnail worker with is_scanning check
            Arc::clone(&thumbnailer)
                .start_background_worker(Arc::clone(&database), Arc::clone(&is_scanning));

            let face_engine = Arc::new(FaceEngine::new(
                app_data_dir.clone(),
                Arc::clone(&is_scanning),
            ));
            // Launch background face recognition worker (defaults to OFF, yielding during scans)
            Arc::clone(&face_engine)
                .start_background_worker(Arc::clone(&database), app.handle().clone());

            let scanner = Arc::new(Scanner::new(
                Arc::clone(&database),
                Arc::clone(&thumbnailer),
                Arc::clone(&is_scanning),
            ));
            let sync_mgr = Arc::new(GooglePhotosSync::new(Arc::clone(&database)));

            app.manage(AppState {
                db: database,
                thumbnailer,
                scanner,
                sync_mgr,
                face_engine,
                is_scanning,
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
            hide_detector_toast,
            get_unnamed_faces,
            get_unnamed_face_groups,
            assign_face_name,
            assign_face_group_name,
            ignore_face,
            ignore_face_group,
            separate_face_from_group,
            get_face_scan_stats,
            trigger_face_rescan,
            get_face_engine_enabled,
            set_face_engine_enabled,
            get_faces_for_media,
            get_face_counts,
            reveal_in_explorer,
            open_folder_in_explorer,
            rename_character,
            delete_character,
            delete_media,
            rotate_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running RedCaso application");
}
