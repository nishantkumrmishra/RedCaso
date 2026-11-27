use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderRecord {
    pub id: i64,
    pub folder_path: String,
    pub folder_name: String,
    pub photo_count: i64,
    pub sync_enabled: bool,
    pub google_album_id: Option<String>,
    pub last_scanned_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaRecord {
    pub id: i64,
    pub folder_id: i64,
    pub file_path: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_hash: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub date_taken: Option<String>,
    pub thumbnail_path: Option<String>,
    pub sync_status: String,
    pub character_tag: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CharacterRecord {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FaceRecord {
    pub id: i64,
    pub media_id: i64,
    pub file_path: String,
    pub crop_path: String,
    pub box_x: i32,
    pub box_y: i32,
    pub box_w: i32,
    pub box_h: i32,
    pub person_name: Option<String>,
    pub group_id: i64,
    pub is_ignored: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FaceGroupRecord {
    pub group_id: i64,
    pub representative_face_id: i64,
    pub representative_crop_path: String,
    pub representative_file_path: String,
    pub face_count: i64,
    pub person_name: Option<String>,
    pub faces: Vec<FaceRecord>,
}

#[derive(Debug, Clone)]
pub struct BatchMediaItem {
    pub file_path: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_hash: String,
    pub date_taken: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

pub struct Database {
    db_path: PathBuf,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let db = Self { db_path };
        db.init_schema()?;
        Ok(db)
    }

    fn get_conn(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(15))?;
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "synchronous", "NORMAL");
        Ok(conn)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;

             CREATE TABLE IF NOT EXISTS folders (\n                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  folder_path TEXT UNIQUE NOT NULL,
                  folder_name TEXT NOT NULL,
                  photo_count INTEGER DEFAULT 0,
                  sync_enabled BOOLEAN DEFAULT 0,
                  google_album_id TEXT,
                  last_scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             );

             CREATE TABLE IF NOT EXISTS media_files (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                  file_path TEXT UNIQUE NOT NULL,
                  file_name TEXT NOT NULL,
                  file_size INTEGER NOT NULL,
                  file_hash TEXT NOT NULL,
                  width INTEGER,
                  height INTEGER,
                  date_taken TEXT,
                  thumbnail_path TEXT,
                  sync_status TEXT DEFAULT 'local',
                  character_tag TEXT,
                  face_scanned BOOLEAN DEFAULT 0,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             );

             CREATE TABLE IF NOT EXISTS faces (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  media_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
                  file_path TEXT NOT NULL,
                  crop_path TEXT NOT NULL,
                  box_x INTEGER NOT NULL,
                  box_y INTEGER NOT NULL,
                  box_w INTEGER NOT NULL,
                  box_h INTEGER NOT NULL,
                  person_name TEXT,
                  group_id INTEGER DEFAULT 0,
                  is_ignored BOOLEAN DEFAULT 0,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             );
             ",
        )?;

        // Ensure columns exist on older databases before creating indexes
        let _ = conn.execute(
            "ALTER TABLE media_files ADD COLUMN face_scanned BOOLEAN DEFAULT 0;",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE faces ADD COLUMN group_id INTEGER DEFAULT 0;",
            [],
        );

        // Create indexes safely after ensuring all columns exist
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_media_folder ON media_files(folder_id);
             CREATE INDEX IF NOT EXISTS idx_media_character ON media_files(character_tag);
             CREATE INDEX IF NOT EXISTS idx_media_hash ON media_files(file_hash);
             CREATE INDEX IF NOT EXISTS idx_media_face_scanned ON media_files(face_scanned);
             CREATE INDEX IF NOT EXISTS idx_media_file_path ON media_files(file_path);
             CREATE INDEX IF NOT EXISTS idx_faces_media ON faces(media_id);
             CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_name);
             CREATE INDEX IF NOT EXISTS idx_faces_group ON faces(group_id);
            ",
        )?;

        Ok(())
    }

    pub fn clear_all_data(&self) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute_batch(
            "DELETE FROM faces;
             DELETE FROM media_files;
             DELETE FROM folders;
             VACUUM;
            ",
        )?;
        Ok(())
    }

    pub fn clear_all(&self) -> Result<()> {
        self.clear_all_data()
    }

    pub fn upsert_folder(&self, path: &str, name: &str, count: i64) -> Result<i64> {
        let conn = self.get_conn()?;
        conn.execute(
            "INSERT INTO folders (folder_path, folder_name, photo_count, last_scanned_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
             ON CONFLICT(folder_path) DO UPDATE SET
                 folder_name = excluded.folder_name,
                 photo_count = excluded.photo_count,
                 last_scanned_at = CURRENT_TIMESTAMP",
            params![path, name, count],
        )?;

        let id = conn.query_row(
            "SELECT id FROM folders WHERE folder_path = ?1",
            params![path],
            |row| row.get(0),
        )?;
        Ok(id)
    }

    pub fn insert_media_batch(&self, folder_id: i64, items: &[BatchMediaItem]) -> Result<()> {
        let mut conn = self.get_conn()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR IGNORE INTO media_files
                 (folder_id, file_path, file_name, file_size, file_hash, width, height, date_taken)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;

            for item in items {
                stmt.execute(params![
                    folder_id,
                    item.file_path,
                    item.file_name,
                    item.file_size,
                    item.file_hash,
                    item.width,
                    item.height,
                    item.date_taken
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn batch_upsert_media(&self, folder_id: i64, items: &[BatchMediaItem]) -> Result<()> {
        self.insert_media_batch(folder_id, items)
    }

    pub fn get_all_folders(&self) -> Result<Vec<FolderRecord>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, folder_path, folder_name, photo_count, sync_enabled, google_album_id, last_scanned_at
             FROM folders
             ORDER BY folder_name ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(FolderRecord {
                id: row.get(0)?,
                folder_path: row.get(1)?,
                folder_name: row.get(2)?,
                photo_count: row.get(3)?,
                sync_enabled: row.get(4)?,
                google_album_id: row.get(5)?,
                last_scanned_at: row.get(6)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn rename_character(&self, old_name: &str, new_name: &str) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE media_files SET character_tag = ?1 WHERE character_tag = ?2",
            params![new_name, old_name],
        )?;
        let _ = conn.execute(
            "UPDATE faces SET person_name = ?1 WHERE person_name = ?2",
            params![new_name, old_name],
        );
        Ok(())
    }

    pub fn delete_character(&self, name: &str) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE media_files SET character_tag = NULL WHERE character_tag = ?1",
            params![name],
        )?;
        let _ = conn.execute(
            "UPDATE faces SET person_name = NULL WHERE person_name = ?1",
            params![name],
        );
        Ok(())
    }

    pub fn delete_media_record(&self, file_path: &str) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "DELETE FROM media_files WHERE file_path = ?1",
            params![file_path],
        )?;
        let _ = conn.execute("DELETE FROM faces WHERE file_path = ?1", params![file_path]);
        Ok(())
    }

    pub fn get_media_records(
        &self,
        folder_id: Option<i64>,
        character_tag: Option<&str>,
    ) -> Result<Vec<MediaRecord>> {
        let conn = self.get_conn()?;

        let mut sql = String::from(
            "SELECT id, folder_id, file_path, file_name, file_size, file_hash, width, height, date_taken, thumbnail_path, sync_status, character_tag
             FROM media_files WHERE 1=1"
        );

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(fid) = folder_id {
            sql.push_str(" AND folder_id = ?");
            params_vec.push(Box::new(fid));
        }

        if let Some(tag) = character_tag {
            sql.push_str(" AND character_tag = ?");
            params_vec.push(Box::new(tag.to_string()));
        }

        sql.push_str(" ORDER BY date_taken DESC, file_name ASC");

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let rows = stmt.query_map(&param_refs[..], |row| {
            Ok(MediaRecord {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                file_path: row.get(2)?,
                file_name: row.get(3)?,
                file_size: row.get(4)?,
                file_hash: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
                date_taken: row.get(8)?,
                thumbnail_path: row.get(9)?,
                sync_status: row.get(10)?,
                character_tag: row.get(11)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn set_folder_sync(&self, folder_id: i64, enabled: bool) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE folders SET sync_enabled = ?1 WHERE id = ?2",
            params![enabled, folder_id],
        )?;
        Ok(())
    }

    pub fn toggle_sync(&self, folder_id: i64, enabled: bool) -> Result<()> {
        self.set_folder_sync(folder_id, enabled)
    }

    pub fn update_character_tag(&self, media_id: i64, tag: Option<&str>) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE media_files SET character_tag = ?1 WHERE id = ?2",
            params![tag, media_id],
        )?;
        Ok(())
    }

    pub fn set_character(&self, file_path: &str, character_name: &str) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE media_files SET character_tag = ?1 WHERE file_path = ?2",
            params![character_name, file_path],
        )?;
        // Also update any face crops for this file
        let _ = conn.execute(
            "UPDATE faces SET person_name = ?1 WHERE file_path = ?2",
            params![character_name, file_path],
        );
        Ok(())
    }

    pub fn get_characters(&self) -> Result<Vec<CharacterRecord>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT character_tag, COUNT(*) as count
             FROM media_files
             WHERE character_tag IS NOT NULL AND character_tag != ''
             GROUP BY character_tag
             ORDER BY count DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(CharacterRecord {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn update_thumbnail_by_path(&self, file_path: &str, thumbnail_path: &str) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE media_files SET thumbnail_path = ?1 WHERE file_path = ?2",
            rusqlite::params![thumbnail_path, file_path],
        )?;
        Ok(())
    }

    pub fn update_thumbnail_path(&self, id: i64, thumbnail_path: &str) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE media_files SET thumbnail_path = ?1 WHERE id = ?2",
            params![thumbnail_path, id],
        )?;
        Ok(())
    }

    pub fn get_unthumbnailed_media(&self, limit: i64) -> Result<Vec<(i64, String)>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, file_path FROM media_files
             WHERE thumbnail_path IS NULL OR thumbnail_path = ''
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| Ok((row.get(0)?, row.get(1)?)))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // ================= FACE RECOGNITION DATABASE OPERATIONS =================

    pub fn insert_face(
        &self,
        media_id: i64,
        file_path: &str,
        crop_path: &str,
        x: i32,
        y: i32,
        w: i32,
        h: i32,
    ) -> Result<i64> {
        self.insert_face_with_group(media_id, file_path, crop_path, x, y, w, h, 0)
    }

    pub fn insert_face_with_group(
        &self,
        media_id: i64,
        file_path: &str,
        crop_path: &str,
        x: i32,
        y: i32,
        w: i32,
        h: i32,
        group_id: i64,
    ) -> Result<i64> {
        let conn = self.get_conn()?;
        conn.execute(
            "INSERT INTO faces (media_id, file_path, crop_path, box_x, box_y, box_w, box_h, group_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![media_id, file_path, crop_path, x, y, w, h, group_id],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn mark_media_face_scanned(&self, media_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE media_files SET face_scanned = 1 WHERE id = ?1",
            params![media_id],
        )?;
        Ok(())
    }

    pub fn mark_media_batch_face_scanned(&self, media_ids: &[i64]) -> Result<()> {
        if media_ids.is_empty() {
            return Ok(());
        }
        let mut conn = self.get_conn()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare("UPDATE media_files SET face_scanned = 1 WHERE id = ?1")?;
            for &id in media_ids {
                let _ = stmt.execute(params![id]);
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_unscanned_media(&self, limit: i64) -> Result<Vec<(i64, String, Option<String>)>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, file_path, thumbnail_path FROM media_files
             WHERE (face_scanned = 0 OR face_scanned IS NULL)
               AND thumbnail_path IS NOT NULL AND thumbnail_path != '' AND thumbnail_path != 'none'
             ORDER BY id ASC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_unnamed_faces(&self, limit: i64) -> Result<Vec<FaceRecord>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, media_id, file_path, crop_path, box_x, box_y, box_w, box_h, person_name, group_id, is_ignored
             FROM faces
             WHERE (person_name IS NULL OR person_name = '') AND is_ignored = 0
             ORDER BY id DESC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(FaceRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                file_path: row.get(2)?,
                crop_path: row.get(3)?,
                box_x: row.get(4)?,
                box_y: row.get(5)?,
                box_w: row.get(6)?,
                box_h: row.get(7)?,
                person_name: row.get(8)?,
                group_id: row.get(9)?,
                is_ignored: row.get(10)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_unnamed_face_groups(&self, limit: i64) -> Result<Vec<FaceGroupRecord>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT group_id, MIN(id) as rep_id, crop_path, file_path, COUNT(*) as count, person_name
             FROM faces
             WHERE (person_name IS NULL OR person_name = '') AND is_ignored = 0
             GROUP BY group_id
             ORDER BY count DESC, group_id ASC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            let gid: i64 = row.get(0)?;
            Ok(FaceGroupRecord {
                group_id: gid,
                representative_face_id: row.get(1)?,
                representative_crop_path: row.get(2)?,
                representative_file_path: row.get(3)?,
                face_count: row.get(4)?,
                person_name: row.get(5)?,
                faces: Vec::new(),
            })
        })?;

        let mut groups = Vec::new();
        for r in rows {
            groups.push(r?);
        }

        if groups.is_empty() {
            return Ok(groups);
        }

        // Fetch constituent faces in a single fast batch query
        let mut face_stmt = conn.prepare(
            "SELECT id, media_id, file_path, crop_path, box_x, box_y, box_w, box_h, person_name, group_id, is_ignored
             FROM faces
             WHERE (person_name IS NULL OR person_name = '') AND is_ignored = 0
             ORDER BY group_id, id ASC",
        )?;

        let face_rows = face_stmt.query_map([], |frow| {
            Ok(FaceRecord {
                id: frow.get(0)?,
                media_id: frow.get(1)?,
                file_path: frow.get(2)?,
                crop_path: frow.get(3)?,
                box_x: frow.get(4)?,
                box_y: frow.get(5)?,
                box_w: frow.get(6)?,
                box_h: frow.get(7)?,
                person_name: frow.get(8)?,
                group_id: frow.get(9)?,
                is_ignored: frow.get(10)?,
            })
        })?;

        let mut map: std::collections::HashMap<i64, Vec<FaceRecord>> =
            std::collections::HashMap::new();
        for f in face_rows {
            if let Ok(item) = f {
                map.entry(item.group_id).or_default().push(item);
            }
        }

        for g in groups.iter_mut() {
            if let Some(list) = map.remove(&g.group_id) {
                g.faces = list;
            }
        }

        Ok(groups)
    }

    pub fn assign_face_name(&self, face_id: i64, name: &str) -> Result<()> {
        let conn = self.get_conn()?;
        // 1. Update face record
        conn.execute(
            "UPDATE faces SET person_name = ?1 WHERE id = ?2",
            params![name, face_id],
        )?;

        // 2. Also tag parent photo in media_files
        let media_id: Option<i64> = conn
            .query_row(
                "SELECT media_id FROM faces WHERE id = ?1",
                params![face_id],
                |row| row.get(0),
            )
            .ok();

        if let Some(mid) = media_id {
            let _ = conn.execute(
                "UPDATE media_files SET character_tag = ?1 WHERE id = ?2",
                params![name, mid],
            );
        }

        Ok(())
    }

    pub fn assign_group_name(&self, group_id: i64, name: &str) -> Result<()> {
        let conn = self.get_conn()?;
        // 1. Tag all faces in this group
        conn.execute(
            "UPDATE faces SET person_name = ?1 WHERE group_id = ?2",
            params![name, group_id],
        )?;

        // 2. Tag all parent media files for this group
        let _ = conn.execute(
            "UPDATE media_files SET character_tag = ?1
             WHERE id IN (SELECT media_id FROM faces WHERE group_id = ?2)",
            params![name, group_id],
        );

        Ok(())
    }

    pub fn ignore_face(&self, face_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE faces SET is_ignored = 1 WHERE id = ?1",
            params![face_id],
        )?;
        Ok(())
    }

    pub fn ignore_group(&self, group_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE faces SET is_ignored = 1 WHERE group_id = ?1",
            params![group_id],
        )?;
        Ok(())
    }

    pub fn separate_face_from_group(&self, face_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE faces
             SET group_id = (SELECT COALESCE(MAX(group_id), 0) + 1 FROM faces)
             WHERE id = ?1",
            params![face_id],
        )?;
        Ok(())
    }

    pub fn get_face_scan_stats(&self) -> Result<(i64, i64, i64, i64)> {
        let conn = self.get_conn()?;
        let total: i64 =
            conn.query_row("SELECT COUNT(*) FROM media_files", [], |row| row.get(0))?;
        let scanned: i64 = conn.query_row(
            "SELECT COUNT(*) FROM media_files WHERE face_scanned = 1",
            [],
            |row| row.get(0),
        )?;
        let faces_found: i64 = conn.query_row(
            "SELECT COUNT(*) FROM faces WHERE is_ignored = 0",
            [],
            |row| row.get(0),
        )?;
        let groups_count: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT group_id) FROM faces WHERE (person_name IS NULL OR person_name = '') AND is_ignored = 0",
            [],
            |row| row.get(0),
        )?;
        Ok((scanned, total, faces_found, groups_count))
    }

    pub fn reset_face_scans(&self) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute_batch(
            "DELETE FROM faces;
             UPDATE media_files SET face_scanned = 0;
            ",
        )?;
        Ok(())
    }

    pub fn get_faces_for_media(&self, file_path: &str) -> Result<Vec<FaceRecord>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, media_id, file_path, crop_path, box_x, box_y, box_w, box_h, person_name, group_id, is_ignored
             FROM faces
             WHERE file_path = ?1 AND is_ignored = 0
             ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![file_path], |row| {
            Ok(FaceRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                file_path: row.get(2)?,
                crop_path: row.get(3)?,
                box_x: row.get(4)?,
                box_y: row.get(5)?,
                box_w: row.get(6)?,
                box_h: row.get(7)?,
                person_name: row.get(8)?,
                group_id: row.get(9)?,
                is_ignored: row.get(10)?,
            })
        })?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_face_counts(&self) -> Result<std::collections::HashMap<String, i64>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT file_path, COUNT(*) FROM faces WHERE is_ignored = 0 GROUP BY file_path",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut map = std::collections::HashMap::new();
        for r in rows {
            if let Ok((p, c)) = r {
                map.insert(p, c);
            }
        }
        Ok(map)
    }
}
