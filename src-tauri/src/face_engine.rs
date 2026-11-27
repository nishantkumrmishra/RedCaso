use crate::db::Database;
use image::imageops::FilterType;
use rustface::ImageData;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FaceScanProgressPayload {
    pub scanned: i64,
    pub total: i64,
    pub faces_found: i64,
    pub groups_count: i64,
    pub percentage: i32,
    pub is_complete: bool,
}

pub struct FaceEngine {
    cache_dir: PathBuf,
    is_rescan_requested: Arc<AtomicBool>,
    is_enabled: Arc<AtomicBool>,
    is_scanning: Arc<AtomicBool>,
}

struct ClusterCentroid {
    group_id: i64,
    centroid: [f32; 128],
    count: usize,
}

impl FaceEngine {
    pub fn new(cache_dir: PathBuf, is_scanning: Arc<AtomicBool>) -> Self {
        let faces_dir = cache_dir.join("faces");
        let _ = fs::create_dir_all(&faces_dir);
        FaceEngine {
            cache_dir: faces_dir,
            is_rescan_requested: Arc::new(AtomicBool::new(false)),
            is_enabled: Arc::new(AtomicBool::new(false)), // Default OFF: Zero CPU and 0 MB/s disk until user toggles on
            is_scanning,
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.is_enabled.store(enabled, Ordering::SeqCst);
    }

    pub fn is_enabled(&self) -> bool {
        self.is_enabled.load(Ordering::SeqCst)
    }

    pub fn request_rescan(&self) {
        self.is_enabled.store(true, Ordering::SeqCst);
        self.is_rescan_requested.store(true, Ordering::SeqCst);
    }

    /// Background worker that scans photos for human faces at ultra low resource footprint
    pub fn start_background_worker(self: Arc<Self>, db: Arc<Database>, app: AppHandle) {
        std::thread::spawn(move || {
            let model_bytes = include_bytes!("../models/seeta_fd_frontal_v1.0.bin");
            let model = match rustface::read_model(std::io::Cursor::new(model_bytes)) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("Failed to load embedded SeetaFace model: {}", e);
                    return;
                }
            };

            let mut detector = rustface::create_detector_with_model(model);
            detector.set_min_face_size(20);
            detector.set_score_thresh(2.0);
            detector.set_pyramid_scale_factor(0.8);
            detector.set_slide_window_step(4, 4);

            let mut active_clusters: Vec<ClusterCentroid> = Vec::new();
            let mut next_group_id: i64 = 1;

            loop {
                // 1. If face recognition is toggled off, sleep and consume 0% CPU & 0 MB/s disk
                if !self.is_enabled.load(Ordering::SeqCst) {
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                    continue;
                }

                // 2. Concurrency Lock: NEVER run face engine while directory scanner is running
                if self.is_scanning.load(Ordering::SeqCst) {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    continue;
                }

                // Check if user requested a full rescan
                if self.is_rescan_requested.swap(false, Ordering::SeqCst) {
                    let _ = db.reset_face_scans();
                    active_clusters.clear();
                    next_group_id = 1;

                    let (scanned, total, faces_found, groups_count) =
                        db.get_face_scan_stats().unwrap_or((0, 0, 0, 0));
                    let _ = app.emit(
                        "face_scan_progress",
                        FaceScanProgressPayload {
                            scanned,
                            total,
                            faces_found,
                            groups_count,
                            percentage: 0,
                            is_complete: false,
                        },
                    );
                }

                // Fetch batch of unscanned media files that already have cached thumbnails
                let batch = match db.get_unscanned_media(10) {
                    Ok(items) => items,
                    Err(_) => {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        continue;
                    }
                };

                if batch.is_empty() {
                    // Nothing to scan, emit completion and sleep
                    if let Ok((scanned, total, faces_found, groups_count)) =
                        db.get_face_scan_stats()
                    {
                        let pct = if total > 0 {
                            ((scanned as f64 / total as f64) * 100.0).round() as i32
                        } else {
                            100
                        };
                        let _ = app.emit(
                            "face_scan_progress",
                            FaceScanProgressPayload {
                                scanned,
                                total,
                                faces_found,
                                groups_count,
                                percentage: pct,
                                is_complete: true,
                            },
                        );
                    }
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    continue;
                }

                let mut scanned_ids = Vec::with_capacity(batch.len());

                for (media_id, file_path, thumb_path) in batch {
                    if !self.is_enabled.load(Ordering::SeqCst)
                        || self.is_scanning.load(Ordering::SeqCst)
                        || self.is_rescan_requested.load(Ordering::SeqCst)
                    {
                        break;
                    }

                    Self::process_photo(
                        &mut *detector,
                        media_id,
                        &file_path,
                        thumb_path.as_deref(),
                        &self.cache_dir,
                        &db,
                        &mut active_clusters,
                        &mut next_group_id,
                    );

                    scanned_ids.push(media_id);

                    // Gentle duty-cycle pacing: 60ms sleep prevents HDD churn
                    std::thread::sleep(std::time::Duration::from_millis(60));
                }

                let _ = db.mark_media_batch_face_scanned(&scanned_ids);

                // Emit progress update after batch
                if let Ok((scanned, total, faces_found, groups_count)) = db.get_face_scan_stats() {
                    let pct = if total > 0 {
                        ((scanned as f64 / total as f64) * 100.0).round() as i32
                    } else {
                        100
                    };
                    let _ = app.emit(
                        "face_scan_progress",
                        FaceScanProgressPayload {
                            scanned,
                            total,
                            faces_found,
                            groups_count,
                            percentage: pct,
                            is_complete: scanned >= total,
                        },
                    );
                }

                // Duty-cycle rest: 2-second quiet period between micro-batches
                std::thread::sleep(std::time::Duration::from_millis(2000));
            }
        });
    }

    /// Fast thumbnail-only face detection and identity clustering.
    /// Strictly NEVER opens full 20MB original images from disk!
    fn process_photo(
        detector: &mut dyn rustface::Detector,
        media_id: i64,
        file_path: &str,
        thumb_path: Option<&str>,
        faces_dir: &Path,
        db: &Database,
        clusters: &mut Vec<ClusterCentroid>,
        next_group_id: &mut i64,
    ) {
        // SAFETY: Only read from existing 256x256 thumbnail cache (<15KB)
        let detect_img = match thumb_path {
            Some(tp) => {
                let tp_path = Path::new(tp);
                if tp_path.exists() {
                    match image::open(tp_path) {
                        Ok(img) => img,
                        Err(_) => return,
                    }
                } else {
                    return; // Wait until thumbnail is generated
                }
            }
            None => return, // Wait until thumbnail is generated
        };

        let (dw, dh) = (detect_img.width(), detect_img.height());
        if dw == 0 || dh == 0 {
            return;
        }

        // Grayscale conversion for SeetaFace
        let gray = detect_img.to_luma8();
        let image_data = ImageData::new(gray.as_raw(), gray.width(), gray.height());

        let faces = detector.detect(&image_data);
        if faces.is_empty() {
            // No faces found - zero further overhead
            return;
        }

        for (idx, face) in faces.into_iter().enumerate() {
            if face.score() < 2.0 {
                continue;
            }

            let bbox = face.bbox();
            let bx = bbox.x();
            let by = bbox.y();
            let bw = bbox.width();
            let bh = bbox.height();

            if bw <= 12 || bh <= 12 {
                continue;
            }

            // Expand bounding box with 25% padding for Picasa portrait avatar framing
            let pad_x = (bw as f32 * 0.25) as i32;
            let pad_y = (bh as f32 * 0.25) as i32;

            let crop_x = (bx - pad_x).max(0) as u32;
            let crop_y = (by - pad_y).max(0) as u32;
            let crop_w = ((bw as i32 + pad_x * 2).max(1) as u32)
                .min(dw.saturating_sub(crop_x))
                .max(1);
            let crop_h = ((bh as i32 + pad_y * 2).max(1) as u32)
                .min(dh.saturating_sub(crop_y))
                .max(1);

            let face_crop = detect_img.crop_imm(crop_x, crop_y, crop_w, crop_h);
            let face_avatar = face_crop.resize_exact(160, 160, FilterType::Triangle);

            // 1. Extract 128-D spatial/chroma/gradient face feature vector
            let rgb_avatar = face_avatar.to_rgb8();
            let embedding = Self::extract_face_embedding(&rgb_avatar);

            // 2. Dynamic clustering: match person cluster with Cosine Similarity >= 0.76
            let mut best_sim = -1.0f32;
            let mut matched_group_id: Option<i64> = None;
            let mut matched_cluster_idx: Option<usize> = None;

            for (c_idx, c) in clusters.iter().enumerate() {
                let sim = Self::cosine_similarity(&embedding, &c.centroid);
                if sim > best_sim {
                    best_sim = sim;
                    if sim >= 0.76 {
                        matched_group_id = Some(c.group_id);
                        matched_cluster_idx = Some(c_idx);
                    }
                }
            }

            let group_id = if let Some(gid) = matched_group_id {
                if let Some(c_idx) = matched_cluster_idx {
                    let c = &mut clusters[c_idx];
                    let n = (c.count as f32).min(6.0);
                    for k in 0..128 {
                        c.centroid[k] = (c.centroid[k] * n + embedding[k]) / (n + 1.0);
                    }
                    c.count += 1;
                    let mean: f32 = c.centroid.iter().sum::<f32>() / 128.0;
                    for v in c.centroid.iter_mut() {
                        *v -= mean;
                    }
                    let norm_sq: f32 = c.centroid.iter().map(|v| v * v).sum();
                    if norm_sq > 1e-6 {
                        let norm = norm_sq.sqrt();
                        for v in c.centroid.iter_mut() {
                            *v /= norm;
                        }
                    }
                }
                gid
            } else {
                let new_id = *next_group_id;
                *next_group_id += 1;
                clusters.push(ClusterCentroid {
                    group_id: new_id,
                    centroid: embedding,
                    count: 1,
                });
                new_id
            };

            // 3. Save 160x160 avatar thumbnail to disk (~6KB)
            let crop_file_name = format!("face_{}_{}.jpg", media_id, idx);
            let crop_full_path = faces_dir.join(&crop_file_name);

            if face_avatar.save(&crop_full_path).is_ok() {
                let _ = db.insert_face_with_group(
                    media_id,
                    file_path,
                    &crop_full_path.to_string_lossy(),
                    bx, by, bw as i32, bh as i32,
                    group_id,
                );
            }
        }
    }

    /// Extract a discriminative zero-centered 128-D spatial facial gradient & contrast vector
    fn extract_face_embedding(img: &image::RgbImage) -> [f32; 128] {
        let mut vec = [0.0f32; 128];
        let (w, h) = img.dimensions();
        if w < 16 || h < 16 {
            return vec;
        }

        // 1. Calculate global face statistics for zero-centering (removes lighting bias)
        let mut global_luma_sum = 0.0f32;
        let mut global_r_sum = 0.0f32;
        let mut global_g_sum = 0.0f32;
        let mut global_b_sum = 0.0f32;
        let total_pixels = (w * h) as f32;

        for pixel in img.pixels() {
            let r = pixel[0] as f32 / 255.0;
            let g = pixel[1] as f32 / 255.0;
            let b = pixel[2] as f32 / 255.0;
            let luma = 0.299 * r + 0.587 * g + 0.114 * b;
            global_luma_sum += luma;
            global_r_sum += r;
            global_g_sum += g;
            global_b_sum += b;
        }

        let global_mean_luma = global_luma_sum / total_pixels;
        let global_mean_rg = (global_r_sum - global_g_sum) / total_pixels;
        let global_mean_rb = (global_r_sum - global_b_sum) / total_pixels;

        // 2. 4x4 spatial grid = 16 cells, 8 features per cell = 128 features
        let cell_w = w / 4;
        let cell_h = h / 4;
        let mut feat_idx = 0;

        for cy in 0..4 {
            for cx in 0..4 {
                let start_x = cx * cell_w;
                let start_y = cy * cell_h;
                let mut sum_luma_diff = 0.0f32;
                let mut sum_luma_sq = 0.0f32;
                let mut sum_grad_x = 0.0f32;
                let mut sum_grad_y = 0.0f32;
                let mut sum_grad_mag = 0.0f32;
                let mut sum_rg_diff = 0.0f32;
                let mut sum_rb_diff = 0.0f32;
                let mut count = 0.0f32;

                let end_x = (start_x + cell_w).min(w - 1);
                let end_y = (start_y + cell_h).min(h - 1);

                for y in (start_y.max(1))..end_y {
                    for x in (start_x.max(1))..end_x {
                        let p = img.get_pixel(x, y);
                        let r = p[0] as f32 / 255.0;
                        let g = p[1] as f32 / 255.0;
                        let b = p[2] as f32 / 255.0;
                        let luma = 0.299 * r + 0.587 * g + 0.114 * b;

                        let luma_diff = luma - global_mean_luma;
                        sum_luma_diff += luma_diff;
                        sum_luma_sq += luma_diff * luma_diff;

                        let p_left = img.get_pixel(x - 1, y);
                        let p_right = img.get_pixel(x + 1, y);
                        let p_up = img.get_pixel(x, y - 1);
                        let p_down = img.get_pixel(x, y + 1);

                        let luma_left = 0.299 * (p_left[0] as f32)
                            + 0.587 * (p_left[1] as f32)
                            + 0.114 * (p_left[2] as f32);
                        let luma_right = 0.299 * (p_right[0] as f32)
                            + 0.587 * (p_right[1] as f32)
                            + 0.114 * (p_right[2] as f32);
                        let luma_up = 0.299 * (p_up[0] as f32)
                            + 0.587 * (p_up[1] as f32)
                            + 0.114 * (p_up[2] as f32);
                        let luma_down = 0.299 * (p_down[0] as f32)
                            + 0.587 * (p_down[1] as f32)
                            + 0.114 * (p_down[2] as f32);

                        let gx = (luma_right - luma_left) / 255.0;
                        let gy = (luma_down - luma_up) / 255.0;
                        let gmag = (gx * gx + gy * gy).sqrt();

                        sum_grad_x += gx;
                        sum_grad_y += gy;
                        sum_grad_mag += gmag;

                        sum_rg_diff += (r - g) - global_mean_rg;
                        sum_rb_diff += (r - b) - global_mean_rb;

                        count += 1.0;
                    }
                }

                if count > 0.0 {
                    let mean_luma_diff = sum_luma_diff / count;
                    let var_luma = (sum_luma_sq / count - mean_luma_diff * mean_luma_diff)
                        .max(0.0)
                        .sqrt();
                    let mean_gx = sum_grad_x / count;
                    let mean_gy = sum_grad_y / count;
                    let mean_gmag = sum_grad_mag / count;
                    let mean_rg = sum_rg_diff / count;
                    let mean_rb = sum_rb_diff / count;

                    vec[feat_idx] = mean_luma_diff;
                    vec[feat_idx + 1] = var_luma;
                    vec[feat_idx + 2] = mean_gx;
                    vec[feat_idx + 3] = mean_gy;
                    vec[feat_idx + 4] = mean_gmag;
                    vec[feat_idx + 5] = mean_rg;
                    vec[feat_idx + 6] = mean_rb;
                    vec[feat_idx + 7] = mean_luma_diff * var_luma;
                }

                feat_idx += 8;
            }
        }

        // 3. Subtract vector mean to guarantee zero-centered spherical embedding
        let vec_mean: f32 = vec.iter().sum::<f32>() / 128.0;
        for v in vec.iter_mut() {
            *v -= vec_mean;
        }

        // 4. L2 Unit Normalization for true Cosine Similarity via dot product
        let norm_sq: f32 = vec.iter().map(|v| v * v).sum();
        if norm_sq > 1e-6 {
            let norm = norm_sq.sqrt();
            for v in vec.iter_mut() {
                *v /= norm;
            }
        }

        vec
    }

    #[inline]
    fn cosine_similarity(a: &[f32; 128], b: &[f32; 128]) -> f32 {
        let mut dot = 0.0f32;
        for i in 0..128 {
            dot += a[i] * b[i];
        }
        dot
    }
}

