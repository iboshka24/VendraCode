import React, { useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { FileEntry } from '@/types/index';
import { getFileIcon } from '@/utils/providers';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, RefreshCw, Search, FolderPlus, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function FileTreeItem({ entry, depth }: { entry: FileEntry; depth: number }) {
  const { toggleFolder, openFile, activeTabId, setFileTree, activeLocks } = useAppStore();

  const handleFolderClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFolder(entry.path);
    if (!entry.isExpanded && (!entry.children || entry.children.length === 0)) {
      try {
        const children = await window.vendraAPI.fs.readDir(entry.path);
        
        const updateTreeWithChildren = (tree: FileEntry[], dirPath: string, newChildren: FileEntry[]): FileEntry[] => {
          return tree.map(node => {
            if (node.path === dirPath) {
              return { ...node, children: newChildren, isExpanded: true };
            }
            if (node.children) {
              return { ...node, children: updateTreeWithChildren(node.children, dirPath, newChildren) };
            }
            return node;
          });
        };
        
        setFileTree(updateTreeWithChildren(useAppStore.getState().fileTree, entry.path, children));
      } catch (err) {
        console.error('Failed to load directory children', err);
      }
    }
  };

  const handleFileClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const content = await window.vendraAPI.fs.readFile(entry.path);
      openFile(entry.path, entry.name, content);
    } catch (err) {
      console.error('Failed to read file', err);
    }
  };

  const isSelected = activeTabId === entry.path;
  const paddingLeft = depth * 14;
  
  if (entry.isDirectory) {
    return (
      <div>
        <div 
          onClick={handleFolderClick}
          className="flex items-center py-1 px-2 cursor-pointer hover:bg-surface-hover text-text-secondary select-none transition-colors rounded-sm"
          style={{ paddingLeft: `${paddingLeft + 6}px` }}
        >
          <span className="mr-1 text-text-muted">
            {entry.isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="mr-1.5 text-text-secondary">
            {entry.isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
          </span>
          <span className="text-xs truncate font-medium">{entry.name}</span>
        </div>
        <AnimatePresence>
          {entry.isExpanded && entry.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="overflow-hidden"
            >
              {entry.children.map(child => (
                <FileTreeItem key={child.path} entry={child} depth={depth + 1} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const { icon, color } = getFileIcon(entry.name);
  const lock = activeLocks ? (activeLocks[entry.path] || activeLocks[entry.name]) : null;

  return (
    <div
      onClick={handleFileClick}
      className={`flex items-center justify-between py-1 px-2 cursor-pointer text-text-secondary select-none transition-all rounded-sm ${
        isSelected 
          ? 'bg-chip text-text-primary border-l-2 border-pop font-medium' 
          : 'hover:bg-surface-hover hover:text-text-primary border-l-2 border-transparent'
      }`}
      style={{ paddingLeft: `${paddingLeft + 6}px` }}
    >
      <div className="flex items-center min-w-0">
        <span className="ml-[12px] mr-2 text-[11px] font-mono font-bold" style={{ color }}>{icon}</span>
        <span className={`text-xs truncate ${isSelected ? 'text-text-primary' : ''}`}>{entry.name}</span>
      </div>
      {lock && (
        <span 
          className="ml-1 text-[9px] px-1.5 py-0.2 rounded bg-ok/15 text-ok border border-ok/30 font-mono shrink-0 flex items-center gap-1"
          title={`Advisory Lock: ${lock.agentName}`}
        >
          <span className="w-1 h-1 rounded-full bg-ok animate-pulse" />
          {lock.agentName}
        </span>
      )}
    </div>
  );
}

export function FileExplorer() {
  const { workspacePath, setWorkspacePath, fileTree, setFileTree } = useAppStore();

  const loadDirectory = useCallback(async (dirPath: string) => {
    try {
      const entries = await window.vendraAPI.fs.readDir(dirPath);
      setFileTree(entries);
    } catch (err) {
      console.error('Failed to load directory', err);
    }
  }, [setFileTree]);

  const openFolder = async () => {
    try {
      const path = await window.vendraAPI.dialog.openDirectory();
      if (path) {
        setWorkspacePath(path);
        loadDirectory(path);
      }
    } catch (err) {
      console.error('Failed to open directory', err);
    }
  };

  const refreshDirectory = () => {
    if (workspacePath) {
      loadDirectory(workspacePath);
    }
  };

  return (
    <aside className="w-60 shrink-0 flex flex-col h-full bg-bgside border-r border-border text-text-secondary select-none">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-bgtitle">
        <span className="text-[10px] font-bold tracking-wider uppercase text-text-muted">FILES</span>
        <div className="flex gap-1">
          <button 
            type="button"
            onClick={openFolder}
            className="btn btn-ghost h-6 w-6 p-0"
            title="Open Folder"
          >
            <FolderPlus size={13} />
          </button>
          <button 
            type="button"
            onClick={refreshDirectory}
            className="btn btn-ghost h-6 w-6 p-0"
            title="Refresh Directory"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {fileTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted px-4 text-center">
            <p className="text-xs mb-3 text-text-secondary">No repository opened</p>
            <button 
              type="button"
              onClick={openFolder}
              className="btn btn-primary text-xs"
            >
              Open Folder
            </button>
          </div>
        ) : (
          fileTree.map(entry => (
            <FileTreeItem key={entry.path} entry={entry} depth={0} />
          ))
        )}
      </div>
    </aside>
  );
}
