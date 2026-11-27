import React, { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useFluentDialog } from './FluentDialog';
import {
  Minus,
  Square,
  X,
  Search,
  Plus,
  RefreshCw,
  FolderPlus,
  Users,
  MoreHorizontal,
  Check,
  Info,
} from 'lucide-react';

interface ModernTopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onTriggerScan: () => void;
  onFindFaces: () => void;
  isScanning: boolean;
  libraryStatus?: string;
  isDark?: boolean;
  onToggleTheme?: () => void;
  onOpenInfo?: () => void;
  onAddFolder?: () => void;
  isFaceEngineEnabled?: boolean;
  onToggleFaceEngine?: () => void;
}

export const ModernTopBar: React.FC<ModernTopBarProps> = ({
  searchQuery,
  onSearchChange,
  onTriggerScan,
  onFindFaces,
  isScanning,
  libraryStatus = 'Library up to date',
  onOpenInfo,
  onAddFolder,
  isFaceEngineEnabled = false,
  onToggleFaceEngine,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const { alert } = useFluentDialog();
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});
  }, [appWindow]);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = async () => {
    const max = await appWindow.isMaximized();
    if (max) {
      await appWindow.unmaximize();
      setIsMaximized(false);
    } else {
      await appWindow.maximize();
      setIsMaximized(true);
    }
  };
  const handleClose = () => appWindow.close();

  return (
    <header className="shrink-0 select-none border-b border-[#E5E5E5]">
      {/* 1. Top Titlebar */}
      <div className="h-[48px] px-4 flex items-center justify-between gap-4 bg-[#F3F3F3]">
        {/* Left: App Logo & Title */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <div className="w-[22px] h-[22px] rounded-[5px] bg-[#0067C0] flex items-center justify-center text-white shadow-xs">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span className="text-[13px] text-[#242424] tracking-tight">RedCaso</span>
          <span className="text-[12px] text-[#616161]">Photo manager</span>
        </div>

        {/* Center: Search Box */}
        <div className="flex-1 max-w-[549px] mx-auto">
          <div className="h-[33px] bg-white border border-[#D1D1D1] rounded-[4.5px] px-3 flex items-center shadow-2xs focus-within:border-[#0067C0] focus-within:ring-1 focus-within:ring-[#0067C0] transition-all">
            <Search size={14} className="text-[#616161] shrink-0 mr-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search photos, people, or folders"
              className="w-full bg-transparent text-xs text-[#242424] outline-none placeholder-[#616161]"
            />
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#D1D1D1] text-[#616161] shrink-0 ml-2">
              Ctrl + F
            </span>
          </div>
        </div>

        {/* Right: Window Controls matching Windows 11 */}
        <div className="flex items-center space-x-1 shrink-0">
          <button
            type="button"
            onClick={handleMinimize}
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#444444] transition-colors cursor-pointer"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#444444] transition-colors cursor-pointer"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-[#E81123] hover:text-white text-[#444444] transition-colors cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 2. Action Toolbar */}
      <div className="h-[52px] px-4 bg-[#F9F9F9] flex items-center justify-between gap-4 text-xs">
        {/* Left Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Primary + Add folder Button */}
          <button
            type="button"
            onClick={onAddFolder || onTriggerScan}
            className="w-[130px] h-[34px] bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578] text-white rounded-[4px] shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>Add folder</span>
          </button>

          {/* Scan now Button */}
          <button
            type="button"
            onClick={onTriggerScan}
            disabled={isScanning}
            className="h-[34px] px-3.5 border border-[#D8D8D8] hover:bg-white text-[#242424] rounded-[4px] flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={isScanning ? 'animate-spin text-[#0067C0]' : 'text-[#616161]'} />
            <span>{isScanning ? 'Scanning...' : 'Scan now'}</span>
          </button>

          <div className="w-[1px] h-[22px] bg-[#D8D8D8] mx-1" />

          {/* New album Button */}
          <button
            type="button"
            onClick={() =>
              alert({
                title: 'Create Album',
                message: 'Select photos in the gallery and click "Add to album" in the context menu to create a new album.',
              })
            }
            className="h-[34px] px-3 border border-transparent hover:border-[#D8D8D8] hover:bg-white text-[#242424] rounded-[4px] flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <FolderPlus size={14} className="text-[#616161]" />
            <span>New album</span>
          </button>

          {/* Face Recognition Toggle Button */}
          <button
            type="button"
            onClick={onToggleFaceEngine || onFindFaces}
            className={`h-[34px] px-3 border rounded-[4px] flex items-center space-x-2 transition-all cursor-pointer shadow-2xs ${
              isFaceEngineEnabled
                ? 'bg-[#EBF3FB] border-[#0067C0] text-[#0067C0]'
                : 'bg-white border-[#D8D8D8] text-[#555555] hover:bg-[#F5F5F5]'
            }`}
            title={
              isFaceEngineEnabled
                ? 'Face recognition is Active (Click to pause and save disk)'
                : 'Face recognition is Paused (Click to enable)'
            }
          >
            <Users size={14} className={isFaceEngineEnabled ? 'text-[#0067C0]' : 'text-[#777777]'} />
            <span className="font-medium">
              Faces: {isFaceEngineEnabled ? 'On' : 'Off'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                isFaceEngineEnabled ? 'bg-[#107C41] animate-pulse' : 'bg-[#A0A0A0]'
              }`}
            />
          </button>

          {/* More options button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="h-[34px] px-2.5 border border-transparent hover:border-[#D8D8D8] hover:bg-white text-[#242424] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer"
              title="More options"
            >
              <MoreHorizontal size={15} className="text-[#616161]" />
            </button>

            {showMoreMenu && (
              <div
                className="absolute left-0 mt-1 w-52 bg-white border border-[#D8D8D8] rounded-[6px] shadow-xl py-1 z-50 text-[#242424]"
                onClick={() => setShowMoreMenu(false)}
              >
                <button
                  type="button"
                  onClick={onTriggerScan}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#EDF3F9] hover:text-[#0067C0] flex items-center space-x-2"
                >
                  <RefreshCw size={12} />
                  <span>Rescan all indexed drives</span>
                </button>
                <button
                  type="button"
                  onClick={onFindFaces}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#EDF3F9] hover:text-[#0067C0] flex items-center space-x-2"
                >
                  <Users size={12} />
                  <span>Recluster detected faces</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Status Indicator & Info */}
        <div className="flex items-center space-x-3 text-[#616161]">
          <div className="flex items-center space-x-1.5">
            <Check size={14} className="text-[#0067C0]" strokeWidth={2.5} />
            <span className="text-[11px] text-[#616161]">{libraryStatus}</span>
          </div>

          {onOpenInfo && (
            <button
              type="button"
              onClick={onOpenInfo}
              className="p-1 rounded-full hover:bg-[#EAEAEA] text-[#616161] transition-colors cursor-pointer"
              title="About RedCaso"
            >
              <Info size={15} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
