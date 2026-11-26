import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { MediaRecord } from '../types';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Image as ImageIcon } from 'lucide-react';

interface ImageCellProps {
  media: MediaRecord;
  onSelect: (media: MediaRecord) => void;
  onContextMenu?: (e: React.MouseEvent, media: MediaRecord) => void;
  isDark?: boolean;
}

export const ImageCell: React.FC<ImageCellProps> = memo(({ media, onSelect, onContextMenu, isDark = false }) => {
  // CRITICAL: NEVER load 20MB raw original camera files in the gallery view!
  // ONLY load the 256px thumbnail (6-12KB) from disk cache.
  const [thumbSrc, setThumbSrc] = useState<string | null>(() => {
    if (media.thumbnail_path && media.thumbnail_path !== 'none') {
      return convertFileSrc(media.thumbnail_path);
    }
    return null;
  });

  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (media.thumbnail_path && media.thumbnail_path !== 'none') {
      setThumbSrc(convertFileSrc(media.thumbnail_path));
      return;
    }

    // If thumbnail isn't ready in DB yet, ask backend to generate/fetch it on demand
    let isCancelled = false;
    invoke<string | null>('get_thumbnail', { filePath: media.file_path })
      .then((res) => {
        if (!isCancelled && res) {
          setThumbSrc(convertFileSrc(res));
        }
      })
      .catch(() => {
        if (!isCancelled) setError(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [media.thumbnail_path, media.file_path]);

  // Calculate natural aspect ratio width based on DB dimensions (height is fixed to 170px)
  const computedWidth = useMemo(() => {
    if (media.width && media.height && media.height > 0) {
      const aspect = media.width / media.height;
      return Math.max(65, Math.min(400, Math.round(170 * aspect)));
    }
    return 170;
  }, [media.width, media.height]);

  const handleClick = useCallback(() => {
    onSelect(media);
  }, [media, onSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, media);
    }
  }, [media, onContextMenu]);

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={`${media.file_name} (${media.width || '?'}×${media.height || '?'})`}
      style={{
        height: '170px',
        width: `${computedWidth}px`,
      }}
      className="relative shrink-0 select-none cursor-pointer flex items-center justify-center transition-all duration-150 hover:-translate-y-0.5 group"
    >
      {/* Background placeholder while thumbnail loads */}
      {(!loaded || !thumbSrc) && !error && (
        <div
          className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-colors ${
            isDark ? 'bg-[#1E1E1E]' : 'bg-[#DCDFE4]'
          }`}
        >
          <ImageIcon size={18} className={isDark ? 'text-[#3A3A3A]' : 'text-[#ADB5BD]'} />
        </div>
      )}

      {error ? (
        <div
          className={`w-full h-full flex flex-col items-center justify-center p-2 text-center border ${
            isDark ? 'bg-[#1C1C1C] border-[#2C2C2C]' : 'bg-[#E5E7EB] border-[#D1D5DB]'
          }`}
        >
          <span className={`text-[10px] font-mono ${isDark ? 'text-[#777777]' : 'text-[#888888]'}`}>
            Unsupported
          </span>
        </div>
      ) : thumbSrc ? (
        <img
          src={thumbSrc}
          alt={media.file_name}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            height: '170px',
            width: `${computedWidth}px`,
          }}
          className={`h-[170px] object-cover shadow-xs group-hover:shadow-md transition-shadow border ${
            isDark ? 'border-white/10' : 'border-black/15'
          } ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
    </div>
  );
});

ImageCell.displayName = 'ImageCell';
