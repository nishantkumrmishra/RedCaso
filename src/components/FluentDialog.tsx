import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { AlertTriangle, Info, FolderPlus, HelpCircle, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

interface PromptOptions {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface AlertOptions {
  title: string;
  message: string;
  buttonLabel?: string;
}

interface DialogContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  alert: (options: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | null>(null);

type DialogState =
  | {
      type: 'confirm';
      options: ConfirmOptions;
      resolve: (val: boolean) => void;
    }
  | {
      type: 'prompt';
      options: PromptOptions;
      resolve: (val: string | null) => void;
    }
  | {
      type: 'alert';
      options: AlertOptions;
      resolve: () => void;
    }
  | null;

export const FluentDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ type: 'confirm', options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setInputValue(options.defaultValue || '');
      setDialog({ type: 'prompt', options, resolve });
    });
  }, []);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      setDialog({ type: 'alert', options, resolve });
    });
  }, []);

  useEffect(() => {
    if (dialog && dialog.type === 'prompt') {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [dialog]);

  // Keyboard shortcut listener
  useEffect(() => {
    if (!dialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dialog.type === 'confirm') dialog.resolve(false);
        else if (dialog.type === 'prompt') dialog.resolve(null);
        else if (dialog.type === 'alert') dialog.resolve();
        setDialog(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dialog.type === 'confirm') dialog.resolve(true);
        else if (dialog.type === 'prompt') dialog.resolve(inputValue);
        else if (dialog.type === 'alert') dialog.resolve();
        setDialog(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog, inputValue]);

  const handleClose = () => {
    if (!dialog) return;
    if (dialog.type === 'confirm') dialog.resolve(false);
    else if (dialog.type === 'prompt') dialog.resolve(null);
    else if (dialog.type === 'alert') dialog.resolve();
    setDialog(null);
  };

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.type === 'confirm') dialog.resolve(true);
    else if (dialog.type === 'prompt') dialog.resolve(inputValue);
    else if (dialog.type === 'alert') dialog.resolve();
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt, alert }}>
      {children}

      {/* Fluent Software Dialog Modal */}
      {dialog && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-xs select-none"
          onClick={handleClose}
        >
          <div
            className="w-[440px] max-w-[92vw] bg-[#FCFCFC] border border-[#D1D1D1] rounded-[8px] shadow-2xl p-6 text-[#242424] flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Icon and Title */}
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                {dialog.type === 'confirm' && (dialog.options.isDestructive ? (
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle size={18} />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#EDF4FA] text-[#0067C0] flex items-center justify-center shrink-0 mt-0.5">
                    <HelpCircle size={18} />
                  </div>
                ))}

                {dialog.type === 'prompt' && (
                  <div className="w-8 h-8 rounded-full bg-[#EDF4FA] text-[#0067C0] flex items-center justify-center shrink-0 mt-0.5">
                    <FolderPlus size={18} />
                  </div>
                )}

                {dialog.type === 'alert' && (
                  <div className="w-8 h-8 rounded-full bg-[#EDF4FA] text-[#0067C0] flex items-center justify-center shrink-0 mt-0.5">
                    <Info size={18} />
                  </div>
                )}

                <div>
                  <h3 className="text-[15px] text-[#111827] leading-tight">
                    {dialog.options.title}
                  </h3>
                  <p className="text-xs text-[#616161] mt-1.5 leading-relaxed">
                    {dialog.options.message}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="p-1 rounded hover:bg-[#EAEAEA] text-[#767676] hover:text-[#111827] transition-colors cursor-pointer shrink-0 ml-2"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Prompt Input Field */}
            {dialog.type === 'prompt' && (
              <div className="pt-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={dialog.options.placeholder || ''}
                  className="w-full h-[34px] px-3 bg-white border border-[#A3A3A3] focus:border-[#0067C0] rounded-[4px] text-xs outline-none text-[#242424] transition-all"
                />
              </div>
            )}

            {/* Action Buttons Footer */}
            <div className="flex items-center justify-end space-x-2 pt-2">
              {dialog.type === 'confirm' && (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="h-[32px] px-4 rounded-[4px] bg-[#F3F3F3] hover:bg-[#EAEAEA] border border-[#D8D8D8] text-xs text-[#242424] transition-colors cursor-pointer"
                  >
                    {dialog.options.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className={`h-[32px] px-4 rounded-[4px] text-xs text-white transition-colors cursor-pointer shadow-xs ${
                      dialog.options.isDestructive
                        ? 'bg-[#C42B1C] hover:bg-[#B32719] active:bg-[#991E13]'
                        : 'bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578]'
                    }`}
                  >
                    {dialog.options.confirmLabel || (dialog.options.isDestructive ? 'Delete' : 'Confirm')}
                  </button>
                </>
              )}

              {dialog.type === 'prompt' && (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="h-[32px] px-4 rounded-[4px] bg-[#F3F3F3] hover:bg-[#EAEAEA] border border-[#D8D8D8] text-xs text-[#242424] transition-colors cursor-pointer"
                  >
                    {dialog.options.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="h-[32px] px-4 rounded-[4px] bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578] text-xs text-white transition-colors cursor-pointer shadow-xs"
                  >
                    {dialog.options.confirmLabel || 'OK'}
                  </button>
                </>
              )}

              {dialog.type === 'alert' && (
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="h-[32px] px-4 rounded-[4px] bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578] text-xs text-white transition-colors cursor-pointer shadow-xs"
                >
                  {dialog.options.buttonLabel || 'OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useFluentDialog = (): DialogContextType => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useFluentDialog must be used within a FluentDialogProvider');
  }
  return context;
};
