/**
 * Planform New Project Creation Dialog
 */

import React, { useState } from 'react';
import { MeasurementUnit, Project } from '../model/types';
import { generateId } from '../geometry/validation';
import { createWallTransaction } from '../geometry/transactions';
import { X, Plus, Sparkles, Building2, Square, LayoutTemplate } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: Project) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<MeasurementUnit>('m');
  const [height, setHeight] = useState('3.00');
  const [thickness, setThickness] = useState('0.15');
  const [template, setTemplate] = useState<'empty' | 'studio' | 'l_shaped'>('empty');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Project name is required.');
      return;
    }

    const numHeight = parseFloat(height);
    if (isNaN(numHeight) || numHeight <= 0) {
      setError('Wall height must be a positive number.');
      return;
    }

    const numThickness = parseFloat(thickness);
    if (isNaN(numThickness) || numThickness <= 0) {
      setError('Wall thickness must be a positive number.');
      return;
    }

    const now = new Date().toISOString();
    let newProject: Project = {
      id: generateId('proj'),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      unit,
      defaultWallHeight: numHeight,
      defaultWallThickness: numThickness,
      points: {},
      walls: {},
      schemaVersion: 1,
    };

    // Apply template starter geometry if selected
    if (template === 'studio') {
      // 4 walls forming a 5m x 4m rectangle
      const w1 = createWallTransaction(
        newProject,
        { point: { x: 0, y: 0 } },
        { point: { x: 5, y: 0 } },
        { height: numHeight, thickness: numThickness }
      );
      newProject = w1.project;
      const ptB = newProject.walls[w1.newWallId].endPointId;

      const w2 = createWallTransaction(
        newProject,
        { point: { x: 5, y: 0 }, pointId: ptB },
        { point: { x: 5, y: 4 } },
        { height: numHeight, thickness: numThickness }
      );
      newProject = w2.project;
      const ptC = newProject.walls[w2.newWallId].endPointId;

      const w3 = createWallTransaction(
        newProject,
        { point: { x: 5, y: 4 }, pointId: ptC },
        { point: { x: 0, y: 4 } },
        { height: numHeight, thickness: numThickness }
      );
      newProject = w3.project;
      const ptD = newProject.walls[w3.newWallId].endPointId;

      const ptA = newProject.walls[w1.newWallId].startPointId;
      const w4 = createWallTransaction(
        newProject,
        { point: { x: 0, y: 4 }, pointId: ptD },
        { point: { x: 0, y: 0 }, pointId: ptA },
        { height: numHeight, thickness: numThickness }
      );
      newProject = w4.project;
    } else if (template === 'l_shaped') {
      // 6 connected walls forming an L-shape
      const corners = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 3 },
        { x: 3, y: 3 },
        { x: 3, y: 6 },
        { x: 0, y: 6 },
      ];
      let lastPtId: string | undefined = undefined;
      let firstPtId: string | undefined = undefined;

      for (let i = 0; i < corners.length; i++) {
        const nextIdx = (i + 1) % corners.length;
        const res = createWallTransaction(
          newProject,
          { point: corners[i], pointId: lastPtId },
          { point: corners[nextIdx], pointId: nextIdx === 0 ? firstPtId : undefined },
          { height: numHeight, thickness: numThickness }
        );
        newProject = res.project;
        lastPtId = newProject.walls[res.newWallId].endPointId;
        if (i === 0) {
          firstPtId = newProject.walls[res.newWallId].startPointId;
        }
      }
    }

    onCreateProject(newProject);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Create New Project</h2>
              <p className="text-xs text-slate-400">Configure floor-plan parameters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Dialog"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Project Name */}
          <div className="space-y-1">
            <label htmlFor="project-name-input" className="block text-xs font-medium text-slate-300">
              Project Name <span className="text-sky-400">*</span>
            </label>
            <input
              id="project-name-input"
              type="text"
              required
              placeholder="e.g. Modern Residential Villa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* Units */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">Measurement Units</label>
            <div className="grid grid-cols-3 gap-2">
              {(['m', 'ft', 'mm'] as MeasurementUnit[]).map((u) => (
                <button
                  type="button"
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
                    unit === u
                      ? 'bg-sky-500 text-white shadow'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {u === 'm' ? 'Meters (m)' : u === 'ft' ? 'Feet (ft)' : 'Millimeters (mm)'}
                </button>
              ))}
            </div>
          </div>

          {/* Wall Height and Thickness */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="default-height-input" className="block text-xs font-medium text-slate-300">
                Default Wall Height
              </label>
              <div className="relative">
                <input
                  id="default-height-input"
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                  {unit}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="default-thickness-input" className="block text-xs font-medium text-slate-300">
                Default Wall Thickness
              </label>
              <div className="relative">
                <input
                  id="default-thickness-input"
                  type="number"
                  step="0.01"
                  min="0.05"
                  value={thickness}
                  onChange={(e) => setThickness(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                  {unit}
                </span>
              </div>
            </div>
          </div>

          {/* Starter Template Option */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-medium text-slate-300">Starter Geometry</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTemplate('empty')}
                className={`p-2.5 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition-all ${
                  template === 'empty'
                    ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span className="text-[11px] font-medium">Blank Canvas</span>
              </button>

              <button
                type="button"
                onClick={() => setTemplate('studio')}
                className={`p-2.5 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition-all ${
                  template === 'studio'
                    ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Square className="w-4 h-4" />
                <span className="text-[11px] font-medium">Studio (4 Walls)</span>
              </button>

              <button
                type="button"
                onClick={() => setTemplate('l_shaped')}
                className={`p-2.5 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition-all ${
                  template === 'l_shaped'
                    ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <LayoutTemplate className="w-4 h-4" />
                <span className="text-[11px] font-medium">L-Shaped Room</span>
              </button>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold shadow-lg shadow-sky-500/25 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
