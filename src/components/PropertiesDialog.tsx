import React from 'react';
import { MediaRecord } from '../types';
import { X, Calendar, HardDrive, Maximize2, Tag, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface PropertiesDialogProps {
  media: MediaRecord | null;
  onClose: () => void;
  isDark?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  return `${val} ${sizes[i]} (${bytes.toLocaleString()} bytes)`;
}

export const PropertiesDialog: React.FC<PropertiesDialogProps> = ({
  media,
  onClose,
  isDark = false,
}) => {
  if (!media) return null;

  const handleReveal = () => {
    invoke('reveal_in_explorer', { filePath: media.file_path }).catch(console.error);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-[480px] border shadow-2xl p-5 select-none font-sans text-xs ${
          isDark ? 'bg-[#1E1E1E] border-[#383838] text-white' : 'bg-[#F2F4F7] border-[#A0A0A0] text-[#111827]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Titlebar */}
        <div className="flex items-center justify-between border-b pb-2.5 mb-4 border-inherit">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-sm truncate max-w-[360px]">{media.file_name}</span>
            <span className="text-[11px] opacity-60">Properties</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#E5E7EB] dark:hover:bg-[#2C2C2C] text-[#6B7280] dark:text-[#AAAAAA] cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Properties Grid */}
        <div className="space-y-3">
          <div className="flex items-start space-x-3 p-2.5 border border-inherit bg-white/40 dark:bg-black/20">
            <div className="w-8 h-8 bg-[#0078D4]/10 text-[#0078D4] flex items-center justify-center shrink-0">
              <HardDrive size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[11px] text-[#64748B] dark:text-[#999999]">File Location</div>
              <div className="font-mono text-[11px] break-all select-text mt-0.5">{media.file_path}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 border border-inherit bg-white/40 dark:bg-black/20">
              <div className="flex items-center space-x-1.5 text-[#64748B] dark:text-[#999999] mb-1 font-semibold text-[10px]">
                <HardDrive size={12} />
                <span>File Size</span>
              </div>
              <div className="font-mono text-[11px]">{formatBytes(media.file_size)}</div>
            </div>

            <div className="p-2 border border-inherit bg-white/40 dark:bg-black/20">
              <div className="flex items-center space-x-1.5 text-[#64748B] dark:text-[#999999] mb-1 font-semibold text-[10px]">
                <Maximize2 size={12} />
                <span>Dimensions</span>
              </div>
              <div className="font-mono text-[11px]">
                {media.width && media.height ? `${media.width} × ${media.height} px` : 'Unscanned / Standard'}
              </div>
            </div>

            <div className="p-2 border border-inherit bg-white/40 dark:bg-black/20">
              <div className="flex items-center space-x-1.5 text-[#64748B] dark:text-[#999999] mb-1 font-semibold text-[10px]">
                <Calendar size={12} />
                <span>Date Taken</span>
              </div>
              <div className="font-mono text-[11px]">
                {media.date_taken ? new Date(media.date_taken).toLocaleString() : 'Unknown'}
              </div>
            </div>

            <div className="p-2 border border-inherit bg-white/40 dark:bg-black/20">
              <div className="flex items-center space-x-1.5 text-[#64748B] dark:text-[#999999] mb-1 font-semibold text-[10px]">
                <Tag size={12} />
                <span>Person / Tag</span>
              </div>
              <div className="font-medium text-[11px] text-[#0078D4]">
                {media.character_tag || 'None'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-inherit flex items-center justify-between mt-5">
          <button
            type="button"
            onClick={handleReveal}
            className={`px-3 py-1.5 border flex items-center space-x-1.5 font-medium cursor-pointer transition-colors ${
              isDark
                ? 'border-[#383838] bg-[#252525] hover:bg-[#303030]'
                : 'border-[#CBD5E1] bg-white hover:bg-[#F8FAFC]'
            }`}
          >
            <ExternalLink size={12} />
            <span>Open in Explorer</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 font-semibold bg-[#0078D4] hover:bg-[#106EBE] text-white cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
