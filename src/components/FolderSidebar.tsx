import React, { useState, useMemo, useCallback } from 'react';
import { FolderRecord, CharacterRecord } from '../types';
import {
  Folder,
  FolderOpen,
  HardDrive,
  RefreshCw,
  User,
  Cloud,
  Trash2,
  Code,
  Search,
  Star,
  BookMarked,
  HelpCircle,
  ChevronUp,
} from 'lucide-react';

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
      <polygon points="2,3.5 10,3.5 6,8.5" fill="#1565C0" />
    ) : (
      <polygon points="3.5,2 9,6 3.5,10" fill="none" stroke="#1565C0" strokeWidth="1.8" />
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
  isScanning,
  isDark = false,
}) => {
  const totalPhotos = useMemo(() => folders.reduce((sum, f) => sum + f.photo_count, 0), [folders]);
  const treeRoots = useMemo(() => buildFolderTree(folders), [folders]);

  const [filterQuery, setFilterQuery] = useState<string>('');

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

  const toggleExpand = useCallback((nodeId: string) => {
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

  // Filter tree if user types in search
  const filteredTree = useMemo(() => {
    if (!filterQuery.trim()) return treeRoots;
    const q = filterQuery.toLowerCase();

    function filterNode(node: FolderTreeNode): FolderTreeNode | null {
      const matchSelf = node.name.toLowerCase().includes(q);
      const filteredChildren: FolderTreeNode[] = [];
      for (const child of node.children) {
        const res = filterNode(child);
        if (res) filteredChildren.push(res);
      }

      if (matchSelf || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    }

    return treeRoots.map(filterNode).filter((n): n is FolderTreeNode => n !== null);
  }, [treeRoots, filterQuery]);

  // Render a single tree node row recursively (Picasa 3 style with slate-blue banner on active)
  const renderTreeNode = (node: FolderTreeNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = filterQuery.trim() ? true : expandedNodes.has(node.id);
    const isSelected = selectedFolderId !== null && node.folderId === selectedFolderId;

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => {
            if (node.id === 'my-computer') {
              onSelectFolder(null);
              onSelectCharacter(null);
            } else if (node.folderId) {
              onSelectCharacter(null);
              onSelectFolder(node.folderId);
            } else if (hasChildren) {
              toggleExpand(node.id);
            }
          }}
          style={{ paddingLeft: `${depth * 13 + 4}px` }}
          className={`flex items-center space-x-1.5 py-0.5 pr-2 cursor-pointer transition-colors text-left group ${
            isSelected
              ? isDark
                ? 'bg-[#3F5164] text-white font-semibold'
                : 'bg-[#7E8FA2] text-white font-semibold'
              : isDark
              ? 'text-[#CCCCCC] hover:bg-[#252525] hover:text-white'
              : 'text-[#2D3748] hover:bg-[#EAECEF] hover:text-[#111827]'
          }`}
          title={node.fullPath}
        >
          {/* Blue triangle expand/collapse button */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="w-3.5 h-3.5 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <BlueTriangleExpander expanded={isExpanded} />
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          {/* Folder Icon / Manila icon */}
          <div className="shrink-0 flex items-center justify-center">
            {node.id === 'my-computer' ? (
              <HardDrive size={13} className="text-[#0078D4]" />
            ) : hasChildren && isExpanded ? (
              <FolderOpen size={13} className="text-[#EAA300] fill-[#FFC83B]" />
            ) : (
              <Folder size={13} className="text-[#EAA300] fill-[#FFC83B]" />
            )}
          </div>

          {/* Folder Name */}
          <span className="truncate text-[11px] min-w-0">{node.name}</span>

          {/* Photo Count in parentheses: name (count) */}
          {(node.photoCount > 0 || (node.id === 'my-computer' && node.totalPhotosUnder > 0)) && (
            <span
              className={`text-[11px] shrink-0 font-normal ${
                isSelected
                  ? 'text-white/90'
                  : isDark
                  ? 'text-[#888888]'
                  : 'text-[#64748B]'
              }`}
            >
              ({node.id === 'my-computer' ? node.totalPhotosUnder : node.photoCount})
            </span>
          )}

          {/* Cloud Sync Status Indicator */}
          {node.syncEnabled && (
            <span className="ml-auto shrink-0 flex items-center" title="Synced to Google Photos">
              <Cloud size={11} className={isSelected ? 'text-white' : 'text-[#0078D4]'} />
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

  const unnamedCount = useMemo(() => {
    return Math.max(0, totalPhotos - characters.reduce((sum, c) => sum + c.count, 0));
  }, [totalPhotos, characters]);

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
                <span className={`text-[10px] ${selectedFolderId === null && selectedCharacter === null ? 'text-white/90' : 'text-[#64748B]'}`}>
                  ({Math.min(totalPhotos, 250)})
                </span>
              </button>

              {/* Starred Photos */}
              <button
                onClick={() => {
                  onSelectFolder(null);
                  onSelectCharacter(null);
                }}
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
              {/* Unnamed group */}
              <button
                onClick={() => {
                  onSelectFolder(null);
                  onSelectCharacter(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1 text-left cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-[#252525] text-[#CCCCCC]' : 'hover:bg-[#EAECEF] text-[#374151]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-[#64748B] text-white flex items-center justify-center text-[10px]">
                    <User size={11} />
                  </div>
                  <span className="text-[11px]">Unnamed</span>
                </div>
                <span className="text-[10px] text-[#64748B]">({unnamedCount})</span>
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
    </aside>
  );
};
