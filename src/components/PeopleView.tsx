import React, { useState, useMemo, useEffect } from 'react';
import { MediaRecord, CharacterRecord, FaceRecord, FaceGroupRecord, FaceScanProgressPayload } from '../types';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { User, X, Check, Search, UserPlus, RefreshCw, Layers, Maximize2, ExternalLink, Copy, Tag, EyeOff } from 'lucide-react';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

interface PeopleViewProps {
  items: MediaRecord[];
  characters: CharacterRecord[];
  onSaveCharacter: (filePath: string, characterName: string) => void;
  onSelectMedia: (media: MediaRecord) => void;
  isScanning?: boolean;
  isDark?: boolean;
}

interface NewPersonDialogState {
  isOpen: boolean;
  faceId?: number;
  groupId?: number;
  filePath: string;
  imageSrc: string;
  name: string;
  email: string;
  syncWithWeb: boolean;
}

export const PeopleView: React.FC<PeopleViewProps> = ({
  items,
  characters,
  onSaveCharacter,
  onSelectMedia,
  isScanning: _isScanning = false,
  isDark = false,
}) => {
  const [faceGroups, setFaceGroups] = useState<FaceGroupRecord[]>([]);
  const [faces, setFaces] = useState<FaceRecord[]>([]);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [activeInputKey, setActiveInputKey] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  // Context menu state for face / group cards
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    group?: FaceGroupRecord;
    face?: FaceRecord;
  } | null>(null);

  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.group) {
      const g = contextMenu.group;
      return [
        {
          label: 'Add / Change Name',
          icon: <Tag size={13} />,
          onClick: () => {
            setActiveInputKey(`group_${g.group_id}`);
          },
        },
        {
          label: 'View Source Photo',
          icon: <Maximize2 size={13} />,
          onClick: () => {
            const parentMedia = items.find((m) => m.file_path === g.representative_file_path);
            if (parentMedia) onSelectMedia(parentMedia);
          },
        },
        {
          label: 'Locate on Disk',
          icon: <ExternalLink size={13} />,
          onClick: () => {
            invoke('reveal_in_explorer', { filePath: g.representative_file_path }).catch(console.error);
          },
        },
        {
          label: 'Copy Photo Path',
          icon: <Copy size={13} />,
          onClick: () => {
            navigator.clipboard.writeText(g.representative_file_path);
          },
        },
        { separator: true },
        {
          label: `Ignore Group (${g.face_count} faces)`,
          icon: <EyeOff size={13} />,
          danger: true,
          onClick: () => {
            handleIgnoreGroup(g.group_id);
          },
        },
      ];
    } else if (contextMenu.face) {
      const f = contextMenu.face;
      return [
        {
          label: 'Add / Change Name',
          icon: <Tag size={13} />,
          onClick: () => {
            setActiveInputKey(`face_${f.id}`);
          },
        },
        {
          label: 'View Source Photo',
          icon: <Maximize2 size={13} />,
          onClick: () => {
            const parentMedia = items.find((m) => m.file_path === f.file_path);
            if (parentMedia) onSelectMedia(parentMedia);
          },
        },
        {
          label: 'Locate on Disk',
          icon: <ExternalLink size={13} />,
          onClick: () => {
            invoke('reveal_in_explorer', { filePath: f.file_path }).catch(console.error);
          },
        },
        {
          label: 'Copy Photo Path',
          icon: <Copy size={13} />,
          onClick: () => {
            navigator.clipboard.writeText(f.file_path);
          },
        },
        { separator: true },
        {
          label: 'Ignore This Face',
          icon: <EyeOff size={13} />,
          danger: true,
          onClick: () => {
            handleIgnoreFace(f.id);
          },
        },
      ];
    }
    return [];
  }, [contextMenu, items, onSelectMedia]);

  // Live Face Scan Progress from pure Rust SeetaFace worker
  const [scanStats, setScanStats] = useState<FaceScanProgressPayload>({
    scanned: 0,
    total: items.length || 0,
    faces_found: 0,
    groups_count: 0,
    percentage: 0,
    is_complete: false,
  });

  // People Dialog State (Picasa 3 Modal from user screenshot)
  const [peopleDialog, setPeopleDialog] = useState<NewPersonDialogState>({
    isOpen: false,
    faceId: undefined,
    groupId: undefined,
    filePath: '',
    imageSrc: '',
    name: '',
    email: '',
    syncWithWeb: true,
  });

  // Group Review & Consolidation Modal State (Double click to review all detected photos in group)
  const [consolidatingGroup, setConsolidatingGroup] = useState<FaceGroupRecord | null>(null);
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<number>>(new Set());
  const [consolidationName, setConsolidationName] = useState<string>('');
  const [isSubmittingConsolidation, setIsSubmittingConsolidation] = useState<boolean>(false);

  const [dialogSearch, setDialogSearch] = useState('');

  // Fetch unnamed face groups & individual faces from backend
  const fetchFaceData = async () => {
    try {
      const [groups, allFaces] = await Promise.all([
        invoke<FaceGroupRecord[]>('get_unnamed_face_groups', { limit: 300 }),
        invoke<FaceRecord[]>('get_unnamed_faces', { limit: 500 }),
      ]);
      setFaceGroups(groups);
      setFaces(allFaces);
    } catch (e) {
      console.error('Failed to fetch face groups / faces', e);
    }
  };

  // Fetch scan statistics
  const fetchStats = async () => {
    try {
      const stats = await invoke<FaceScanProgressPayload>('get_face_scan_stats');
      setScanStats(stats);
    } catch (e) {
      console.error('Failed to get face scan stats', e);
    }
  };

  useEffect(() => {
    fetchFaceData();
    fetchStats();

    // Listen to real-time face scan progress emitted from Rust background thread
    let lastFetchTime = 0;
    const unlistenPromise = listen<FaceScanProgressPayload>('face_scan_progress', (event) => {
      setScanStats(event.payload);
      const now = Date.now();
      if (event.payload.is_complete || now - lastFetchTime > 3000) {
        lastFetchTime = now;
        fetchFaceData();
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Map each character to their first photo avatar for rich autocomplete (Screenshot 2)
  const characterAvatars = useMemo(() => {
    const map = new Map<string, string>();
    for (const char of characters) {
      const match = items.find((m) => m.character_tag === char.name);
      if (match) {
        map.set(
          char.name,
          match.thumbnail_path ? convertFileSrc(match.thumbnail_path) : convertFileSrc(match.file_path)
        );
      }
    }
    return map;
  }, [characters, items]);

  // Filtered Groups
  const visibleGroups = useMemo(() => {
    if (!searchFilter.trim()) return faceGroups;
    const query = searchFilter.toLowerCase();
    return faceGroups.filter(
      (g) =>
        g.representative_file_path.toLowerCase().includes(query) ||
        g.faces.some((f) => f.file_path.toLowerCase().includes(query))
    );
  }, [faceGroups, searchFilter]);

  // Filtered Unnamed Individual Faces (for expanded view)
  const visibleFaces = useMemo(() => {
    return faces.filter((face) => {
      if (!showIgnored && face.is_ignored) return false;
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        return face.file_path.toLowerCase().includes(query);
      }
      return true;
    });
  }, [faces, showIgnored, searchFilter]);

  // Assign name to a single face
  const handleAssignFaceName = async (faceId: number, filePath: string, name: string) => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    try {
      await invoke('assign_face_name', { faceId, name: trimmed });
      onSaveCharacter(filePath, trimmed);
      setFaces((prev) => prev.filter((f) => f.id !== faceId));
      setFaceGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            faces: g.faces.filter((f) => f.id !== faceId),
            face_count: g.faces.filter((f) => f.id !== faceId).length,
          }))
          .filter((g) => g.face_count > 0)
      );
      setNameInputs((prev) => {
        const next = { ...prev };
        delete next[`face_${faceId}`];
        return next;
      });
      setActiveInputKey(null);
    } catch (e) {
      console.error('Failed to assign face name', e);
    }
  };

  // Assign name to entire identity group (groups all identical faces in 1 click!)
  const handleAssignGroupName = async (groupId: number, name: string) => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    try {
      await invoke('assign_face_group_name', { groupId, name: trimmed });
      const targetGroup = faceGroups.find((g) => g.group_id === groupId);
      if (targetGroup) {
        // assign_face_group_name in Rust already tagged all photos in SQLite.
        // Notify parent once to update characters catalog without flooding IPC.
        onSaveCharacter(targetGroup.representative_file_path, trimmed);
      }
      setFaceGroups((prev) => prev.filter((g) => g.group_id !== groupId));
      setFaces((prev) => prev.filter((f) => f.group_id !== groupId));
      setNameInputs((prev) => {
        const next = { ...prev };
        delete next[`group_${groupId}`];
        return next;
      });
      setActiveInputKey(null);
    } catch (e) {
      console.error('Failed to assign face group name', e);
    }
  };

  // Ignore face (Picasa "X" button)
  const handleIgnoreFace = async (faceId: number) => {
    try {
      await invoke('ignore_face', { faceId });
      setFaces((prev) => prev.filter((f) => f.id !== faceId));
      setFaceGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            faces: g.faces.filter((f) => f.id !== faceId),
            face_count: g.faces.filter((f) => f.id !== faceId).length,
          }))
          .filter((g) => g.face_count > 0)
      );
    } catch (e) {
      console.error('Failed to ignore face', e);
    }
  };

  // Ignore entire group
  const handleIgnoreGroup = async (groupId: number) => {
    try {
      await invoke('ignore_face_group', { groupId });
      setFaceGroups((prev) => prev.filter((g) => g.group_id !== groupId));
      setFaces((prev) => prev.filter((f) => f.group_id !== groupId));
    } catch (e) {
      console.error('Failed to ignore face group', e);
    }
  };

  // Open Face Group Review & Consolidation Modal (Double click on face group)
  const handleOpenGroupConsolidation = (group: FaceGroupRecord) => {
    setConsolidatingGroup(group);
    setSelectedFaceIds(new Set(group.faces.map((f) => f.id)));
    const prefill = nameInputs[`group_${group.group_id}`] || group.person_name || '';
    setConsolidationName(prefill);
  };

  const handleToggleFaceSelection = (faceId: number) => {
    setSelectedFaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(faceId)) {
        next.delete(faceId);
      } else {
        next.add(faceId);
      }
      return next;
    });
  };

  const handleToggleAllConsolidation = () => {
    if (!consolidatingGroup) return;
    if (selectedFaceIds.size === consolidatingGroup.faces.length) {
      setSelectedFaceIds(new Set());
    } else {
      setSelectedFaceIds(new Set(consolidatingGroup.faces.map((f) => f.id)));
    }
  };

  const handleSaveConsolidation = async () => {
    if (!consolidatingGroup) return;
    const trimmed = consolidationName.trim();
    if (!trimmed || selectedFaceIds.size === 0) return;

    setIsSubmittingConsolidation(true);
    try {
      const confirmedFaces = consolidatingGroup.faces.filter((f) => selectedFaceIds.has(f.id));
      const excludedFaces = consolidatingGroup.faces.filter((f) => !selectedFaceIds.has(f.id));

      // 1. Assign name to all confirmed faces
      for (const face of confirmedFaces) {
        await invoke('assign_face_name', { faceId: face.id, name: trimmed });
      }

      // 2. Separate excluded faces from this group so they won't be mislabeled
      for (const face of excludedFaces) {
        await invoke('separate_face_from_group', { faceId: face.id });
      }

      // 3. Notify parent to update character catalog
      if (confirmedFaces.length > 0) {
        onSaveCharacter(confirmedFaces[0].file_path, trimmed);
      }

      // 4. Refresh data
      await fetchFaceData();
      await fetchStats();

      // 5. Close modal
      setConsolidatingGroup(null);
    } catch (e) {
      console.error('Failed to save group consolidation', e);
    } finally {
      setIsSubmittingConsolidation(false);
    }
  };

  // Trigger full rescan in background thread
  const handleTriggerFaceRescan = async () => {
    try {
      setScanStats((prev) => ({ ...prev, percentage: 0, is_complete: false, scanned: 0 }));
      setFaceGroups([]);
      setFaces([]);
      await invoke('trigger_face_rescan');
    } catch (e) {
      console.error('Failed to trigger face rescan', e);
    }
  };

  // Open the Picasa People Profile Dialog (Screenshot 3)
  const handleOpenPeopleDialog = (
    target: { faceId?: number; groupId?: number },
    filePath: string,
    initialName: string,
    imageSrc: string
  ) => {
    setPeopleDialog({
      isOpen: true,
      faceId: target.faceId,
      groupId: target.groupId,
      filePath,
      imageSrc,
      name: initialName,
      email: '',
      syncWithWeb: true,
    });
    setDialogSearch(initialName);
  };

  const totalGroupsCount = scanStats.groups_count || faceGroups.length;
  const totalFacesCount = scanStats.faces_found || faces.length;

  return (
    <div
      className={`flex-1 flex flex-col h-full overflow-hidden select-none font-sans transition-colors ${
        isDark ? 'bg-[#141414] text-[#E0E0E0]' : 'bg-[#ECEEF1] text-[#111827]'
      }`}
    >
      {/* 1. Authentic Picasa Header Banner (Matching user screenshot 1) */}
      <div
        className={`px-6 py-3.5 border-b shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs ${
          isDark ? 'bg-[#1C1C1C] border-[#2C2C2C]' : 'bg-white border-[#D6D9DE]'
        }`}
      >
        {/* Left: Avatar + Title + Counts */}
        <div className="flex items-start space-x-3.5">
          <div className="w-10 h-10 bg-[#4285F4]/15 border border-[#4285F4]/30 flex items-center justify-center shrink-0">
            <User size={22} className="text-[#0078D4]" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#1F2937]'}`}>
                Unnamed people
              </h2>
              <span className="text-[11px] font-mono text-[#6B7280] dark:text-[#999999]">
                {totalGroupsCount > 0 ? `${totalGroupsCount} Group(s), ` : ''}
                {totalFacesCount} Face(s)
              </span>
            </div>
            <p className="text-xs text-[#6B7280] dark:text-[#888888] mt-0.5">
              Select someone you know and add a name, or click the &quot;x&quot; to ignore that person.
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2">
          {/* Quick Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-[#9CA3AF]" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search file name..."
              className={`pl-7 pr-3 py-1.5 text-xs border outline-none transition-colors w-40 ${
                isDark
                  ? 'bg-[#222222] border-[#383838] focus:border-[#0078D4] text-white'
                  : 'bg-[#F9FAFB] border-[#D1D5DB] focus:border-[#0078D4] text-[#111827]'
              }`}
            />
          </div>

          <button
            type="button"
            onClick={() => setExpandedGroups(!expandedGroups)}
            className={`px-3 py-1.5 text-xs font-normal border flex items-center space-x-1.5 transition-colors cursor-pointer ${
              expandedGroups
                ? 'bg-[#0078D4] text-white border-[#0078D4]'
                : isDark
                ? 'border-[#333333] hover:bg-[#252525] text-[#CCCCCC]'
                : 'border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#475569]'
            }`}
          >
            <Layers size={12} />
            <span>{expandedGroups ? 'Collapse groups' : 'Expand groups'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowIgnored(!showIgnored)}
            className={`px-3 py-1.5 text-xs font-normal border transition-colors cursor-pointer ${
              showIgnored
                ? 'bg-[#0078D4] text-white border-[#0078D4]'
                : isDark
                ? 'border-[#333333] hover:bg-[#252525] text-[#CCCCCC]'
                : 'border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#475569]'
            }`}
          >
            {showIgnored ? 'Hide ignored' : 'Show ignored faces'}
          </button>

          <button
            type="button"
            onClick={handleTriggerFaceRescan}
            className={`px-3 py-1.5 text-xs font-normal border flex items-center space-x-1.5 transition-colors cursor-pointer ${
              isDark
                ? 'border-[#333333] hover:bg-[#252525] text-[#CCCCCC]'
                : 'border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#475569]'
            }`}
            title="Trigger face recognition scan across photo catalog"
          >
            <RefreshCw size={12} className={_isScanning ? 'animate-spin' : ''} />
            <span>Rescan faces</span>
          </button>
        </div>
      </div>



      {/* 3. Main Grid of Face Cards */}
      <div className="flex-1 overflow-y-auto p-6" onClick={() => setActiveInputKey(null)}>
        {(!expandedGroups ? visibleGroups.length === 0 : visibleFaces.length === 0) ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            {!scanStats.is_complete && scanStats.percentage < 100 && scanStats.total > 0 ? (
              <>
                <div className="w-14 h-14 bg-[#0078D4]/10 border border-[#0078D4]/20 flex items-center justify-center mb-3">
                  <RefreshCw size={26} className="text-[#0078D4] animate-spin" />
                </div>
                <h3 className="font-normal text-sm">Clustering and detecting faces in background...</h3>
                <p className="text-xs text-[#6B7280] dark:text-[#888888] mt-1 max-w-sm">
                  RedCaso is clustering faces by identity with cosine similarity. Non-face photos (screenshots, kettles, landscapes) are excluded.
                </p>
                <div className="text-xs font-mono text-[#0078D4] font-normal mt-3">
                  {scanStats.percentage}% completed ({scanStats.scanned} of {scanStats.total})
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-[#107C41]/10 border border-[#107C41]/20 flex items-center justify-center mb-3">
                  <Check size={28} className="text-[#107C41]" />
                </div>
                <h3 className="font-normal text-sm">All faces named!</h3>
                <p className="text-xs text-[#6B7280] dark:text-[#888888] mt-1 max-w-sm">
                  All detected people in your photo collection have been assigned names or ignored.
                </p>
              </>
            )}
          </div>
        ) : !expandedGroups ? (
          /* ================= DEFAULT GROUP VIEW (1 Representative Card per Person) ================= */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {visibleGroups.map((group) => {
              const faceAvatarSrc = convertFileSrc(group.representative_crop_path);
              const inputKey = `group_${group.group_id}`;
              const currentInput = nameInputs[inputKey] || '';
              const isInputActive = activeInputKey === inputKey;

              const matchingProfiles = characters.filter((c) =>
                c.name.toLowerCase().includes(currentInput.toLowerCase())
              );

              return (
                <div
                  key={`group_${group.group_id}`}
                  onDoubleClick={() => handleOpenGroupConsolidation(group)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, group });
                  }}
                  className={`border shadow-xs group flex flex-col transition-all relative ${
                    isDark
                      ? 'bg-[#1C1C1C] border-[#2C2C2C] hover:border-[#0078D4]'
                      : 'bg-white border-[#D6D9DE] hover:border-[#0078D4]'
                  }`}
                >
                  {/* Square Face Image Container (Tightly cropped 160×160) */}
                  <div
                    className="relative w-full aspect-square overflow-hidden bg-[#E2E8F0] dark:bg-[#252525] cursor-pointer"
                    onClick={() => {
                      const parentMedia =
                        items.find((m) => m.file_path === group.representative_file_path) ||
                        items.find((m) => m.id === group.faces[0]?.media_id);
                      if (parentMedia) onSelectMedia(parentMedia);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleOpenGroupConsolidation(group);
                    }}
                    title={`Double click to review & consolidate all ${group.face_count} detected photos`}
                  >
                    <img
                      src={faceAvatarSrc}
                      alt="Detected person"
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />

                    {/* Stack count badge (e.g. "11" for 11 faces of this person) */}
                    {group.face_count > 1 && (
                      <div
                        className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/75 backdrop-blur-xs text-white text-[10px] font-mono font-normal border border-white/20 shadow-xs flex items-center space-x-1"
                        title={`${group.face_count} photos of this person grouped together`}
                      >
                        <Layers size={9} />
                        <span>{group.face_count}</span>
                      </div>
                    )}

                    {/* Top Right "X" Ignore Group Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIgnoreGroup(group.group_id);
                      }}
                      title="Ignore all faces in this group"
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-[#E81123] text-white flex items-center justify-center border border-white/20 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </div>

                  {/* Bottom "Add a name" Input Box & Autocomplete */}
                  <div
                    className={`p-1.5 border-t relative ${
                      isDark ? 'border-[#2C2C2C] bg-[#1E1E1E]' : 'border-[#E5E7EB] bg-white'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (currentInput.trim()) {
                          const existing = characters.find(
                            (c) => c.name.toLowerCase() === currentInput.trim().toLowerCase()
                          );
                          if (existing) {
                            handleAssignGroupName(group.group_id, existing.name);
                          } else {
                            // Open Picasa People Profile dialog to create new person!
                            handleOpenPeopleDialog(
                              { groupId: group.group_id },
                              group.representative_file_path,
                              currentInput.trim(),
                              faceAvatarSrc
                            );
                          }
                        }
                      }}
                      className="flex items-center"
                    >
                      <input
                        type="text"
                        value={currentInput}
                        onFocus={() => setActiveInputKey(inputKey)}
                        onChange={(e) =>
                          setNameInputs((prev) => ({
                            ...prev,
                            [inputKey]: e.target.value,
                          }))
                        }
                        placeholder="Add a name"
                        className={`w-full px-2 py-1 text-xs border outline-none transition-colors ${
                          isDark
                            ? 'bg-[#141414] border-[#333333] focus:border-[#0078D4] text-white placeholder-[#777777]'
                            : 'bg-[#F9FAFB] border-[#D1D5DB] focus:border-[#0078D4] text-[#111827] placeholder-[#9CA3AF]'
                        }`}
                      />
                      {currentInput.trim() && (
                        <button
                          type="submit"
                          className="ml-1 px-1.5 py-1 bg-[#0078D4] hover:bg-[#106EBE] text-white text-[11px] font-normal cursor-pointer shrink-0"
                          title="Assign name to all photos in this group"
                        >
                          <Check size={11} />
                        </button>
                      )}
                    </form>

                    {/* Autocomplete Recommendation Dropdown */}
                    {isInputActive && (
                      <div
                        className={`absolute left-0 right-0 top-full mt-0.5 z-40 border shadow-xl max-h-48 overflow-y-auto animate-in fade-in duration-100 ${
                          isDark ? 'bg-[#202020] border-[#383838] text-white' : 'bg-white border-[#C7CCD1] text-[#111827]'
                        }`}
                      >
                        {matchingProfiles.map((char) => {
                          const avatar = characterAvatars.get(char.name);
                          return (
                            <button
                              key={char.name}
                              type="button"
                              onClick={() => handleAssignGroupName(group.group_id, char.name)}
                              className={`w-full px-2 py-1.5 flex items-center space-x-2 text-left text-xs transition-colors cursor-pointer border-b last:border-b-0 border-inherit ${
                                isDark ? 'hover:bg-[#0078D4] hover:text-white' : 'hover:bg-[#EBF3FB] hover:text-[#0078D4]'
                              }`}
                            >
                              {avatar ? (
                                <img
                                  src={avatar}
                                  alt={char.name}
                                  className="w-5 h-5 object-cover border border-inherit shrink-0"
                                />
                              ) : (
                                <div className="w-5 h-5 bg-[#0078D4] text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                                  {char.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="font-normal truncate text-[11px] flex-1">{char.name}</span>
                              <span className="text-[10px] opacity-60 font-mono">({char.count})</span>
                            </button>
                          );
                        })}

                        {/* "New Person" option if typed name doesn't match exactly */}
                        {currentInput.trim() &&
                          !characters.some((c) => c.name.toLowerCase() === currentInput.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenPeopleDialog(
                                  { groupId: group.group_id },
                                  group.representative_file_path,
                                  currentInput.trim(),
                                  faceAvatarSrc
                                )
                              }
                              className={`w-full px-2 py-1.5 flex items-center space-x-1.5 text-left text-xs font-normal text-[#0078D4] transition-colors cursor-pointer ${
                                isDark ? 'hover:bg-[#2A2A2A]' : 'hover:bg-[#F3F4F6]'
                              }`}
                            >
                              <UserPlus size={12} />
                              <span className="truncate">Add new person &quot;{currentInput.trim()}&quot;...</span>
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ================= EXPANDED GROUPS VIEW (Shows all individual face crops) ================= */
          <div className="space-y-6">
            {visibleGroups.map((group) => {
              const groupInputKey = `group_exp_${group.group_id}`;
              const currentGroupInput = nameInputs[groupInputKey] || '';
              return (
                <div
                  key={`exp_group_${group.group_id}`}
                  className={`border p-4 shadow-2xs ${
                    isDark ? 'bg-[#1A1A1A] border-[#2C2C2C]' : 'bg-white border-[#D6D9DE]'
                  }`}
                >
                  {/* Group Subheader */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-inherit">
                    <div className="flex items-center space-x-2">
                      <Layers size={14} className="text-[#0078D4]" />
                      <span className="text-xs font-bold">Group #{group.group_id}</span>
                      <span className="text-[11px] text-[#6B7280] font-mono">({group.face_count} photos)</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (currentGroupInput.trim()) {
                            handleAssignGroupName(group.group_id, currentGroupInput.trim());
                          }
                        }}
                        className="flex items-center space-x-1"
                      >
                        <input
                          type="text"
                          value={currentGroupInput}
                          onChange={(e) =>
                            setNameInputs((prev) => ({
                              ...prev,
                              [groupInputKey]: e.target.value,
                            }))
                          }
                          placeholder="Name this entire group..."
                          className={`px-2 py-1 text-xs border outline-none ${
                            isDark
                              ? 'bg-[#141414] border-[#383838] text-white focus:border-[#0078D4]'
                              : 'bg-[#F9FAFB] border-[#D1D5DB] text-[#111827] focus:border-[#0078D4]'
                          }`}
                        />
                        <button
                          type="submit"
                          className="px-2 py-1 text-xs font-normal bg-[#0078D4] hover:bg-[#106EBE] text-white cursor-pointer"
                        >
                          Name All
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => handleIgnoreGroup(group.group_id)}
                        className={`px-2 py-1 text-xs font-normal border cursor-pointer ${
                          isDark ? 'border-[#383838] hover:bg-[#252525]' : 'border-[#CBD5E1] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        Ignore Group
                      </button>
                    </div>
                  </div>

                  {/* Individual Face Cards inside Group */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {group.faces.map((face) => {
                      const faceAvatarSrc = convertFileSrc(face.crop_path);
                      const inputKey = `face_${face.id}`;
                      const currentInput = nameInputs[inputKey] || '';
                      return (
                        <div
                          key={`face_${face.id}`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, face });
                          }}
                          className={`border shadow-xs group flex flex-col relative ${
                            isDark
                              ? 'bg-[#161616] border-[#303030] hover:border-[#0078D4]'
                              : 'bg-[#FAFAFA] border-[#D1D5DB] hover:border-[#0078D4]'
                          }`}
                        >
                          <div
                            className="relative w-full aspect-square overflow-hidden cursor-pointer"
                            onClick={() => {
                              const parentMedia = items.find((m) => m.file_path === face.file_path);
                              if (parentMedia) onSelectMedia(parentMedia);
                            }}
                          >
                            <img
                              src={faceAvatarSrc}
                              alt="Face"
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleIgnoreFace(face.id);
                              }}
                              className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-[#E81123] text-white flex items-center justify-center border border-white/20 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          </div>
                          <div className="p-1 border-t border-inherit">
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (currentInput.trim()) {
                                  handleAssignFaceName(face.id, face.file_path, currentInput.trim());
                                }
                              }}
                              className="flex items-center"
                            >
                              <input
                                type="text"
                                value={currentInput}
                                onChange={(e) =>
                                  setNameInputs((prev) => ({
                                    ...prev,
                                    [inputKey]: e.target.value,
                                  }))
                                }
                                placeholder="Add name"
                                className={`w-full px-1.5 py-0.5 text-[11px] border outline-none ${
                                  isDark
                                    ? 'bg-[#121212] border-[#383838] text-white'
                                    : 'bg-white border-[#D1D5DB] text-[#111827]'
                                }`}
                              />
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
          isDark={isDark}
        />
      )}

      {/* 3.5 Face Group Review & Consolidation Modal (Double click on face group) */}
      {consolidatingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-6 select-none animate-in fade-in duration-150 font-normal">
          <div className="bg-white border border-[#D1D5DB] rounded-[8px] shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-[#242424] font-normal">
            {/* 1. Modal Header */}
            <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between gap-4 bg-[#F9FAFB]">
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-[#D1D5DB] shrink-0 bg-slate-100 shadow-2xs">
                  <img
                    src={convertFileSrc(consolidatingGroup.representative_crop_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="truncate">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base text-[#111827] font-normal">
                      Review Detected Photos
                    </h3>
                    <span className="px-2 py-0.5 rounded-[4px] bg-[#EDF5FD] text-[#0067C0] text-[11px] font-normal">
                      Group #{consolidatingGroup.group_id}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5 font-normal">
                    {consolidatingGroup.faces.length} detected photo{consolidatingGroup.faces.length === 1 ? '' : 's'}. Uncheck any photo that is not this person.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConsolidatingGroup(null)}
                className="p-1.5 rounded-[4px] hover:bg-slate-200 text-[#6B7280] transition-colors cursor-pointer"
                title="Close without saving"
              >
                <X size={16} />
              </button>
            </div>

            {/* 2. Name Input & Quick Select Controls */}
            <div className="px-6 py-3 border-b border-[#E5E7EB] bg-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[240px]">
                <label className="text-[11px] text-[#6B7280] block mb-1 font-normal">Person name</label>
                <input
                  type="text"
                  autoFocus
                  value={consolidationName}
                  onChange={(e) => setConsolidationName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveConsolidation();
                    if (e.key === 'Escape') setConsolidatingGroup(null);
                  }}
                  placeholder="Enter person's name (e.g. Alice, Nishant)..."
                  className="w-full px-3 py-1.5 text-xs border border-[#D1D5DB] rounded-[4px] bg-[#F9FAFB] focus:bg-white focus:border-[#0067C0] focus:ring-1 focus:ring-[#0067C0] outline-none transition-all font-normal"
                />
                {characters.length > 0 && (
                  <div className="flex items-center space-x-1.5 mt-1.5 overflow-x-auto">
                    <span className="text-[10px] text-[#9CA3AF] font-normal">Suggestions:</span>
                    {characters
                      .filter((c) => !consolidationName || c.name.toLowerCase().includes(consolidationName.toLowerCase()))
                      .slice(0, 4)
                      .map((char) => (
                        <button
                          key={char.name}
                          type="button"
                          onClick={() => setConsolidationName(char.name)}
                          className="px-2 py-0.5 rounded-[3px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[11px] text-[#374151] transition-colors cursor-pointer font-normal"
                        >
                          {char.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Selection counts & Select All / Deselect All */}
              <div className="flex items-center space-x-2 pt-4">
                <span className="text-xs text-[#6B7280] font-normal">
                  {selectedFaceIds.size} of {consolidatingGroup.faces.length} confirmed
                </span>
                <div className="h-3 w-[1px] bg-[#D1D5DB]" />
                <button
                  type="button"
                  onClick={handleToggleAllConsolidation}
                  className="text-xs text-[#0067C0] hover:underline cursor-pointer font-normal"
                >
                  {selectedFaceIds.size === consolidatingGroup.faces.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            </div>

            {/* 3. Constituent Photos Grid */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#F9FAFB]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {consolidatingGroup.faces.map((face) => {
                  const isConfirmed = selectedFaceIds.has(face.id);
                  const parentMedia = items.find((m) => m.id === face.media_id || m.file_path === face.file_path);
                  const imgSrc = convertFileSrc(face.crop_path);

                  return (
                    <div
                      key={face.id}
                      onClick={() => handleToggleFaceSelection(face.id)}
                      className={`rounded-[6px] border overflow-hidden transition-all cursor-pointer relative group flex flex-col bg-white ${
                        isConfirmed
                          ? 'border-[#0067C0] ring-2 ring-[#0067C0]/20 shadow-xs'
                          : 'border-[#E5E7EB] opacity-50 grayscale hover:opacity-80'
                      }`}
                    >
                      {/* Face Thumbnail */}
                      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
                        <img
                          src={imgSrc}
                          alt=""
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        {/* Top-Right Toggle Checkbox */}
                        <div
                          className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors shadow-xs ${
                            isConfirmed
                              ? 'bg-[#0067C0] text-white'
                              : 'bg-white/80 border border-[#9CA3AF] text-transparent'
                          }`}
                        >
                          <Check size={12} strokeWidth={2.5} />
                        </div>

                        {/* Status label badge */}
                        <div className="absolute bottom-1.5 left-1.5">
                          {isConfirmed ? (
                            <span className="px-1.5 py-0.5 rounded-[3px] bg-black/60 backdrop-blur-xs text-white text-[9px] font-normal">
                              Matched
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-[3px] bg-red-600/80 backdrop-blur-xs text-white text-[9px] font-normal">
                              Excluded
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Footer details with filename */}
                      <div className="p-2 border-t border-[#F3F4F6] text-left">
                        <span className="text-[11px] text-[#374151] block truncate font-normal" title={face.file_path}>
                          {parentMedia?.file_name || face.file_path.split(/[\/]/).pop()}
                        </span>
                        <span className="text-[10px] text-[#9CA3AF] block font-normal">
                          {isConfirmed ? 'Will be saved with name' : 'Will be removed from group'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Action Footer Buttons */}
            <div className="px-6 py-3 border-t border-[#E5E7EB] bg-white flex items-center justify-between gap-3 font-normal">
              <button
                type="button"
                onClick={() => setConsolidatingGroup(null)}
                className="px-4 py-1.5 rounded-[4px] border border-[#D1D5DB] hover:bg-[#F3F4F6] text-xs text-[#374151] transition-colors cursor-pointer font-normal"
              >
                Cancel
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={selectedFaceIds.size === 0 || !consolidationName.trim() || isSubmittingConsolidation}
                  onClick={handleSaveConsolidation}
                  className={`px-4 py-1.5 rounded-[4px] text-xs transition-colors flex items-center space-x-1.5 font-normal shadow-xs cursor-pointer ${
                    selectedFaceIds.size > 0 && consolidationName.trim() && !isSubmittingConsolidation
                      ? 'bg-[#0067C0] hover:bg-[#005A9E] active:bg-[#004578] text-white'
                      : 'bg-slate-200 text-[#9CA3AF] cursor-not-allowed'
                  }`}
                >
                  {isSubmittingConsolidation ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} strokeWidth={2} />
                  )}
                  <span>
                    Save with name ({selectedFaceIds.size} photo{selectedFaceIds.size === 1 ? '' : 's'})
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Authentic Picasa "People" Dialog / Profile Creator (Screenshot 3) */}
      {peopleDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-[680px] border shadow-2xl p-5 select-none font-sans ${
              isDark ? 'bg-[#1E1E1E] border-[#383838] text-white' : 'bg-[#F2F4F7] border-[#A0A0A0] text-[#111827]'
            }`}
          >
            {/* Modal Titlebar */}
            <div className="flex items-center justify-between border-b pb-2.5 mb-4 border-inherit">
              <h3 className="font-normal text-sm">People</h3>
              <button
                onClick={() => setPeopleDialog((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 hover:bg-[#E5E7EB] dark:hover:bg-[#2C2C2C] text-[#6B7280] dark:text-[#AAAAAA] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Body (Matching user's Screenshot 3) */}
            <div className="flex gap-5">
              {/* Left Column: Search & Existing Contacts List */}
              <div className="w-[280px] flex flex-col space-y-2">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-normal shrink-0">Search:</span>
                  <input
                    type="text"
                    value={dialogSearch}
                    onChange={(e) => setDialogSearch(e.target.value)}
                    className={`flex-1 px-2 py-1 border text-xs outline-none ${
                      isDark
                        ? 'bg-[#141414] border-[#383838] text-white focus:border-[#0078D4]'
                        : 'bg-white border-[#B8BDC2] text-[#111827] focus:border-[#0078D4]'
                    }`}
                  />
                </div>

                {/* Contacts Box */}
                <div
                  className={`h-56 border overflow-y-auto p-1 space-y-0.5 ${
                    isDark ? 'bg-[#141414] border-[#383838]' : 'bg-white border-[#B8BDC2]'
                  }`}
                >
                  {characters
                    .filter((c) => c.name.toLowerCase().includes(dialogSearch.toLowerCase()))
                    .map((char) => (
                      <div
                        key={char.name}
                        onClick={() => {
                          setPeopleDialog((prev) => ({ ...prev, name: char.name }));
                        }}
                        className={`px-2 py-1 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                          peopleDialog.name === char.name
                            ? 'bg-[#0078D4] text-white'
                            : isDark
                            ? 'hover:bg-[#252525]'
                            : 'hover:bg-[#EAECEF]'
                        }`}
                      >
                        <span className="truncate">{char.name}</span>
                        <span className="text-[10px] opacity-70">({char.count})</span>
                      </div>
                    ))}
                </div>

                {/* Buttons Below List */}
                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    disabled
                    className={`flex-1 py-1 text-xs border font-normal opacity-50 cursor-not-allowed ${
                      isDark ? 'border-[#383838] bg-[#222222]' : 'border-[#CBD5E1] bg-[#F1F5F9]'
                    }`}
                  >
                    Delete Person
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeopleDialog((prev) => ({ ...prev, name: '' }));
                    }}
                    className={`flex-1 py-1 text-xs border font-normal cursor-pointer transition-colors ${
                      isDark
                        ? 'border-[#383838] bg-[#252525] hover:bg-[#303030]'
                        : 'border-[#CBD5E1] bg-white hover:bg-[#F8FAFC]'
                    }`}
                  >
                    New Person
                  </button>
                </div>
              </div>

              {/* Right Column: Person Profile Form & Face Crop Preview */}
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Photo Preview of Selected Face */}
                  <div className="flex items-center space-x-3 p-2 border border-inherit bg-white/50 dark:bg-black/20">
                    <img
                      src={peopleDialog.imageSrc}
                      alt="Face preview"
                      className="w-14 h-14 object-cover object-top border border-inherit shrink-0"
                    />
                    <div>
                      <div className="font-normal text-xs">Face Crop Preview</div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#888888] mt-0.5">
                        This face will be established as this person&apos;s primary profile avatar.
                      </div>
                    </div>
                  </div>

                  {/* Name Input */}
                  <div className="flex items-center space-x-3 text-xs">
                    <span className="w-16 font-normal text-right shrink-0">Name:</span>
                    <input
                      type="text"
                      value={peopleDialog.name}
                      onChange={(e) => setPeopleDialog((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Papa, Nishant..."
                      className={`flex-1 px-2.5 py-1.5 border text-xs outline-none ${
                        isDark
                          ? 'bg-[#141414] border-[#383838] text-white focus:border-[#0078D4]'
                          : 'bg-white border-[#B8BDC2] text-[#111827] focus:border-[#0078D4]'
                      }`}
                    />
                  </div>

                  {/* Email Input */}
                  <div className="flex items-start space-x-3 text-xs">
                    <span className="w-16 font-normal text-right shrink-0 pt-1">Email(s):</span>
                    <textarea
                      rows={3}
                      value={peopleDialog.email}
                      onChange={(e) => setPeopleDialog((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="Optional email addresses"
                      className={`flex-1 px-2.5 py-1.5 border text-xs outline-none resize-none ${
                        isDark
                          ? 'bg-[#141414] border-[#383838] text-white focus:border-[#0078D4]'
                          : 'bg-white border-[#B8BDC2] text-[#111827] focus:border-[#0078D4]'
                      }`}
                    />
                  </div>

                  {/* Web Album Sync Checkbox */}
                  <div className="flex items-center space-x-2 pl-20 text-xs">
                    <input
                      type="checkbox"
                      id="syncFaceTags"
                      checked={peopleDialog.syncWithWeb}
                      onChange={(e) => setPeopleDialog((prev) => ({ ...prev, syncWithWeb: e.target.checked }))}
                      className="accent-[#0078D4] cursor-pointer"
                    />
                    <label htmlFor="syncFaceTags" className="cursor-pointer text-[#4B5563] dark:text-[#CCCCCC]">
                      Sync Face Tags with Web Albums / Google Photos
                    </label>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-4 border-t border-inherit flex items-center justify-between mt-4">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border font-normal ${
                        isDark ? 'border-[#383838] bg-[#222222]' : 'border-[#CBD5E1] bg-white'
                      }`}
                    >
                      Manage Online Contacts
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border font-normal ${
                        isDark ? 'border-[#383838] bg-[#222222]' : 'border-[#CBD5E1] bg-white'
                      }`}
                    >
                      Refresh Contacts
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (peopleDialog.name.trim()) {
                          if (peopleDialog.groupId != null) {
                            handleAssignGroupName(peopleDialog.groupId, peopleDialog.name.trim());
                          } else if (peopleDialog.faceId != null) {
                            handleAssignFaceName(
                              peopleDialog.faceId,
                              peopleDialog.filePath,
                              peopleDialog.name.trim()
                            );
                          }
                        }
                        setPeopleDialog((prev) => ({ ...prev, isOpen: false }));
                      }}
                      disabled={!peopleDialog.name.trim()}
                      className="px-5 py-1.5 text-xs font-normal bg-[#0078D4] hover:bg-[#106EBE] disabled:opacity-50 text-white cursor-pointer"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeopleDialog((prev) => ({ ...prev, isOpen: false }))}
                      className={`px-4 py-1.5 text-xs font-normal border cursor-pointer ${
                        isDark ? 'border-[#383838] bg-[#222222]' : 'border-[#CBD5E1] bg-white'
                      }`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
