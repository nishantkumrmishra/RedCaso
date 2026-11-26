import React, { useState, useMemo, useCallback } from 'react';
import { FolderRecord, CharacterRecord } from '../types';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  HardDrive,
  RefreshCw,
  User,
  Cloud,
  Trash2,
  Code,
  Search,
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

  return Array.from(rootMap.values())
    .map(convertTemp)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

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

  // Initial expanded nodes: auto-expand top 3 depth levels so main directories are visible
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
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

  // Render a single tree node row recursively
  const renderTreeNode = (node: FolderTreeNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = filterQuery.trim() ? true : expandedNodes.has(node.id);
    const isSelected = selectedFolderId !== null && node.folderId === selectedFolderId;

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => {
            if (node.folderId) {
              onSelectCharacter(null);
              onSelectFolder(node.folderId);
            } else if (hasChildren) {
              toggleExpand(node.id);
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`flex items-center space-x-1.5 py-1 pr-2 cursor-pointer transition-colors text-left group ${
            isSelected
              ? isDark
                ? 'bg-[#0078D4]/25 text-[#60CDFF] font-semibold border-l-2 border-[#0078D4]'
                : 'bg-[#0078D4]/12 text-[#0078D4] font-semibold border-l-2 border-[#0078D4]'
              : isDark
              ? 'text-[#CCCCCC] hover:bg-[#252525] hover:text-white'
              : 'text-[#374151] hover:bg-[#EAECEF] hover:text-[#111827]'
          }`}
          title={node.fullPath}
        >
          {/* Chevron expand/collapse arrow */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="w-3.5 h-3.5 flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:text-[#888888] dark:hover:text-white shrink-0"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          {/* Windows Golden/Amber Folder Icon */}
          <div className="shrink-0 flex items-center justify-center">
            {hasChildren && isExpanded ? (
              <FolderOpen size={14} className="text-[#EAA300] fill-[#FFC83B]" />
            ) : (
              <Folder size={14} className="text-[#EAA300] fill-[#FFC83B]" />
            )}
          </div>

          {/* Folder Name */}
          <span className="truncate text-xs min-w-0">{node.name}</span>

          {/* Photo Count in parentheses: name (count) */}
          {node.photoCount > 0 && (
            <span
              className={`text-[11px] shrink-0 font-normal font-mono ${
                isSelected
                  ? isDark ? 'text-[#B3E0FF]' : 'text-[#0078D4]'
                  : isDark ? 'text-[#888888]' : 'text-[#6B7280]'
              }`}
            >
              ({node.photoCount})
            </span>
          )}

          {/* Cloud Sync Status Indicator */}
          {node.syncEnabled && (
            <span className="ml-auto shrink-0 flex items-center" title="Synced to Google Photos">
              <Cloud size={11} className="text-[#0078D4]" />
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
      className={`w-[22%] min-w-[240px] max-w-[340px] h-full border-l flex flex-col font-sans select-none text-xs transition-colors ${
        isDark ? 'border-[#2B2B2B] bg-[#181818] text-[#CCCCCC]' : 'border-[#DCE0E5] bg-[#F4F6F8] text-[#374151]'
      }`}
    >
      {/* Top Action Area: Scan PC & Count */}
      <div className={`p-3 border-b ${isDark ? 'border-[#262626] bg-[#1E1E1E]' : 'border-[#DCE0E5] bg-white'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[11px] font-semibold tracking-wide uppercase ${isDark ? 'text-[#999999]' : 'text-[#6B7280]'}`}>
            Library Folders
          </span>
          <span className="text-[11px] text-[#0078D4] font-medium bg-[#0078D4]/12 px-2 py-0.5">
            {totalPhotos} photos
          </span>
        </div>

        <button
          onClick={onTriggerScan}
          disabled={isScanning}
          className={`w-full py-2 px-3 text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-xs cursor-pointer ${
            isScanning
              ? isDark
                ? 'bg-[#2A2A2A] text-[#888888] cursor-not-allowed border border-[#3A3A3A]'
                : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed border border-[#D1D5DB]'
              : 'bg-[#0078D4] hover:bg-[#106EBE] active:bg-[#005A9E] text-white'
          }`}
        >
          <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
          <span>{isScanning ? 'Paced Scan (C:, D:, E:)...' : 'Scan PC Drives (C:, D:, E:)'}</span>
        </button>

        {/* Quick Search / Filter Input */}
        <div className="mt-2 relative">
          <Search size={12} className={`absolute left-2.5 top-2.5 ${isDark ? 'text-[#777777]' : 'text-[#9CA3AF]'}`} />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter folders..."
            className={`w-full pl-7 pr-3 py-1.5 text-xs border outline-none transition-colors ${
              isDark
                ? 'bg-[#141414] border-[#333333] text-white placeholder-[#666666] focus:border-[#0078D4]'
                : 'bg-[#F9FAFB] border-[#D1D5DB] text-[#111827] placeholder-[#9CA3AF] focus:border-[#0078D4]'
            }`}
          />
        </div>
      </div>

      {/* Main List Scrollable */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* All Photos Navigation Item */}
        <div>
          <button
            onClick={() => {
              onSelectFolder(null);
              onSelectCharacter(null);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 transition-all text-left cursor-pointer ${
              selectedFolderId === null && selectedCharacter === null
                ? isDark
                  ? 'bg-[#0078D4]/25 text-[#60CDFF] font-semibold border-l-2 border-[#0078D4]'
                  : 'bg-[#0078D4]/12 text-[#0078D4] font-semibold border-l-2 border-[#0078D4]'
                : isDark
                ? 'text-[#CCCCCC] hover:bg-[#252525] hover:text-white'
                : 'text-[#374151] hover:bg-[#EAECEF] hover:text-[#111827]'
            }`}
          >
            <div className="flex items-center space-x-2">
              <HardDrive size={14} className="text-[#0078D4]" />
              <span className="font-medium">All Photos</span>
            </div>
            <span
              className={`text-[11px] font-mono ${
                isDark ? 'text-[#888888]' : 'text-[#6B7280]'
              }`}
            >
              ({totalPhotos})
            </span>
          </button>
        </div>

        {/* Hierarchical Folder Tree */}
        <div>
          <div className={`px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-[#888888]' : 'text-[#6B7280]'}`}>
            Directories ({folders.length})
          </div>

          {filteredTree.length === 0 ? (
            <div
              className={`p-3 text-[11px] text-center border ${
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

        {/* Character / Person Section */}
        {characters.length > 0 && (
          <div className="pt-2 border-t border-inherit">
            <div className={`px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-[#888888]' : 'text-[#6B7280]'}`}>
              People & Characters
            </div>
            <div className="space-y-0.5">
              {characters.map((char) => {
                const isSelected = selectedCharacter === char.name;
                return (
                  <button
                    key={char.name}
                    onClick={() => {
                      onSelectFolder(null);
                      onSelectCharacter(char.name);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 transition-all text-left cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'bg-[#0078D4]/25 text-[#60CDFF] font-semibold border-l-2 border-[#0078D4]'
                          : 'bg-[#0078D4]/12 text-[#0078D4] font-semibold border-l-2 border-[#0078D4]'
                        : isDark
                        ? 'text-[#CCCCCC] hover:bg-[#252525] hover:text-white'
                        : 'text-[#374151] hover:bg-[#EAECEF] hover:text-[#111827]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <User size={13} className="text-[#0078D4]" />
                      <span className="truncate">{char.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono ${
                        isDark ? 'text-[#777777]' : 'text-[#6B7280]'
                      }`}
                    >
                      ({char.count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Developer Mode: Reset & Clear Database */}
        <div className={`pt-2 border-t ${isDark ? 'border-[#262626]' : 'border-[#E5E7EB]'}`}>
          <div
            className={`p-2 border ${
              isDark ? 'bg-[#202020] border-[#2D2D2D]' : 'bg-white border-[#E5E7EB]'
            }`}
          >
            <div className={`flex items-center space-x-1.5 text-[10px] font-semibold mb-1.5 ${isDark ? 'text-[#AAAAAA]' : 'text-[#6B7280]'}`}>
              <Code size={12} className="text-[#0078D4]" />
              <span>Developer Mode</span>
            </div>
            <button
              onClick={onClearCatalog}
              disabled={isScanning}
              className="w-full py-1.5 px-2 bg-[#FEE2E2] hover:bg-[#FECDCD] active:bg-[#FCA5A5] border border-[#F87171]/40 text-[#DC2626] text-[10px] font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={11} />
              <span>Reset & Clear Database</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div
        className={`p-2.5 border-t text-[10px] flex items-center justify-between ${
          isDark ? 'border-[#262626] bg-[#161616] text-[#777777]' : 'border-[#DCE0E5] bg-[#EAECEF] text-[#6B7280]'
        }`}
      >
        <span className="font-medium">RedCaso Photo Engine</span>
        <span className="text-[#0078D4]">v1.2 Fluent</span>
      </div>
    </aside>
  );
};
