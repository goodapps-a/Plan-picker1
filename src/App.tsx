/**
 * Planform Application Root
 * State orchestration, local persistence, routing, and PWA install prompt
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Project } from './model/types';
import { getAllProjects, saveProject, deleteProject } from './storage/db';
import { ProjectDashboard } from './pages/ProjectDashboard';
import { ProjectEditor } from './pages/ProjectEditor';
import { createWallTransaction } from './geometry/transactions';
import { Download, Smartphone } from 'lucide-react';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);

  // Initialize and load saved projects
  const refreshProjects = useCallback(async () => {
    try {
      let loaded = await getAllProjects();

      // Check if we need to seed an initial project for first-time user
      if (loaded.length === 0) {
        const seedProject: Project = {
          id: 'proj_sample_residence',
          name: 'Sample Villa',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unit: 'm',
          defaultWallHeight: 3.0,
          defaultWallThickness: 0.15,
          points: {},
          walls: {},
          schemaVersion: 1,
        };

        // Draw 4 perimeter walls (6m x 4m)
        const w1 = createWallTransaction(
          seedProject,
          { point: { x: 0, y: 0 } },
          { point: { x: 6, y: 0 } }
        );
        let currentProj = w1.project;
        const ptB = currentProj.walls[w1.newWallId].endPointId;

        const w2 = createWallTransaction(
          currentProj,
          { point: { x: 6, y: 0 }, pointId: ptB },
          { point: { x: 6, y: 4 } }
        );
        currentProj = w2.project;
        const ptC = currentProj.walls[w2.newWallId].endPointId;

        const w3 = createWallTransaction(
          currentProj,
          { point: { x: 6, y: 4 }, pointId: ptC },
          { point: { x: 0, y: 4 } }
        );
        currentProj = w3.project;
        const ptD = currentProj.walls[w3.newWallId].endPointId;

        const ptA = currentProj.walls[w1.newWallId].startPointId;
        const w4 = createWallTransaction(
          currentProj,
          { point: { x: 0, y: 4 }, pointId: ptD },
          { point: { x: 0, y: 0 }, pointId: ptA }
        );
        currentProj = w4.project;

        // Interior divider wall at x = 3.5
        const w5 = createWallTransaction(
          currentProj,
          { point: { x: 3.5, y: 0 } },
          { point: { x: 3.5, y: 2.5 } }
        );
        currentProj = w5.project;

        await saveProject(currentProj);
        loaded = [currentProj];
      }

      setProjects(loaded);

      // Handle autostart query param
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('autostart') === '1' && loaded.length > 0) {
        setActiveProjectId(loaded[0].id);
      }
    } catch (err) {
      console.error('[Planform] Failed to load projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Capture PWA beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  // Create Project handler
  const handleCreateProject = async (newProj: Project) => {
    await saveProject(newProj);
    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
  };

  // Delete Project handler
  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  };

  // Import Project handler
  const handleImportProject = async (importedProj: Project) => {
    await saveProject(importedProj);
    setProjects((prev) => [importedProj, ...prev]);
    setActiveProjectId(importedProj.id);
  };

  // Update Project in memory
  const handleProjectUpdated = (updated: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 animate-pulse mb-3">
          <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-slate-400 font-mono tracking-wider uppercase">Loading Planform...</p>
      </div>
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-sky-500 selection:text-white">
      {/* PWA In-App Install Prompt Banner */}
      {showInstallBanner && (
        <div className="bg-sky-950/80 border-b border-sky-800/80 px-4 py-2 flex items-center justify-between text-xs text-sky-200 z-50">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>Install Planform on your mobile home screen for offline architectural drafting.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallPWA}
              className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="text-sky-400 hover:text-white px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* View routing: Active Project Editor vs Dashboard */}
      {activeProject ? (
        <ProjectEditor
          key={activeProject.id}
          initialProject={activeProject}
          onBackToDashboard={() => setActiveProjectId(null)}
          onProjectUpdated={handleProjectUpdated}
        />
      ) : (
        <ProjectDashboard
          projects={projects}
          onOpenProject={(id) => setActiveProjectId(id)}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onImportProject={handleImportProject}
        />
      )}
    </div>
  );
}
