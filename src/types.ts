export interface FolderRecord {
  id: number;
  folder_path: string;
  folder_name: string;
  photo_count: number;
  sync_enabled: boolean;
  google_album_id?: string | null;
  last_scanned_at: string;
}

export interface MediaRecord {
  id: number;
  folder_id: number;
  file_path: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  width?: number | null;
  height?: number | null;
  date_taken?: string | null;
  thumbnail_path?: string | null;
  sync_status: 'local' | 'pending' | 'uploading' | 'synced' | 'error';
  character_tag?: string | null;
}

export interface CharacterRecord {
  name: string;
  count: number;
}

export interface ScanProgressPayload {
  status: string;
  current_folder: string;
  folders_found: number;
  images_found: number;
}

export interface FolderScannedPayload {
  folder_id: number;
  folder_name: string;
  folder_path: string;
  photo_count: number;
  preview_image_path: string;
  preview_image_name: string;
  total_images: number;
  total_folders: number;
}

export interface SyncProgressPayload {
  folder_id: number;
  folder_name: string;
  uploaded_count: number;
  total_count: number;
  state: 'idle' | 'uploading' | 'complete' | 'error';
}
