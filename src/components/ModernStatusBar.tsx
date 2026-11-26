import React from 'react';
import { Check, RefreshCw } from 'lucide-react';

interface ModernStatusBarProps {
  totalPhotos: number;
  totalFolders: number;
  selectedCount?: number;
  visibleCount: number;
  filterLabel?: string;
  isScanning?: boolean;
  facePercentage?: number;
  isDark?: boolean;
}

export const ModernStatusBar: React.FC<ModernStatusBarProps> = ({
  totalPhotos,
  totalFolders,
  selectedCount = 0,
  isScanning = false,
  facePercentage = 100,
}) => {
  const displayPhotos = (totalPhotos || 0).toLocaleString();
  const displayFolders = totalFolders || 0;

  return (
    <footer className="h-[28px] px-4 bg-[#F3F3F3] border-t border-[#E5E5E5] flex items-center justify-between text-[11px] text-[#616161] font-sans font-normal select-none shrink-0">
      {/* Left: Photos & Folders Count + Selection */}
      <div className="flex items-center space-x-3">
        <span>{displayPhotos} photos • {displayFolders} indexed folders</span>
        <span className="text-[#242424]">{selectedCount} selected</span>
      </div>

      {/* Right: Face Recognition Status & On-Device Guarantee */}
      <div className="flex items-center space-x-3 shrink-0">
        <div className="flex items-center space-x-1.5">
          {isScanning ? (
            <RefreshCw size={12} className="animate-spin text-[#0067C0]" />
          ) : (
            <Check size={13} className="text-[#0067C0]" strokeWidth={2} />
          )}
          <span>Face recognition is on-device</span>
        </div>
        <span className="opacity-40">|</span>
        <span className="text-[#242424]">{facePercentage}%</span>
      </div>
    </footer>
  );
};
