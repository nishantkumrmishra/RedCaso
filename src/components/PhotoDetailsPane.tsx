import React, { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import {
  X,
  Lock,
  ExternalLink,
  Edit3,
  Check,
} from 'lucide-react';
import { MediaRecord, FaceRecord } from '../types';

interface PhotoDetailsPaneProps {
  photo: MediaRecord | null;
  onClose: () => void;
  onOpenViewer?: (photo: MediaRecord) => void;
  onRefresh?: () => void;
}

export const PhotoDetailsPane: React.FC<PhotoDetailsPaneProps> = ({
  photo,
  onClose,
  onOpenViewer,
  onRefresh,
}) => {
  const [faces, setFaces] = useState<FaceRecord[]>([]);
  const [personName, setPersonName] = useState<string>('');
  const [applyToGroup, setApplyToGroup] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Fetch faces detected in this specific photo
  useEffect(() => {
    if (!photo || !photo.file_path) {
      setFaces([]);
      setPersonName('');
      return;
    }

    setSavedSuccess(false);
    if (!photo.file_path.startsWith('sample://')) {
      invoke<FaceRecord[]>('get_faces_for_media', { filePath: photo.file_path })
        .then((records) => {
          setFaces(records);
          if (records.length > 0 && records[0].person_name) {
            setPersonName(records[0].person_name);
          } else if (photo.character_tag) {
            setPersonName(photo.character_tag);
          } else {
            setPersonName('');
          }
        })
        .catch(() => setFaces([]));
    } else {
      setFaces([]);
      setPersonName('');
    }
  }, [photo]);

  if (!photo) return null;

  const currentFace = faces.length > 0 ? faces[0] : null;

  // Format file size
  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Save Name Handler
  const handleSaveName = async () => {
    if (!personName.trim()) return;
    setIsSaving(true);
    try {
      if (currentFace) {
        if (applyToGroup && currentFace.group_id) {
          await invoke('assign_face_group_name', {
            groupId: currentFace.group_id,
            name: personName.trim(),
          });
        } else {
          await invoke('assign_face_name', {
            faceId: currentFace.id,
            name: personName.trim(),
          });
        }
      } else if (photo.file_path && !photo.file_path.startsWith('sample://')) {
        await invoke('assign_character', {
          filePath: photo.file_path,
          characterName: personName.trim(),
        });
      }

      setSavedSuccess(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to save person name:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReveal = () => {
    if (photo.file_path && !photo.file_path.startsWith('sample://')) {
      invoke('reveal_in_explorer', { filePath: photo.file_path }).catch(console.error);
    }
  };

  // Image source: use thumbnail_path or original file
  const imageSource =
    photo.file_path && !photo.file_path.startsWith('sample://')
      ? convertFileSrc(photo.thumbnail_path || photo.file_path)
      : '';

  // Face crop thumbnail
  const faceCropSource =
    currentFace && currentFace.crop_path
      ? convertFileSrc(currentFace.crop_path)
      : imageSource;

  // Contained preview dimensions calculation
  const containerW = 272;
  const containerH = 181;
  const imgW = photo.width || containerW;
  const imgH = photo.height || containerH;
  const scale = Math.min(containerW / imgW, containerH / imgH);
  const displayW = Math.max(1, Math.round(imgW * scale));
  const displayH = Math.max(1, Math.round(imgH * scale));

  // Support both new scaled full-res coordinates and legacy unscaled thumbnail coordinates
  const photoW = photo.width || 0;
  const isLegacyCoords =
    currentFace &&
    photoW > 550 &&
    currentFace.box_w <= 160 &&
    currentFace.box_x + currentFace.box_w <= 512;

  const legacyScale = isLegacyCoords
    ? (currentFace.box_x + currentFace.box_w > 256 ? photoW / 512 : photoW / 256)
    : 1;

  const boxX = currentFace ? currentFace.box_x * legacyScale : 0;
  const boxY = currentFace ? currentFace.box_y * legacyScale : 0;
  const boxW = currentFace ? currentFace.box_w * legacyScale : 0;
  const boxH = currentFace ? currentFace.box_h * legacyScale : 0;

  return (
    <aside className="w-[320px] shrink-0 bg-[#FAFAFA] border-l border-[#E5E5E5] flex flex-col justify-between select-none overflow-hidden text-[#242424] font-normal">
      {/* Top Header */}
      <div className="h-[48px] px-4 border-b border-[#E5E5E5] flex items-center justify-between shrink-0 bg-white">
        <span className="text-[13px] text-[#242424]">Photo details</span>
        <div className="flex items-center space-x-1">
          {onOpenViewer && (
            <button
              type="button"
              onClick={() => onOpenViewer(photo)}
              className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#616161] hover:text-[#0067C0] transition-colors cursor-pointer"
              title="Open photo in editor"
            >
              <Edit3 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#616161] transition-colors cursor-pointer"
            title="Close details"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Main Content Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 1. Large Preview Container - Perfectly aspect-ratio contained */}
        <div className="w-[272px] h-[181px] rounded-[4px] overflow-hidden relative mx-auto bg-slate-100 border border-[#E5E5E5] shadow-2xs flex items-center justify-center">
          {imageSource ? (
            <div
              style={{ width: `${displayW}px`, height: `${displayH}px` }}
              className="relative overflow-hidden shrink-0 flex items-center justify-center"
            >
              <img
                src={imageSource}
                alt={photo.file_name}
                className="w-full h-full object-fill"
              />

              {/* Real Face Bounding Box directly overlaid on the photo */}
              {currentFace && photo.width && photo.height && (
                <div
                  style={{
                    left: `${Math.max(0, Math.min(95, (boxX / photo.width) * 100))}%`,
                    top: `${Math.max(0, Math.min(95, (boxY / photo.height) * 100))}%`,
                    width: `${Math.max(5, Math.min(100, (boxW / photo.width) * 100))}%`,
                    height: `${Math.max(5, Math.min(100, (boxH / photo.height) * 100))}%`,
                  }}
                  className="absolute border-[2px] border-white rounded-[2px] shadow-[0_0_5px_rgba(0,0,0,0.8)] pointer-events-none"
                />
              )}
            </div>
          ) : (
            <div className="text-xs text-[#767676]">No image preview</div>
          )}
        </div>

        {/* 2. Photo Title & Date */}
        <div>
          <h3 className="text-[13px] text-[#242424] truncate" title={photo.file_name}>
            {photo.file_name}
          </h3>
          <p className="text-[12px] text-[#616161] mt-0.5">
            {formatDate(photo.date_taken)}
          </p>
        </div>

        {/* Divider line */}
        <div className="h-[1px] bg-[#E5E5E5] w-full" />

        {/* 3. People in This Photo Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#242424]">People in this photo</span>
            <span className="w-5 h-5 rounded-[4px] bg-[#EBEBEB] text-[#616161] flex items-center justify-center text-[11px]">
              {faces.length}
            </span>
          </div>

          {faces.length === 0 ? (
            <div className="p-3 bg-white border border-[#E5E5E5] rounded-[4px] text-center space-y-1">
              <span className="text-xs text-[#616161] block">No faces detected</span>
              <span className="text-[10px] text-[#8C8C8C] block">
                This image contains no detected faces or has not been scanned yet.
              </span>
            </div>
          ) : (
            <>
              {/* Avatar and Person identity */}
              <div className="flex items-center space-x-3">
                <div className="w-[42px] h-[42px] rounded-full overflow-hidden border border-[#D0D0D0] shrink-0 bg-slate-200 shadow-2xs">
                  <img
                    src={faceCropSource}
                    alt="Detected face"
                    className="w-full h-full object-cover scale-150"
                  />
                </div>
                <div>
                  <h4 className="text-[13px] text-[#242424] leading-tight">
                    {currentFace?.person_name ? currentFace.person_name : 'Who is this?'}
                  </h4>
                  <p className="text-[11px] text-[#616161] mt-0.5">
                    {currentFace?.group_id
                      ? `Face Group #${currentFace.group_id}`
                      : 'Detected face'}
                  </p>
                </div>
              </div>

              {/* Name Input Field */}
              <div className="relative">
                <input
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder="Enter person name..."
                  className="w-full h-[35px] px-3 text-xs bg-white border border-[#A3A3A3] focus:border-[#0067C0] rounded-[3.5px] outline-none text-[#242424] transition-all font-normal"
                />
                <div className="h-[2px] bg-[#0067C0] rounded-b-[3.5px] w-full" />
              </div>

              {/* Checkbox: Apply to matching group */}
              {currentFace?.group_id && (
                <label className="flex items-center space-x-2 text-[11px] text-[#242424] cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={applyToGroup}
                    onChange={(e) => setApplyToGroup(e.target.checked)}
                    className="w-4 h-4 rounded text-[#0067C0] focus:ring-[#0067C0] border-gray-300 cursor-pointer"
                  />
                  <span>Apply to all photos in Group #{currentFace.group_id}</span>
                </label>
              )}

              {/* Primary Save Name Button */}
              <button
                type="button"
                onClick={handleSaveName}
                disabled={isSaving || !personName.trim()}
                className="w-full h-[34px] bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578] disabled:opacity-50 text-white text-xs font-normal rounded-[4px] shadow-2xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                {isSaving ? (
                  <span>Saving...</span>
                ) : savedSuccess ? (
                  <>
                    <Check size={13} />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save name</span>
                )}
              </button>
            </>
          )}

          {/* Privacy badge */}
          <div className="pt-0.5 flex items-center space-x-1.5 text-[10px] text-[#616161]">
            <Lock size={11} className="shrink-0" />
            <span>Face data stays on this device.</span>
          </div>
        </div>

        {/* Divider line */}
        <div className="h-[1px] bg-[#E5E5E5] w-full" />

        {/* 4. File Information Section */}
        <div className="space-y-2.5">
          <span className="text-[11px] uppercase tracking-wider text-[#616161] block">
            File information
          </span>

          <div className="space-y-2 text-xs">
            <div className="flex items-start justify-between">
              <span className="text-[#616161]">Location</span>
              <span className="text-[#242424] text-right truncate max-w-[160px]" title={photo.file_path}>
                {photo.file_path
                  ? photo.file_path.split(/[\\/]/).slice(-2).join(' > ')
                  : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#616161]">Dimensions</span>
              <span className="text-[#242424]">
                {photo.width && photo.height ? `${photo.width} × ${photo.height}` : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#616161]">Size</span>
              <span className="text-[#242424]">
                {formatSize(photo.file_size)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReveal}
            className="pt-2 text-xs text-[#0067C0] hover:underline flex items-center space-x-1.5 cursor-pointer font-normal"
          >
            <ExternalLink size={13} />
            <span>Show in File Explorer</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
