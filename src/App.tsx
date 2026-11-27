import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  FolderRecord,
  MediaRecord,
  CharacterRecord,
  ScanProgressPayload,
  FolderScannedPayload,
  FaceScanProgressPayload,
} from './types';
import { ModernTopBar } from './components/ModernTopBar';
import { ModernSidebar } from './components/ModernSidebar';
import { ModernGallery } from './components/ModernGallery';
import { PhotoDetailsPane } from './components/PhotoDetailsPane';
import { ModernToast } from './components/ModernToast';
import { ModernStatusBar } from './components/ModernStatusBar';
import { PeopleView } from './components/PeopleView';
import { PhotoViewer } from './components/PhotoViewer';
import { SettingsModal } from './components/SettingsModal';
import { useFluentDialog } from './components/FluentDialog';

export default function App() {
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'photos' | 'recently' | 'favorites' | 'people'>('photos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Selected photo for Right Inspector pane
  const [selectedMedia, setSelectedMedia] = useState<MediaRecord | null>(null);
  // Fullscreen Lightbox PhotoViewer & Editor
  const [viewerMedia, setViewerMedia] = useState<MediaRecord | null>(null);
  // Inspector toggle
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  // Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Face recognition stats & user toggle
  const [faceCount, setFaceCount] = useState<number>(0);
  const [facePercentage, setFacePercentage] = useState<number>(100);
  const [faceEngineEnabled, setFaceEngineEnabled] = useState<boolean>(false);

  // Dialog hook
  const { prompt } = useFluentDialog();

  // Floating Toast Notification (Starts null, only shows on real events)
  const [toastNotification, setToastNotification] = useState<{
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // Fetch catalog from backend
  const loadCatalog = useCallback(async () => {
    try {
      const [fetchedFolders, fetchedCharacters] = await Promise.all([
        invoke<FolderRecord[]>('get_folders'),
        invoke<CharacterRecord[]>('get_characters'),
      ]);
      if (fetchedFolders) {
        setFolders(fetchedFolders);
      }
      if (fetchedCharacters) {
        setCharacters(fetchedCharacters);
      }
    } catch (err) {
      console.error('Failed to load catalog:', err);
    }
  }, []);

  const loadMedia = useCallback(async () => {
    try {
      const fetchedMedia = await invoke<MediaRecord[]>('get_media', {
        folderId: selectedFolderId,
        characterTag: selectedCharacter === '__unnamed__' ? null : selectedCharacter,
      });
      if (fetchedMedia) {
        setMedia(fetchedMedia);
        setSelectedMedia((prev) => {
          if (prev && fetchedMedia.some((m) => m.id === prev.id)) return prev;
          return fetchedMedia.length > 0 ? fetchedMedia[0] : null;
        });
      }
    } catch (err) {
      console.error('Failed to load media:', err);
    }
  }, [selectedFolderId, selectedCharacter]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // Load initial face engine enabled status
  useEffect(() => {
    invoke<boolean>('get_face_engine_enabled')
      .then(setFaceEngineEnabled)
      .catch(() => {});
  }, []);

  // Toggle face engine worker
  const handleToggleFaceEngine = async () => {
    const next = !faceEngineEnabled;
    try {
      await invoke('set_face_engine_enabled', { enabled: next });
      setFaceEngineEnabled(next);
      if (next) {
        invoke<FaceScanProgressPayload>('get_face_scan_stats')
          .then((stats) => {
            setFaceCount(stats.faces_found);
            setFacePercentage(stats.percentage || 100);
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to toggle face engine:', err);
    }
  };

  // Debounced loadMedia to prevent IPC floods when streaming scanned folders
  const loadMediaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoadMedia = useCallback(() => {
    if (loadMediaDebounceRef.current) {
      clearTimeout(loadMediaDebounceRef.current);
    }
    loadMediaDebounceRef.current = setTimeout(() => {
      loadMedia();
    }, 350);
  }, [loadMedia]);

  // Real-time face recognition stats
  useEffect(() => {
    invoke<FaceScanProgressPayload>('get_face_scan_stats')
      .then((stats) => {
        setFaceCount(stats.faces_found);
        setFacePercentage(stats.percentage || 100);
      })
      .catch(() => {});

    const unlistenPromise = listen<FaceScanProgressPayload>('face_scan_progress', (e) => {
      setFaceCount(e.payload.faces_found);
      setFacePercentage(e.payload.percentage);
    });

    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  // Real-time incremental streaming of scanned folders
  useEffect(() => {
    const unlistenFolderScanned = listen<FolderScannedPayload>(
      'folder_scanned',
      (event) => {
        setIsScanning(true);
        const payload = event.payload;

        setFolders((prev) => {
          const index = prev.findIndex((f) => f.id === payload.folder_id);
          const newFolder: FolderRecord = {
            id: payload.folder_id,
            folder_name: payload.folder_name,
            folder_path: payload.folder_path,
            photo_count: payload.photo_count,
            sync_enabled: false,
            last_scanned_at: new Date().toISOString(),
          };

          if (index >= 0) {
            const updated = [...prev];
            updated[index] = newFolder;
            return updated;
          }
          return [...prev, newFolder];
        });

        debouncedLoadMedia();

        setToastNotification({
          title: 'Folder scan complete',
          description: `Added ${payload.photo_count} photos from ${payload.folder_name}.`,
          actionLabel: 'View photos',
          onAction: () => {
            setSelectedFolderId(payload.folder_id);
            setActiveTab('photos');
          },
        });
      }
    );

    const unlistenScanProgress = listen<ScanProgressPayload>(
      'scan_progress',
      (event) => {
        if (event.payload.status === 'complete') {
          setIsScanning(false);
          loadCatalog();
          loadMedia();
        } else {
          setIsScanning(true);
        }
      }
    );

    return () => {
      unlistenFolderScanned.then((unlisten) => unlisten());
      unlistenScanProgress.then((unlisten) => unlisten());
    };
  }, [loadCatalog, loadMedia]);

  // Trigger Paced Scan of PC Drives
  const handleTriggerScan = async (customPath?: string) => {
    try {
      setIsScanning(true);
      let paths: string[] = [];
      if (customPath) {
        paths = [customPath];
      } else {
        paths = await invoke<string[]>('get_default_scan_paths');
      }
      await invoke('scan_directories', { roots: paths });
    } catch (err) {
      console.error('Scan trigger error:', err);
      setIsScanning(false);
    }
  };

  // Add folder prompt using Fluent Dialog
  const handleAddFolder = async () => {
    const inputPath = await prompt({
      title: 'Index Folder',
      message: 'Enter the absolute path of the folder to index and monitor for photos:',
      placeholder: 'C:\\Users\\...\\Pictures',
      confirmLabel: 'Add Folder',
    });
    if (inputPath && inputPath.trim()) {
      handleTriggerScan(inputPath.trim());
    }
  };

  // Save Character / Tagging
  const handleSaveCharacter = async (filePath: string, characterName: string) => {
    try {
      await invoke('assign_character', {
        filePath,
        characterName,
      });
      loadCatalog();
      loadMedia();
      setSelectedMedia((prev) =>
        prev && prev.file_path === filePath
          ? { ...prev, character_tag: characterName }
          : prev
      );
    } catch (err) {
      console.error('Failed to assign character:', err);
    }
  };

  // Filter and sort media
  const visibleMedia = useMemo(() => {
    let result = [...media];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.file_name.toLowerCase().includes(q) ||
          (m.character_tag && m.character_tag.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.file_name.localeCompare(b.file_name);
      }
      if (sortBy === 'size') {
        return b.file_size - a.file_size;
      }
      const dateA = a.date_taken || '';
      const dateB = b.date_taken || '';
      return dateB.localeCompare(dateA);
    });

    return result;
  }, [media, searchQuery, sortBy]);

  return (
    <div className="h-screen w-screen flex flex-col select-none overflow-hidden bg-[#FAFAFA] text-[#242424]">
      {/* 1. Top Bar & Search */}
      <ModernTopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onTriggerScan={() => handleTriggerScan()}
        onFindFaces={() => {
          setActiveTab('people');
          if (!faceEngineEnabled) {
            handleToggleFaceEngine();
          }
        }}
        isScanning={isScanning}
        onAddFolder={handleAddFolder}
        onOpenInfo={() => setIsSettingsOpen(true)}
        isFaceEngineEnabled={faceEngineEnabled}
        onToggleFaceEngine={handleToggleFaceEngine}
      />

      {/* 2. Workspace: Sidebar + Full-Area Canvas + Right Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Navigation Sidebar (Standard Layout) */}
        <ModernSidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            if (tab !== 'photos') {
              setSelectedFolderId(null);
              setSelectedCharacter(null);
            }
          }}
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={(id) => {
            setSelectedFolderId(id);
            setSelectedCharacter(null);
            setActiveTab('photos');
          }}
          totalPhotos={media.length}
          totalPeople={faceCount}
          isScanning={isScanning}
          onTriggerScan={() => handleTriggerScan()}
          onAddFolder={handleAddFolder}
          onOpenSettings={() => setIsSettingsOpen(true)}
          faceCount={faceCount}
          facePercentage={facePercentage}
          isFaceScanning={facePercentage < 100 && media.length > 0 && faceEngineEnabled}
        />

        {/* Main Content Area: Fills 100% of remaining width */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-white">
          {activeTab === 'people' ? (
            <PeopleView
              items={media}
              characters={characters}
              onSaveCharacter={handleSaveCharacter}
              onSelectMedia={(item) => {
                setSelectedMedia(item);
              }}
              isScanning={isScanning}
              isDark={false}
              isFaceEngineEnabled={faceEngineEnabled}
              onToggleFaceEngine={handleToggleFaceEngine}
            />
          ) : (
            <ModernGallery
              media={visibleMedia}
              folders={folders}
              characters={characters}
              unnamedFaceCount={faceCount}
              title={
                selectedFolderId
                  ? folders.find((f) => f.id === selectedFolderId)?.folder_name || 'Folder photos'
                  : selectedCharacter
                  ? `Photos of ${selectedCharacter}`
                  : 'All photos'
              }
              subtitle={
                selectedFolderId
                  ? folders.find((f) => f.id === selectedFolderId)?.folder_path || ''
                  : 'Your memories, together in one place.'
              }
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              selectedMedia={selectedMedia}
              onSelectMedia={(photo) => {
                setSelectedMedia(photo);
              }}
              onOpenViewer={(photo) => setViewerMedia(photo)}
              sortBy={sortBy}
              onSortChange={setSortBy}
              isDetailsOpen={isDetailsOpen}
              onToggleDetails={() => {
                if (!isDetailsOpen && !selectedMedia && visibleMedia.length > 0) {
                  setSelectedMedia(visibleMedia[0]);
                }
                setIsDetailsOpen(!isDetailsOpen);
              }}
              onOpenPeopleView={() => setActiveTab('people')}
              onSelectCharacter={(name) => {
                setSelectedCharacter(name);
                setActiveTab('photos');
              }}
              onRefresh={() => {
                loadCatalog();
                loadMedia();
              }}
            />
          )}
        </main>

        {/* Right-Hand Split Pane: Photo Details Inspector (Width 320px) */}
        {isDetailsOpen && activeTab !== 'people' && (
          <PhotoDetailsPane
            photo={selectedMedia}
            onClose={() => setIsDetailsOpen(false)}
            onOpenViewer={(photo) => setViewerMedia(photo)}
            onRefresh={() => {
              loadCatalog();
              loadMedia();
            }}
          />
        )}

        {/* Floating Notification Toast */}
        {toastNotification && (
          <ModernToast
            title={toastNotification.title}
            description={toastNotification.description}
            primaryActionLabel={toastNotification.actionLabel || 'Review'}
            onPrimaryAction={() => {
              if (toastNotification.onAction) {
                toastNotification.onAction();
              } else {
                setActiveTab('people');
              }
              setToastNotification(null);
            }}
            onDismiss={() => setToastNotification(null)}
          />
        )}
      </div>

      {/* 3. Bottom Status Bar (Height 28px) */}
      <ModernStatusBar
        totalPhotos={media.length}
        totalFolders={folders.length}
        selectedCount={selectedMedia ? 1 : 0}
        visibleCount={visibleMedia.length}
        isScanning={isScanning}
        facePercentage={facePercentage}
      />

      {/* 4. Fullscreen Photo Viewer & Editor Lightbox */}
      {viewerMedia && (
        <PhotoViewer
          media={viewerMedia}
          items={visibleMedia}
          onSelectMedia={(target) => setViewerMedia(target)}
          onClose={() => setViewerMedia(null)}
          onSaveCharacter={handleSaveCharacter}
          isDark={false}
        />
      )}

      {/* 5. Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        folders={folders}
        onAddFolder={handleAddFolder}
        onRefresh={() => {
          loadCatalog();
          loadMedia();
        }}
        isFaceEngineEnabled={faceEngineEnabled}
        onToggleFaceEngine={handleToggleFaceEngine}
      />
    </div>
  );
}

