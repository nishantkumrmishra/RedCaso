import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  FolderRecord,
  MediaRecord,
  CharacterRecord,
  ScanProgressPayload,
  FolderScannedPayload,
  SyncProgressPayload,
} from './types';
import { TitleBar } from './components/TitleBar';
import { HeaderBar } from './components/HeaderBar';
import { FolderSidebar } from './components/FolderSidebar';
import { VirtualGallery } from './components/VirtualGallery';
import { PhotoViewer } from './components/PhotoViewer';
import { Sparkles } from 'lucide-react';

export function App() {
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<ScanProgressPayload | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgressPayload | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaRecord | null>(null);

  // Device/System Theme Detection (Defaulting to Light mode matching Windows 11 device state)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('redcaso_theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false; // Default to Light Mode!
  });

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('redcaso_theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  // Listen to OS system theme changes if not manually set
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('redcaso_theme')) {
        setIsDark(e.matches);
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Sticking preview card for photos scanned in real time (Picasa Photo Detector style)
  const [scanningPreview, setScanningPreview] = useState<{
    imagePath: string;
    imageName: string;
    folderName: string;
    photoCount: number;
  } | null>(null);

  // Load initial catalog
  const loadCatalog = useCallback(async () => {
    try {
      const [loadedFolders, loadedChars] = await Promise.all([
        invoke<FolderRecord[]>('get_folders'),
        invoke<CharacterRecord[]>('get_characters'),
      ]);
      setFolders(loadedFolders);
      setCharacters(loadedChars);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    }
  }, []);

  // Load media items for the selected view
  const loadMedia = useCallback(async () => {
    try {
      const items = await invoke<MediaRecord[]>('get_media', {
        folderId: selectedFolderId,
        characterTag: selectedCharacter,
      });
      setMedia(items);
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

  // Real-time incremental streaming of scanned folders
  useEffect(() => {
    const unlistenFolderScanned = listen<FolderScannedPayload>(
      'folder_scanned',
      (event) => {
        setIsScanning(true);
        const payload = event.payload;

        // 1. Immediately insert folder into sidebar
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

        // 2. Refresh media catalog
        loadMedia();

        // 3. Trigger sticking desktop notification preview
        setScanningPreview({
          imagePath: payload.preview_image_path,
          imageName: payload.preview_image_name,
          folderName: payload.folder_name,
          photoCount: payload.photo_count,
        });

        // Clear preview notification after 3.5s
        setTimeout(() => {
          setScanningPreview((current) =>
            current?.imagePath === payload.preview_image_path ? null : current
          );
        }, 3500);
      }
    );

    const unlistenScanComplete = listen<ScanProgressPayload>(
      'scan_complete',
      () => {
        setIsScanning(false);
        loadCatalog();
        loadMedia();
      }
    );

    const unlistenSyncProgress = listen<SyncProgressPayload>(
      'sync_progress',
      (event) => {
        setSyncProgress(event.payload);
      }
    );

    return () => {
      unlistenFolderScanned.then((fn) => fn());
      unlistenScanComplete.then((fn) => fn());
      unlistenSyncProgress.then((fn) => fn());
    };
  }, [loadCatalog, loadMedia]);

  // Scan triggers
  const handleTriggerScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgress({
      status: 'Scanning Windows PC drives...',
      current_folder: 'Discovering...',
      folders_found: 0,
      images_found: 0,
    });

    try {
      const defaultPaths = await invoke<string[]>('get_default_scan_paths');
      await invoke('scan_directories', { roots: defaultPaths });
    } catch (err) {
      console.error('Scan failed to trigger:', err);
      setIsScanning(false);
    }
  };

  // Google Photos Sync toggle
  const handleToggleSync = async (folderId: number, currentEnabled: boolean) => {
    try {
      const nextState = !currentEnabled;
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, sync_enabled: nextState } : f))
      );
      await invoke('toggle_folder_sync', {
        folderId,
        enabled: nextState,
      });
    } catch (err) {
      console.error('Failed to toggle sync:', err);
      loadCatalog();
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

  // Developer Mode: Clear database
  const handleClearCatalog = async () => {
    if (
      window.confirm(
        'Developer Mode: Are you sure you want to reset and clear all indexed folders and photos?'
      )
    ) {
      try {
        await invoke('clear_catalog');
        setSelectedFolderId(null);
        setSelectedCharacter(null);
        setSelectedMedia(null);
        setFolders([]);
        setMedia([]);
        setCharacters([]);
      } catch (err) {
        console.error('Failed to clear catalog:', err);
      }
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

  const currentTitle = useMemo(() => {
    if (selectedFolderId !== null) {
      const f = folders.find((item) => item.id === selectedFolderId);
      return f ? f.folder_name : 'Selected Folder';
    }
    if (selectedCharacter !== null) {
      return `Person: ${selectedCharacter}`;
    }
    return 'All Photos';
  }, [selectedFolderId, selectedCharacter, folders]);

  return (
    <div
      className={`h-screen w-screen flex flex-col font-sans select-none overflow-hidden transition-colors ${
        isDark ? 'bg-[#141414] text-[#E0E0E0]' : 'bg-[#ECEEF1] text-[#111827]'
      }`}
    >
      {/* 1. Windows 11 Fluent Clean TitleBar */}
      <TitleBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      {/* 2. Secondary Filter Bar */}
      <HeaderBar
        title={currentTitle}
        totalVisible={visibleMedia.length}
        scanProgress={scanProgress}
        syncProgress={syncProgress}
        sortBy={sortBy}
        onSortChange={setSortBy}
        isDark={isDark}
      />

      {/* 3. Main Workspace: Gallery + Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Content Gallery */}
        <main
          className={`flex-1 flex flex-col h-full overflow-hidden transition-colors ${
            isDark ? 'bg-[#141414]' : 'bg-[#ECEEF1]'
          }`}
        >
          <VirtualGallery
            items={visibleMedia}
            folders={folders}
            onSelectMedia={(item) => setSelectedMedia(item)}
            onToggleSync={handleToggleSync}
            isDark={isDark}
          />
        </main>

        {/* Right Folder Tree Sidebar */}
        <FolderSidebar
          folders={folders}
          characters={characters}
          selectedFolderId={selectedFolderId}
          selectedCharacter={selectedCharacter}
          onSelectFolder={(id) => {
            setSelectedFolderId(id);
            setSelectedCharacter(null);
          }}
          onSelectCharacter={(name) => {
            setSelectedCharacter(name);
            setSelectedFolderId(null);
          }}
          onToggleSync={handleToggleSync}
          onTriggerScan={handleTriggerScan}
          onClearCatalog={handleClearCatalog}
          isScanning={isScanning}
          isDark={isDark}
        />

        {/* Sticking Real-time Preview Notification Card */}
        {scanningPreview && (
          <div
            className={`absolute bottom-4 right-4 z-50 w-72 backdrop-blur-md border shadow-2xl p-2.5 flex items-center space-x-3 animate-in fade-in slide-in-from-bottom-3 duration-200 ${
              isDark
                ? 'bg-[#202020]/95 border-[#0078D4] text-white'
                : 'bg-white/95 border-[#0078D4] text-[#111827]'
            }`}
          >
            <div className="w-12 h-12 overflow-hidden bg-[#E5E7EB] border border-[#D1D5DB] shrink-0 flex items-center justify-center">
              <img
                src={convertFileSrc(scanningPreview.imagePath)}
                alt={scanningPreview.imageName}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center space-x-1.5 text-[10px] text-[#0078D4] font-semibold uppercase tracking-wider mb-0.5">
                <Sparkles size={11} className="text-[#0078D4] animate-pulse" />
                <span>Found New Folder</span>
              </div>
              <div
                className={`text-xs font-semibold truncate ${
                  isDark ? 'text-white' : 'text-[#111827]'
                }`}
                title={scanningPreview.folderName}
              >
                {scanningPreview.folderName} ({scanningPreview.photoCount})
              </div>
              <div className="text-[10px] text-[#6B7280] truncate font-mono mt-0.5">
                {scanningPreview.imageName}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Full Picasa Photo Viewer & Editor */}
      {selectedMedia && (
        <PhotoViewer
          media={selectedMedia}
          items={visibleMedia}
          onSelectMedia={(item) => setSelectedMedia(item)}
          onClose={() => setSelectedMedia(null)}
          onSaveCharacter={handleSaveCharacter}
          isDark={isDark}
        />
      )}
    </div>
  );
}

export default App;
