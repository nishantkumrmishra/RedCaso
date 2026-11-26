import React, { useState, useRef, useMemo, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFluentDialog } from './FluentDialog';
import {
  LayoutGrid,
  List as ListIcon,
  PanelRight,
  ChevronDown,
  Check,
  User,
  UserPlus,
  ChevronRight,
  Folder,
  Copy,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { MediaRecord, FolderRecord, CharacterRecord } from '../types';

interface GalleryRowItem {
  media: MediaRecord;
  width: number;
  height: number;
  aspectRatio: number;
}

interface GalleryRow {
  items: GalleryRowItem[];
  height: number;
}


interface ModernGalleryProps {
  media: MediaRecord[];
  folders: FolderRecord[];
  characters: CharacterRecord[];
  unnamedFaceCount?: number;
  title?: string;
  subtitle?: string;
  selectedFolderId: number | null;
  onSelectFolder: (id: number | null) => void;
  selectedMedia: MediaRecord | null;
  onSelectMedia: (m: MediaRecord) => void;
  onOpenViewer: (m: MediaRecord) => void;
  sortBy: 'date' | 'name' | 'size';
  onSortChange: (sort: 'date' | 'name' | 'size') => void;
  isDetailsOpen: boolean;
  onToggleDetails: () => void;
  onOpenPeopleView: () => void;
  onSelectCharacter?: (name: string) => void;
  isDark?: boolean;
  onRefresh?: () => void;
}

export const ModernGallery: React.FC<ModernGalleryProps> = ({
  media,
  folders,
  characters,
  unnamedFaceCount = 0,
  title = 'All photos',
  subtitle = 'Your memories, together in one place.',
  selectedFolderId,
  onSelectFolder,
  selectedMedia,
  onSelectMedia,
  onOpenViewer,
  sortBy,
  onSortChange,
  isDetailsOpen,
  onToggleDetails,
  onOpenPeopleView,
  onSelectCharacter,
  onRefresh,
}) => {
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(1000);
  const { confirm } = useFluentDialog();

  // Context Menu state
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [contextItem, setContextItem] = useState<MediaRecord | null>(null);

  // Selected folder object
  const currentFolder = folders.find((f) => f.id === selectedFolderId);

  const parentRef = useRef<HTMLDivElement>(null);

  // Measure container width responsively to fill 100% of available space
  useEffect(() => {
    if (!parentRef.current) return;
    const updateWidth = () => {
      if (parentRef.current) {
        // clientWidth is available inner width excluding scrollbars; px-6 is 48px padding
        const w = parentRef.current.clientWidth - 48;
        if (w > 200) {
          setContainerWidth(w);
        }
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(parentRef.current);
    return () => ro.disconnect();
  }, []);

  // Justified Aspect-Ratio Gallery Row Partitioner
  const gap = 12; // 12px clean gap between all photos
  const targetRowHeight = 195; // Natural height for photo rows

  const rows: GalleryRow[] = useMemo(() => {
    if (media.length === 0) return [];

    if (viewStyle === 'list') {
      return media.map((item) => ({
        items: [
          {
            media: item,
            width: containerWidth,
            height: 56,
            aspectRatio: 1,
          },
        ],
        height: 56,
      }));
    }

    const result: GalleryRow[] = [];
    let currentRow: { media: MediaRecord; aspect: number }[] = [];
    let currentAspectSum = 0;

    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      let rawAspect = 1.333; // 4:3 default fallback
      if (item.width && item.height && item.width > 0 && item.height > 0) {
        rawAspect = item.width / item.height;
      }
      // Clamp aspect ratio between 0.48 (portrait 9:16) and 2.6 (ultra-wide panorama)
      const aspect = Math.max(0.48, Math.min(2.6, rawAspect));

      currentRow.push({ media: item, aspect });
      currentAspectSum += aspect;

      const totalGaps = (currentRow.length - 1) * gap;
      const rowWidthAtTarget = currentAspectSum * targetRowHeight + totalGaps;

      // Close row once it fills the container width (at least 2 items)
      if (rowWidthAtTarget >= containerWidth && currentRow.length >= 2) {
        const availableWidth = containerWidth - totalGaps;
        let rowHeight = Math.round(availableWidth / currentAspectSum);
        // Clamp row height within visually balanced bounds
        rowHeight = Math.max(140, Math.min(250, rowHeight));

        let remainingWidth = availableWidth;
        const items: GalleryRowItem[] = [];
        for (let j = 0; j < currentRow.length; j++) {
          const entry = currentRow[j];
          if (j === currentRow.length - 1) {
            const w = Math.max(50, remainingWidth);
            items.push({
              media: entry.media,
              width: w,
              height: rowHeight,
              aspectRatio: entry.aspect,
            });
          } else {
            const w = Math.round((entry.aspect / currentAspectSum) * availableWidth);
            remainingWidth -= w;
            items.push({
              media: entry.media,
              width: w,
              height: rowHeight,
              aspectRatio: entry.aspect,
            });
          }
        }

        result.push({ items, height: rowHeight });
        currentRow = [];
        currentAspectSum = 0;
      }
    }

    // Process leftover photos in the final row
    if (currentRow.length > 0) {
      const totalGaps = (currentRow.length - 1) * gap;
      const rowWidthAtTarget = currentAspectSum * targetRowHeight + totalGaps;

      if (rowWidthAtTarget >= containerWidth * 0.75) {
        // If final row is nearly full, justify it flush
        const availableWidth = containerWidth - totalGaps;
        let rowHeight = Math.round(availableWidth / currentAspectSum);
        rowHeight = Math.max(140, Math.min(250, rowHeight));

        let remainingWidth = availableWidth;
        const items: GalleryRowItem[] = [];
        for (let j = 0; j < currentRow.length; j++) {
          const entry = currentRow[j];
          if (j === currentRow.length - 1) {
            const w = Math.max(50, remainingWidth);
            items.push({
              media: entry.media,
              width: w,
              height: rowHeight,
              aspectRatio: entry.aspect,
            });
          } else {
            const w = Math.round((entry.aspect / currentAspectSum) * availableWidth);
            remainingWidth -= w;
            items.push({
              media: entry.media,
              width: w,
              height: rowHeight,
              aspectRatio: entry.aspect,
            });
          }
        }
        result.push({ items, height: rowHeight });
      } else {
        // Left-align short final row with natural widths at targetRowHeight
        const rowHeight = targetRowHeight;
        const items: GalleryRowItem[] = currentRow.map((entry) => ({
          media: entry.media,
          width: Math.round(entry.aspect * rowHeight),
          height: rowHeight,
          aspectRatio: entry.aspect,
        }));
        result.push({ items, height: rowHeight });
      }
    }

    return result;
  }, [media, containerWidth, gap, targetRowHeight, viewStyle]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.height || targetRowHeight) + gap,
    overscan: 3,
  });

  // Calculate dominant date label
  const dateLabel = useMemo(() => {
    if (media.length === 0) return 'Photos';
    const firstDate = media[0]?.date_taken;
    if (firstDate) {
      try {
        const d = new Date(firstDate);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      } catch {
        // fallback
      }
    }
    return 'Library Photos';
  }, [media]);

  // Context menu actions
  const handleOpenPhoto = () => {
    const target = contextItem || selectedMedia;
    if (target) onOpenViewer(target);
    setContextMenuPos(null);
  };

  const handleRevealInExplorer = () => {
    const target = contextItem || selectedMedia;
    if (target && target.file_path) {
      invoke('reveal_in_explorer', { filePath: target.file_path }).catch(console.error);
    }
    setContextMenuPos(null);
  };

  const handleCopyPath = () => {
    const target = contextItem || selectedMedia;
    if (target && target.file_path) {
      navigator.clipboard.writeText(target.file_path).catch(console.error);
    }
    setContextMenuPos(null);
  };

  const handleDeletePhoto = async () => {
    const target = contextItem || selectedMedia;
    if (target && target.file_path) {
      const confirmed = await confirm({
        title: 'Remove Photo',
        message: `Are you sure you want to remove "${target.file_name}" from the catalog? (The original photo file on disk will not be deleted).`,
        confirmLabel: 'Remove from Catalog',
        cancelLabel: 'Cancel',
        isDestructive: true,
      });
      if (confirmed) {
        try {
          await invoke('delete_media', { filePath: target.file_path });
          if (onRefresh) onRefresh();
        } catch (err) {
          console.error('Failed to delete media:', err);
        }
      }
    }
    setContextMenuPos(null);
  };

  return (
    <div
      className="flex-1 flex flex-col min-w-0 select-none overflow-hidden bg-white text-[#242424] relative"
      onClick={() => setContextMenuPos(null)}
    >
      {/* 1. Header Area */}
      <div className="px-6 pt-5 pb-2 shrink-0">
        <h1 className="text-2xl text-[#242424]">{title}</h1>
        <p className="text-[13px] text-[#616161] mt-0.5">{subtitle}</p>
      </div>

      {/* 2. Filter & Toolbar Bar */}
      <div className="px-6 py-2 border-b border-[#E5E5E5] flex items-center justify-between gap-3 text-xs shrink-0">
        {/* Left: Folder Filter & Photos Chip */}
        <div className="flex items-center space-x-2">
          {/* All folders Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowFolderDropdown(!showFolderDropdown);
              }}
              className="h-[30px] px-3 rounded-[4px] bg-[#F5F5F5] border border-[#D1D1D1] hover:bg-slate-100 flex items-center space-x-2 text-[#242424] transition-colors cursor-pointer"
            >
              <span>{currentFolder ? currentFolder.folder_name : 'All folders'}</span>
              <ChevronDown size={13} className="text-[#616161]" />
            </button>

            {showFolderDropdown && (
              <div
                className="absolute left-0 mt-1 w-52 bg-white border border-[#D1D1D1] rounded-[6px] shadow-xl py-1 z-40 max-h-60 overflow-y-auto text-[#242424]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectFolder(null);
                    setShowFolderDropdown(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#EDF5FD] hover:text-[#0067C0] flex items-center justify-between cursor-pointer"
                >
                  <span>All folders</span>
                  {selectedFolderId === null && <Check size={12} />}
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onSelectFolder(f.id);
                      setShowFolderDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#EDF5FD] hover:text-[#0067C0] flex items-center justify-between cursor-pointer"
                  >
                    <span className="truncate max-w-[150px]">{f.folder_name}</span>
                    {selectedFolderId === f.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Photos Chip */}
          <div className="h-[30px] px-3 rounded-[4px] bg-[#EDF4FA] text-[#0067C0] flex items-center space-x-1.5 shadow-2xs">
            <span>Photos</span>
            <Check size={13} strokeWidth={2} />
          </div>
        </div>

        {/* Right: Sort & View Switchers */}
        <div className="flex items-center space-x-3">
          {/* Sort Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSortDropdown(!showSortDropdown);
              }}
              className="flex items-center space-x-1 text-xs text-[#242424] hover:text-[#0067C0] cursor-pointer"
            >
              <span>
                Sort: {sortBy === 'date' ? 'Date taken' : sortBy === 'name' ? 'Name' : 'File size'}
              </span>
              <ChevronDown size={13} className="text-[#616161]" />
            </button>

            {showSortDropdown && (
              <div
                className="absolute right-0 mt-1 w-44 bg-white border border-[#D1D1D1] rounded-[6px] shadow-xl py-1 z-40 text-[#242424]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSortChange('date');
                    setShowSortDropdown(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#EDF5FD] hover:text-[#0067C0] flex items-center justify-between cursor-pointer"
                >
                  <span>Date taken</span>
                  {sortBy === 'date' && <Check size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSortChange('name');
                    setShowSortDropdown(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#EDF5FD] hover:text-[#0067C0] flex items-center justify-between cursor-pointer"
                >
                  <span>File name</span>
                  {sortBy === 'name' && <Check size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSortChange('size');
                    setShowSortDropdown(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#EDF5FD] hover:text-[#0067C0] flex items-center justify-between cursor-pointer"
                >
                  <span>File size</span>
                  {sortBy === 'size' && <Check size={12} />}
                </button>
              </div>
            )}
          </div>

          {/* View toggle buttons */}
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setViewStyle('grid')}
              title="Grid view"
              className={`p-1.5 rounded-[4px] transition-colors cursor-pointer ${
                viewStyle === 'grid' ? 'bg-[#F0F0F0] text-[#242424]' : 'hover:bg-slate-100 text-[#616161]'
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('list')}
              title="List view"
              className={`p-1.5 rounded-[4px] transition-colors cursor-pointer ${
                viewStyle === 'list' ? 'bg-[#F0F0F0] text-[#242424]' : 'hover:bg-slate-100 text-[#616161]'
              }`}
            >
              <ListIcon size={15} />
            </button>
            <button
              type="button"
              onClick={onToggleDetails}
              title={isDetailsOpen ? 'Hide photo details' : 'Show photo details'}
              className={`p-1.5 rounded-[4px] transition-colors cursor-pointer ${
                isDetailsOpen ? 'bg-[#EDF4FA] text-[#0067C0]' : 'hover:bg-slate-100 text-[#616161]'
              }`}
            >
              <PanelRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Horizontal People Strip */}
      <div className="px-6 py-3 border-b border-[#E5E5E5] flex items-center justify-between gap-4 shrink-0 bg-white">
        {/* Real Named Characters on Left */}
        <div className="flex items-center space-x-6 overflow-x-auto">
          {characters.length > 0 ? (
            characters.slice(0, 6).map((char) => (
              <div
                key={char.name}
                onClick={() => {
                  if (onSelectCharacter) onSelectCharacter(char.name);
                }}
                className="flex items-center space-x-2.5 cursor-pointer group"
              >
                <div className="w-[36px] h-[36px] rounded-full overflow-hidden border border-[#D0D0D0] group-hover:border-[#0067C0] transition-colors shrink-0 bg-slate-100 flex items-center justify-center text-[#0067C0]">
                  <User size={18} />
                </div>
                <div className="leading-tight">
                  <span className="text-xs text-[#242424] block group-hover:text-[#0067C0] transition-colors">
                    {char.name}
                  </span>
                  <span className="text-[11px] text-[#616161]">
                    {char.count} {char.count === 1 ? 'photo' : 'photos'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center space-x-2 text-xs text-[#616161]">
              <User size={15} className="text-[#8C8C8C]" />
              <span>Face recognition ready</span>
            </div>
          )}
        </div>

        {/* Action Card on Right */}
        <button
          type="button"
          onClick={onOpenPeopleView}
          className="h-[36px] px-4 rounded-[6px] bg-[#EDF5FD] hover:bg-[#E1EFFF] border border-[#D0E3F7] text-[#0067C0] flex items-center space-x-2 text-xs transition-colors cursor-pointer shrink-0 shadow-2xs"
        >
          <UserPlus size={15} />
          <span>
            {unnamedFaceCount > 0
              ? `${unnamedFaceCount} faces waiting for a name`
              : 'Review detected people'}
          </span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 4. Full-Width Virtualized Gallery Scrollable Area */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {media.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-base text-[#242424]">No photos found</span>
            <p className="text-xs text-[#767676] max-w-sm">
              No photos match your current filter. Add a monitored folder or reset filters to view photos.
            </p>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {/* Date Group Header */}
            <div className="space-y-1">
              <div className="flex items-baseline space-x-2">
                <h2 className="text-[15px] text-[#242424]">{dateLabel}</h2>
                <span className="text-[13px] text-[#767676]">
                  {media.length.toLocaleString()} photos
                </span>
              </div>
              <div className="w-full h-[1px] bg-[#EBEBEB]" />
            </div>

            {/* Virtualized Container spanning 100% full width */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${row.height}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      display: 'flex',
                      gap: `${gap}px`,
                    }}
                  >
                    {row.items.map(({ media: item, width, height }) => {
                      const isSelected = selectedMedia?.id === item.id;
                      const imgSrc = item.file_path && !item.file_path.startsWith('sample://')
                        ? convertFileSrc(item.thumbnail_path || item.file_path)
                        : '';

                      if (viewStyle === 'list') {
                        return (
                          <div
                            key={item.id}
                            style={{ width: `${width}px`, height: `${height}px` }}
                            onClick={() => onSelectMedia(item)}
                            onDoubleClick={() => onOpenViewer(item)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectMedia(item);
                              setContextItem(item);
                              setContextMenuPos({ x: e.clientX, y: e.clientY });
                            }}
                            className={`w-full px-3 rounded-[4px] flex items-center justify-between border cursor-pointer font-normal transition-colors ${
                              isSelected
                                ? 'bg-[#EDF5FD] border-[#0067C0]'
                                : 'bg-white border-[#EBEBEB] hover:bg-[#F9FAFB]'
                            }`}
                          >
                            <div className="flex items-center space-x-3 truncate">
                              <div className="w-9 h-9 rounded-[3px] overflow-hidden bg-slate-100 shrink-0 border border-[#E0E0E0]">
                                {imgSrc ? (
                                  <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-[#767676]">...</div>
                                )}
                              </div>
                              <div className="truncate text-left">
                                <span className="text-xs text-[#242424] block truncate font-normal">{item.file_name}</span>
                                <span className="text-[11px] text-[#767676] font-normal">
                                  {item.date_taken || 'Unknown date'} {item.width ? `• ${item.width}×${item.height}` : ''}
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-[18px] h-[18px] rounded-full bg-[#0067C0] flex items-center justify-center text-white shrink-0 shadow-2xs">
                                <Check size={11} strokeWidth={2.5} />
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          style={{
                            width: `${width}px`,
                            height: `${height}px`,
                          }}
                          onClick={() => onSelectMedia(item)}
                          onDoubleClick={() => onOpenViewer(item)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectMedia(item);
                            setContextItem(item);
                            setContextMenuPos({ x: e.clientX, y: e.clientY });
                          }}
                          className={`rounded-[3px] overflow-hidden bg-[#F1F3F5] transition-all cursor-pointer relative group shrink-0 ${
                            isSelected
                              ? 'ring-2 ring-[#0067C0] shadow-sm'
                              : 'border border-[#E5E5E5] hover:border-[#CBD5E1] shadow-2xs hover:shadow-xs'
                          }`}
                          title={item.file_name}
                        >
                          {/* Image perfectly fills card according to natural aspect ratio */}
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover rounded-[3px] select-none pointer-events-none transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[11px] text-[#767676]">
                              Loading...
                            </div>
                          )}

                          {/* Top-Right Circular Blue Checkmark for Selected Card */}
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-[20px] h-[20px] rounded-full bg-[#0067C0] flex items-center justify-center text-white shadow-xs z-10">
                              <Check size={12} strokeWidth={2.5} />
                            </div>
                          )}

                          {/* Bottom-Left Pill Badge if character or person tag assigned */}
                          {item.character_tag && (
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-[4px] bg-white/95 backdrop-blur-2xs text-[#242424] text-[11px] flex items-center space-x-1 shadow-xs z-10 font-normal">
                              <User size={11} className="text-[#616161]" />
                              <span>{item.character_tag}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Gallery Footer */}
            <div className="pt-6 pb-4 flex items-center justify-between text-[11px] text-[#767676]">
              <span>Showing {media.length.toLocaleString()} photos</span>
              <span>Full screen gallery</span>
            </div>
          </div>
        )}
      </div>

      {/* 5. Context Menu */}
      {contextMenuPos && (
        <div
          style={{
            left: `${Math.min(contextMenuPos.x, window.innerWidth - 290)}px`,
            top: `${Math.min(contextMenuPos.y, window.innerHeight - 360)}px`,
          }}
          className="fixed z-50 w-[270px] bg-[#FCFCFC] border border-[#D8D8D8] rounded-[8px] shadow-2xl py-1.5 text-xs select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Open in Editor */}
          <button
            type="button"
            onClick={handleOpenPhoto}
            className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-[#F2F2F2] cursor-pointer text-[#242424]"
          >
            <div className="flex items-center space-x-2.5">
              <ExternalLink size={14} className="text-[#616161]" />
              <span>Open in Photo Editor</span>
            </div>
            <span className="text-[11px] text-[#767676]">Enter</span>
          </button>

          <div className="h-[1px] bg-[#E6E6E6] my-1 mx-2" />

          {/* Name People */}
          <button
            type="button"
            onClick={() => {
              setContextMenuPos(null);
              onOpenPeopleView();
            }}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[#F2F2F2] cursor-pointer text-[#242424]"
          >
            <UserPlus size={14} className="text-[#616161]" />
            <span>Name people</span>
          </button>

          {/* Show in File Explorer */}
          <button
            type="button"
            onClick={handleRevealInExplorer}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[#F2F2F2] cursor-pointer text-[#242424]"
          >
            <Folder size={14} className="text-[#616161]" />
            <span>Show in File Explorer</span>
          </button>

          {/* Copy path */}
          <button
            type="button"
            onClick={handleCopyPath}
            className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-[#F2F2F2] cursor-pointer text-[#242424]"
          >
            <div className="flex items-center space-x-2.5">
              <Copy size={14} className="text-[#616161]" />
              <span>Copy path</span>
            </div>
            <span className="text-[11px] text-[#767676]">Ctrl+C</span>
          </button>

          <div className="h-[1px] bg-[#E6E6E6] my-1 mx-2" />

          {/* Delete from catalog */}
          <button
            type="button"
            onClick={handleDeletePhoto}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-red-50 text-red-600 cursor-pointer"
          >
            <Trash2 size={14} />
            <span>Remove from catalog</span>
          </button>
        </div>
      )}
    </div>
  );
};
