/**
 * Planform Application Top Header
 * Houses project title, save status, 2D/3D segmented view switcher, undo/redo, and export
 */

import React, { useState } from 'react';
import { EditorMode, Project, SaveStatus } from '../model/types';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Share2,
  Check,
  Loader2,
  AlertCircle,
  Box,
  PenTool,
  Pencil,
  FileCode,
} from 'lucide-react';
import { exportProjectAsJSON } from '../storage/db';

interface HeaderProps {
  project: Project;
  activeView: 'plan' | '3d';
  onSwitchView: (view: 'plan' | '3d') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveStatus: SaveStatus;
  onBackToDashboard: () => void;
  onRenameProject: (newName: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  activeView,
  onSwitchView,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  onBackToDashboard,
  onRenameProject,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.name);

  const handleFinishRename = () => {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== project.name) {
      onRenameProject(trimmed);
    } else {
      setTitleDraft(project.name);
    }
  };

  const handleExportJSON = () => {
    try {
      const jsonStr = exportProjectAsJSON(project);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_planform.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between z-20 shrink-0 select-none">
      {/* Left: Back button & Project Name */}
      <div className="flex items-center gap-2 max-w-[45%] sm:max-w-xs">
        <button
          onClick={onBackToDashboard}
          aria-label="Back to Dashboard"
          title="Back to Projects"
          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {isEditingTitle ? (
          <input
            type="text"
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRename();
              if (e.key === 'Escape') {
                setTitleDraft(project.name);
                setIsEditingTitle(false);
              }
            }}
            className="bg-slate-950 border border-sky-500 rounded-lg px-2 py-0.5 text-xs sm:text-sm font-semibold text-slate-100 outline-none w-32 sm:w-44"
          />
        ) : (
          <div
            onClick={() => {
              setTitleDraft(project.name);
              setIsEditingTitle(true);
            }}
            title="Click to rename project"
            className="group flex items-center gap-1.5 cursor-pointer truncate"
          >
            <h1 className="text-xs sm:text-sm font-semibold text-slate-100 truncate group-hover:text-sky-300 transition-colors">
              {project.name}
            </h1>
            <Pencil className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        )}

        {/* Save Status Badge */}
        <div className="hidden xs:flex items-center gap-1 ml-1 shrink-0">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">Saving</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <Check className="w-3 h-3" />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-[10px] text-rose-400 font-medium">
              <AlertCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Unable to Save</span>
            </span>
          )}
        </div>
      </div>

      {/* Center: Plan / 3D Segmented Control */}
      <div className="flex items-center bg-slate-950/80 p-0.5 rounded-xl border border-slate-800 shadow-inner">
        <button
          onClick={() => onSwitchView('plan')}
          aria-label="Switch to 2D Plan View"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'plan'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PenTool className="w-3.5 h-3.5" />
          <span>Plan</span>
        </button>

        <button
          onClick={() => onSwitchView('3d')}
          aria-label="Switch to 3D View"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === '3d'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>3D View</span>
        </button>
      </div>

      {/* Right: Undo / Redo & Export */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className={`p-2 rounded-xl transition-colors ${
            canUndo
              ? 'text-slate-300 hover:text-white hover:bg-slate-800'
              : 'text-slate-600 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          className={`p-2 rounded-xl transition-colors ${
            canRedo
              ? 'text-slate-300 hover:text-white hover:bg-slate-800'
              : 'text-slate-600 cursor-not-allowed'
          }`}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleExportJSON}
          aria-label="Export Project JSON"
          title="Export JSON backup"
          className="p-2 rounded-xl text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors hidden sm:flex"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
