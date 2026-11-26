use crate::db::{BatchMediaItem, Database};
use crate::thumbnailer::Thumbnailer;
use exif::{In, Reader, Tag};
use serde::Serialize;
use std::collections::HashSet;
use std::fs::File;
use std::path::{Path, PathBuf};
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
}

impl Scanner {
    pub fn new(db: Arc<Database>, thumbnailer: Arc<Thumbnailer>) -> Self {
        Self { db, thumbnailer }
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
        let thumbnailer = Arc::clone(&self.thumbnailer);

        std::thread::spawn(move || {
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

                                let mut batch_items = Vec::with_capacity(image_files.len());
                                for fpath in &image_files {
                                    let fname = fpath
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_else(|| "unknown".to_string());

                                    let fsize = std::fs::metadata(fpath)
                                        .map(|m| m.len() as i64)
                                        .unwrap_or(0);

                                    let fhash = Thumbnailer::compute_file_hash(fpath);
                                    let date_taken = Self::extract_exif_date(fpath);

                                    let (width, height) = match image::image_dimensions(fpath) {
                                        Ok((w, h)) => (Some(w as i32), Some(h as i32)),
                                        Err(_) => (None, None),
                                    };

                                    batch_items.push(BatchMediaItem {
                                        file_path: fpath.to_string_lossy().to_string(),
                                        file_name: fname,
                                        file_size: fsize,
                                        file_hash: fhash,
                                        date_taken,
                                        width,
                                        height,
                                    });
                                }

                                let _ = db.batch_upsert_media(folder_id, &batch_items);

                                let preview_image = &image_files[0];
                                let preview_path = thumbnailer
                                    .get_or_generate_thumbnail(&preview_image.to_string_lossy())
                                    .unwrap_or_else(|| preview_image.to_string_lossy().to_string());

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

                                std::thread::sleep(std::time::Duration::from_millis(85));
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

    fn extract_exif_date(path: &Path) -> Option<String> {
        if let Ok(file) = File::open(path) {
            let mut bufreader = std::io::BufReader::new(&file);
            if let Ok(exif) = Reader::new().read_from_container(&mut bufreader) {
                if let Some(field) = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
                    return Some(field.display_value().to_string());
                }
            }
        }
        None
    }
}
