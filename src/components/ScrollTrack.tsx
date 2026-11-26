import React, { useEffect, useState, useCallback } from 'react';
import { User, Maximize2, ChevronsUp, ChevronUp, ChevronDown, ChevronsDown } from 'lucide-react';

interface ScrollTrackProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewMode: 'photos' | 'people';
  onToggleViewMode: (mode: 'photos' | 'people') => void;
  folderOffsets?: number[];
  isDark?: boolean;
}

export const ScrollTrack: React.FC<ScrollTrackProps> = ({
  containerRef,
  viewMode,
  onToggleViewMode,
  folderOffsets = [],
  isDark = false,
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(40);

  // Update scroll thumb position
  const updateThumb = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) {
      setScrollProgress(0);
      setThumbHeight(100);
      return;
    }

    const calculatedThumbHeight = Math.max(30, (clientHeight / scrollHeight) * 200);
    setThumbHeight(calculatedThumbHeight);
    const progress = (scrollTop / maxScroll) * (200 - calculatedThumbHeight);
    setScrollProgress(progress);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', updateThumb);
    updateThumb();

    return () => {
      el.removeEventListener('scroll', updateThumb);
      window.removeEventListener('resize', updateThumb);
    };
  }, [containerRef, updateThumb]);

  // Jump to previous folder
  const handleJumpPrevFolder = () => {
    const el = containerRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
    // Find highest offset that is strictly less than currentTop - 20
    const prev = [...folderOffsets].reverse().find((offset) => offset < currentTop - 30);
    const target = prev !== undefined ? prev : 0;
    el.scrollTo({ top: target, behavior: 'smooth' });
  };

  // Jump to next folder
  const handleJumpNextFolder = () => {
    const el = containerRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
    // Find lowest offset that is strictly greater than currentTop + 20
    const next = folderOffsets.find((offset) => offset > currentTop + 30);
    const target = next !== undefined ? next : el.scrollHeight;
    el.scrollTo({ top: target, behavior: 'smooth' });
  };

  const handleStepUp = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ top: -350, behavior: 'smooth' });
  };

  const handleStepDown = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ top: 350, behavior: 'smooth' });
  };

  return (
    <div
      className={`w-9 shrink-0 border-l flex flex-col items-center justify-between py-1 select-none font-sans z-30 transition-colors ${
        isDark
          ? 'bg-[#1A1A1A] border-[#2C2C2C] text-[#CCCCCC]'
          : 'bg-[#ECEEF1] border-[#D1D5DB] text-[#4B5563]'
      }`}
    >
      {/* Top Controls Area */}
      <div className="flex flex-col items-center space-y-1 w-full px-1">
        {/* Toggle Mode: Face Recognition / People View vs Library Grid View */}
        <div className="flex border border-inherit bg-white dark:bg-[#252525] p-0.5 shadow-2xs w-full">
          <button
            type="button"
            onClick={() => onToggleViewMode('people')}
            title="People & Faces View"
            className={`flex-1 py-1 flex items-center justify-center cursor-pointer transition-colors ${
              viewMode === 'people'
                ? 'bg-[#0078D4] text-white'
                : 'hover:bg-[#E5E7EB] dark:hover:bg-[#333333]'
            }`}
          >
            <User size={11} />
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode('photos')}
            title="Photos Library View"
            className={`flex-1 py-1 flex items-center justify-center cursor-pointer transition-colors ${
              viewMode === 'photos'
                ? 'bg-[#0078D4] text-white'
                : 'hover:bg-[#E5E7EB] dark:hover:bg-[#333333]'
            }`}
          >
            <Maximize2 size={10} />
          </button>
        </div>

        {/* Picasa "Remove" button */}
        <button
          type="button"
          onClick={() => {
            const el = containerRef.current;
            if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`w-full py-0.5 text-[9px] border font-medium text-center transition-colors cursor-pointer ${
            isDark
              ? 'border-[#333333] bg-[#222222] hover:bg-[#2A2A2A] text-[#999999]'
              : 'border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#64748B]'
          }`}
          title="Top of Library"
        >
          Top
        </button>

        {/* Top Jump Buttons */}
        <div className="flex flex-col space-y-0.5 w-full pt-1">
          {/* Double Up Arrow: Jump to Previous Folder Header */}
          <button
            type="button"
            onClick={handleJumpPrevFolder}
            title="Jump to Previous Folder (⤊)"
            className={`w-full py-1 border flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#252525] border-[#333333] hover:bg-[#303030] text-[#0078D4]'
                : 'bg-white border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#0078D4]'
            }`}
          >
            <ChevronsUp size={13} strokeWidth={2.2} />
          </button>

          {/* Single Up Arrow: Scroll Up 1 Viewport Step */}
          <button
            type="button"
            onClick={handleStepUp}
            title="Scroll Up (▲)"
            className={`w-full py-1 border flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#252525] border-[#333333] hover:bg-[#303030] text-[#4B5563] dark:text-[#AAAAAA]'
                : 'bg-white border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#4B5563]'
            }`}
          >
            <ChevronUp size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Middle Scroll Track with Thumb Indicator */}
      <div
        className="flex-1 w-full flex items-center justify-center py-2 cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickY = e.clientY - rect.top;
          const ratio = Math.max(0, Math.min(1, clickY / rect.height));
          const el = containerRef.current;
          if (el) {
            el.scrollTo({ top: ratio * (el.scrollHeight - el.clientHeight), behavior: 'smooth' });
          }
        }}
      >
        <div
          className={`w-3.5 h-full relative border ${
            isDark ? 'bg-[#181818] border-[#2C2C2C]' : 'bg-[#E2E8F0] border-[#CBD5E1]'
          }`}
        >
          {/* Proportional Scroll Thumb with Picasa double arrow indicator */}
          <div
            style={{
              top: `${scrollProgress}px`,
              height: `${thumbHeight}px`,
            }}
            className={`absolute left-0 right-0 border flex flex-col items-center justify-center shadow-xs transition-transform ${
              isDark
                ? 'bg-[#333333] border-[#444444] text-[#888888]'
                : 'bg-white border-[#94A3B8] text-[#64748B]'
            }`}
          >
            <div className="w-1.5 h-0.5 bg-current mb-0.5" />
            <div className="w-1.5 h-0.5 bg-current" />
          </div>
        </div>
      </div>

      {/* Bottom Jump Buttons */}
      <div className="flex flex-col space-y-0.5 w-full px-1">
        {/* Single Down Arrow: Scroll Down 1 Viewport Step */}
        <button
          type="button"
          onClick={handleStepDown}
          title="Scroll Down (▼)"
          className={`w-full py-1 border flex items-center justify-center transition-colors cursor-pointer ${
            isDark
              ? 'bg-[#252525] border-[#333333] hover:bg-[#303030] text-[#4B5563] dark:text-[#AAAAAA]'
              : 'bg-white border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#4B5563]'
          }`}
        >
          <ChevronDown size={13} strokeWidth={2.2} />
        </button>

        {/* Double Down Arrow: Jump to Next Folder Header */}
        <button
          type="button"
          onClick={handleJumpNextFolder}
          title="Jump to Next Folder (⤋)"
          className={`w-full py-1 border flex items-center justify-center transition-colors cursor-pointer ${
            isDark
              ? 'bg-[#252525] border-[#333333] hover:bg-[#303030] text-[#0078D4]'
              : 'bg-white border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#0078D4]'
          }`}
        >
          <ChevronsDown size={13} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};
