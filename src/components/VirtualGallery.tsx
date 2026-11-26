import React, { useRef, useState, useCallback, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MediaRecord, FolderRecord } from '../types';
import { ImageCell } from './ImageCell';
import { Folder, Image as EmptyIcon, Calendar, Cloud, Play, Upload, Star } from 'lucide-react';

interface VirtualGalleryProps {
  items: MediaRecord[];
  folders: FolderRecord[];
  onSelectMedia: (media: MediaRecord) => void;
  onToggleSync: (folderId: number, currentEnabled: boolean) => void;
  isDark?: boolean;
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
      <Calendar size={14} className="text-[#60CDFF]" />
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
  isDark = false,
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
          key: `folder-${folderId}-batch-${i}`,
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
      // Estimate ~6 photos per line (170px height + 12px gap)
      const lines = Math.max(1, Math.ceil(count / 6));
      return (isFirst ? 68 : 0) + lines * 182 + 16;
    },
    overscan: 2, // Minimal 2-batch buffer prevents memory accumulation while scrolling
  });

  if (items.length === 0) {
    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center p-8 text-center font-sans ${
          isDark ? 'text-[#777777] bg-[#141414]' : 'text-[#6B7280] bg-[#ECEEF1]'
        }`}
      >
        <div
          className={`border p-8 max-w-md w-full shadow-xs ${
            isDark ? 'border-[#2C2C2C] bg-[#202020]' : 'border-[#D1D5DB] bg-white'
          }`}
        >
          <EmptyIcon size={36} className={`mx-auto mb-3 ${isDark ? 'text-[#555555]' : 'text-[#9CA3AF]'}`} />
          <p className={`text-sm font-semibold mb-1 ${isDark ? 'text-[#CCCCCC]' : 'text-[#1F2937]'}`}>
            No Photos in This View
          </p>
          <p className={`text-xs ${isDark ? 'text-[#888888]' : 'text-[#6B7280]'}`}>
            Select a folder from the sidebar or click &quot;Scan PC Drives&quot; to index your pictures.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      {/* Scrollable Gallery Container */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className={`h-full overflow-y-auto px-6 py-5 select-none transition-colors ${
          isDark ? 'bg-[#141414]' : 'bg-[#ECEEF1]'
        }`}
        style={{
          willChange: 'scroll-position',
        }}
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
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="pb-5"
              >
                {/* Picasa-style Folder Header Banner (shown on the first batch of each folder) */}
                {batch.isFirstBatch && (
                  <div
                    className={`w-full flex items-center justify-between px-4 py-2.5 mb-3 border shadow-xs transition-colors ${
                      isDark
                        ? 'bg-[#1F1F1F] border-[#2D2D2D]'
                        : 'bg-white border-[#D6D9DE]'
                    }`}
                  >
                    {/* Left: Golden Folder Icon + Name + Date */}
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-8 h-8 bg-[#EAA300]/15 border border-[#EAA300]/30 flex items-center justify-center shrink-0">
                        <Folder size={17} className="text-[#FFC83B] fill-[#FFC83B]/20" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h2
                            className={`text-sm font-bold tracking-tight truncate ${
                              isDark ? 'text-white' : 'text-[#111827]'
                            }`}
                          >
                            {batch.folder.folder_name}
                          </h2>
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 shrink-0 ${
                              isDark
                                ? 'text-[#AAAAAA] bg-[#2A2A2A]'
                                : 'text-[#4B5563] bg-[#F3F4F6]'
                            }`}
                          >
                            {batch.totalCount} {batch.totalCount === 1 ? 'photo' : 'photos'}
                          </span>
                        </div>
                        {batch.dateLabel && (
                          <div
                            className={`text-[11px] font-medium mt-0.5 ${
                              isDark ? 'text-[#888888]' : 'text-[#6B7280]'
                            }`}
                          >
                            {batch.dateLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle: Picasa Quick Actions (Play, Star, Upload) */}
                    <div className="hidden md:flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => batch.images[0] && onSelectMedia(batch.images[0])}
                        title="Start slideshow"
                        className={`p-1.5 border transition-colors ${
                          isDark
                            ? 'border-[#333333] hover:bg-[#2A2A2A] text-[#CCCCCC]'
                            : 'border-[#E0E2E6] hover:bg-[#F3F4F6] text-[#4B5563]'
                        }`}
                      >
                        <Play size={13} />
                      </button>
                      <button
                        type="button"
                        title="Add star"
                        className={`p-1.5 border transition-colors ${
                          isDark
                            ? 'border-[#333333] hover:bg-[#2A2A2A] text-[#CCCCCC]'
                            : 'border-[#E0E2E6] hover:bg-[#F3F4F6] text-[#4B5563]'
                        }`}
                      >
                        <Star size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleSync(batch.folder.id, batch.folder.sync_enabled)}
                        title="Sync folder to Google Photos"
                        className={`px-2 py-1 border flex items-center space-x-1.5 text-xs transition-colors ${
                          isDark
                            ? 'border-[#333333] hover:bg-[#2A2A2A] text-[#CCCCCC]'
                            : 'border-[#E0E2E6] hover:bg-[#F3F4F6] text-[#4B5563]'
                        }`}
                      >
                        <Upload size={12} />
                        <span className="text-[11px]">Upload</span>
                      </button>
                    </div>

                    {/* Right: Sync to Google Photos Sharp Toggle Switch */}
                    <div className="flex items-center space-x-3 shrink-0 pl-3">
                      <div className="flex items-center space-x-1.5 text-xs">
                        <Cloud
                          size={14}
                          className={batch.folder.sync_enabled ? 'text-[#0078D4]' : isDark ? 'text-[#777777]' : 'text-[#9CA3AF]'}
                        />
                        <span
                          className={`text-xs font-medium hidden sm:inline ${
                            batch.folder.sync_enabled
                              ? isDark ? 'text-white' : 'text-[#111827]'
                              : isDark ? 'text-[#888888]' : 'text-[#4B5563]'
                          }`}
                        >
                          Sync to Web
                        </span>
                      </div>

                      {/* Sharp Rectangular Toggle Switch */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSync(batch.folder.id, batch.folder.sync_enabled);
                        }}
                        type="button"
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          batch.folder.sync_enabled
                            ? 'bg-[#0078D4]'
                            : isDark ? 'bg-[#383838]' : 'bg-[#D1D5DB]'
                        }`}
                        role="switch"
                        aria-checked={batch.folder.sync_enabled}
                        title={batch.folder.sync_enabled ? 'Disable Google Photos sync' : 'Enable Google Photos sync'}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform bg-white shadow-md transition duration-200 ease-in-out ${
                            batch.folder.sync_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
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
                      isDark={isDark}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Picasa Floating Timeline HUD */}
      <FloatingTimelineHUD
        visible={hudState.visible}
        text={hudState.text}
        index={hudState.index}
        total={items.length}
      />
    </div>
  );
});

VirtualGallery.displayName = 'VirtualGallery';
