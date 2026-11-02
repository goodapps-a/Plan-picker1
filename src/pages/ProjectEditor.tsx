/**
 * Planform Project Editor Page
 * Integrates 2D Plan Viewport, Three.js 3D View, Wall Inspector, History, and Auto-Saving
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EditorMode, Project, SaveStatus, SnapSettings } from '../model/types';
import { HistoryManager } from '../history/historyManager';
import { saveProject } from '../storage/db';
import { Header } from '../components/Header';
import { Toolbar } from '../components/Toolbar';
import { SvgPlanViewport } from '../plan/SvgPlanViewport';
import { IsometricView } from '../isometric/IsometricView';
import { DEFAULT_SNAP_SETTINGS } from '../geometry/snapping';
import { deleteWallTransaction } from '../geometry/transactions';

interface ProjectEditorProps {
  initialProject: Project;
  onBackToDashboard: () => void;
  onProjectUpdated: (updatedProject: Project) => void;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({
  initialProject,
  onBackToDashboard,
  onProjectUpdated,
}) => {
  // Authoritative project geometry model
  const [project, setProject] = useState<Project>(initialProject);

  // Active workspace: 2D Plan or 3D Isometric View
  const [activeView, setActiveView] = useState<'plan' | '3d'>('plan');

  // Editor mode: select, draw, pan
  const [editorMode, setEditorMode] = useState<EditorMode>('select');

  // Currently selected wall ID
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

  // Snapping configuration
  const [snapSettings, setSnapSettings] = useState<SnapSettings>(DEFAULT_SNAP_SETTINGS);

  // Continuous chain drawing option (defaults to false so each wall requires drag-to-draw)
  const [continuousDrawing, setContinuousDrawing] = useState<boolean>(false);

  // Persistence Save Status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  // History Manager instance
  const historyRef = useRef<HistoryManager>(new HistoryManager(50));
  const [historyVersion, setHistoryVersion] = useState<number>(0);

  // Auto-save debounce timer
  const saveTimeoutRef = useRef<any>(null);

  // Debounced auto-save effect
  const scheduleSave = useCallback(
    (projToSave: Project) => {
      setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveProject(projToSave);
          setSaveStatus('saved');
          onProjectUpdated(projToSave);
        } catch (err) {
          console.error('[Planform] Auto-save error:', err);
          setSaveStatus('error');
        }
      }, 400); // 400ms debounce
    },
    [onProjectUpdated]
  );

  // Commit a geometry change (creates an undo entry and triggers save)
  const handleCommitProject = useCallback(
    (updatedProject: Project, actionDescription: string) => {
      // Push previous state to undo history
      historyRef.current.push({
        points: project.points,
        walls: project.walls,
        description: actionDescription,
      });
      setHistoryVersion((v) => v + 1);

      setProject(updatedProject);
      scheduleSave(updatedProject);
    },
    [project.points, project.walls, scheduleSave]
  );

  // Undo
  const handleUndo = useCallback(() => {
    if (!historyRef.current.canUndo()) return;

    const previousState = historyRef.current.undo({
      points: project.points,
      walls: project.walls,
      description: 'Current State',
    });

    if (previousState) {
      const restoredProject: Project = {
        ...project,
        points: previousState.points,
        walls: previousState.walls,
        updatedAt: new Date().toISOString(),
      };

      setProject(restoredProject);
      setHistoryVersion((v) => v + 1);

      // If selected wall no longer exists, deselect
      if (selectedWallId && !restoredProject.walls[selectedWallId]) {
        setSelectedWallId(null);
      }

      scheduleSave(restoredProject);
    }
  }, [project, selectedWallId, scheduleSave]);

  // Redo
  const handleRedo = useCallback(() => {
    if (!historyRef.current.canRedo()) return;

    const nextState = historyRef.current.redo({
      points: project.points,
      walls: project.walls,
      description: 'Current State',
    });

    if (nextState) {
      const restoredProject: Project = {
        ...project,
        points: nextState.points,
        walls: nextState.walls,
        updatedAt: new Date().toISOString(),
      };

      setProject(restoredProject);
      setHistoryVersion((v) => v + 1);
      scheduleSave(restoredProject);
    }
  }, [project, scheduleSave]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept shortcuts when user is typing in a form input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape') {
        setSelectedWallId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWallId) {
        e.preventDefault();
        const updated = deleteWallTransaction(project, selectedWallId);
        handleCommitProject(updated, 'Delete Wall');
        setSelectedWallId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedWallId, project, handleCommitProject]);

  // Handle Project Rename
  const handleRename = (newName: string) => {
    const updated = {
      ...project,
      name: newName,
      updatedAt: new Date().toISOString(),
    };
    setProject(updated);
    scheduleSave(updated);
  };

  const [isTyping, setIsTyping] = useState(false);

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 overflow-hidden" data-testid="project-editor">
      {/* Top Header */}
      <Header
        project={project}
        activeView={activeView}
        onSwitchView={(v) => {
          setActiveView(v);
          // If switching to 3D, close wall inspector
          if (v === '3d') {
            setSelectedWallId(null);
          }
        }}
        canUndo={historyRef.current.canUndo()}
        canRedo={historyRef.current.canRedo()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        saveStatus={saveStatus}
        onBackToDashboard={onBackToDashboard}
        onRenameProject={handleRename}
      />

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {activeView === 'plan' ? (
          /* 2D Plan Viewport */
          <SvgPlanViewport
            project={project}
            mode={editorMode}
            selectedWallId={selectedWallId}
            onSelectWall={(id) => setSelectedWallId(id)}
            onCommitProject={handleCommitProject}
            snapSettings={snapSettings}
            continuousDrawing={continuousDrawing}
            onFinishChain={() => setEditorMode('select')}
            onCancelChain={() => setEditorMode('select')}
            onTypingChange={setIsTyping}
            onSetMode={(m) => setEditorMode(m)}
          />
        ) : (
          /* 3D Isometric Viewport */
          <IsometricView project={project} />
        )}

        {/* Bottom Floating Toolbar (Plan view, hidden when typing dimension) */}
        {activeView === 'plan' && !isTyping && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <Toolbar
              mode={editorMode}
              onSetMode={(m) => {
                setEditorMode(m);
              }}
              snapSettings={snapSettings}
              onUpdateSnapSettings={(s) => setSnapSettings(s)}
              continuousDrawing={continuousDrawing}
              onToggleContinuous={() => setContinuousDrawing(!continuousDrawing)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
