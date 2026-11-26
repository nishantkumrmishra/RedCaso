import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MediaRecord } from '../types';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Star,
  Upload,
  Download,
  Info,
  Wrench,
  Sun,
  Palette,
  X,
  User,
  SplitSquareVertical,
} from 'lucide-react';

interface PhotoViewerProps {
  media: MediaRecord;
  items: MediaRecord[];
  onSelectMedia: (media: MediaRecord) => void;
  onClose: () => void;
  onSaveCharacter: (filePath: string, characterName: string) => void;
  isDark?: boolean;
}

type ToolTab = 'fixes' | 'tuning' | 'effects';
type CompareMode = 'single' | 'split';

interface ImageAdjustments {
  brightness: number; // 0 to 200 (100 = normal)
  contrast: number; // 0 to 200 (100 = normal)
  saturate: number; // 0 to 200 (100 = normal)
  sepia: number; // 0 to 100
  grayscale: number; // 0 to 100
  hueRotate: number; // -180 to 180
  rotation: number; // 0, 90, 180, 270
}

const defaultAdjustments: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  sepia: 0,
  grayscale: 0,
  hueRotate: 0,
  rotation: 0,
};

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  media,
  items,
  onSelectMedia,
  onClose,
  onSaveCharacter,
  isDark = false,
}) => {
  const currentIndex = useMemo(() => {
    const idx = items.findIndex((i) => i.id === media.id);
    return idx >= 0 ? idx : 0;
  }, [items, media.id]);

  // Adjustments & Effects state
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultAdjustments);
  const [activeTab, setActiveTab] = useState<ToolTab>('fixes');
  const [compareMode, setCompareMode] = useState<CompareMode>('single');
  const [showProperties, setShowProperties] = useState<boolean>(true);
  const [characterInput, setCharacterInput] = useState<string>(media.character_tag || '');
  const [captionInput, setCaptionInput] = useState<string>('');
  const [isPlayingSlideshow, setIsPlayingSlideshow] = useState<boolean>(false);
  const [isStarred, setIsStarred] = useState<boolean>(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Histogram canvas ref
  const histogramRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom & caption when photo changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCharacterInput(media.character_tag || '');
  }, [media.id]);

  // Compute CSS filter string
  const filterString = useMemo(() => {
    return `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturate}%) sepia(${adjustments.sepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hueRotate}deg)`;
  }, [adjustments]);

  // Draw real-time RGB Histogram when photo loads
  const drawHistogram = useCallback(() => {
    const canvas = histogramRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    try {
      const offscreen = document.createElement('canvas');
      const sampleSize = 128;
      offscreen.width = sampleSize;
      offscreen.height = sampleSize;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;

      offCtx.drawImage(img, 0, 0, sampleSize, sampleSize);
      const imgData = offCtx.getImageData(0, 0, sampleSize, sampleSize).data;

      const rCounts = new Array(256).fill(0);
      const gCounts = new Array(256).fill(0);
      const bCounts = new Array(256).fill(0);

      for (let i = 0; i < imgData.length; i += 4) {
        rCounts[imgData[i]]++;
        gCounts[imgData[i + 1]]++;
        bCounts[imgData[i + 2]]++;
      }

      const maxCount = Math.max(...rCounts, ...gCounts, ...bCounts, 1);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      ctx.fillStyle = isDark ? '#1C1C1C' : '#E8ECEF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      const drawChannel = (counts: number[], color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        for (let x = 0; x < 256; x++) {
          const cx = (x / 255) * w;
          const cy = h - (counts[x] / maxCount) * (h - 4);
          if (x === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      };

      ctx.globalAlpha = 0.8;
      drawChannel(rCounts, '#EF4444');
      drawChannel(gCounts, '#10B981');
      drawChannel(bCounts, '#3B82F6');
      ctx.globalAlpha = 1.0;
    } catch {
      // Ignore cross-origin canvas errors if any
    }
  }, [isDark]);

  useEffect(() => {
    drawHistogram();
  }, [media.file_path, drawHistogram]);

  // Slideshow timer
  useEffect(() => {
    if (!isPlayingSlideshow) return;
    const timer = setInterval(() => {
      const nextIdx = (currentIndex + 1) % items.length;
      if (items[nextIdx]) onSelectMedia(items[nextIdx]);
    }, 3000);
    return () => clearInterval(timer);
  }, [isPlayingSlideshow, currentIndex, items, onSelectMedia]);

  // Keyboard navigation: Escape to exit, Arrows to navigate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        const prev = currentIndex > 0 ? items[currentIndex - 1] : items[items.length - 1];
        if (prev) onSelectMedia(prev);
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : items[0];
        if (next) onSelectMedia(next);
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(4, z + 0.25));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(1, z - 0.25));
      } else if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items, onClose, onSelectMedia]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoom((prev) => {
      const next = Math.max(1, Math.min(5, prev + delta));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Drag to pan when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Quick Action Presets
  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'lucky':
        setAdjustments((prev) => ({
          ...prev,
          contrast: 115,
          brightness: 104,
          saturate: 110,
        }));
        break;
      case 'contrast':
        setAdjustments((prev) => ({ ...prev, contrast: 130 }));
        break;
      case 'color':
        setAdjustments((prev) => ({ ...prev, saturate: 125, contrast: 110 }));
        break;
      case 'bw':
        setAdjustments((prev) => ({ ...prev, grayscale: 100, contrast: 115 }));
        break;
      case 'sepia':
        setAdjustments((prev) => ({ ...prev, sepia: 100, contrast: 105 }));
        break;
      case 'warm':
        setAdjustments((prev) => ({ ...prev, sepia: 30, saturate: 115, hueRotate: -10 }));
        break;
      case 'cool':
        setAdjustments((prev) => ({ ...prev, saturate: 110, hueRotate: 15 }));
        break;
      case 'reset':
        setAdjustments(defaultAdjustments);
        break;
    }
  };

  // Sibling filmstrip range (shows ~7 photos centered on currentIndex)
  const filmstripItems = useMemo(() => {
    const range: MediaRecord[] = [];
    const count = items.length;
    if (count <= 9) return items;

    for (let offset = -4; offset <= 4; offset++) {
      let idx = currentIndex + offset;
      if (idx < 0) idx += count;
      if (idx >= count) idx -= count;
      if (items[idx]) range.push(items[idx]);
    }
    return range;
  }, [items, currentIndex]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col font-sans select-none overflow-hidden ${
        isDark ? 'bg-[#181818] text-[#EEEEEE]' : 'bg-[#E5E8EB] text-[#1F2937]'
      }`}
    >
      {/* 1. TOP PICASA TOOLBAR */}
      <header
        className={`h-11 px-3 border-b flex items-center justify-between shrink-0 shadow-xs ${
          isDark ? 'bg-[#202020] border-[#2C2C2C]' : 'bg-[#F3F4F6] border-[#D1D5DB]'
        }`}
      >
        {/* Left: Back to Library Button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onClose}
            type="button"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0078D4] hover:bg-[#106EBE] active:bg-[#005A9E] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back to Library</span>
          </button>

          <button
            onClick={() => setIsPlayingSlideshow(!isPlayingSlideshow)}
            type="button"
            className={`p-1.5 border flex items-center space-x-1 text-xs transition-colors ${
              isPlayingSlideshow
                ? 'bg-[#0078D4] text-white border-[#0078D4]'
                : isDark
                ? 'bg-[#282828] border-[#383838] hover:bg-[#333333]'
                : 'bg-white border-[#D1D5DB] hover:bg-[#F9FAFB]'
            }`}
            title="Play / Pause Slideshow"
          >
            {isPlayingSlideshow ? <Pause size={13} /> : <Play size={13} className="text-[#107C41] fill-[#107C41]" />}
            <span className="text-[11px] font-medium pr-1">Play</span>
          </button>
        </div>

        {/* Center: Filmstrip Carousel of Sibling Photos */}
        <div className="hidden md:flex items-center space-x-1 max-w-lg overflow-hidden py-0.5">
          <button
            onClick={() => {
              const prev = currentIndex > 0 ? items[currentIndex - 1] : items[items.length - 1];
              if (prev) onSelectMedia(prev);
            }}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            title="Previous Photo (Left Arrow)"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
            {filmstripItems.map((item) => {
              const isSelected = item.id === media.id;
              const thumb = item.thumbnail_path || item.file_path;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectMedia(item)}
                  style={{ width: '38px', height: '28px' }}
                  className={`shrink-0 cursor-pointer border overflow-hidden transition-all ${
                    isSelected
                      ? 'border-[#0078D4] ring-2 ring-[#0078D4] scale-105 shadow-sm'
                      : 'border-black/20 hover:border-black/50 opacity-70 hover:opacity-100'
                  }`}
                  title={item.file_name}
                >
                  <img
                    src={convertFileSrc(thumb)}
                    alt={item.file_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={() => {
              const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : items[0];
              if (next) onSelectMedia(next);
            }}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            title="Next Photo (Right Arrow)"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Right: Compare Mode (A / AB) & Close */}
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center border border-inherit">
            <button
              onClick={() => setCompareMode('single')}
              className={`px-2 py-1 text-xs font-semibold ${
                compareMode === 'single'
                  ? 'bg-[#0078D4] text-white'
                  : isDark ? 'bg-[#252525] text-[#888888]' : 'bg-white text-[#6B7280]'
              }`}
              title="Single Photo View"
            >
              A
            </button>
            <button
              onClick={() => setCompareMode('split')}
              className={`px-2 py-1 text-xs font-semibold flex items-center space-x-1 ${
                compareMode === 'split'
                  ? 'bg-[#0078D4] text-white'
                  : isDark ? 'bg-[#252525] text-[#888888]' : 'bg-white text-[#6B7280]'
              }`}
              title="Split Compare: Before / After"
            >
              <SplitSquareVertical size={11} />
              <span>AB</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 text-inherit transition-colors cursor-pointer"
            title="Close Viewer"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* 2. MAIN BODY (LEFT TOOLBAR + CENTER CANVAS + RIGHT PROPERTIES) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT TOOL PANEL (PICASA FIXES, TUNING & EFFECTS) */}
        <aside
          className={`w-64 border-r flex flex-col shrink-0 text-xs select-none transition-colors ${
            isDark ? 'bg-[#1F1F1F] border-[#2C2C2C]' : 'bg-[#F9FAFB] border-[#D1D5DB]'
          }`}
        >
          {/* Tool Tabs: Fixes | Tuning | Effects */}
          <div className={`flex border-b text-xs ${isDark ? 'border-[#2C2C2C]' : 'border-[#D1D5DB]'}`}>
            <button
              onClick={() => setActiveTab('fixes')}
              className={`flex-1 py-2 flex items-center justify-center space-x-1 font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'fixes'
                  ? 'border-[#0078D4] text-[#0078D4] bg-white/50 dark:bg-black/20'
                  : 'border-transparent text-[#6B7280] hover:text-inherit'
              }`}
              title="Common Fixes"
            >
              <Wrench size={13} />
              <span>Fixes</span>
            </button>
            <button
              onClick={() => setActiveTab('tuning')}
              className={`flex-1 py-2 flex items-center justify-center space-x-1 font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'tuning'
                  ? 'border-[#0078D4] text-[#0078D4] bg-white/50 dark:bg-black/20'
                  : 'border-transparent text-[#6B7280] hover:text-inherit'
              }`}
              title="Light & Color Tuning"
            >
              <Sun size={13} />
              <span>Tuning</span>
            </button>
            <button
              onClick={() => setActiveTab('effects')}
              className={`flex-1 py-2 flex items-center justify-center space-x-1 font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'effects'
                  ? 'border-[#0078D4] text-[#0078D4] bg-white/50 dark:bg-black/20'
                  : 'border-transparent text-[#6B7280] hover:text-inherit'
              }`}
              title="Photo Effects"
            >
              <Palette size={13} />
              <span>Effects</span>
            </button>
          </div>

          {/* Active Tab Controls */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {activeTab === 'fixes' && (
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider block">
                  Picasa Auto Fixes
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => applyPreset('lucky')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#0078D4] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs text-[#0078D4]">I&apos;m Feeling Lucky</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Auto levels</div>
                  </button>

                  <button
                    onClick={() => applyPreset('contrast')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#0078D4] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs">Auto Contrast</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Equalize curve</div>
                  </button>

                  <button
                    onClick={() => applyPreset('color')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#0078D4] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs">Auto Color</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Color balance</div>
                  </button>

                  <button
                    onClick={() => applyPreset('reset')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#DC2626] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs text-[#DC2626]">Reset All</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Revert original</div>
                  </button>
                </div>

                {/* Fill Light / Brightness Slider */}
                <div className="pt-2">
                  <div className="flex justify-between text-[11px] font-medium mb-1">
                    <span>Fill Light</span>
                    <span className="font-mono text-[#0078D4]">{adjustments.brightness - 100}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="180"
                    value={adjustments.brightness}
                    onChange={(e) => setAdjustments((p) => ({ ...p, brightness: Number(e.target.value) }))}
                    className="w-full accent-[#0078D4] cursor-pointer"
                  />
                </div>

                {/* Contrast Slider */}
                <div>
                  <div className="flex justify-between text-[11px] font-medium mb-1">
                    <span>Contrast</span>
                    <span className="font-mono text-[#0078D4]">{adjustments.contrast - 100}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="180"
                    value={adjustments.contrast}
                    onChange={(e) => setAdjustments((p) => ({ ...p, contrast: Number(e.target.value) }))}
                    className="w-full accent-[#0078D4] cursor-pointer"
                  />
                </div>
              </div>
            )}

            {activeTab === 'tuning' && (
              <div className="space-y-3.5">
                <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider block">
                  Color &amp; Lighting Tuning
                </span>

                <div>
                  <div className="flex justify-between text-[11px] font-medium mb-1">
                    <span>Saturation</span>
                    <span className="font-mono text-[#0078D4]">{adjustments.saturate}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={adjustments.saturate}
                    onChange={(e) => setAdjustments((p) => ({ ...p, saturate: Number(e.target.value) }))}
                    className="w-full accent-[#0078D4] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-medium mb-1">
                    <span>Color Temperature</span>
                    <span className="font-mono text-[#0078D4]">{adjustments.hueRotate}°</span>
                  </div>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={adjustments.hueRotate}
                    onChange={(e) => setAdjustments((p) => ({ ...p, hueRotate: Number(e.target.value) }))}
                    className="w-full accent-[#0078D4] cursor-pointer"
                  />
                </div>
              </div>
            )}

            {activeTab === 'effects' && (
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider block">
                  Creative Effects
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => applyPreset('bw')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#0078D4] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs">B&amp;W</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Classic monochrome</div>
                  </button>

                  <button
                    onClick={() => applyPreset('sepia')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#0078D4] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs">Sepia</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Vintage brown</div>
                  </button>

                  <button
                    onClick={() => applyPreset('warm')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#0078D4] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs">Warmify</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Golden glow</div>
                  </button>

                  <button
                    onClick={() => applyPreset('cool')}
                    className="p-2 border text-left bg-white dark:bg-[#252525] border-[#D1D5DB] dark:border-[#333333] hover:border-[#0078D4] transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-xs">Cool Tint</div>
                    <div className="text-[10px] text-[#6B7280] dark:text-[#888888]">Cold frost tone</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Real-time RGB Histogram Graph */}
          <div className={`p-3 border-t shrink-0 ${isDark ? 'border-[#2C2C2C] bg-[#1A1A1A]' : 'border-[#D1D5DB] bg-white'}`}>
            <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider mb-1.5 block">
              Histogram &amp; Information
            </span>
            <canvas
              ref={histogramRef}
              width={220}
              height={55}
              className="w-full h-14 border border-inherit block"
            />
            <div className="flex justify-between text-[10px] text-[#6B7280] mt-1 font-mono">
              <span>{media.width || 0} × {media.height || 0} px</span>
              <span>{formatSize(media.file_size)}</span>
            </div>
          </div>
        </aside>

        {/* CENTER VIEWPORT CANVAS */}
        <main
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className={`flex-1 relative overflow-hidden flex items-center justify-center p-4 transition-colors select-none ${
            isDark ? 'bg-[#121212]' : 'bg-[#7A7E83]'
          } ${zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
        >
          {compareMode === 'single' ? (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${adjustments.rotation}deg)`,
                transition: isDragging ? 'none' : 'transform 120ms ease-out',
              }}
              className="relative max-w-full max-h-full flex items-center justify-center"
            >
              <img
                ref={imageRef}
                src={convertFileSrc(media.file_path)}
                alt={media.file_name}
                onLoad={drawHistogram}
                style={{ filter: filterString }}
                className="max-w-[85vw] max-h-[72vh] object-contain shadow-2xl transition-all"
                draggable={false}
              />
            </div>
          ) : (
            /* Side-by-side A/B Split Comparison */
            <div className="flex items-center space-x-4 max-w-full max-h-full">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 mb-1.5">
                  A: Original
                </span>
                <img
                  src={convertFileSrc(media.file_path)}
                  alt="Original"
                  className="max-w-[40vw] max-h-[68vh] object-contain shadow-xl"
                  draggable={false}
                />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-white bg-[#0078D4] px-2 py-0.5 mb-1.5">
                  B: Edited
                </span>
                <img
                  src={convertFileSrc(media.file_path)}
                  alt="Edited"
                  style={{
                    filter: filterString,
                    transform: `rotate(${adjustments.rotation}deg)`,
                  }}
                  className="max-w-[40vw] max-h-[68vh] object-contain shadow-xl"
                  draggable={false}
                />
              </div>
            </div>
          )}

          {/* Floating Zoom Mini-Map Navigator when zoomed in */}
          {zoom > 1.05 && (
            <div className="absolute bottom-4 right-4 bg-black/85 backdrop-blur-md border border-white/20 p-2 shadow-2xl z-20 flex flex-col items-center">
              <div className="flex items-center justify-between w-full mb-1 text-[10px] text-white font-mono">
                <span>Zoomed to {Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="text-white/60 hover:text-white ml-2"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="w-24 h-16 border border-white/40 overflow-hidden relative">
                <img
                  src={convertFileSrc(media.thumbnail_path || media.file_path)}
                  alt="mini"
                  className="w-full h-full object-cover"
                />
                <div
                  style={{
                    width: `${Math.max(20, 100 / zoom)}%`,
                    height: `${Math.max(20, 100 / zoom)}%`,
                    transform: `translate(${-pan.x / 10}px, ${-pan.y / 10}px)`,
                  }}
                  className="absolute inset-0 border-2 border-[#0078D4] bg-[#0078D4]/20 pointer-events-none"
                />
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PROPERTIES / METADATA PANEL */}
        {showProperties && (
          <aside
            className={`w-72 border-l flex flex-col shrink-0 text-xs p-4 space-y-4 overflow-y-auto transition-colors ${
              isDark ? 'bg-[#1F1F1F] border-[#2C2C2C]' : 'bg-[#F9FAFB] border-[#D1D5DB]'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2 border-inherit">
              <span className="font-bold text-xs uppercase tracking-wider text-[#6B7280]">Properties</span>
              <button
                onClick={() => setShowProperties(false)}
                className="hover:text-black dark:hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-semibold text-[#888888] block mb-0.5">LOCATION</span>
                <span className="text-[11px] font-mono break-all p-1.5 block border bg-white dark:bg-[#141414] border-inherit">
                  {media.file_path}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 border bg-white dark:bg-[#141414] border-inherit">
                  <span className="text-[10px] text-[#888888] block">FILE SIZE</span>
                  <span className="font-semibold text-xs mt-0.5 block">{formatSize(media.file_size)}</span>
                </div>
                <div className="p-2 border bg-white dark:bg-[#141414] border-inherit">
                  <span className="text-[10px] text-[#888888] block">DIMENSIONS</span>
                  <span className="font-semibold text-xs mt-0.5 block">
                    {media.width && media.height ? `${media.width}×${media.height}` : 'Unknown'}
                  </span>
                </div>
              </div>

              {media.date_taken && (
                <div className="p-2 border bg-white dark:bg-[#141414] border-inherit">
                  <span className="text-[10px] text-[#888888] block">FILE DATE (EXIF)</span>
                  <span className="font-semibold text-xs mt-0.5 block">{media.date_taken}</span>
                </div>
              )}

              {/* People & Character Tagging */}
              <div className="pt-2 border-t border-inherit">
                <span className="text-[10px] font-semibold text-[#888888] flex items-center space-x-1 mb-1.5">
                  <User size={12} className="text-[#0078D4]" />
                  <span>PERSON / CHARACTER TAG</span>
                </span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSaveCharacter(media.file_path, characterInput);
                  }}
                  className="flex space-x-1.5"
                >
                  <input
                    type="text"
                    value={characterInput}
                    onChange={(e) => setCharacterInput(e.target.value)}
                    placeholder="Name this person..."
                    className="flex-1 px-2.5 py-1 text-xs border bg-white dark:bg-[#141414] border-inherit outline-none focus:border-[#0078D4]"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-[#0078D4] hover:bg-[#106EBE] text-white text-xs font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                </form>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* 3. BOTTOM BLUE STATUS BREADCRUMB BAR */}
      <div className="h-6 bg-[#0078D4] text-white text-[11px] px-3 flex items-center justify-between font-mono shrink-0 select-none">
        <div className="truncate max-w-lg">
          {media.file_name} &bull; {formatSize(media.file_size)} &bull; {media.width || 0}×{media.height || 0} px &bull; ({currentIndex + 1} of {items.length})
        </div>

        {/* Center: Make a caption */}
        <div className="flex items-center space-x-1.5">
          <input
            type="text"
            value={captionInput}
            onChange={(e) => setCaptionInput(e.target.value)}
            placeholder="Make a caption!"
            className="bg-transparent border-b border-white/40 focus:border-white px-2 py-0 text-white placeholder-white/70 text-xs outline-none w-48 text-center"
          />
        </div>

        <div className="text-[10px] text-white/80">
          RedCaso Photo Engine
        </div>
      </div>

      {/* 4. BOTTOM ACTION TRAY (DOCK) */}
      <footer
        className={`h-12 px-4 border-t flex items-center justify-between shrink-0 shadow-md ${
          isDark ? 'bg-[#202020] border-[#2C2C2C]' : 'bg-[#F3F4F6] border-[#D1D5DB]'
        }`}
      >
        {/* Left: Star & Rotations */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setIsStarred(!isStarred)}
            type="button"
            className={`p-1.5 border transition-colors cursor-pointer ${
              isStarred
                ? 'bg-[#EAA300] text-white border-[#EAA300]'
                : isDark ? 'bg-[#282828] border-[#383838]' : 'bg-white border-[#D1D5DB]'
            }`}
            title="Star / Favorite"
          >
            <Star size={14} className={isStarred ? 'fill-white' : ''} />
          </button>

          <button
            onClick={() => setAdjustments((p) => ({ ...p, rotation: (p.rotation - 90 + 360) % 360 }))}
            type="button"
            className={`p-1.5 border transition-colors cursor-pointer ${
              isDark ? 'bg-[#282828] border-[#383838]' : 'bg-white border-[#D1D5DB]'
            }`}
            title="Rotate Left 90°"
          >
            <RotateCcw size={14} />
          </button>

          <button
            onClick={() => setAdjustments((p) => ({ ...p, rotation: (p.rotation + 90) % 360 }))}
            type="button"
            className={`p-1.5 border transition-colors cursor-pointer ${
              isDark ? 'bg-[#282828] border-[#383838]' : 'bg-white border-[#D1D5DB]'
            }`}
            title="Rotate Right 90°"
          >
            <RotateCw size={14} />
          </button>
        </div>

        {/* Center: Big Green "Upload to Google Photos" button! */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            className="px-4 py-1.5 bg-[#107C41] hover:bg-[#0E6B38] active:bg-[#0A532B] text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Upload size={13} />
            <span>Upload to Google Photos</span>
          </button>

          <button
            type="button"
            className={`px-3 py-1.5 border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer ${
              isDark ? 'bg-[#282828] border-[#383838]' : 'bg-white border-[#D1D5DB]'
            }`}
          >
            <Download size={13} />
            <span>Export</span>
          </button>
        </div>

        {/* Right: Zoom Slider + 1:1 Toggle + Info Panel Toggle */}
        <div className="flex items-center space-x-2">
          <div className="hidden sm:flex items-center space-x-1.5">
            <span className="text-[11px] font-mono text-[#6B7280]">
              {Math.round(zoom * 100)}%
            </span>
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 accent-[#0078D4] cursor-pointer"
            />
          </div>

          <button
            onClick={() => {
              setZoom(zoom === 1 ? 2 : 1);
              setPan({ x: 0, y: 0 });
            }}
            type="button"
            className={`px-2 py-1 border text-xs font-mono font-semibold cursor-pointer ${
              zoom > 1
                ? 'bg-[#0078D4] text-white border-[#0078D4]'
                : isDark ? 'bg-[#282828] border-[#383838]' : 'bg-white border-[#D1D5DB]'
            }`}
            title="Toggle 1:1 Actual Pixels"
          >
            1:1
          </button>

          <button
            onClick={() => setShowProperties(!showProperties)}
            type="button"
            className={`p-1.5 border transition-colors cursor-pointer ${
              showProperties
                ? 'bg-[#0078D4] text-white border-[#0078D4]'
                : isDark ? 'bg-[#282828] border-[#383838]' : 'bg-white border-[#D1D5DB]'
            }`}
            title="Toggle Properties Panel"
          >
            <Info size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
};
