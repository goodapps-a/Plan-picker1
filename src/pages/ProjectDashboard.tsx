/**
 * Planform Project Dashboard
 * Project list, creation, import/export, and deletion with confirmation
 */

import React, { useState } from 'react';
import { Project } from '../model/types';
import { NewProjectModal } from '../components/NewProjectModal';
import {
  Plus,
  Building2,
  Trash2,
  Calendar,
  Layers,
  FileCode,
  Download,
  Upload,
  Sparkles,
  Smartphone,
  ChevronRight,
  HardDrive,
  Info,
} from 'lucide-react';
import { exportProjectAsJSON, importProjectFromJSON } from '../storage/db';

interface ProjectDashboardProps {
  projects: Project[];
  onOpenProject: (projectId: string) => void;
  onCreateProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  onImportProject: (project: Project) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  projects,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onImportProject,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = importProjectFromJSON(text);
        onImportProject(imported);
      } catch (err: any) {
        setImportError(err.message || 'Failed to import project JSON file');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleExport = (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation();
    try {
      const jsonStr = exportProjectAsJSON(proj);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proj.name.toLowerCase().replace(/\s+/g, '_')}_planform.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" data-testid="project-dashboard">
      {/* Top App Bar */}
      <header className="h-16 border-b border-slate-800/80 px-4 sm:px-8 flex items-center justify-between bg-slate-900/60 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {/* Planform Geometric Logo */}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 p-0.5 shadow-lg shadow-sky-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <div className="relative w-5 h-5 border-2 border-sky-400 rounded-sm">
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-sky-400" />
                <div className="absolute top-0 right-1/2 w-0.5 h-full bg-sky-400" />
              </div>
            </div>
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              PLANFORM
              <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                PWA
              </span>
            </span>
            <p className="text-[11px] text-slate-400 font-medium">Architectural Floor Plan & 3D Engine</p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* Import JSON button */}
          <label
            aria-label="Import Project JSON"
            title="Import Project JSON"
            className="cursor-pointer px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700/80 transition-all active:scale-95"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileImport}
              className="hidden"
            />
          </label>

          {/* New Project Primary CTA */}
          <button
            onClick={() => setIsModalOpen(true)}
            aria-label="New Project"
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-sky-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Import Error Message */}
        {importError && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span>{importError}</span>
            <button
              onClick={() => setImportError(null)}
              className="text-rose-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero Banner / Quick Overview */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-900/40 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Projects & Floor Plans
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
              Precision 2D wall drafting, automatic endpoint snapping, isolated dimension editing, and real-time 3D isometric building inspection.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Offline Ready</span>
            </div>
          </div>
        </div>

        {/* Projects List */}
        {projects.length === 0 ? (
          /* Empty State */
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-10 sm:p-14 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-3xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4 shadow-lg shadow-sky-500/5">
              <Building2 className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">No Projects Yet</h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
              Create your first architectural project to begin drawing walls, snapping corners, and viewing your design in 3D.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-sky-500/25 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              Create First Project
            </button>
          </div>
        ) : (
          /* Grid of Project Cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((proj) => {
              const wallCount = Object.keys(proj.walls || {}).length;
              const formattedDate = new Date(proj.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  className="group bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-lg hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-all">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors line-clamp-1">
                            {proj.name}
                          </h3>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {formattedDate}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Export & Delete buttons */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleExport(e, proj)}
                          title="Export JSON"
                          aria-label={`Export JSON for ${proj.name}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(proj);
                          }}
                          title="Delete Project"
                          aria-label={`Delete ${proj.name}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stats badges */}
                    <div className="flex items-center gap-2 pt-1">
                      <div className="px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 font-medium flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-sky-400" />
                        <span>{wallCount} {wallCount === 1 ? 'wall' : 'walls'}</span>
                      </div>
                      <div className="px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 font-mono">
                        {proj.defaultWallHeight.toFixed(2)}m H • {proj.defaultWallThickness.toFixed(2)}m T
                      </div>
                    </div>
                  </div>

                  {/* Open Project Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-medium text-sky-400 group-hover:text-sky-300">
                    <span>Open Floor Plan</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateProject={(newProj) => {
          setIsModalOpen(false);
          onCreateProject(newProj);
        }}
      />

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-2">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Delete Project?</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Are you sure you want to delete <span className="text-white font-medium">"{projectToDelete.name}"</span>? This will permanently remove all drawn walls and geometry.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProject(projectToDelete.id);
                  setProjectToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
