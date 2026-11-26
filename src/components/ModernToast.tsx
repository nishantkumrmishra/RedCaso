import React, { useEffect } from 'react';
import { Check, X } from 'lucide-react';

interface ModernToastProps {
  title: string;
  description: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export const ModernToast: React.FC<ModernToastProps> = ({
  title,
  description,
  primaryActionLabel = 'Review',
  onPrimaryAction,
  onDismiss,
  autoDismissMs = 5000,
}) => {
  useEffect(() => {
    if (autoDismissMs > 0) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [autoDismissMs, onDismiss]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[380px] min-h-[148px] bg-[#FBFBFB] border border-[#D8D8D8] rounded-[8px] p-4 shadow-2xl select-none flex flex-col justify-between font-normal animate-in slide-in-from-bottom-5 duration-200"
    >
      {/* 1. Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded-[4px] bg-[#0067C0] flex items-center justify-center text-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span className="text-xs text-[#242424] font-normal">RedCaso</span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-[#767676] font-normal">Just now</span>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded hover:bg-[#EAEAEA] text-[#616161] cursor-pointer transition-colors"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 2. Main Content Body */}
      <div className="flex items-start space-x-3 my-2">
        <div className="w-[23px] h-[23px] rounded-full bg-[#E4F3E5] flex items-center justify-center shrink-0 mt-0.5 text-[#2E7D32]">
          <Check size={14} strokeWidth={2} />
        </div>
        <div>
          <h4 className="text-[13px] text-[#242424] font-normal leading-snug">{title}</h4>
          <p className="text-[11px] text-[#616161] font-normal mt-0.5 leading-normal">
            {description}
          </p>
        </div>
      </div>

      {/* 3. Action Buttons Row */}
      <div className="flex items-center space-x-2 pt-1">
        {onPrimaryAction && (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="flex-1 h-[28px] bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578] text-white text-xs font-normal rounded-[4px] shadow-xs flex items-center justify-center transition-colors cursor-pointer"
          >
            {primaryActionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 h-[28px] bg-[#F2F2F2] hover:bg-[#EAEAEA] border border-[#DEDEDE] text-[#242424] text-xs font-normal rounded-[3.5px] flex items-center justify-center transition-colors cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
