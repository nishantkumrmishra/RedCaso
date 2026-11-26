import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { FolderScannedPayload } from '../types';
import { Sparkles, X } from 'lucide-react';

export const DetectorWidget: React.FC = () => {
  const [data, setData] = useState<FolderScannedPayload | null>(null);

  useEffect(() => {
    const unlisten = listen<FolderScannedPayload>('folder_scanned', (event) => {
      setData(event.payload);
    });

    return () => {
      unlisten.then((unsub) => unsub());
    };
  }, []);

  const handleRestore = () => {
    invoke('restore_main_window');
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke('hide_detector_toast');
  };

  if (!data) return null;

  return (
    <div
      onClick={handleRestore}
      className="w-full h-full bg-[#1C1C1C]/95 backdrop-blur-md border border-[#0078D4] shadow-2xl p-2.5 flex items-center space-x-3 select-none cursor-pointer font-sans overflow-hidden"
    >
      {/* Actual photo preview */}
      <div className="w-13 h-13 overflow-hidden bg-[#141414] border border-[#2D2D2D] shrink-0 flex items-center justify-center">
        <img
          src={convertFileSrc(data.preview_image_path)}
          alt={data.preview_image_name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Scanned Details */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-[10px] text-[#60CDFF] font-semibold uppercase tracking-wider">
            <Sparkles size={11} className="text-[#60CDFF] animate-pulse" />
            <span>Picasa Photo Detector</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-[#333333] text-[#888888] hover:text-white transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>

        <div className="text-xs font-semibold text-white truncate mt-0.5" title={data.folder_name}>\n          {data.folder_name} ({data.photo_count} photos)\n        </div>
        <div className="text-[10px] text-[#888888] truncate font-mono">
          {data.preview_image_name}
        </div>
      </div>
    </div>
  );
};
