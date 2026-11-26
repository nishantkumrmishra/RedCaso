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
        Connection::open(&self.db_path)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;

             CREATE TABLE IF NOT EXISTS folders (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             );

             CREATE INDEX IF NOT EXISTS idx_media_folder ON media_files(folder_id);
             CREATE INDEX IF NOT EXISTS idx_media_character ON media_files(character_tag);
             CREATE INDEX IF NOT EXISTS idx_media_hash ON media_files(file_hash);
            ",
        )?;
        Ok(())
    }

    pub fn clear_all_data(&self) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute_batch(
            "DELETE FROM media_files;
             DELETE FROM folders;
             VACUUM;
            "
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

        let id: i64 = conn.query_row(
            "SELECT id FROM folders WHERE folder_path = ?1",
            params![path],
            |row| row.get(0),
        )?;

        Ok(id)
    }

    pub fn batch_upsert_media(&self, folder_id: i64, items: &[BatchMediaItem]) -> Result<()> {
        let mut conn = self.get_conn()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO media_files (folder_id, file_path, file_name, file_size, file_hash, date_taken, width, height)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(file_path) DO UPDATE SET
                    file_size = excluded.file_size,
                    file_hash = excluded.file_hash,
                    date_taken = COALESCE(excluded.date_taken, media_files.date_taken),
                    width = COALESCE(excluded.width, media_files.width),
                    height = COALESCE(excluded.height, media_files.height)",
            )?;

            for item in items {
                stmt.execute(params![
                    folder_id,
                    item.file_path,
                    item.file_name,
                    item.file_size,
                    item.file_hash,
                    item.date_taken,
                    item.width,
                    item.height,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_all_folders(&self) -> Result<Vec<FolderRecord>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, folder_path, folder_name, photo_count, sync_enabled, google_album_id, last_scanned_at
             FROM folders WHERE photo_count > 0 ORDER BY folder_name COLLATE NOCASE ASC",
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

    pub fn get_media_records(
        &self,
        folder_id: Option<i64>,
        character_tag: Option<&str>,
    ) -> Result<Vec<MediaRecord>> {
        let conn = self.get_conn()?;
        let mut query = String::from(
            "SELECT id, folder_id, file_path, file_name, file_size, file_hash, width, height, date_taken, thumbnail_path, sync_status, character_tag
             FROM media_files WHERE 1=1"
        );

        if folder_id.is_some() {
            query.push_str(" AND folder_id = ?1");
        }
        if character_tag.is_some() {
            query.push_str(" AND character_tag = ?2");
        }
        query.push_str(" ORDER BY date_taken DESC, id DESC");

        let mut stmt = conn.prepare(&query)?;

        let rows = if let (Some(fid), Some(tag)) = (folder_id, character_tag) {
            stmt.query_map(params![fid, tag], Self::map_media_row)?
        } else if let Some(fid) = folder_id {
            stmt.query_map(params![fid], Self::map_media_row)?
        } else if let Some(tag) = character_tag {
            stmt.query_map(params![tag], Self::map_media_row)?
        } else {
            stmt.query_map([], Self::map_media_row)?
        };

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    fn map_media_row(row: &rusqlite::Row) -> Result<MediaRecord> {
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

        let rows = stmt.query_map(params![limit], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }
}
