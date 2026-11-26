import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Clock,
  Star,
  User,
  Plus,
  Folder,
  HardDrive,
  Settings,
  Pause,
  Play,
  RotateCw,
} from 'lucide-react';
import { FolderRecord } from '../types';
import { useFluentDialog } from './FluentDialog';

interface ModernSidebarProps {
  activeTab: 'photos' | 'recently' | 'favorites' | 'people';
  onSelectTab: (tab: 'photos' | 'recently' | 'favorites' | 'people') => void;
  folders: FolderRecord[];
  selectedFolderId: number | null;
  onSelectFolder: (id: number | null) => void;
  totalPhotos: number;
  totalPeople: number;
  isDark?: boolean;
  isScanning?: boolean;
  onTriggerScan?: () => void;
  onAddFolder?: () => void;
  onOpenSettings?: () => void;
  starredCount?: number;
  faceCount?: number;
  facePercentage?: number;
  isFaceScanning?: boolean;
}

export const ModernSidebar: React.FC<ModernSidebarProps> = ({
  activeTab,
  onSelectTab,
  folders,
  selectedFolderId,
  onSelectFolder,
  totalPhotos,
  totalPeople,
  isScanning = false,
  onTriggerScan,
  onAddFolder,
  onOpenSettings,
  starredCount = 0,
  faceCount = 0,
  facePercentage = 100,
  isFaceScanning = false,
}) => {
  const [isWatchingPaused, setIsWatchingPaused] = useState(false);
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const { prompt } = useFluentDialog();

  const handleAddCollection = async () => {
    const name = await prompt({
      title: 'New Collection',
      message: 'Enter a name for your new album / collection:',
      placeholder: 'e.g. Vacation, Family',
      confirmLabel: 'Create Collection',
    });
    if (name && name.trim()) {
      setCollections((prev) => [...prev, name.trim()]);
    }
  };

  return (
    <aside className="w-[224px] shrink-0 bg-[#F3F3F3] border-r border-[#E5E5E5] flex flex-col justify-between select-none text-xs font-normal overflow-hidden">
      {/* Scrollable Nav Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Main Category Links */}
        <div className="space-y-1">
          {/* All Photos */}
          <button
            type="button"
            onClick={() => {
              onSelectFolder(null);
              setSelectedCollection(null);
              onSelectTab('photos');
            }}
            className={`w-[208px] h-[40px] px-2.5 rounded-[5px] flex items-center justify-between transition-colors cursor-pointer relative ${
              activeTab === 'photos' && selectedFolderId === null && selectedCollection === null
                ? 'bg-[#E5EDF5] text-[#0067C0]'
                : 'hover:bg-[#EAEAEA] text-[#242424]'
            }`}
          >
            {activeTab === 'photos' && selectedFolderId === null && selectedCollection === null && (
              <div className="absolute left-0 w-[3px] h-[18px] bg-[#0067C0] rounded-r-full" />
            )}
            <div className="flex items-center space-x-2.5 ml-1">
              <ImageIcon
                size={16}
                className={
                  activeTab === 'photos' && selectedFolderId === null && selectedCollection === null
                    ? 'text-[#0067C0]'
                    : 'text-[#616161]'
                }
              />
              <span>All photos</span>
            </div>
            <span className="text-[11px] text-[#616161]">
              {(totalPhotos || 0).toLocaleString()}
            </span>
          </button>

          {/* Recently added */}
          <button
            type="button"
            onClick={() => {
              onSelectFolder(null);
              setSelectedCollection(null);
              onSelectTab('recently');
            }}
            className={`w-[208px] h-[40px] px-2.5 rounded-[5px] flex items-center justify-between transition-colors cursor-pointer relative ${
              activeTab === 'recently'
                ? 'bg-[#E5EDF5] text-[#0067C0]'
                : 'hover:bg-[#EAEAEA] text-[#242424]'
            }`}
          >
            {activeTab === 'recently' && (
              <div className="absolute left-0 w-[3px] h-[18px] bg-[#0067C0] rounded-r-full" />
            )}
            <div className="flex items-center space-x-2.5 ml-1">
              <Clock
                size={16}
                className={activeTab === 'recently' ? 'text-[#0067C0]' : 'text-[#616161]'}
              />
              <span>Recently added</span>
            </div>
          </button>

          {/* Favorites */}
          <button
            type="button"
            onClick={() => {
              onSelectFolder(null);
              setSelectedCollection(null);
              onSelectTab('favorites');
            }}
            className={`w-[208px] h-[40px] px-2.5 rounded-[5px] flex items-center justify-between transition-colors cursor-pointer relative ${
              activeTab === 'favorites'
                ? 'bg-[#E5EDF5] text-[#0067C0]'
                : 'hover:bg-[#EAEAEA] text-[#242424]'
            }`}
          >
            {activeTab === 'favorites' && (
              <div className="absolute left-0 w-[3px] h-[18px] bg-[#0067C0] rounded-r-full" />
            )}
            <div className="flex items-center space-x-2.5 ml-1">
              <Star
                size={16}
                className={activeTab === 'favorites' ? 'text-[#0067C0] fill-[#0067C0]' : 'text-[#616161]'}
              />
              <span>Favorites</span>
            </div>
            {starredCount > 0 && (
              <span className="text-[11px] text-[#616161]">
                {starredCount}
              </span>
            )}
          </button>

          {/* People */}
          <button
            type="button"
            onClick={() => {
              onSelectFolder(null);
              setSelectedCollection(null);
              onSelectTab('people');
            }}
            className={`w-[208px] h-[40px] px-2.5 rounded-[5px] flex items-center justify-between transition-colors cursor-pointer relative ${
              activeTab === 'people'
                ? 'bg-[#E5EDF5] text-[#0067C0]'
                : 'hover:bg-[#EAEAEA] text-[#242424]'
            }`}
          >
            {activeTab === 'people' && (
              <div className="absolute left-0 w-[3px] h-[18px] bg-[#0067C0] rounded-r-full" />
            )}
            <div className="flex items-center space-x-2.5 ml-1">
              <User
                size={16}
                className={activeTab === 'people' ? 'text-[#0067C0]' : 'text-[#616161]'}
              />
              <span>People</span>
            </div>
            <span className="text-[11px] text-[#616161]">
              {totalPeople || 0}
            </span>
          </button>
        </div>

        {/* Collections Section */}
        {collections.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 mb-1 text-[11px] tracking-wider uppercase text-[#616161]">
              <span>Collections</span>
              <button
                type="button"
                onClick={handleAddCollection}
                className="p-1 rounded hover:bg-[#EAEAEA] text-[#616161] hover:text-[#0067C0] transition-colors cursor-pointer"
                title="New collection"
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="space-y-0.5">
              {collections.map((col) => {
                const isSel = selectedCollection === col;
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      setSelectedCollection(col);
                      onSelectFolder(null);
                      onSelectTab('photos');
                    }}
                    className={`w-[208px] h-[36px] px-2.5 rounded-[5px] flex items-center justify-between transition-colors cursor-pointer ${
                      isSel ? 'bg-[#E5EDF5] text-[#0067C0]' : 'hover:bg-[#EAEAEA] text-[#242424]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <Folder size={14} className={isSel ? 'text-[#0067C0]' : 'text-[#616161]'} />
                      <span className="truncate">{col}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Horizontal Divider */}
        <div className="w-[192px] h-[1px] bg-[#DEDEDE] mx-auto my-2" />

        {/* THIS PC / Real Indexed Folders Section */}
        <div>
          <div className="flex items-center justify-between px-3 mb-1 text-[11px] tracking-wider uppercase text-[#616161]">
            <span>This PC</span>
            <button
              type="button"
              onClick={onAddFolder || onTriggerScan}
              className="p-1 rounded hover:bg-[#EAEAEA] text-[#616161] hover:text-[#0067C0] transition-colors cursor-pointer"
              title="Add folder to scan"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="space-y-0.5">
            {folders.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-[#767676]">
                No folders indexed yet. Click &apos;+&apos; to scan.
              </div>
            ) : (
              folders.slice(0, 15).map((folder) => {
                const isSel = selectedFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      setSelectedCollection(null);
                      onSelectFolder(folder.id);
                      onSelectTab('photos');
                    }}
                    className={`w-[208px] h-[36px] px-2.5 rounded-[5px] flex items-center justify-between transition-colors cursor-pointer ${
                      isSel
                        ? 'bg-[#E5EDF5] text-[#0067C0]'
                        : 'hover:bg-[#EAEAEA] text-[#242424]'
                    }`}
                    title={folder.folder_path}
                  >
                    <div className="flex items-center space-x-2.5 truncate max-w-[140px]">
                      {folder.folder_path.includes(':') && folder.folder_path.length <= 3 ? (
                        <HardDrive size={14} className={isSel ? 'text-[#0067C0]' : 'text-[#616161]'} />
                      ) : (
                        <Folder size={14} className={isSel ? 'text-[#0067C0]' : 'text-[#616161]'} />
                      )}
                      <span className="truncate">{folder.folder_name}</span>
                    </div>
                    {folder.photo_count > 0 && (
                      <span className="text-[10px] text-[#616161] shrink-0">
                        {folder.photo_count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Watching Card & Settings */}
      <div className="p-3 border-t border-[#E5E5E5] space-y-3">
        {/* Watching & Face Detection Dynamic Status Card */}
        <div className="w-[199px] bg-white border border-[#E0E0E0] rounded-[5.5px] p-3 mx-auto shadow-xs space-y-2 font-normal">
          {isScanning ? (
            /* 1. Folder Scanning Active */
            <>
              <div className="flex items-center space-x-1.5 text-xs text-[#242424]">
                <RotateCw size={13} className="text-[#0067C0] animate-spin" />
                <span>Scanning folders...</span>
              </div>
              <p className="text-[11px] text-[#616161] leading-tight">
                Checking for new photo files...
              </p>
              <div className="w-[176px] h-[3px] bg-[#E7E7E7] rounded-full overflow-hidden">
                <div className="h-full bg-[#0067C0] w-2/3 animate-pulse rounded-full" />
              </div>
              <div className="pt-0.5 flex items-center justify-between text-[10px] text-[#616161]">
                <span>Scanning {folders.length} folders...</span>
              </div>
            </>
          ) : isFaceScanning ? (
            /* 2. Face Detection in Progress */
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs text-[#242424]">
                  <RotateCw size={13} className="text-[#0067C0] animate-spin" />
                  <span>Detecting faces...</span>
                </div>
                <span className="text-[10px] text-[#0067C0] font-mono">{facePercentage}%</span>
              </div>
              <p className="text-[11px] text-[#616161] leading-tight">
                {faceCount > 0
                  ? `Found ${faceCount} face${faceCount === 1 ? '' : 's'} so far`
                  : 'Analyzing photos for faces...'}
              </p>
              <div className="w-[176px] h-[3px] bg-[#E7E7E7] rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, Math.max(8, facePercentage))}%` }}
                  className="h-full bg-[#0067C0] transition-all duration-300 rounded-full"
                />
              </div>
              <div className="pt-0.5 flex items-center justify-between text-[10px] text-[#616161]">
                <span>On-device AI</span>
                <span>{faceCount} faces</span>
              </div>
            </>
          ) : folders.length === 0 ? (
            /* 3. No Folders Monitored */
            <>
              <div className="flex items-center space-x-1.5 text-xs text-[#242424]">
                <Folder size={13} className="text-[#888888]" />
                <span>No folders monitored</span>
              </div>
              <p className="text-[11px] text-[#767676] leading-tight">
                Click &apos;+&apos; above to index photos.
              </p>
              <div className="w-[176px] h-[3px] bg-[#E7E7E7] rounded-full" />
              <div className="pt-0.5 flex items-center justify-between text-[10px] text-[#888888]">
                <span>Idle</span>
                <span>0 folders</span>
              </div>
            </>
          ) : (
            /* 4. Idle / Watching with Found Faces */
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs text-[#242424]">
                  <RotateCw size={13} className="text-[#0067C0]" />
                  <span>
                    {isWatchingPaused
                      ? 'Watcher paused'
                      : `Watching ${folders.length} folder${folders.length > 1 ? 's' : ''}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWatchingPaused(!isWatchingPaused)}
                  title={isWatchingPaused ? 'Resume live watcher' : 'Pause live watcher'}
                  className="p-1 rounded hover:bg-slate-100 text-[#444444] cursor-pointer"
                >
                  {isWatchingPaused ? <Play size={11} /> : <Pause size={11} />}
                </button>
              </div>

              <p className="text-[11px] text-[#616161] leading-tight">
                {isWatchingPaused
                  ? `${folders.length} folder${folders.length > 1 ? 's' : ''} monitoring on hold`
                  : faceCount > 0
                  ? `Found ${faceCount} face${faceCount === 1 ? '' : 's'} ready to name`
                  : 'New photos appear automatically.'}
              </p>

              {/* Progress bar line */}
              <div className="w-[176px] h-[3px] bg-[#E7E7E7] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isWatchingPaused ? 'bg-[#888888] w-full' : 'bg-[#107C41] w-full'
                  }`}
                />
              </div>

              <div className="pt-0.5 flex items-center justify-between text-[10px] text-[#616161]">
                <span>{isWatchingPaused ? 'Paused' : 'All folders up to date'}</span>
                {faceCount > 0 && <span className="text-[#0067C0]">{faceCount} faces</span>}
              </div>
            </>
          )}
        </div>

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full px-2 py-1.5 flex items-center space-x-2 text-xs text-[#242424] hover:bg-[#EAEAEA] rounded-[4px] cursor-pointer transition-colors"
        >
          <Settings size={15} className="text-[#616161]" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
