import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderRecord, FaceScanProgressPayload } from '../types';
import { useFluentDialog } from './FluentDialog';
import {
  X,
  Folder,
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Cpu,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: FolderRecord[];
  onAddFolder: () => void;
  onRefresh: () => void;
  isFaceEngineEnabled?: boolean;
  onToggleFaceEngine?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  folders,
  onAddFolder,
  onRefresh,
  isFaceEngineEnabled = false,
  onToggleFaceEngine,
}) => {
  const [activeSection, setActiveSection] = useState<'folders' | 'faces' | 'maintenance'>('folders');
  const [faceStats, setFaceStats] = useState<FaceScanProgressPayload | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const { confirm } = useFluentDialog();

  React.useEffect(() => {
    if (isOpen) {
      invoke<FaceScanProgressPayload>('get_face_scan_stats')
        .then(setFaceStats)
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTriggerFaceRescan = async () => {
    setIsRescanning(true);
    try {
      await invoke('trigger_face_rescan');
      const stats = await invoke<FaceScanProgressPayload>('get_face_scan_stats');
      setFaceStats(stats);
      onRefresh();
    } catch (err) {
      console.error('Failed to trigger face rescan:', err);
    } finally {
      setTimeout(() => setIsRescanning(false), 800);
    }
  };

  const handleClearDatabase = async () => {
    const confirmed = await confirm({
      title: 'Reset & Clear Catalog Database',
      message:
        'Are you sure you want to reset and clear the entire catalog database? All indexed folders and face groups will be cleared. Your original photo files on disk will NOT be modified or deleted.',
      confirmLabel: 'Clear Catalog Database',
      cancelLabel: 'Cancel',
      isDestructive: true,
    });
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await invoke('clear_catalog');
      onRefresh();
      onClose();
    } catch (err) {
      console.error('Failed to clear catalog:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleOpenFolder = (path: string) => {
    invoke('open_folder_in_explorer', { folderPath: path }).catch(console.error);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="w-[620px] max-h-[85vh] bg-[#FCFCFC] border border-[#D1D1D1] rounded-[8px] shadow-2xl flex flex-col overflow-hidden text-[#242424]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h-[52px] px-5 border-b border-[#E5E5E5] flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center space-x-2.5">
            <h2 className="text-base text-[#111827]">Settings</h2>
            <span className="text-[11px] text-[#767676] px-2 py-0.5 rounded bg-[#F0F0F0]">
              v1.5.0
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#F0F0F0] text-[#616161] hover:text-[#111827] transition-colors cursor-pointer"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Subnav */}
        <div className="flex border-b border-[#E5E5E5] bg-[#F9F9F9] px-5 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveSection('folders')}
            className={`py-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
              activeSection === 'folders'
                ? 'border-[#0067C0] text-[#0067C0]'
                : 'border-transparent text-[#616161] hover:text-[#111827]'
            }`}
          >
            Indexed Folders
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('faces')}
            className={`py-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
              activeSection === 'faces'
                ? 'border-[#0067C0] text-[#0067C0]'
                : 'border-transparent text-[#616161] hover:text-[#111827]'
            }`}
          >
            Face Recognition
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('maintenance')}
            className={`py-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
              activeSection === 'maintenance'
                ? 'border-[#0067C0] text-[#0067C0]'
                : 'border-transparent text-[#616161] hover:text-[#111827]'
            }`}
          >
            Performance & Database
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {activeSection === 'folders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm text-[#111827]">Watched Photo Directories</h3>
                  <p className="text-[11px] text-[#616161] mt-0.5">
                    RedCaso monitors these local folders and discovers new photos in the background.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAddFolder}
                  className="h-[30px] px-3 bg-[#0067C0] hover:bg-[#005A9E] text-white rounded-[4px] flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus size={13} />
                  <span>Add Folder</span>
                </button>
              </div>

              <div className="divide-y divide-[#EAEAEA] border border-[#E5E5E5] rounded-[6px] bg-white overflow-hidden">
                {folders.length === 0 ? (
                  <div className="p-6 text-center text-[#767676]">
                    No custom folders configured.
                  </div>
                ) : (
                  folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="p-3 flex items-center justify-between hover:bg-[#F9F9F9] transition-colors"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <Folder size={16} className="text-[#0067C0] shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs text-[#242424] block truncate">
                            {folder.folder_name}
                          </span>
                          <span className="text-[11px] text-[#767676] block truncate">
                            {folder.folder_path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0 ml-4">
                        <span className="text-[11px] text-[#767676]">
                          {folder.photo_count.toLocaleString()} photos
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFolder(folder.folder_path)}
                          title="Open folder in File Explorer"
                          className="p-1 rounded hover:bg-[#EAEAEA] text-[#616161] hover:text-[#0067C0] transition-colors cursor-pointer"
                        >
                          <ExternalLink size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeSection === 'faces' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm text-[#111827]">Face Recognition Engine</h3>
                <p className="text-[11px] text-[#616161] mt-0.5">
                  128-dimensional spherical gradient embeddings powered by on-device SeetaFace.
                </p>
              </div>

              {/* Master On/Off Toggle */}
              <div className="p-3.5 bg-white border border-[#E5E5E5] rounded-[6px] flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs text-[#242424] font-medium block">
                    Background Face Recognition
                  </span>
                  <span className="text-[11px] text-[#767676] block mt-0.5">
                    {isFaceEngineEnabled
                      ? 'Active: analyzing faces on cached thumbnails only when computer is idle.'
                      : 'Paused: consumes 0% CPU and 0 MB/s disk to prevent disk noise and computer vibration.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleFaceEngine}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isFaceEngineEnabled ? 'bg-[#0067C0]' : 'bg-[#D1D1D1]'
                  }`}
                  title="Toggle background face recognition"
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-all ${
                      isFaceEngineEnabled ? 'left-[26px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-white border border-[#E5E5E5] rounded-[6px]">
                  <span className="text-[11px] text-[#767676] block">Scanned Photos</span>
                  <span className="text-lg text-[#111827] mt-1 block">
                    {faceStats ? `${faceStats.scanned.toLocaleString()} / ${faceStats.total.toLocaleString()}` : '—'}
                  </span>
                </div>
                <div className="p-3 bg-white border border-[#E5E5E5] rounded-[6px]">
                  <span className="text-[11px] text-[#767676] block">Faces Detected</span>
                  <span className="text-lg text-[#0067C0] mt-1 block">
                    {faceStats ? faceStats.faces_found.toLocaleString() : '—'}
                  </span>
                </div>
                <div className="p-3 bg-white border border-[#E5E5E5] rounded-[6px]">
                  <span className="text-[11px] text-[#767676] block">Person Clusters</span>
                  <span className="text-lg text-[#111827] mt-1 block">
                    {faceStats ? faceStats.groups_count.toLocaleString() : '—'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-[#EDF5FD] border border-[#D0E3F7] rounded-[6px] flex items-start space-x-2.5">
                <ShieldCheck size={16} className="text-[#0067C0] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[#1D3B5A] leading-relaxed">
                  All facial analysis and cluster embeddings run 100% locally on your computer.
                  No facial vectors, photos, or biometric tags are ever transmitted over the network.
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#242424] block">Re-cluster All Faces</span>
                  <span className="text-[11px] text-[#767676]">
                    Re-scans library and re-groups faces using structural contrast embeddings.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerFaceRescan}
                  disabled={isRescanning}
                  className="h-[30px] px-3 bg-white border border-[#D1D1D1] hover:bg-[#F5F5F5] text-[#242424] rounded-[4px] flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <RefreshCw size={13} className={isRescanning ? 'animate-spin' : ''} />
                  <span>{isRescanning ? 'Reclustering...' : 'Re-scan Faces'}</span>
                </button>
              </div>
            </div>
          )}

          {activeSection === 'maintenance' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm text-[#111827]">Maintenance & Database</h3>
                <p className="text-[11px] text-[#616161] mt-0.5">
                  Manage SQLite catalog caching, thumbnail generation, and database state.
                </p>
              </div>

              <div className="p-3 bg-white border border-[#E5E5E5] rounded-[6px] space-y-2">
                <div className="flex items-center space-x-2 text-xs text-[#242424]">
                  <Cpu size={14} className="text-[#0067C0]" />
                  <span>Picasa 3 Low-Resource Architecture Active</span>
                </div>
                <p className="text-[11px] text-[#616161]">
                  Directory crawler performs metadata-only reads (&lt;0.5 MB/s). Background thumbnailer and face detector never run at the same time and strictly yield during active disk operations.
                </p>
              </div>

              <div className="p-4 border border-red-200 bg-red-50/50 rounded-[6px] space-y-3">
                <div className="flex items-start space-x-2.5">
                  <Trash2 size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs text-red-700 block">
                      Reset & Clear Catalog Database
                    </span>
                    <span className="text-[11px] text-red-600/80 leading-relaxed block mt-0.5">
                      Clears all indexed photo listings, folders, and face recognition records from
                      the local cache. Your original photo files on your disk will NOT be modified or deleted.
                    </span>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleClearDatabase}
                    disabled={isClearing}
                    className="h-[30px] px-3 bg-red-600 hover:bg-red-700 text-white rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isClearing ? 'Clearing Catalog...' : 'Clear Catalog Database'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
