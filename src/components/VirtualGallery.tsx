import React, { useRef, useState, useCallback, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MediaRecord, FolderRecord } from '../types';
import { useFluentDialog } from './FluentDialog';
import { ImageCell } from './ImageCell';
import { ScrollTrack } from './ScrollTrack';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { PropertiesDialog } from './PropertiesDialog';
import {
  Folder,
  Calendar,
  Cloud,
  Play,
  Upload,
  Maximize2,
  ExternalLink,
  RotateCw,
  RotateCcw,
  Copy,
  Trash2,
  Info,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface VirtualGalleryProps {
  items: MediaRecord[];
  folders: FolderRecord[];
  onSelectMedia: (media: MediaRecord) => void;
  onToggleSync: (folderId: number, currentEnabled: boolean) => void;
  onRefreshMedia?: () => void;
  isDark?: boolean;
  viewMode?: 'photos' | 'people';
  onToggleViewMode?: (mode: 'photos' | 'people') => void;
}

interface GalleryBatch {
  key: string;
  folderId: number;
  folder: FolderRecord;
  isFirstBatch: boolean;
  totalCount: number;
  dateLabel?: string;
  images: MediaRecord[];
}

// Picasa-style Floating Timeline HUD
const FloatingTimelineHUD = memo(({
  visible,
  text,
  index,
  total,
}: {
  visible: boolean;
  text: string;
  index: number;
  total: number;
}) => {
  if (!visible) return null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 bg-[#0078D4]/95 backdrop-blur-md text-white px-4 py-2 shadow-2xl border border-white/20 flex items-center space-x-2 text-xs font-semibold animate-in fade-in zoom-in-95 pointer-events-none select-none">
      <Calendar size={14} className="text-[#60CDFF]\" />
      <span>{text || 'Photos'}</span>
      <span className="text-[#B3E0FF] text-[11px] font-mono pl-1 border-l border-white/30">
        {index} / {total}
      </span>
    </div>
  );
});
FloatingTimelineHUD.displayName = 'FloatingTimelineHUD';

// Helper to format date taken into Picasa style (e.g. "12 April 2017")
function formatPicasaDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export const VirtualGallery: React.FC<VirtualGalleryProps> = memo(({
  items,
  folders,
  onSelectMedia,
  onToggleSync,
  onRefreshMedia,
  isDark = false,
  viewMode = 'photos',
  onToggleViewMode,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const [hudState, setHudState] = useState<{
    visible: boolean;
    text: string;
    index: number;
  }>({
    visible: false,
    text: '',
    index: 1,
  });

  // Context Menu & Properties Dialog state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    media?: MediaRecord;
    folder?: FolderRecord;
  } | null>(null);

  const [propertiesMedia, setPropertiesMedia] = useState<MediaRecord | null>(null);
  const { confirm } = useFluentDialog();

  const lastScrollTop = useRef<number>(0);
  const lastScrollTime = useRef<number>(Date.now());
  const scrollStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafId = useRef<number | null>(null);

  // Group photos by folder and partition into batches for smooth virtualization
  const batches = useMemo(() => {
    if (items.length === 0) return [];

    const folderGroups = new Map<number, MediaRecord[]>();
    for (const item of items) {
      let list = folderGroups.get(item.folder_id);
      if (!list) {
        list = [];
        folderGroups.set(item.folder_id, list);
      }
      list.push(item);
    }

    const result: GalleryBatch[] = [];
    const BATCH_SIZE = 24; // 24 photos per batch keeps DOM small and fast to recycle

    for (const [folderId, folderItems] of folderGroups.entries()) {
      const folderRecord = folders.find((f) => f.id === folderId) || {
        id: folderId,
        folder_name: folderItems[0]?.file_path
          ? folderItems[0].file_path.split(/[\\/]/).slice(-2, -1)[0] || 'Photos'
          : 'Photos',
        folder_path: '',
        photo_count: folderItems.length,
        sync_enabled: false,
        last_scanned_at: '',
      };

      const dateLabel = formatPicasaDate(folderItems[0]?.date_taken) ||
        formatPicasaDate(folderRecord.last_scanned_at);

      for (let i = 0; i < folderItems.length; i += BATCH_SIZE) {
        result.push({
          key: `${folderId}_batch_${i}`,
          folderId,
          folder: folderRecord,
          isFirstBatch: i === 0,
          totalCount: folderItems.length,
          dateLabel,
          images: folderItems.slice(i, i + BATCH_SIZE),
        });
      }
    }

    return result;
  }, [items, folders]);

  // Track pixel offsets of each folder header for instant jump navigation
  const folderOffsets = useMemo(() => {
    const offsets: number[] = [];
    let currentY = 0;
    for (const batch of batches) {
      if (batch.isFirstBatch) {
        offsets.push(currentY);
      }
      const isFirst = batch.isFirstBatch;
      const count = batch.images.length || 0;
      const lines = Math.max(1, Math.ceil(count / 6));
      currentY += (isFirst ? 68 : 0) + lines * 182 + 16;
    }
    return offsets;
  }, [batches]);

  // Throttled scroll HUD indicator
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const currentTop = e.currentTarget.scrollTop;
      const now = Date.now();
      const dt = now - lastScrollTime.current;
      const dy = Math.abs(currentTop - lastScrollTop.current);

      lastScrollTop.current = currentTop;
      lastScrollTime.current = now;

      const velocity = dt > 0 ? (dy / dt) * 1000 : 0;

      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = null;
          const approxBatch = Math.min(batches.length - 1, Math.max(0, Math.floor(currentTop / 250)));
          const batch = batches[approxBatch];

          let hudText = '';
          if (batch) {
            hudText = batch.folder.folder_name;
          }

          if (velocity > 400) {
            setHudState({
              visible: true,
              text: hudText,
              index: Math.min(items.length, (approxBatch + 1) * 24),
            });
          }
        });
      }

      if (scrollStopTimer.current) clearTimeout(scrollStopTimer.current);
      scrollStopTimer.current = setTimeout(() => {
        setHudState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }, 300);
    },
    [batches, items.length]
  );

  // Dynamic measuring virtualizer with lean overscan to prevent memory bloat
  const rowVirtualizer = useVirtualizer({
    count: batches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const batch = batches[index];
      const isFirst = batch?.isFirstBatch;
      const count = batch?.images.length || 0;
      const lines = Math.max(1, Math.ceil(count / 6));
      return (isFirst ? 68 : 0) + lines * 182 + 16;
    },
    overscan: 2,
  });

  // Photo context menu items
  const photoMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu?.media) return [];
    const media = contextMenu.media;

    return [
      {
        label: 'View Fullscreen',
        icon: <Maximize2 size={13} />,
        shortcut: 'Enter',
        onClick: () => onSelectMedia(media),
      },
      {
        label: 'Locate on Disk',
        icon: <ExternalLink size={13} />,
        shortcut: 'Ctrl+O',
        onClick: () => {
          invoke('reveal_in_explorer', { filePath: media.file_path }).catch(console.error);
        },
      },
      { separator: true },
      {
        label: 'Rotate Clockwise',
        icon: <RotateCw size={13} />,
        shortcut: 'Ctrl+R',
        onClick: async () => {
          try {
            await invoke('rotate_image', { filePath: media.file_path, degrees: 90 });
            onRefreshMedia?.();
          } catch (e) {
            console.error('Rotate failed:', e);
          }
        },
      },
      {
        label: 'Rotate Counter-Clockwise',
        icon: <RotateCcw size={13} />,
        shortcut: 'Ctrl+Shift+R',
        onClick: async () => {
          try {
            await invoke('rotate_image', { filePath: media.file_path, degrees: -90 });
            onRefreshMedia?.();
          } catch (e) {
            console.error('Rotate failed:', e);
          }
        },
      },
      { separator: true },
      {
        label: 'Copy File Path',
        icon: <Copy size={13} />,
        shortcut: 'Ctrl+C',
        onClick: () => {
          navigator.clipboard.writeText(media.file_path);
        },
      },
      {
        label: 'Properties',
        icon: <Info size={13} />,
        shortcut: 'Alt+Enter',
        onClick: () => {
          setPropertiesMedia(media);
        },
      },
      { separator: true },
      {
        label: 'Remove from Library',
        icon: <Trash2 size={13} />,
        shortcut: 'Del',
        danger: true,
        onClick: async () => {
          const ok = await confirm({ title: "Remove Photo", message: `Remove "${media.file_name}" from library?`, confirmLabel: "Remove", isDestructive: true });
        if (ok) {
            try {
              await invoke('delete_media', { filePath: media.file_path });
              onRefreshMedia?.();
            } catch (e) {
              console.error('Delete failed:', e);
            }
          }
        },
      },
    ];
  }, [contextMenu, onSelectMedia, onRefreshMedia]);

  // Folder context menu items
  const folderMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu?.folder) return [];
    const folder = contextMenu.folder;

    return [
      {
        label: 'Open in File Explorer',
        icon: <ExternalLink size={13} />,
        onClick: () => {
          invoke('open_folder_in_explorer', { folderPath: folder.folder_path }).catch(console.error);
        },
      },
      {
        label: folder.sync_enabled ? 'Disable Web Sync' : 'Sync to Google Photos',
        icon: <Cloud size={13} />,
        onClick: () => {
          onToggleSync(folder.id, folder.sync_enabled);
        },
      },
      { separator: true },
      {
        label: 'Copy Folder Path',
        icon: <Copy size={13} />,
        onClick: () => {
          navigator.clipboard.writeText(folder.folder_path);
        },
      },
    ];
  }, [contextMenu, onToggleSync]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none font-sans">
        <div className="w-16 h-16 bg-[#EAA300]/10 border border-[#EAA300]/20 flex items-center justify-center mb-4">
          <Folder size={28} className="text-[#FFC83B]" />
        </div>
        <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-[#1F2937]'}`}>
          No photos found in this view
        </h3>
        <p className="text-xs text-[#6B7280] dark:text-[#888888] mt-1 max-w-sm">
          Select another folder from the left sidebar or scan drives to populate photos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden relative font-sans select-none">
      {/* Scrollable Virtual Canvas */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 scrollbar-none"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const batch = batches[virtualRow.index];
            if (!batch) return null;

            return (
              <div
                key={batch.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="pb-4"
              >
                {/* Authentic Picasa Metallic Folder Header */}
                {batch.isFirstBatch && (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, folder: batch.folder });
                    }}
                    className={`h-[48px] px-3.5 mb-3 flex items-center justify-between border-t border-b shadow-2xs ${
                      isDark
                        ? 'bg-gradient-to-b from-[#2E3135] via-[#26282B] to-[#1E2022] border-[#3B3F45] text-white'
                        : 'bg-gradient-to-b from-[#F2F4F7] via-[#E4E7EB] to-[#D5D8DC] border-[#B8BDC2] text-[#1F2937]'
                    }`}
                  >
                    {/* Left: Folder Name, Date and Photo Count */}
                    <div className="flex items-center space-x-2.5 truncate min-w-0 pr-2">
                      <Folder size={17} className="text-[#0078D4] shrink-0" />
                      <span className="font-bold text-sm tracking-tight truncate">
                        {batch.folder.folder_name}
                      </span>
                      {batch.dateLabel && (
                        <span className="text-xs text-[#6B7280] dark:text-[#AAAAAA] font-normal truncate hidden sm:inline">
                          &bull; {batch.dateLabel}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-[#6B7280] dark:text-[#888888] shrink-0">
                        ({batch.totalCount})
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (batch.images.length > 0) onSelectMedia(batch.images[0]);
                        }}
                        title="Play Slideshow"
                        className={`p-1.5 border flex items-center justify-center transition-colors cursor-pointer ${
                          isDark
                            ? 'border-[#333333] hover:bg-[#2A2A2A] text-[#CCCCCC]'
                            : 'border-[#E0E2E6] hover:bg-[#F3F4F6] text-[#4B5563]'
                        }`}
                      >
                        <Play size={12} className="fill-current text-[#107C41]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleSync(batch.folder.id, batch.folder.sync_enabled)}
                        title="Sync folder to Google Photos"
                        className={`px-2 py-1 border flex items-center space-x-1.5 text-xs transition-colors cursor-pointer ${
                          isDark
                            ? 'border-[#333333] hover:bg-[#2A2A2A] text-[#CCCCCC]'
                            : 'border-[#E0E2E6] hover:bg-[#F3F4F6] text-[#4B5563]'
                        }`}
                      >
                        <Upload size={12} />
                        <span className="text-[11px]">Upload</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Fluid Photo Flow: Equal 12px gaps between ALL photos regardless of portrait/landscape */}
                <div className="flex flex-wrap items-center gap-3">
                  {batch.images.map((media) => (
                    <ImageCell
                      key={media.id}
                      media={media}
                      onSelect={onSelectMedia}
                      onContextMenu={(e, item) => {
                        setContextMenu({ x: e.clientX, y: e.clientY, media: item });
                      }}
                      isDark={isDark}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Picasa Custom Scrollbar Navigation Track */}
      {onToggleViewMode && (
        <ScrollTrack
          containerRef={parentRef}
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
          folderOffsets={folderOffsets}
          isDark={isDark}
        />
      )}

      {/* Picasa Floating Timeline HUD */}
      <FloatingTimelineHUD
        visible={hudState.visible}
        text={hudState.text}
        index={hudState.index}
        total={items.length}
      />

      {/* Context Menu Popup */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.media ? photoMenuItems : folderMenuItems}
          onClose={() => setContextMenu(null)}
          isDark={isDark}
        />
      )}

      {/* Properties Dialog */}
      {propertiesMedia && (
        <PropertiesDialog
          media={propertiesMedia}
          onClose={() => setPropertiesMedia(null)}
          isDark={isDark}
        />
      )}
    </div>
  );
});

VirtualGallery.displayName = 'VirtualGallery';
