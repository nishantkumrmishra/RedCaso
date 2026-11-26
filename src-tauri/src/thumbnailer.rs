use crate::db::Database;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct Thumbnailer {
    cache_dir: PathBuf,
}

impl Thumbnailer {
    pub fn new(cache_dir: PathBuf) -> Self {
        let thumbs_dir = cache_dir.join("thumbs");
        let _ = fs::create_dir_all(&thumbs_dir);
        Thumbnailer {
            cache_dir: thumbs_dir,
        }
    }

    pub fn compute_file_hash(path: &Path) -> String {
        if let Ok(metadata) = fs::metadata(path) {
            let mut hasher = Sha256::new();
            hasher.update(path.to_string_lossy().as_bytes());
            hasher.update(metadata.len().to_le_bytes());
            if let Ok(modified) = metadata.modified() {
                if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                    hasher.update(dur.as_secs().to_le_bytes());
                }
            }
            format!("{:x}", hasher.finalize())
        } else {
            let mut hasher = Sha256::new();
            hasher.update(path.to_string_lossy().as_bytes());
            format!("{:x}", hasher.finalize())
        }
    }

    pub fn get_or_generate_thumbnail(&self, file_path_str: &str) -> Option<String> {
        let path = Path::new(file_path_str);
        if !path.exists() {
            return None;
        }

        let hash = Self::compute_file_hash(path);
        let cached_thumb = self.cache_dir.join(format!("{}.jpg", hash));

        // Fast path: cached thumbnail already exists on disk
        if cached_thumb.exists() {
            return Some(cached_thumb.to_string_lossy().to_string());
        }

        // Generate 256x256 thumbnail with fast scaling
        if let Ok(img) = image::open(path) {
            let thumb = img.thumbnail(256, 256);
            if thumb.save(&cached_thumb).is_ok() {
                return Some(cached_thumb.to_string_lossy().to_string());
            }
        }

        None
    }

    /// Background worker that paces thumbnail creation at <5% CPU
    pub fn start_background_worker(self: Arc<Self>, db: Arc<Database>) {
        std::thread::spawn(move || {
            loop {
                // Fetch next batch of unthumbnailed files
                let batch = match db.get_unthumbnailed_media(30) {
                    Ok(items) => items,
                    Err(_) => {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        continue;
                    }
                };

                if batch.is_empty() {
                    // Nothing to process, sleep before next check
                    std::thread::sleep(std::time::Duration::from_secs(4));
                    continue;
                }

                for (id, file_path) in batch {
                    if let Some(thumb_path) = self.get_or_generate_thumbnail(&file_path) {
                        let _ = db.update_thumbnail_path(id, &thumb_path);
                    } else {
                        // Mark as attempted so we don't spin on corrupted files
                        let _ = db.update_thumbnail_path(id, "none");
                    }
                    // Low priority pacing: 15ms sleep between images keeps CPU < 5%
                    std::thread::sleep(std::time::Duration::from_millis(15));
                }
            }
        });
    }
}
