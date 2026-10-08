import React, { useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { FileEntry } from '@/types/index';
import { getFileIcon } from '@/utils/providers';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, RefreshCw, Search, FolderPlus } from 'lucide-react';
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
  const paddingLeft = depth * 16;
  
  if (entry.isDirectory) {
    return (
      <div>
        <div 
          onClick={handleFolderClick}
          className="flex items-center py-1 px-2 cursor-pointer hover:bg-surface-hover text-text-secondary select-none"
          style={{ paddingLeft: `${paddingLeft + 8}px` }}
        >
          <span className="mr-1 text-muted">
            {entry.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="mr-2 text-primary">
            {entry.isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
          <span className="text-sm truncate">{entry.name}</span>
        </div>
        <AnimatePresence>
          {entry.isExpanded && entry.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
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
        className={`flex items-center justify-between py-1 px-2 cursor-pointer text-text-secondary select-none ${
          isSelected ? 'bg-primary/10 border-l-2 border-primary text-text-primary' : 'hover:bg-surface-hover border-l-2 border-transparent'
        }`}
        style={{ paddingLeft: `${paddingLeft + 8}px` }}
      >
        <div className="flex items-center min-w-0">
          <span className="ml-[14px] mr-2 text-xs font-mono font-bold" style={{ color }}>{icon}</span>
          <span className={`text-sm truncate ${isSelected ? 'text-text-primary' : ''}`}>{entry.name}</span>
        </div>
        {lock && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-mono shrink-0 animate-pulse" title={`Currently edited by ${lock.agentName}`}>
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
    <aside className="w-64 shrink-0 flex flex-col h-full bg-surface border-r border-border text-text-secondary">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h2 className="text-xs font-semibold tracking-wider text-muted">EXPLORER</h2>
        <div className="flex gap-1">
          <button 
            onClick={openFolder}
            className="p-1 hover:bg-surface-hover rounded text-muted hover:text-text-primary transition-colors"
            title="Open Folder"
          >
            <FolderPlus size={14} />
          </button>
          <button 
            onClick={refreshDirectory}
            className="p-1 hover:bg-surface-hover rounded text-muted hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {fileTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted px-4 text-center">
            <p className="text-sm mb-4">No folder opened</p>
            <button 
              onClick={openFolder}
              className="px-4 py-2 bg-primary text-white text-sm rounded hover:bg-primary/90 transition-colors"
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
