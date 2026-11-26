import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  id?: string;
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  isDark?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
  isDark = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust positioning to stay within viewport
  const menuWidth = 230;
  const itemHeight = 28;
  const estimatedHeight = items.length * itemHeight + 16;

  const posX = x + menuWidth > window.innerWidth ? Math.max(10, x - menuWidth) : x;
  const posY = y + estimatedHeight > window.innerHeight ? Math.max(10, y - estimatedHeight) : y;

  return (
    <div
      ref={menuRef}
      style={{ left: `${posX}px`, top: `${posY}px` }}
      className={`fixed z-50 w-[230px] border shadow-xl select-none font-sans py-1 text-xs animate-in fade-in zoom-in-95 duration-100 ${
        isDark
          ? 'bg-[#222222] border-[#3E3E3E] text-[#E0E0E0]'
          : 'bg-[#F9FAFB] border-[#A8ADB3] text-[#1F2937]'
      }`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return (
            <div
              key={`sep_${idx}`}
              className={`my-1 border-t ${
                isDark ? 'border-[#333333]' : 'border-[#E0E3E7]'
              }`}
            />
          );
        }

        return (
          <button
            key={item.id || `item_${idx}`}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled && item.onClick) {
                item.onClick();
                onClose();
              }
            }}
            className={`w-full px-3 py-1.5 flex items-center justify-between text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              item.danger
                ? isDark
                  ? 'hover:bg-[#E81123] hover:text-white text-[#F87171]'
                  : 'hover:bg-[#E81123] hover:text-white text-[#DC2626]'
                : isDark
                ? 'hover:bg-[#0078D4] hover:text-white'
                : 'hover:bg-[#0078D4] hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              {item.icon && <span className="shrink-0 opacity-85">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </div>
            {item.shortcut && (
              <span className="text-[10px] opacity-60 font-mono ml-2 shrink-0">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
