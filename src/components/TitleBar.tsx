import React, { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import appIcon from '../assets/app_icon.png';
import { Minus, Square, X, Copy, Search, Sun, Moon } from 'lucide-react';

interface TitleBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  searchQuery,
  onSearchChange,
  isDark = false,
  onToggleTheme,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);

    let unsubResize: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    appWindow.onResized(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
      }, 150);
    }).then((unsub) => {
      unsubResize = unsub;
    });

    return () => {
      if (unsubResize) unsubResize();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
    const max = await appWindow.isMaximized();
    setIsMaximized(max);
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <div
      data-tauri-drag-region
      className={`h-10 border-b flex items-center justify-between px-3 select-none font-sans text-xs shrink-0 z-50 transition-colors ${
        isDark
          ? 'bg-[#1A1A1A] border-[#2B2B2B] text-[#CCCCCC]'
          : 'bg-[#F3F4F6] border-[#E1E4E8] text-[#333333]'
      }`}
    >
      {/* Left: App Icon & Brand */}
      <div data-tauri-drag-region className="flex items-center space-x-2.5">
        <img
          src={appIcon}
          alt="RedCaso"
          className="w-4 h-4 object-contain pointer-events-none"
        />
        <span className={`font-semibold tracking-tight text-[12px] ${isDark ? 'text-white' : 'text-[#1A1A1A]'}`}>
          RedCaso
        </span>
        <span className="text-[10px] text-[#0078D4] bg-[#0078D4]/12 px-1.5 py-0.5 font-medium">
          Photos & Sync
        </span>
      </div>

      {/* Center: Integrated Fluent Search Bar & Theme Toggle */}
      <div data-tauri-drag-region className="flex-1 max-w-md mx-4 flex items-center justify-center space-x-2">
        <div className="relative w-full max-w-sm flex items-center">
          <Search size={13} className={`absolute left-2.5 pointer-events-none ${isDark ? 'text-[#777777]' : 'text-[#888888]'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search photos, people, or tags..."
            className={`w-full text-[11px] pl-8 pr-3 py-1 outline-none transition-all ${
              isDark
                ? 'bg-[#242424] hover:bg-[#2A2A2A] focus:bg-[#1E1E1E] border border-[#333333] focus:border-[#0078D4] text-white placeholder-[#777777]'
                : 'bg-white hover:bg-[#F9FAFB] focus:bg-white border border-[#D1D5DB] focus:border-[#0078D4] text-[#1A1A1A] placeholder-[#9CA3AF] shadow-xs'
            }`}
          />
        </div>

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={`p-1.5 transition-colors cursor-pointer ${
              isDark
                ? 'text-[#AAAAAA] hover:text-white hover:bg-[#2A2A2A]'
                : 'text-[#666666] hover:text-[#1A1A1A] hover:bg-[#E5E7EB]'
            }`}
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        )}
      </div>

      {/* Right: Windows 11 Fluent Window Control Buttons */}
      <div className="flex items-center h-full -mr-3">
        <button
          onClick={handleMinimize}
          title="Minimize"
          className={`h-10 w-11 flex items-center justify-center transition-colors cursor-pointer ${
            isDark
              ? 'hover:bg-[#333333] active:bg-[#404040] text-[#AAAAAA] hover:text-white'
              : 'hover:bg-[#E5E7EB] active:bg-[#D1D5DB] text-[#4B5563] hover:text-[#111827]'
          }`}
        >
          <Minus size={13} />
        </button>
        <button
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          className={`h-10 w-11 flex items-center justify-center transition-colors cursor-pointer ${
            isDark
              ? 'hover:bg-[#333333] active:bg-[#404040] text-[#AAAAAA] hover:text-white'
              : 'hover:bg-[#E5E7EB] active:bg-[#D1D5DB] text-[#4B5563] hover:text-[#111827]'
          }`}
        >
          {isMaximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          onClick={handleClose}
          title="Close"
          className={`h-10 w-12 flex items-center justify-center hover:bg-[#E81123] active:bg-[#BF0F1D] hover:text-white transition-colors cursor-pointer ${
            isDark ? 'text-[#AAAAAA]' : 'text-[#4B5563]'
          }`}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
