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

export interface FaceRecord {
  id: number;
  media_id: number;
  file_path: string;
  crop_path: string;
  box_x: number;
  box_y: number;
  box_w: number;
  box_h: number;
  person_name?: string | null;
  is_ignored: boolean;
  group_id?: number;
}

export interface FaceGroupRecord {
  group_id: number;
  representative_face_id: number;
  representative_crop_path: string;
  representative_file_path: string;
  face_count: number;
  person_name?: string | null;
  faces: FaceRecord[];
}

export interface FaceScanProgressPayload {
  scanned: number;
  total: number;
  faces_found: number;
  groups_count: number;
  percentage: number;
  is_complete: boolean;
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
