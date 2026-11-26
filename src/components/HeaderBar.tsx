import React from 'react';
import { ScanProgressPayload, SyncProgressPayload } from '../types';
import { Sparkles, Cloud, FolderCheck } from 'lucide-react';

interface HeaderBarProps {
  title: string;
  totalVisible: number;
  scanProgress: ScanProgressPayload | null;
  syncProgress: SyncProgressPayload | null;
  sortBy: 'date' | 'name' | 'size';
  onSortChange: (sort: 'date' | 'name' | 'size') => void;
  isDark?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  totalVisible,
  scanProgress,
  syncProgress,
  sortBy,
  onSortChange,
  isDark = false,
}) => {
  const isPeople = title.toLowerCase().includes('people') || title.toLowerCase().includes('unnamed');

  return (
    <div
      className={`h-12 border-b px-4 flex items-center justify-between select-none font-sans text-xs shrink-0 transition-colors ${
        isDark
          ? 'bg-[#1E1E1E] border-[#2C2C2C] text-[#CCCCCC]'
          : 'bg-white border-[#E5E7EB] text-[#374151]'
      }`}
    >
      {/* Left: View Title & Item Count */}
      <div className="flex items-center space-x-3">
        <h1 className={`text-sm font-semibold tracking-tight truncate max-w-sm ${isDark ? 'text-white' : 'text-[#111827]'}`}>
          {title}
        </h1>
        <span
          className={`text-[11px] px-2 py-0.5 font-medium ${
            isDark ? 'text-[#888888] bg-[#2A2A2A]' : 'text-[#6B7280] bg-[#F3F4F6]'
          }`}
        >
          {totalVisible} {isPeople ? (totalVisible === 1 ? 'face' : 'faces') : (totalVisible === 1 ? 'photo' : 'photos')}
        </span>
      </div>

      {/* Center: Live Background Progress */}
      <div className="hidden md:flex items-center space-x-2">
        {scanProgress && scanProgress.status !== 'complete' && (
          <div className="bg-[#0078D4]/12 border border-[#0078D4]/30 px-3 py-1 text-[11px] text-[#0078D4] flex items-center space-x-2 animate-pulse">
            <Sparkles size={13} className="text-[#0078D4]" />
            <span className="font-medium">Indexing:</span>
            <span>{scanProgress.images_found} images ({scanProgress.folders_found} folders)</span>
          </div>
        )}

        {syncProgress && syncProgress.state === 'uploading' && (
          <div className="bg-[#0078D4]/15 border border-[#0078D4]/40 px-3 py-1 text-[11px] text-[#0078D4] flex items-center space-x-2">
            <Cloud size={14} className="text-[#0078D4] animate-bounce" />
            <span className="font-medium">Syncing &quot;{syncProgress.folder_name}&quot;:</span>
            <span className="font-bold">
              {syncProgress.uploaded_count} / {syncProgress.total_count}
            </span>
          </div>
        )}

        {syncProgress && syncProgress.state === 'complete' && (
          <div className="bg-[#107C41]/12 border border-[#107C41]/30 px-3 py-1 text-[11px] text-[#107C41] flex items-center space-x-2">
            <FolderCheck size={14} className="text-[#107C41]" />
            <span className="font-medium">Synced with Google Photos</span>
          </div>
        )}
      </div>

      {/* Right: Sort controls */}
      <div className="flex items-center space-x-2">
        <span className={`text-[11px] ${isDark ? 'text-[#888888]' : 'text-[#6B7280]'}`}>Sort by:</span>
        <div className="inline-flex border border-inherit">
          {(['date', 'name', 'size'] as const).map((type) => (
            <button
              key={type}
              onClick={() => onSortChange(type)}
              className={`px-2.5 py-1 text-xs capitalize transition-colors cursor-pointer ${
                sortBy === type
                  ? 'bg-[#0078D4] text-white font-medium'
                  : isDark
                  ? 'text-[#AAAAAA] hover:bg-[#2A2A2A]'
                  : 'text-[#4B5563] hover:bg-[#F3F4F6]'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
