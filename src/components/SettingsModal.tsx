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
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  folders,
  onAddFolder,
  onRefresh,
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
              v1.0.0
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
                : 'border-transparent text-[#616161] hover:text-[#242424]'
            }`}
          >
            Indexed Folders ({folders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('faces')}
            className={`py-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
              activeSection === 'faces'
                ? 'border-[#0067C0] text-[#0067C0]'
                : 'border-transparent text-[#616161] hover:text-[#242424]'
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
                : 'border-transparent text-[#616161] hover:text-[#242424]'
            }`}
          >
            Maintenance & Storage
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
          {activeSection === 'folders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm text-[#111827]">Monitored PC Folders</h3>
                  <p className="text-[11px] text-[#616161] mt-0.5">
                    RedCaso monitors these locations for photos and automatically indexes changes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAddFolder}
                  className="h-[30px] px-3 bg-[#0067C0] hover:bg-[#005A9E] text-white rounded-[4px] flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus size={14} />
                  <span>Add Folder</span>
                </button>
              </div>

              <div className="border border-[#E5E5E5] rounded-[6px] divide-y divide-[#E5E5E5] max-h-[300px] overflow-y-auto bg-white">
                {folders.length === 0 ? (
                  <div className="p-6 text-center text-[#767676] text-xs">
                    No folders indexed yet. Click &quot;Add Folder&quot; above to select a folder.
                  </div>
                ) : (
                  folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="px-3.5 py-2.5 flex items-center justify-between hover:bg-[#F9F9F9] transition-colors"
                    >
                      <div className="flex items-center space-x-3 truncate mr-3">
                        <Folder size={16} className="text-[#0067C0] shrink-0" />
                        <div className="truncate">
                          <span className="text-xs text-[#242424] block truncate">
                            {folder.folder_name}
                          </span>
                          <span className="text-[10px] text-[#767676] truncate block" title={folder.folder_path}>
                            {folder.folder_path}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 shrink-0">
                        <span className="text-[11px] text-[#616161] px-2 py-0.5 rounded bg-[#F0F0F0]">
                          {folder.photo_count} photos
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
                  <span>Low-Resource Pacing Mode Active</span>
                </div>
                <p className="text-[11px] text-[#616161]">
                  Background scanner sleeps 20ms between photos, throttling disk I/O to &lt;2 MB/s
                  and CPU usage to &lt;4% to prevent system slowdowns.
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
                      Clears all cataloged photos, indexed directories, and face records from SQLite.
                      Your original photo files on disk will NOT be modified or deleted.
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleClearDatabase}
                    disabled={isClearing}
                    className="h-[30px] px-3 bg-red-600 hover:bg-red-700 text-white rounded-[4px] flex items-center space-x-1.5 transition-colors cursor-pointer text-xs"
                  >
                    <span>{isClearing ? 'Clearing...' : 'Clear Catalog Database'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-[48px] px-5 border-t border-[#E5E5E5] flex items-center justify-end bg-[#F9F9F9] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-4 bg-white border border-[#D1D1D1] hover:bg-[#F5F5F5] text-[#242424] rounded-[4px] text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
