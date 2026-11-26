import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { FolderRecord, CharacterRecord, FaceScanProgressPayload } from '../types';
import { useFluentDialog } from './FluentDialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Folder,
  FolderOpen,
  HardDrive,
  RefreshCw,
  User,
  Trash2,
  Code,
  Search,
  Star,
  BookMarked,
  HelpCircle,
  ChevronUp,
  Sparkles,
  ExternalLink,
  Copy,
  Edit3,
} from 'lucide-react';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

interface FolderSidebarProps {
  folders: FolderRecord[];
  characters: CharacterRecord[];
  selectedFolderId: number | null;
  selectedCharacter: string | null;
  onSelectFolder: (id: number | null) => void;
  onSelectCharacter: (name: string | null) => void;
  onToggleSync: (folderId: number, currentEnabled: boolean) => void;
  onTriggerScan: () => void;
  onClearCatalog: () => void;
  onRefreshCatalog?: () => void;
  isScanning: boolean;
  isDark?: boolean;
}

export interface FolderTreeNode {
  id: string; // unique full path
  name: string; // folder name
  fullPath: string;
  folderId?: number; // DB folder id if this node has direct photos
  photoCount: number;
  totalPhotosUnder: number;
  children: FolderTreeNode[];
  syncEnabled?: boolean;
}

// Build hierarchical directory tree from flat FolderRecord[]
function buildFolderTree(folders: FolderRecord[]): FolderTreeNode[] {
  interface TempNode {
    id: string;
    name: string;
    fullPath: string;
    folderId?: number;
    photoCount: number;
    syncEnabled?: boolean;
    children: Map<string, TempNode>;
  }

  const rootMap = new Map<string, TempNode>();

  for (const f of folders) {
    if (!f.folder_path) continue;
    const cleanPath = f.folder_path.replace(/\//g, '\\').replace(/\\+$/, '');
    const parts = cleanPath.split('\\').filter(Boolean);
    if (parts.length === 0) continue;

    let currentChildren = rootMap;
    let runningPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      runningPath = runningPath ? `${runningPath}\\${part}` : part;
      const isLeaf = i === parts.length - 1;

      let node = currentChildren.get(part);
      if (!node) {
        node = {
          id: runningPath,
          name: part,
          fullPath: runningPath,
          children: new Map(),
          photoCount: 0,
        };
        currentChildren.set(part, node);
      }

      if (isLeaf) {
        node.folderId = f.id;
        node.photoCount = f.photo_count;
        node.syncEnabled = f.sync_enabled;
        if (f.folder_name) {
          node.name = f.folder_name;
        }
      }

      currentChildren = node.children;
    }
  }

  function convertTemp(temp: TempNode): FolderTreeNode {
    const childrenList = Array.from(temp.children.values())
      .map(convertTemp)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const totalPhotosUnder = temp.photoCount + childrenList.reduce((sum, c) => sum + c.totalPhotosUnder, 0);

    return {
      id: temp.id,
      name: temp.name,
      fullPath: temp.fullPath,
      folderId: temp.folderId,
      photoCount: temp.photoCount,
      totalPhotosUnder,
      children: childrenList,
      syncEnabled: temp.syncEnabled,
    };
  }

  const driveNodes = Array.from(rootMap.values())
    .map(convertTemp)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const totalPhotos = folders.reduce((sum, f) => sum + f.photo_count, 0);

  // Wrap drive roots inside "My Computer" root node (matching authentic Picasa 3 hierarchy)
  const myComputerNode: FolderTreeNode = {
    id: 'my-computer',
    name: 'My Computer',
    fullPath: 'My Computer',
    photoCount: 0,
    totalPhotosUnder: totalPhotos,
    children: driveNodes,
  };

  return [myComputerNode];
}

// Iconic Picasa 3 green circular section collapse badge
const GreenCircleBadge: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" className="shrink-0 drop-shadow-xs">
    <circle cx="8" cy="8" r="7" fill="#4CAF50" stroke="#388E3C" strokeWidth="1" />
    {expanded ? (
      <polygon points="5,6.5 11,6.5 8,10.5" fill="white" />
    ) : (
      <polygon points="6.5,5 6.5,11 10.5,8" fill="white" />
    )}
  </svg>
);

// Picasa 3 blue triangular folder tree expander
const BlueTriangleExpander: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg width="10" height="10" viewBox="0 0 12 12" className="shrink-0">
    {expanded ? (
      <polygon points="2,3 10,3 6,9" fill="#0078D4" />
    ) : (
      <polygon points="3,2 9,6 3,10" fill="#0078D4" />
    )}
  </svg>
);

export const FolderSidebar: React.FC<FolderSidebarProps> = ({
  folders,
  characters,
  selectedFolderId,
  selectedCharacter,
  onSelectFolder,
  onSelectCharacter,
  onTriggerScan,
  onClearCatalog,
  onRefreshCatalog,
  isScanning,
  isDark = false,
}) => {
  const { confirm, prompt } = useFluentDialog();
  const treeRoots = useMemo(() => buildFolderTree(folders), [folders]);

  const [filterQuery, setFilterQuery] = useState<string>('');
  const [faceScanPct, setFaceScanPct] = useState<number>(0);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    folderNode?: FolderTreeNode;
    character?: CharacterRecord;
  } | null>(null);

  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.folderNode) {
      const node = contextMenu.folderNode;
      const isComputer = node.id === 'my-computer';
      if (isComputer) {
        return [
          {
            label: 'Scan PC Drives (C:, D:, E:)',
            icon: <Sparkles size={13} />,
            onClick: onTriggerScan,
          },
        ];
      }

      return [
        {
          label: 'Open in File Explorer',
          icon: <ExternalLink size={13} />,
          onClick: () => {
            invoke('open_folder_in_explorer', { folderPath: node.fullPath }).catch(console.error);
          },
        },
        {
          label: 'Copy Folder Path',
          icon: <Copy size={13} />,
          onClick: () => {
            navigator.clipboard.writeText(node.fullPath);
          },
        },
        { separator: true },
        {
          label: 'Rescan Drives',
          icon: <RefreshCw size={13} />,
          onClick: onTriggerScan,
        },
      ];
    } else if (contextMenu.character) {
      const char = contextMenu.character;
      return [
        {
          label: `View Photos of ${char.name}`,
          icon: <User size={13} />,
          onClick: () => {
            onSelectFolder(null);
            onSelectCharacter(char.name);
          },
        },
        {
          label: 'Rename Person...',
          icon: <Edit3 size={13} />,
          onClick: async () => {
            const newName = await prompt({ title: "Rename Tag", message: `Rename "${char.name}" across library:`, defaultValue: char.name, confirmLabel: "Rename" });
            if (newName && newName.trim() && newName.trim() !== char.name) {
              try {
                await invoke('rename_character', {
                  oldName: char.name,
                  newName: newName.trim(),
                });
                onRefreshCatalog?.();
              } catch (e) {
                console.error('Rename failed:', e);
              }
            }
          },
        },
        { separator: true },
        {
          label: 'Delete Person Tag',
          icon: <Trash2 size={13} />,
          danger: true,
          onClick: async () => {
            const ok = await confirm({ title: "Delete Tag", message: `Delete tag "${char.name}"? This removes the tag from all ${char.count} photos.`, confirmLabel: "Delete Tag", isDestructive: true });
    if (ok) {
              try {
                await invoke('delete_character', { characterName: char.name });
                if (selectedCharacter === char.name) {
                  onSelectCharacter(null);
                }
                onRefreshCatalog?.();
              } catch (e) {
                console.error('Delete character tag failed:', e);
              }
            }
          },
        },
      ];
    }
    return [];
  }, [contextMenu, onTriggerScan, onSelectFolder, onSelectCharacter, onRefreshCatalog, selectedCharacter]);

  // Live Face Scan percentage from pure Rust backend
  useEffect(() => {
    invoke<FaceScanProgressPayload>('get_face_scan_stats')
      .then((stats) => {
        setFaceScanPct(stats.percentage);
      })
      .catch(() => {});

    const unlistenPromise = listen<FaceScanProgressPayload>('face_scan_progress', (e) => {
      setFaceScanPct(e.payload.percentage);
    });

    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  // Collapsible Picasa categories
  const [sectionExpanded, setSectionExpanded] = useState({
    albums: true,
    people: true,
    folders: true,
  });

  const toggleSection = (key: 'albums' | 'people' | 'folders') => {
    setSectionExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Initial expanded nodes: expand "My Computer" and top drives by default
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    initial.add('my-computer');
    function expand(nodes: FolderTreeNode[], depth: number) {
      for (const n of nodes) {
        if (depth < 3 && n.children.length > 0) {
          initial.add(n.id);
          expand(n.children, depth + 1);
        }
      }
    }
    expand(treeRoots, 0);
    return initial;
  });

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Filter folders if query is provided
  const filteredTree = useMemo(() => {
    if (!filterQuery.trim()) return treeRoots;
    const query = filterQuery.toLowerCase();

    function filterNode(node: FolderTreeNode): FolderTreeNode | null {
      const match = node.name.toLowerCase().includes(query);
      const filteredChildren = node.children
        .map(filterNode)
        .filter((c): c is FolderTreeNode => c !== null);

      if (match || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    }

    return treeRoots.map(filterNode).filter((n): n is FolderTreeNode => n !== null);
  }, [treeRoots, filterQuery]);

  // Render recursive folder tree row
  const renderTreeNode = (node: FolderTreeNode, depth: number = 0) => {
    const isSelected = selectedFolderId !== null && node.folderId === selectedFolderId;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id) || Boolean(filterQuery.trim());
    const isRoot = node.id === 'my-computer';
    const isDrive = !isRoot && depth === 1;

    return (
      <div key={node.id} className="select-none font-sans">
        {/* Row Element */}
        <div
          onClick={() => {
            if (node.folderId) {
              onSelectFolder(node.folderId);
              onSelectCharacter(null);
            } else if (hasChildren) {
              toggleNodeExpanded(node.id);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, folderNode: node });
          }}
          style={{ paddingLeft: `${Math.max(6, depth * 14)}px` }}
          className={`group flex items-center pr-2 py-0.5 cursor-pointer text-xs transition-colors relative ${
            isSelected
              ? isDark
                ? 'bg-[#3F5164] text-white font-medium shadow-2xs'
                : 'bg-[#7E8FA2] text-white font-medium shadow-2xs'
              : isDark
              ? 'hover:bg-[#252525] text-[#D4D4D4]'
              : 'hover:bg-[#EAECEF] text-[#2D3748]'
          }`}
        >
          {/* Expander Icon */}
          <div
            onClick={(e) => {
              if (hasChildren) {
                e.stopPropagation();
                toggleNodeExpanded(node.id);
              }
            }}
            className="w-3.5 h-3.5 flex items-center justify-center shrink-0 mr-1"
          >
            {hasChildren && <BlueTriangleExpander expanded={isExpanded} />}
          </div>

          {/* Folder / Drive / PC Icon */}
          <div className="shrink-0 mr-1.5 flex items-center">
            {isRoot ? (
              <span className="text-[#0078D4] text-[13px] font-bold">💻</span>
            ) : isDrive ? (
              <HardDrive size={13} className="text-[#0078D4]" />
            ) : isExpanded ? (
              <FolderOpen size={13} className="text-[#D97706] fill-[#FCD34D]" />
            ) : (
              <Folder size={13} className="text-[#D97706] fill-[#FBBF24]" />
            )}
          </div>

          {/* Folder Name */}
          <span className="truncate flex-1 text-[11px] leading-tight font-normal">
            {node.name}
          </span>

          {/* Photo Count Badge (Picasa style) */}
          {node.totalPhotosUnder > 0 && (
            <span
              className={`text-[10px] ml-1.5 font-mono shrink-0 ${
                isSelected
                  ? 'text-white/90'
                  : isDark
                  ? 'text-[#888888]'
                  : 'text-[#64748B]'
              }`}
            >
              ({node.totalPhotosUnder})
            </span>
          )}

          {/* Up arrow toggle marker on active folder (Picasa style) */}
          {isSelected && (
            <span className="ml-auto shrink-0 text-white/80">
              <ChevronUp size={12} />
            </span>
          )}
        </div>

        {/* Children Rows */}
        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`w-[240px] md:w-[260px] lg:w-[280px] h-full border-r flex flex-col font-sans select-none text-xs transition-colors shrink-0 ${
        isDark ? 'border-[#2B2B2B] bg-[#181818] text-[#CCCCCC]' : 'border-[#D4D8DC] bg-[#F4F6F8] text-[#333333]'
      }`}
    >
      {/* Top Action Area: Scan PC & Filter */}
      <div className={`p-2.5 border-b ${isDark ? 'border-[#262626] bg-[#1E1E1E]' : 'border-[#D4D8DC] bg-white'}`}>
        <button
          onClick={onTriggerScan}
          disabled={isScanning}
          className={`w-full py-1.5 px-2.5 text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-xs cursor-pointer ${
            isScanning
              ? isDark
                ? 'bg-[#2A2A2A] text-[#888888] cursor-not-allowed border border-[#3A3A3A]'
                : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed border border-[#D1D5DB]'
              : 'bg-[#0078D4] hover:bg-[#106EBE] active:bg-[#005A9E] text-white'
          }`}
        >
          <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
          <span>{isScanning ? 'Paced Scan (C:, D:, E:)...' : 'Scan PC Drives (C:, D:, E:)'}</span>
        </button>

        {/* Quick Filter Input */}
        <div className="mt-2 relative">
          <Search size={11} className={`absolute left-2 top-2 ${isDark ? 'text-[#777777]' : 'text-[#9CA3AF]'}`} />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter folders..."
            className={`w-full pl-6 pr-2.5 py-1 text-[11px] border outline-none transition-colors ${
              isDark
                ? 'bg-[#141414] border-[#333333] text-white placeholder-[#666666] focus:border-[#0078D4]'
                : 'bg-[#F9FAFB] border-[#D1D5DB] text-[#111827] placeholder-[#9CA3AF] focus:border-[#0078D4]'
            }`}
          />
        </div>
      </div>

      {/* Main List Scrollable with Picasa 3 Metallic Header Strips */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* ================= SECTION 1: ALBUMS ================= */}
        <div>
          {/* Metallic Section Header */}
          <div
            onClick={() => toggleSection('albums')}
            className={`px-2 py-1 flex items-center space-x-1.5 cursor-pointer border-t border-b ${
              isDark
                ? 'bg-gradient-to-b from-[#2E3135] via-[#26282B] to-[#1E2022] border-[#3B3F45] text-[#E0E0E0]'
                : 'bg-gradient-to-b from-[#EFF2F5] via-[#E2E6E9] to-[#D3D7DB] border-[#B8BDC2] text-[#1F2937]'
            }`}
          >
            <GreenCircleBadge expanded={sectionExpanded.albums} />
            <span className="font-bold text-[11px] tracking-tight">Albums (1)</span>
          </div>

          {sectionExpanded.albums && (
            <div className="py-1">
              {/* Recently Updated */}
              <button
                onClick={() => {
                  onSelectFolder(null);
                  onSelectCharacter(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1 text-left cursor-pointer transition-colors ${
                  selectedFolderId === null && selectedCharacter === null
                    ? isDark
                      ? 'bg-[#3F5164] text-white font-semibold'
                      : 'bg-[#7E8FA2] text-white font-semibold'
                    : isDark
                    ? 'hover:bg-[#252525] text-[#CCCCCC]'
                    : 'hover:bg-[#EAECEF] text-[#374151]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <BookMarked size={13} className="text-[#107C41]" />
                  <span className="text-[11px]">Recently Updated</span>
                </div>
                <span className="text-[10px] text-[#64748B]">({folders.length})</span>
              </button>

              {/* Starred Photos */}
              <button
                onClick={() => {}}
                className={`w-full flex items-center justify-between px-3 py-1 text-left cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-[#252525] text-[#CCCCCC]' : 'hover:bg-[#EAECEF] text-[#374151]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Star size={13} className="text-[#EAA300] fill-[#FFC83B]" />
                  <span className="text-[11px]">Starred Photos</span>
                </div>
                <span className="text-[10px] text-[#64748B]">(0)</span>
              </button>
            </div>
          )}
        </div>

        {/* ================= SECTION 2: PEOPLE ================= */}
        <div>
          {/* Metallic Section Header */}
          <div
            onClick={() => toggleSection('people')}
            className={`px-2 py-1 flex items-center space-x-1.5 cursor-pointer border-t border-b ${
              isDark
                ? 'bg-gradient-to-b from-[#2E3135] via-[#26282B] to-[#1E2022] border-[#3B3F45] text-[#E0E0E0]'
                : 'bg-gradient-to-b from-[#EFF2F5] via-[#E2E6E9] to-[#D3D7DB] border-[#B8BDC2] text-[#1F2937]'
            }`}
          >
            <GreenCircleBadge expanded={sectionExpanded.people} />
            <span className="font-bold text-[11px] tracking-tight">
              People ({characters.length > 0 ? characters.length + 1 : 1})
            </span>
          </div>

          {sectionExpanded.people && (
            <div className="py-1">
              {/* Unnamed group (Shows live Face Scan Percentage instead of total photos count) */}
              <button
                onClick={() => {
                  onSelectFolder(null);
                  onSelectCharacter('__unnamed__');
                }}
                className={`w-full flex items-center justify-between px-3 py-1 text-left cursor-pointer transition-colors ${
                  selectedCharacter === '__unnamed__'
                    ? isDark
                      ? 'bg-[#3F5164] text-white font-semibold'
                      : 'bg-[#7E8FA2] text-white font-semibold'
                    : isDark
                    ? 'hover:bg-[#252525] text-[#CCCCCC]'
                    : 'hover:bg-[#EAECEF] text-[#374151]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-4 h-4 flex items-center justify-center text-[10px] ${
                      selectedCharacter === '__unnamed__'
                        ? 'bg-white text-[#0078D4]'
                        : 'bg-[#64748B] text-white'
                    }`}
                  >
                    <User size={11} />
                  </div>
                  <span className="text-[11px]">Unnamed</span>
                </div>
                {/* Shows percentage scanned (e.g. 0%, 25%, 100%) */}
                <span
                  className={`text-[10px] font-mono font-medium ${
                    selectedCharacter === '__unnamed__' ? 'text-white' : 'text-[#0078D4] dark:text-[#60A5FA]'
                  }`}
                >
                  ({faceScanPct}%)
                </span>
              </button>

              {/* Tagged people from catalog */}
              {characters.map((char) => {
                const isSelected = selectedCharacter === char.name;
                return (
                  <button
                    key={char.name}
                    onClick={() => {
                      onSelectFolder(null);
                      onSelectCharacter(char.name);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, character: char });
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1 text-left cursor-pointer transition-colors ${
                      isSelected
                        ? isDark
                          ? 'bg-[#3F5164] text-white font-semibold'
                          : 'bg-[#7E8FA2] text-white font-semibold'
                        : isDark
                        ? 'hover:bg-[#252525] text-[#CCCCCC]'
                        : 'hover:bg-[#EAECEF] text-[#374151]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className="w-4 h-4 bg-[#0078D4] text-white flex items-center justify-center text-[10px] font-bold">
                        {char.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate text-[11px]">{char.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className={`text-[10px] ${isSelected ? 'text-white/90' : 'text-[#64748B]'}`}>
                        ({char.count})
                      </span>
                      <HelpCircle size={10} className="text-[#EAA300]" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ================= SECTION 3: FOLDERS ================= */}
        <div>
          {/* Metallic Section Header */}
          <div
            onClick={() => toggleSection('folders')}
            className={`px-2 py-1 flex items-center space-x-1.5 cursor-pointer border-t border-b ${
              isDark
                ? 'bg-gradient-to-b from-[#2E3135] via-[#26282B] to-[#1E2022] border-[#3B3F45] text-[#E0E0E0]'
                : 'bg-gradient-to-b from-[#EFF2F5] via-[#E2E6E9] to-[#D3D7DB] border-[#B8BDC2] text-[#1F2937]'
            }`}
          >
            <GreenCircleBadge expanded={sectionExpanded.folders} />
            <span className="font-bold text-[11px] tracking-tight">Folders ({folders.length})</span>
          </div>

          {sectionExpanded.folders && (
            <div className="py-1">
              {filteredTree.length === 0 ? (
                <div
                  className={`p-3 text-[11px] text-center border m-2 ${
                    isDark ? 'bg-[#202020] text-[#777777] border-[#2B2B2B]' : 'bg-white text-[#6B7280] border-[#E5E7EB]'
                  }`}
                >
                  No folders matched.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredTree.map((rootNode) => renderTreeNode(rootNode, 0))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Developer Mode Reset */}
        <div className={`p-2.5 mt-2 border-t ${isDark ? 'border-[#262626]' : 'border-[#D4D8DC]'}`}>
          <div
            className={`p-2 border ${
              isDark ? 'bg-[#202020] border-[#2D2D2D]' : 'bg-white border-[#E5E7EB]'
            }`}
          >
            <div className={`flex items-center space-x-1.5 text-[10px] font-semibold mb-1.5 ${isDark ? 'text-[#AAAAAA]' : 'text-[#6B7280]'}`}>
              <Code size={11} className="text-[#0078D4]" />
              <span>Developer Mode</span>
            </div>
            <button
              onClick={onClearCatalog}
              disabled={isScanning}
              className="w-full py-1 px-2 bg-[#FEE2E2] hover:bg-[#FECDCD] active:bg-[#FCA5A5] border border-[#F87171]/40 text-[#DC2626] text-[10px] font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={11} />
              <span>Reset & Clear Database</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Footer Status */}
      <div
        className={`px-3 py-1.5 border-t text-[10px] flex items-center justify-between ${
          isDark ? 'border-[#262626] bg-[#161616] text-[#777777]' : 'border-[#D4D8DC] bg-[#EAECEF] text-[#6B7280]'
        }`}
      >
        <span className="font-medium">RedCaso Photo Engine</span>
        <span className="text-[#0078D4] font-mono">v1.0.0</span>
      </div>
      {/* Context Menu Popup */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
          isDark={isDark}
        />
      )}
    </aside>
  );
};
