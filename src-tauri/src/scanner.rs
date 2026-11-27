use crate::db::{BatchMediaItem, Database};
use crate::thumbnailer::Thumbnailer;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
pub struct ScanProgressPayload {
    pub status: String,
    pub current_folder: String,
    pub folders_found: usize,
    pub images_found: usize,
}

#[derive(Clone, Serialize)]
pub struct FolderScannedPayload {
    pub folder_id: i64,
    pub folder_name: String,
    pub folder_path: String,
    pub photo_count: i64,
    pub preview_image_path: String,
    pub preview_image_name: String,
    pub total_images: usize,
    pub total_folders: usize,
}

pub struct Scanner {
    db: Arc<Database>,
    thumbnailer: Arc<Thumbnailer>,
    is_scanning: Arc<AtomicBool>,
}

struct ScanGuard(Arc<AtomicBool>);
impl Drop for ScanGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn format_timestamp(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let hours = rem / 3600;
    let minutes = (rem % 3600) / 60;
    let seconds = rem % 60;

    // Civil day conversion algorithm (Howard Hinnant Euclidean affine)
    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1024 + doe / 1461 - doe / 142401) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        y, m, d, hours, minutes, seconds
    )
}

impl Scanner {
    pub fn new(
        db: Arc<Database>,
        thumbnailer: Arc<Thumbnailer>,
        is_scanning: Arc<AtomicBool>,
    ) -> Self {
        Self {
            db,
            thumbnailer,
            is_scanning,
        }
    }

    pub fn is_image_file(path: &Path) -> bool {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            matches!(
                ext_lower.as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "heic" | "avif"
            )
        } else {
            false
        }
    }

    pub fn scan_directories(&self, roots: Vec<PathBuf>, app_handle: AppHandle) {
        let db = Arc::clone(&self.db);
        let _thumbnailer = Arc::clone(&self.thumbnailer);
        let is_scanning = Arc::clone(&self.is_scanning);

        std::thread::spawn(move || {
            is_scanning.store(true, Ordering::SeqCst);
            let _guard = ScanGuard(Arc::clone(&is_scanning));

            let mut search_paths = roots;
            if search_paths.is_empty() {
                // Common user photo folders
                if let Some(pictures) = dirs::picture_dir() {
                    search_paths.push(pictures);
                }
                if let Some(downloads) = dirs::download_dir() {
                    search_paths.push(downloads);
                }
                if let Some(desktop) = dirs::desktop_dir() {
                    search_paths.push(desktop);
                }

                // Available drive roots on Windows
                for drive_letter in b'C'..=b'Z' {
                    let drive_str = format!("{}:\\", drive_letter as char);
                    let p = PathBuf::from(&drive_str);
                    if p.exists() {
                        search_paths.push(p);
                    }
                }
            }

            let mut processed_dirs: HashSet<PathBuf> = HashSet::new();
            let mut total_folders = 0;
            let mut total_images = 0;

            for root_path in search_paths {
                let walker = WalkDir::new(&root_path)
                    .follow_links(false)
                    .max_depth(7)
                    .into_iter()
                    .filter_entry(|e| {
                        let fname = e.file_name().to_string_lossy();
                        !fname.starts_with('.')
                            && !fname.starts_with('$')
                            && fname != "Windows"
                            && fname != "Program Files"
                            && fname != "Program Files (x86)"
                            && fname != "AppData"
                            && fname != "node_modules"
                            && fname != "target"
                            && fname != ".git"
                    });

                for entry in walker.filter_map(|e| e.ok()) {
                    if entry.file_type().is_dir() {
                        let dir_path = entry.path().to_path_buf();
                        if processed_dirs.contains(&dir_path) {
                            continue;
                        }
                        processed_dirs.insert(dir_path.clone());

                        if let Ok(entries) = std::fs::read_dir(&dir_path) {
                            let mut image_files: Vec<PathBuf> = Vec::new();
                            for file_entry in entries.filter_map(|e| e.ok()) {
                                let fpath = file_entry.path();
                                if fpath.is_file() && Self::is_image_file(&fpath) {
                                    image_files.push(fpath);
                                }
                            }

                            if !image_files.is_empty() {
                                total_folders += 1;
                                total_images += image_files.len();

                                let folder_name = dir_path
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_else(|| "Root".to_string());

                                let folder_id = match db.upsert_folder(
                                    &dir_path.to_string_lossy(),
                                    &folder_name,
                                    image_files.len() as i64,
                                ) {
                                    Ok(id) => id,
                                    Err(_) => continue,
                                };

                                // Picasa 3 Architecture: Metadata-only indexing!
                                // ZERO opening or decoding of original photo files during directory scans.
                                // Keeps disk I/O at <0.5 MB/s and prevents disk thrashing.
                                let mut batch_items = Vec::with_capacity(image_files.len());
                                for fpath in &image_files {
                                    let fname = fpath
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_else(|| "unknown".to_string());

                                    let (fsize, date_taken) = match std::fs::metadata(fpath) {
                                        Ok(m) => {
                                            let len = m.len() as i64;
                                            let dt = m.modified().ok().and_then(|t| {
                                                t.duration_since(std::time::UNIX_EPOCH)
                                                    .ok()
                                                    .map(|d| format_timestamp(d.as_secs()))
                                            });
                                            (len, dt)
                                        }
                                        Err(_) => (0, None),
                                    };

                                    let fhash = Thumbnailer::compute_file_hash(fpath);

                                    batch_items.push(BatchMediaItem {
                                        file_path: fpath.to_string_lossy().to_string(),
                                        file_name: fname,
                                        file_size: fsize,
                                        file_hash: fhash,
                                        date_taken,
                                        width: None,
                                        height: None,
                                    });
                                }

                                let _ = db.batch_upsert_media(folder_id, &batch_items);

                                let preview_image = &image_files[0];
                                let preview_path = preview_image.to_string_lossy().to_string();
                                let preview_name = preview_image
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default();

                                // Stream folder event immediately to the UI
                                let _ = app_handle.emit(
                                    "folder_scanned",
                                    FolderScannedPayload {
                                        folder_id,
                                        folder_name: folder_name.clone(),
                                        folder_path: dir_path.to_string_lossy().to_string(),
                                        photo_count: image_files.len() as i64,
                                        preview_image_path: preview_path,
                                        preview_image_name: preview_name,
                                        total_images,
                                        total_folders,
                                    },
                                );

                                // Pacing yield: 40ms sleep between folders keeps disk quiet and responsive
                                std::thread::sleep(std::time::Duration::from_millis(40));
                            }
                        }
                    }
                }
            }

            let _ = app_handle.emit(
                "scan_complete",
                ScanProgressPayload {
                    status: "complete".to_string(),
                    current_folder: "".to_string(),
                    folders_found: total_folders,
                    images_found: total_images,
                },
            );
        });
    }
}
