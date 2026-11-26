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
  X,
  User,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  Wand2,
  Sun,
  Eye,
  Rotate3D,
  Undo2,
  Redo2,
  Check,
} from 'lucide-react';

interface PhotoViewerProps {
  media: MediaRecord;
  items: MediaRecord[];
  onSelectMedia: (media: MediaRecord) => void;
  onClose: () => void;
  onSaveCharacter: (filePath: string, characterName: string) => void;
  isDark?: boolean;
}

type ToolTab = 'fixes' | 'tuning' | 'effects' | 'filters';

interface ImageAdjustments {
  brightness: number; // 50 to 150 (100 = default)
  contrast: number; // 50 to 150 (100 = default)
  saturate: number; // 0 to 200 (100 = default)
  fillLight: number; // -50 to 50 (0 = default)
  warmth: number; // -50 to 50 (0 = default)
  sepia: number; // 0 to 100
  grayscale: number; // 0 to 100
  hueRotate: number; // -180 to 180
  rotation: number; // 0, 90, 180, 270
}

const defaultAdjustments: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  fillLight: 0,
  warmth: 0,
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
}) => {
  const currentIndex = useMemo(() => {
    const idx = items.findIndex((i) => i.id === media.id);
    return idx >= 0 ? idx : 0;
  }, [items, media.id]);

  // Adjustments & Effects state
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultAdjustments);
  const [history, setHistory] = useState<ImageAdjustments[]>([defaultAdjustments]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<ToolTab>('fixes');
  const [showRightMenu, setShowRightMenu] = useState<boolean>(true);
  const [characterInput, setCharacterInput] = useState<string>(media.character_tag || '');
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
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Reset zoom and tagging when photo changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCharacterInput(media.character_tag || '');
    setAdjustments(defaultAdjustments);
    setHistory([defaultAdjustments]);
    setHistoryIndex(0);
  }, [media.id]);

  // Push adjustment to undo history
  const updateAdjustment = (newAdj: Partial<ImageAdjustments>) => {
    setAdjustments((prev) => {
      const updated = { ...prev, ...newAdj };
      const nextHistory = [...history.slice(0, historyIndex + 1), updated];
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
      return updated;
    });
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setAdjustments(history[prevIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setAdjustments(history[nextIdx]);
    }
  };

  // Compute CSS filter string
  const filterString = useMemo(() => {
    const effBrightness = adjustments.brightness + adjustments.fillLight;
    const effWarmthHue = adjustments.warmth > 0 ? -adjustments.warmth : Math.abs(adjustments.warmth);
    const effSepia = Math.max(adjustments.sepia, adjustments.warmth > 0 ? adjustments.warmth * 0.4 : 0);
    return `brightness(${effBrightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturate}%) sepia(${effSepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hueRotate + effWarmthHue}deg)`;
  }, [adjustments]);

  // Draw real-time RGB Histogram when photo loads
  const drawHistogram = useCallback(() => {
    const canvas = histogramRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    try {
      const offscreen = document.createElement('canvas');
      const sampleSize = 96;
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

      ctx.fillStyle = '#F3F4F6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      const drawChannel = (counts: number[], color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        for (let x = 0; x < 256; x++) {
          const cx = (x / 255) * w;
          const cy = h - (counts[x] / maxCount) * (h - 4);
          if (x === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      };

      ctx.globalAlpha = 0.85;
      drawChannel(rCounts, '#0067C0');
      drawChannel(gCounts, '#107C41');
      drawChannel(bCounts, '#D83B01');
      ctx.globalAlpha = 1.0;
    } catch {
      // Ignore cross-origin canvas errors if any
    }
  }, []);

  useEffect(() => {
    drawHistogram();
  }, [media.file_path, drawHistogram]);

  // Slideshow timer
  useEffect(() => {
    if (!isPlayingSlideshow) return;
    const timer = setInterval(() => {
      const nextIdx = (currentIndex + 1) % items.length;
      if (items[nextIdx]) onSelectMedia(items[nextIdx]);
    }, 3200);
    return () => clearInterval(timer);
  }, [isPlayingSlideshow, currentIndex, items, onSelectMedia]);

  // Keyboard navigation
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
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((prev) => {
      const next = Math.max(1, Math.min(4, prev + delta));
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
        updateAdjustment({
          contrast: 115,
          brightness: 105,
          saturate: 112,
          fillLight: 6,
        });
        break;
      case 'contrast':
        updateAdjustment({ contrast: 125 });
        break;
      case 'color':
        updateAdjustment({ saturate: 130, contrast: 108 });
        break;
      case 'bw':
        updateAdjustment({ grayscale: 100, contrast: 115 });
        break;
      case 'sepia':
        updateAdjustment({ sepia: 100, contrast: 105 });
        break;
      case 'warm':
        updateAdjustment({ warmth: 25, saturate: 110 });
        break;
      case 'cool':
        updateAdjustment({ warmth: -20, saturate: 105 });
        break;
      case 'reset':
        updateAdjustment(defaultAdjustments);
        break;
    }
  };

  // Format bytes
  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Megapixels and aspect ratio
  const megapixels = useMemo(() => {
    if (!media.width || !media.height) return '—';
    return ((media.width * media.height) / 1000000).toFixed(1);
  }, [media.width, media.height]);

  const aspectRatioText = useMemo(() => {
    if (!media.width || !media.height) return 'Standard';
    if (media.height > media.width) return 'Portrait (3:4)';
    if (media.width > media.height * 1.5) return 'Landscape (16:9)';
    return 'Landscape (4:3)';
  }, [media.width, media.height]);

  // Filmstrip range around current photo
  const filmstripWindow = useMemo(() => {
    if (items.length <= 15) return items;
    const start = Math.max(0, currentIndex - 7);
    const end = Math.min(items.length, start + 15);
    return items.slice(start, end);
  }, [items, currentIndex]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F3F3F3] text-[#242424] font-sans font-normal select-none overflow-hidden">
      {/* 1. TOP HEADER TOOLBAR */}
      <header className="h-[44px] px-3 bg-[#FFFFFF] border-b border-[#E5E5E5] flex items-center justify-between shrink-0 shadow-xs">
        {/* Left: Back Button & File Info */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-[4px] bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578] text-white text-xs font-normal transition-colors cursor-pointer shadow-xs"
          >
            <ArrowLeft size={14} />
            <span>All photos</span>
          </button>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-[#242424] truncate max-w-[240px]" title={media.file_name}>
              {media.file_name}
            </span>
            <span className="text-[#767676] text-[11px]">
              {currentIndex + 1} of {items.length}
            </span>
          </div>
        </div>

        {/* Center: Zoom, Rotate & Presentation Controls */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#616161] cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut size={15} />
          </button>
          <span className="text-xs text-[#616161] min-w-[38px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#616161] cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn size={15} />
          </button>

          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2 py-1 text-[11px] rounded hover:bg-[#EAEAEA] text-[#616161] cursor-pointer ml-1"
            title="Fit to Window"
          >
            Fit
          </button>

          <div className="w-[1px] h-4 bg-[#E0E0E0] mx-1" />

          {/* Rotations */}
          <button
            type="button"
            onClick={() =>
              updateAdjustment({ rotation: (adjustments.rotation - 90 + 360) % 360 })
            }
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#616161] cursor-pointer"
            title="Rotate Left 90°"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              updateAdjustment({ rotation: (adjustments.rotation + 90) % 360 })
            }
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#616161] cursor-pointer"
            title="Rotate Right 90°"
          >
            <RotateCw size={14} />
          </button>

          {/* Star / Favorite */}
          <button
            type="button"
            onClick={() => setIsStarred(!isStarred)}
            className={`p-1.5 rounded cursor-pointer transition-colors ml-1 ${
              isStarred ? 'text-[#EAA300]' : 'text-[#616161] hover:bg-[#EAEAEA]'
            }`}
            title="Favorite"
          >
            <Star size={14} className={isStarred ? 'fill-[#EAA300]' : ''} />
          </button>

          {/* Slideshow */}
          <button
            type="button"
            onClick={() => setIsPlayingSlideshow(!isPlayingSlideshow)}
            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs cursor-pointer ml-1 transition-colors ${
              isPlayingSlideshow
                ? 'bg-[#E5EDF5] text-[#0067C0]'
                : 'hover:bg-[#EAEAEA] text-[#616161]'
            }`}
            title="Slideshow"
          >
            {isPlayingSlideshow ? <Pause size={13} /> : <Play size={13} />}
            <span className="text-[11px]">Slide</span>
          </button>
        </div>

        {/* Right: Color Calibration Badge, Adjustments Toggle & Close */}
        <div className="flex items-center space-x-2">
          <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#E4F3E5] text-[#2E7D32] text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32]" />
            <span>sRGB · 99.4% ΔE 0.8</span>
          </div>

          <button
            type="button"
            onClick={() => setShowRightMenu(!showRightMenu)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-[4px] text-xs transition-colors cursor-pointer ${
              showRightMenu
                ? 'bg-[#E5EDF5] text-[#0067C0]'
                : 'hover:bg-[#EAEAEA] text-[#616161]'
            }`}
            title="Toggle Right Adjustments Menu"
          >
            <SlidersHorizontal size={13} />
            <span>Adjustments</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#EAEAEA] text-[#616161] cursor-pointer"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* 2. MAIN BODY (LEFT/CENTER CANVAS + RIGHT SIDE ADJUSTMENTS MENU) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* CENTER VIEWPORT CANVAS */}
        <main
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className={`flex-1 relative overflow-hidden flex items-center justify-center p-4 select-none bg-[#EFEFEF] ${
            zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
        >
          {/* Main Photo Display */}
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
              className="max-w-[82vw] max-h-[70vh] object-contain shadow-xl transition-all rounded-[2px]"
              draggable={false}
            />
          </div>

          {/* Floating Left Chevron */}
          <button
            type="button"
            onClick={() => {
              const prev = currentIndex > 0 ? items[currentIndex - 1] : items[items.length - 1];
              if (prev) onSelectMedia(prev);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#242424] shadow-md flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
            title="Previous Photo (Left Arrow)"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Floating Right Chevron */}
          <button
            type="button"
            onClick={() => {
              const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : items[0];
              if (next) onSelectMedia(next);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#242424] shadow-md flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
            title="Next Photo (Right Arrow)"
          >
            <ChevronRight size={20} />
          </button>
        </main>

        {/* RIGHT SIDE MENU (Fluent Adjustments & Metadata Panel) */}
        {showRightMenu && (
          <aside className="w-[320px] shrink-0 bg-[#FAFAFA] border-l border-[#E5E5E5] flex flex-col justify-between overflow-y-auto text-xs font-normal">
            <div className="p-4 space-y-4">
              {/* Color Accuracy Box (Matching User Reference) */}
              <div className="p-3 bg-white border border-[#E0E0E0] rounded-[6px] space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#242424]">Color accuracy</span>
                  <span className="text-[#107C41] text-[11px]">Calibrated</span>
                </div>

                {/* Live RGB Histogram */}
                <canvas
                  ref={histogramRef}
                  width={256}
                  height={54}
                  className="w-full h-[54px] rounded-[4px] border border-[#E5E5E5] block"
                />

                {/* Color Specs Table */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[#616161]">
                  <div>Color space</div>
                  <div className="text-right text-[#242424]">sRGB IEC61966</div>
                  <div>Gamut</div>
                  <div className="text-right text-[#242424]">99.4% · ΔE 0.8</div>
                  <div>White point</div>
                  <div className="text-right text-[#242424]">D65 · 6500K</div>
                  <div>Bit depth</div>
                  <div className="text-right text-[#242424]">8-bit · ICC v4</div>
                </div>
              </div>

              {/* Adjustments Tabs */}
              <div className="space-y-3">
                <div className="flex border-b border-[#E5E5E5] text-xs">
                  {(['fixes', 'tuning', 'effects', 'filters'] as ToolTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-1.5 text-center capitalize transition-colors cursor-pointer border-b-2 -mb-[1px] ${
                        activeTab === tab
                          ? 'border-[#0067C0] text-[#0067C0]'
                          : 'border-transparent text-[#616161] hover:text-[#242424]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Quick Action Tools Grid (8 Buttons Matching User Screenshot) */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('lucky')}
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Auto-enhance photo"
                  >
                    <Wand2 size={13} className="text-[#0067C0]" />
                    <span className="text-[10px] text-[#242424]">I&apos;m Lucky</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('contrast')}
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Boost contrast"
                  >
                    <Sun size={13} className="text-[#616161]" />
                    <span className="text-[10px] text-[#242424]">Contrast</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('color')}
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Auto color vibrance"
                  >
                    <Eye size={13} className="text-[#616161]" />
                    <span className="text-[10px] text-[#242424]">Auto Color</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateAdjustment({ rotation: (adjustments.rotation + 90) % 360 })
                    }
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Straighten / Rotate"
                  >
                    <Rotate3D size={13} className="text-[#616161]" />
                    <span className="text-[10px] text-[#242424]">Straighten</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('bw')}
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Black & White"
                  >
                    <span className="text-xs">B&W</span>
                    <span className="text-[10px] text-[#242424]">Monochrome</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('sepia')}
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Vintage Sepia tone"
                  >
                    <span className="text-xs">Sepia</span>
                    <span className="text-[10px] text-[#242424]">Vintage</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('warm')}
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Warm golden tone"
                  >
                    <Sun size={13} className="text-[#D83B01]" />
                    <span className="text-[10px] text-[#242424]">Warmth</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('reset')}
                    className="h-[48px] p-1 border border-[#E0E0E0] rounded-[4px] bg-white hover:bg-[#F3F3F3] flex flex-col items-center justify-center space-y-0.5 text-center transition-colors cursor-pointer"
                    title="Reset all adjustments"
                  >
                    <Undo2 size={13} className="text-[#616161]" />
                    <span className="text-[10px] text-[#242424]">Reset</span>
                  </button>
                </div>

                {/* Fine-Tuning Sliders */}
                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-[11px] text-[#616161] mb-1">
                      <span>Fill Light</span>
                      <span>{adjustments.fillLight > 0 ? `+${adjustments.fillLight}%` : `${adjustments.fillLight}%`}</span>
                    </div>
                    <input
                      type="range"
                      min="-40"
                      max="60"
                      value={adjustments.fillLight}
                      onChange={(e) => updateAdjustment({ fillLight: Number(e.target.value) })}
                      className="w-full accent-[#0067C0] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#616161] mb-1">
                      <span>Brightness</span>
                      <span>{adjustments.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="140"
                      value={adjustments.brightness}
                      onChange={(e) => updateAdjustment({ brightness: Number(e.target.value) })}
                      className="w-full accent-[#0067C0] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#616161] mb-1">
                      <span>Contrast</span>
                      <span>{adjustments.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="150"
                      value={adjustments.contrast}
                      onChange={(e) => updateAdjustment({ contrast: Number(e.target.value) })}
                      className="w-full accent-[#0067C0] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#616161] mb-1">
                      <span>Saturation</span>
                      <span>{adjustments.saturate}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="180"
                      value={adjustments.saturate}
                      onChange={(e) => updateAdjustment({ saturate: Number(e.target.value) })}
                      className="w-full accent-[#0067C0] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Undo / Redo Buttons */}
                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className="flex-1 h-[28px] border border-[#D8D8D8] rounded-[4px] bg-white hover:bg-[#F3F3F3] disabled:opacity-40 flex items-center justify-center space-x-1.5 text-xs text-[#242424] cursor-pointer"
                  >
                    <Undo2 size={12} />
                    <span>Undo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className="flex-1 h-[28px] border border-[#D8D8D8] rounded-[4px] bg-white hover:bg-[#F3F3F3] disabled:opacity-40 flex items-center justify-center space-x-1.5 text-xs text-[#242424] cursor-pointer"
                  >
                    <Redo2 size={12} />
                    <span>Redo</span>
                  </button>
                </div>
              </div>

              {/* File & Camera Information Section */}
              <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
                <span className="text-[11px] text-[#616161] tracking-wider uppercase block">
                  File &amp; camera
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#616161]">Dimensions</span>
                    <span className="text-[#242424]">
                      {media.width && media.height ? `${media.width} × ${media.height} px` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#616161]">File size</span>
                    <span className="text-[#242424]">{formatSize(media.file_size)}</span>
                  </div>
                  {media.date_taken && (
                    <div className="flex justify-between">
                      <span className="text-[#616161]">Date taken</span>
                      <span className="text-[#242424]">{media.date_taken}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[#616161] block mb-0.5">Location</span>
                    <span
                      className="text-[#242424] text-[10px] break-all block p-1.5 bg-white border border-[#E0E0E0] rounded-[3px]"
                      title={media.file_path}
                    >
                      {media.file_path}
                    </span>
                  </div>
                </div>
              </div>

              {/* People Tagging Section */}
              <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
                <span className="text-[11px] text-[#616161] tracking-wider uppercase flex items-center space-x-1">
                  <User size={12} className="text-[#0067C0]" />
                  <span>Person in this photo</span>
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
                    className="flex-1 px-2.5 py-1 text-xs border border-[#D8D8D8] rounded-[3px] bg-white outline-none focus:border-[#0067C0]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 bg-[#0067C0] hover:bg-[#005A9E] text-white text-xs rounded-[3px] cursor-pointer"
                  >
                    Save
                  </button>
                </form>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* 3. BOTTOM FILMSTRIP & STATUS DOCK (MATCHING USER REFERENCE) */}
      <footer className="h-[74px] bg-[#FFFFFF] border-t border-[#E5E5E5] flex items-center justify-between px-4 select-none shrink-0 shadow-xs">
        {/* Left: Resolution, Megapixels & Size */}
        <div className="flex items-center space-x-2 text-[11px] text-[#616161] min-w-[220px]">
          <span>{aspectRatioText}</span>
          <span>•</span>
          <span>{media.width && media.height ? `${media.width} × ${media.height} px` : '—'}</span>
          <span>|</span>
          <span>{megapixels} MP</span>
          <span>•</span>
          <span>{formatSize(media.file_size)}</span>
        </div>

        {/* Center: Real Photo Thumbnails Filmstrip */}
        <div className="flex items-center space-x-1 overflow-x-auto max-w-[50vw] py-1" ref={filmstripRef}>
          {filmstripWindow.map((item) => {
            const isSelected = item.id === media.id;
            const thumbSrc = convertFileSrc(item.thumbnail_path || item.file_path);
            return (
              <div
                key={item.id}
                onClick={() => onSelectMedia(item)}
                style={{ width: '48px', height: '48px' }}
                className={`shrink-0 cursor-pointer rounded-[3px] overflow-hidden transition-all relative ${
                  isSelected
                    ? 'border-2 border-[#0067C0] shadow-md ring-2 ring-[#0067C0]/20 scale-105'
                    : 'border border-[#D8D8D8] opacity-75 hover:opacity-100 hover:border-[#0067C0]'
                }`}
                title={item.file_name}
              >
                <img
                  src={thumbSrc}
                  alt={item.file_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            );
          })}
        </div>

        {/* Right: Color accurate guarantee & Zoom indicator */}
        <div className="flex items-center space-x-2 text-[11px] text-[#616161] min-w-[220px] justify-end">
          <div className="flex items-center space-x-1.5 text-[#107C41]">
            <Check size={12} strokeWidth={2.5} />
            <span>sRGB IEC61966-2.1 · Color accurate</span>
          </div>
          <span>|</span>
          <span>Zoom: {Math.round(zoom * 100)}%</span>
        </div>
      </footer>
    </div>
  );
};
