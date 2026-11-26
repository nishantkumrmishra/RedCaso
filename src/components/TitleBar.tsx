import React, { useState, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import appIcon from '../assets/app_icon.png';
import {
  Minus,
  Square,
  X,
  Copy,
  Search,
  Sun,
  Moon,
  FolderSync,
  Sparkles,
  Info,
  Check,
  FolderOpen,
  Cloud,
  ExternalLink,
  ShieldCheck,
  HardDrive,
  Calendar,
  Type,
  Maximize2,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { MediaRecord } from '../types';

export interface TitleBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
  onTriggerScan?: () => void;
  onClearCatalog?: () => void;
  onSelectAllPhotos?: () => void;
  onSortChange?: (sort: 'date' | 'name' | 'size') => void;
  sortBy?: 'date' | 'name' | 'size';
  totalPhotos?: number;
  totalFolders?: number;
  selectedMedia?: MediaRecord | null;
  onOpenViewer?: () => void;
}

type MenuKey = 'File' | 'Edit' | 'View' | 'Folder' | 'Picture' | 'Create' | 'Tools' | 'Help';

export const TitleBar: React.FC<TitleBarProps> = ({
  searchQuery,
  onSearchChange,
  isDark = false,
  onToggleTheme,
  onTriggerScan,
  onClearCatalog,
  onSelectAllPhotos,
  onSortChange,
  sortBy = 'date',
  totalPhotos = 0,
  totalFolders = 0,
  selectedMedia,
  onOpenViewer,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuKey | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);

  const menuContainerRef = useRef<HTMLDivElement>(null);
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

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
        setShowGoogleModal(false);
        setShowAboutModal(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
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

  const handleToggleFullscreen = async () => {
    const isFull = await appWindow.isFullscreen();
    appWindow.setFullscreen(!isFull);
    setActiveMenu(null);
  };

  const menuItems: MenuKey[] = ['File', 'Edit', 'View', 'Folder', 'Picture', 'Create', 'Tools', 'Help'];

  return (
    <header className="flex flex-col select-none font-sans shrink-0 z-50">
      {/* 1. Top Titlebar Strip (Picasa 3 style: Logo + Title + Window Controls) */}
      <div
        data-tauri-drag-region
        className={`h-7 px-2.5 flex items-center justify-between border-b text-xs transition-colors ${
          isDark
            ? 'bg-gradient-to-b from-[#252525] to-[#1C1C1C] border-[#2E2E2E] text-[#D1D5DB]'
            : 'bg-gradient-to-b from-[#FAFAFA] to-[#ECEEF1] border-[#DCE0E5] text-[#333333]'
        }`}
      >
        {/* Left: App Logo & Title */}
        <div data-tauri-drag-region className="flex items-center space-x-2">
          <img
            src={appIcon}
            alt="RedCaso"
            className="w-4 h-4 object-contain pointer-events-none"
          />
          <span className={`font-semibold tracking-tight text-[11px] ${isDark ? 'text-white' : 'text-[#1F2937]'}`}>
            RedCaso
          </span>
          <span className="text-[9px] text-[#6B7280] font-mono">
            v1.0.0
          </span>
        </div>

        {/* Center: Window Drag Zone */}
        <div data-tauri-drag-region className="flex-1 h-full mx-4" />

        {/* Right: Window Controls */}
        <div className="flex items-center h-full -mr-2.5">
          <button
            onClick={handleMinimize}
            title="Minimize"
            className={`h-7 w-10 flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'hover:bg-[#333333] active:bg-[#404040] text-[#AAAAAA] hover:text-white'
                : 'hover:bg-[#E5E7EB] active:bg-[#D1D5DB] text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            <Minus size={12} />
          </button>
          <button
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
            className={`h-7 w-10 flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'hover:bg-[#333333] active:bg-[#404040] text-[#AAAAAA] hover:text-white'
                : 'hover:bg-[#E5E7EB] active:bg-[#D1D5DB] text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            {isMaximized ? <Copy size={10} /> : <Square size={10} />}
          </button>
          <button
            onClick={handleClose}
            title="Close"
            className={`h-7 w-11 flex items-center justify-center hover:bg-[#E81123] active:bg-[#BF0F1D] hover:text-white transition-colors cursor-pointer ${
              isDark ? 'text-[#AAAAAA]' : 'text-[#4B5563]'
            }`}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 2. Menu Bar Strip (Picasa 3 style: File, Edit, View, Folder, Picture, Create, Tools, Help) */}
      <div
        ref={menuContainerRef}
        className={`h-6 px-2 flex items-center justify-between border-b text-[11px] relative transition-colors ${
          isDark
            ? 'bg-[#181818] border-[#2A2A2A] text-[#CCCCCC]'
            : 'bg-[#F2F4F7] border-[#D5D9DC] text-[#2D3748]'
        }`}
      >
        {/* Left: Dropdown Menus */}
        <div className="flex items-center space-x-0.5">
          {menuItems.map((menuKey) => {
            const isOpen = activeMenu === menuKey;
            return (
              <div key={menuKey} className="relative">
                <button
                  type="button"
                  onClick={() => setActiveMenu(isOpen ? null : menuKey)}
                  onMouseEnter={() => {
                    if (activeMenu !== null) {
                      setActiveMenu(menuKey);
                    }
                  }}
                  className={`px-2 py-0.5 font-medium transition-colors cursor-pointer border ${
                    isOpen
                      ? isDark
                        ? 'bg-[#0078D4] text-white border-[#0078D4]'
                        : 'bg-[#0078D4] text-white border-[#0078D4]'
                      : isDark
                      ? 'border-transparent hover:bg-[#2A2A2A] hover:text-white'
                      : 'border-transparent hover:bg-[#E2E6EA] hover:text-[#111827]'
                  }`}
                >
                  {menuKey}
                </button>

                {/* Dropdown Menu Container */}
                {isOpen && (
                  <div
                    className={`absolute left-0 top-full mt-0.5 z-50 min-w-[220px] py-1 border shadow-xl animate-in fade-in duration-100 ${
                      isDark
                        ? 'bg-[#202020] border-[#383838] text-[#E0E0E0]'
                        : 'bg-white border-[#C7CCD1] text-[#1F2937]'
                    }`}
                  >
                    {menuKey === 'File' && (
                      <>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onTriggerScan) onTriggerScan();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <FolderSync size={13} />
                            <span>Scan PC for Photos (C:, D:, E:)</span>
                          </div>
                          <span className="text-[10px] opacity-60 font-mono">Ctrl+S</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onTriggerScan) onTriggerScan();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <FolderOpen size={13} />
                          <span>Add Folder to RedCaso...</span>
                        </button>
                        <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            setShowGoogleModal(true);
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <Cloud size={13} className="text-[#0078D4]" />
                          <span>Sync Photos to Google Photos...</span>
                        </button>
                        <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                        <button
                          onClick={handleClose}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#E81123] hover:text-white' : 'hover:bg-[#E81123] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <X size={13} />
                            <span>Exit</span>
                          </div>
                          <span className="text-[10px] opacity-60 font-mono">Alt+F4</span>
                        </button>
                      </>
                    )}

                    {menuKey === 'Edit' && (
                      <>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onSelectAllPhotos) onSelectAllPhotos();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <span>Select All Photos</span>
                          <span className="text-[10px] opacity-60 font-mono">Ctrl+A</span>
                        </button>
                        <button
                          onClick={() => setActiveMenu(null)}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <span>Deselect All</span>
                          <span className="text-[10px] opacity-60 font-mono">Esc</span>
                        </button>
                        <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                        <button
                          onClick={() => {
                            if (selectedMedia) {
                              navigator.clipboard.writeText(selectedMedia.file_path);
                            }
                            setActiveMenu(null);
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <span>Copy File Path</span>
                          <span className="text-[10px] opacity-60 font-mono">Ctrl+C</span>
                        </button>
                      </>
                    )}

                    {menuKey === 'View' && (
                      <>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onSelectAllPhotos) onSelectAllPhotos();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <HardDrive size={13} />
                            <span>All Photos ({totalPhotos})</span>
                          </div>
                          <span className="text-[10px] opacity-60 font-mono">Ctrl+1</span>
                        </button>
                        <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                        <button
                          onClick={() => {
                            if (onSortChange) onSortChange('date');
                            setActiveMenu(null);
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Calendar size={13} />
                            <span>Sort by Date Taken</span>
                          </div>
                          {sortBy === 'date' && <Check size={12} className="text-[#0078D4]" />}
                        </button>
                        <button
                          onClick={() => {
                            if (onSortChange) onSortChange('name');
                            setActiveMenu(null);
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Type size={13} />
                            <span>Sort by File Name</span>
                          </div>
                          {sortBy === 'name' && <Check size={12} className="text-[#0078D4]" />}
                        </button>
                        <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                        <button
                          onClick={handleToggleFullscreen}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Maximize2 size={13} />
                            <span>Toggle Full Screen</span>
                          </div>
                          <span className="text-[10px] opacity-60 font-mono">F11</span>
                        </button>
                        {onToggleTheme && (
                          <button
                            onClick={() => {
                              onToggleTheme();
                              setActiveMenu(null);
                            }}
                            className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                              isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              {isDark ? <Sun size={13} /> : <Moon size={13} />}
                              <span>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                            </div>
                          </button>
                        )}
                      </>
                    )}

                    {menuKey === 'Folder' && (
                      <>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onTriggerScan) onTriggerScan();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <FolderSync size={13} />
                          <span>Scan Drives (C:, D:, E:)</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            setShowGoogleModal(true);
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <Cloud size={13} className="text-[#0078D4]" />
                          <span>Google Photos Sync Settings...</span>
                        </button>
                      </>
                    )}

                    {menuKey === 'Picture' && (
                      <>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onOpenViewer) onOpenViewer();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <ImageIcon size={13} />
                            <span>Open in Picasa Photo Viewer</span>
                          </div>
                          <span className="text-[10px] opacity-60 font-mono">Enter</span>
                        </button>
                        <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onOpenViewer) onOpenViewer();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <Sparkles size={13} className="text-[#EAA300]" />
                          <span>&quot;I&apos;m Feeling Lucky&quot; Auto Fix</span>
                        </button>
                      </>
                    )}

                    {menuKey === 'Create' && (
                      <>
                        <button
                          onClick={() => setActiveMenu(null)}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <FolderOpen size={13} />
                          <span>New Album...</span>
                        </button>
                        <button
                          onClick={() => setActiveMenu(null)}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <Sparkles size={13} />
                          <span>Picture Collage...</span>
                        </button>
                      </>
                    )}

                    {menuKey === 'Tools' && (
                      <>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            if (onTriggerScan) onTriggerScan();
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <FolderSync size={13} />
                          <span>Folder Manager & Scanner...</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            setShowGoogleModal(true);
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <Cloud size={13} className="text-[#0078D4]" />
                          <span>Google Photos Sync Manager...</span>
                        </button>
                        {onClearCatalog && (
                          <>
                            <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                            <button
                              onClick={() => {
                                setActiveMenu(null);
                                onClearCatalog();
                              }}
                              className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer text-[#DC2626] transition-colors ${
                                isDark ? 'hover:bg-[#DC2626] hover:text-white' : 'hover:bg-[#DC2626] hover:text-white'
                              }`}
                            >
                              <Trash2 size={13} />
                              <span>Reset & Clear Database...</span>
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {menuKey === 'Help' && (
                      <>
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            window.open('https://github.com/nishantkumrmishra/RedCaso', '_blank');
                          }}
                          className={`w-full px-3 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <ExternalLink size={13} />
                            <span>Visit GitHub Repository</span>
                          </div>
                        </button>
                        <div className={`my-1 border-t ${isDark ? 'border-[#333333]' : 'border-[#E5E7EB]'}`} />
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            setShowAboutModal(true);
                          }}
                          className={`w-full px-3 py-1.5 flex items-center space-x-2 text-left cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#0078D4] hover:text-white'
                          }`}
                        >
                          <Info size={13} className="text-[#0078D4]" />
                          <span>About RedCaso v1.0.0</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Search + "Sign in with Google Account" Link + Theme */}
        <div className="flex items-center space-x-3.5">
          {/* Integrated Quick Search */}
          <div className="relative flex items-center">
            <Search
              size={11}
              className={`absolute left-2 pointer-events-none ${isDark ? 'text-[#777777]' : 'text-[#888888]'}`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search library..."
              className={`w-36 md:w-48 text-[10px] pl-6 pr-2 py-0.5 outline-none border transition-all ${
                isDark
                  ? 'bg-[#222222] border-[#383838] focus:border-[#0078D4] text-white placeholder-[#777777]'
                  : 'bg-white border-[#C7CCD1] focus:border-[#0078D4] text-[#1A1A1A] placeholder-[#9CA3AF]'
              }`}
            />
          </div>

          {/* Classic Picasa "Sign in with Google Account" blue hyperlink */}
          <button
            type="button"
            onClick={() => setShowGoogleModal(true)}
            className={`text-[11px] font-medium cursor-pointer transition-colors underline ${
              isDark
                ? 'text-[#60CDFF] hover:text-[#99DDFF]'
                : 'text-[#0B57D0] hover:text-[#0842A0]'
            }`}
          >
            {googleConnected ? 'Google Account (Active)' : 'Sign in with Google Account'}
          </button>

          {/* Theme Toggle */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`p-1 cursor-pointer transition-colors ${
                isDark
                  ? 'text-[#AAAAAA] hover:text-white hover:bg-[#2A2A2A]'
                  : 'text-[#555555] hover:text-[#111827] hover:bg-[#E2E6EA]'
              }`}
            >
              {isDark ? <Sun size={12} /> : <Moon size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* 3. Google Account & Sync Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-[420px] border shadow-2xl p-5 select-none ${
              isDark ? 'bg-[#1E1E1E] border-[#383838] text-white' : 'bg-white border-[#D1D5DB] text-[#111827]'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4 border-inherit">
              <div className="flex items-center space-x-2">
                <Cloud size={18} className="text-[#0078D4]" />
                <h3 className="font-semibold text-sm">Google Photos Sync</h3>
              </div>
              <button
                onClick={() => setShowGoogleModal(false)}
                className="p-1 hover:bg-[#E5E7EB] dark:hover:bg-[#2C2C2C] text-[#6B7280] dark:text-[#AAAAAA] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div
                className={`p-3 border flex items-center space-x-3 ${
                  isDark ? 'bg-[#252525] border-[#333333]' : 'bg-[#F9FAFB] border-[#E5E7EB]'
                }`}
              >
                <div className="w-8 h-8 bg-[#0078D4] text-white font-bold flex items-center justify-center text-sm">
                  G
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-xs flex items-center space-x-1.5">
                    <span>Google Account Connected</span>
                    <ShieldCheck size={13} className="text-[#107C41]" />
                  </div>
                  <div className="text-[11px] text-[#6B7280] dark:text-[#888888]">
                    Syncing local albums directly to Google Photos
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Auto-sync detected folders:</span>
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                    className="accent-[#0078D4] cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between text-[#6B7280] dark:text-[#888888] text-[11px]">
                  <span>Library coverage:</span>
                  <span>{totalFolders} folders ({totalPhotos} photos)</span>
                </div>
              </div>

              <div className="pt-3 border-t border-inherit flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setGoogleConnected(!googleConnected)}
                  className={`px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors ${
                    googleConnected
                      ? 'border-[#F87171] text-[#DC2626] hover:bg-[#FEE2E2] dark:hover:bg-[#3B1515]'
                      : 'border-[#0078D4] bg-[#0078D4] text-white hover:bg-[#106EBE]'
                  }`}
                >
                  {googleConnected ? 'Disconnect Account' : 'Connect Google Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold bg-[#0078D4] hover:bg-[#106EBE] text-white cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. About RedCaso Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-[400px] border shadow-2xl p-5 select-none ${
              isDark ? 'bg-[#1E1E1E] border-[#383838] text-white' : 'bg-white border-[#D1D5DB] text-[#111827]'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4 border-inherit">
              <div className="flex items-center space-x-2.5">
                <img src={appIcon} alt="RedCaso" className="w-5 h-5 object-contain" />
                <h3 className="font-semibold text-sm">About RedCaso</h3>
              </div>
              <button
                onClick={() => setShowAboutModal(false)}
                className="p-1 hover:bg-[#E5E7EB] dark:hover:bg-[#2C2C2C] text-[#6B7280] dark:text-[#AAAAAA] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="font-semibold text-sm text-[#0078D4]">
                RedCaso Desktop Photo Organizer & Sync
              </div>
              <p className="text-[#6B7280] dark:text-[#999999] leading-relaxed">
                A high-performance photo catalog and Google Photos synchronization manager inspired by Google Picasa 3. Built with Tauri v2, Rust, and React.
              </p>
              <div className="bg-[#F3F4F6] dark:bg-[#252525] p-2.5 space-y-1 font-mono text-[11px] text-[#4B5563] dark:text-[#AAAAAA]">
                <div>Version: 1.0.0 Release</div>
                <div>Engine: Tauri v2 + SQLite Local Catalog</div>
                <div>Memory Target: &lt;40 MB Low Footprint</div>
              </div>
              <div className="pt-3 border-t border-inherit flex items-center justify-between">
                <a
                  href="https://github.com/nishantkumrmishra/RedCaso"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#0078D4] hover:underline flex items-center space-x-1"
                >
                  <span>GitHub Repository</span>
                  <ExternalLink size={11} />
                </a>
                <button
                  type="button"
                  onClick={() => setShowAboutModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold bg-[#0078D4] hover:bg-[#106EBE] text-white cursor-pointer"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
