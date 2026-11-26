import React, { useState } from 'react';
import { MediaRecord } from '../types';
import { convertFileSrc } from '@tauri-apps/api/core';
import { X, User, HardDrive, Calendar, Cloud, Hash } from 'lucide-react';

interface PhotoModalProps {
  media: MediaRecord | null;
  onClose: () => void;
  onSaveCharacter: (filePath: string, characterName: string) => void;
}

export const PhotoModal: React.FC<PhotoModalProps> = ({
  media,
  onClose,
  onSaveCharacter,
}) => {
  const [characterInput, setCharacterInput] = useState<string>(
    media?.character_tag || ''
  );

  if (!media) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveCharacter(media.file_path, characterInput);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 font-sans select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] bg-[#202020] border border-[#3A3A3A] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Dialog Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#242424] border-b border-[#2E2E2E]">
          <div className="flex items-center space-x-2 truncate max-w-md">
            <span className="text-sm font-semibold text-white truncate">
              {media.file_name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#333333] text-[#AAAAAA] hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content: Left Preview, Right Inspector */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Main Photo Display Area */}
          <div className="flex-1 bg-[#141414] flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-[#2C2C2C] overflow-hidden">
            <img
              src={convertFileSrc(media.file_path)}
              alt={media.file_name}
              className="max-w-full max-h-[62vh] object-contain shadow-md"
            />
          </div>

          {/* Inspector Panel */}
          <div className="w-full md:w-80 p-5 bg-[#202020] flex flex-col justify-between text-xs space-y-4 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <span className="text-[11px] font-medium text-[#888888] flex items-center gap-1.5 mb-1">
                  <HardDrive size={13} />
                  File Path
                </span>
                <span className="text-[#CCCCCC] text-[11px] break-all bg-[#1A1A1A] p-2 block border border-[#2D2D2D] font-mono">
                  {media.file_path}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1A1A1A] p-2.5 border border-[#2D2D2D]">
                  <span className="text-[10px] text-[#777777] block font-medium">SIZE</span>
                  <span className="text-white font-semibold text-xs mt-0.5 block">
                    {formatSize(media.file_size)}
                  </span>
                </div>
                <div className="bg-[#1A1A1A] p-2.5 border border-[#2D2D2D]">
                  <span className="text-[10px] text-[#777777] flex items-center gap-1 font-medium">
                    <Cloud size={11} /> SYNC
                  </span>
                  <span className="text-[#60CDFF] font-semibold text-xs mt-0.5 block capitalize">
                    {media.sync_status}
                  </span>
                </div>
              </div>

              {media.date_taken && (
                <div className="bg-[#1A1A1A] p-2.5 border border-[#2D2D2D]">
                  <span className="text-[10px] text-[#777777] flex items-center gap-1 font-medium">
                    <Calendar size={11} /> DATE TAKEN (EXIF)
                  </span>
                  <span className="text-white font-semibold text-xs mt-0.5 block">
                    {media.date_taken}
                  </span>
                </div>
              )}

              {/* Character Naming (Picasa-style Tagging) */}
              <form onSubmit={handleSave} className="bg-[#1A1A1A] p-3 border border-[#2D2D2D]">
                <label className="text-[11px] text-[#EEEEEE] font-semibold flex items-center gap-1.5 mb-2">
                  <User size={13} className="text-[#60CDFF]" />
                  Associate Person / Character
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={characterInput}
                    onChange={(e) => setCharacterInput(e.target.value)}
                    placeholder="e.g. Alice, John, Hero"
                    className="flex-1 bg-[#252525] border border-[#3A3A3A] focus:border-[#60CDFF] focus:ring-1 focus:ring-[#60CDFF] text-white px-2.5 py-1.5 text-xs outline-none transition-all placeholder-[#666666]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[#0078D4] hover:bg-[#106EBE] active:bg-[#005A9E] text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
                  >
                    Save
                  </button>
                </div>
                <span className="text-[10px] text-[#777777] mt-1.5 block">
                  Creates an automatic Character Album in the sidebar.
                </span>
              </form>
            </div>

            <div className="text-[10px] text-[#555555] flex items-center gap-1 pt-2 border-t border-[#2A2A2A]">
              <Hash size={12} />
              <span className="font-mono truncate">{media.file_hash}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
