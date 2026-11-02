/**
 * Planform Contextual Wall Inspector
 * Mobile-first bottom sheet panel for isolated editing of length, angle, height, and thickness
 */

import React, { useState, useEffect } from 'react';
import { FixedEndpoint, Project } from '../model/types';
import {
  formatAngleDegrees,
  toDegrees,
  toRadians,
  wallAngle,
  wallLength,
  MIN_WALL_LENGTH,
} from '../geometry/pureGeometry';
import {
  resizeWallTransaction,
  rotateWallTransaction,
  updateWallPropertiesTransaction,
  deleteWallTransaction,
  getPointReferenceCount,
} from '../geometry/transactions';
import {
  Ruler,
  Compass,
  Layers,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Link,
  Unlink,
  Check,
  ShieldCheck,
} from 'lucide-react';

interface WallInspectorProps {
  project: Project;
  wallId: string;
  onCommitProject: (updatedProject: Project, actionDescription: string) => void;
  onDeselect: () => void;
}

export const WallInspector: React.FC<WallInspectorProps> = ({
  project,
  wallId,
  onCommitProject,
  onDeselect,
}) => {
  const wall = project.walls[wallId];
  const pStart = wall ? project.points[wall.startPointId] : null;
  const pEnd = wall ? project.points[wall.endPointId] : null;

  // Selected fixed endpoint for length and angle transformations
  const [fixedEndpoint, setFixedEndpoint] = useState<FixedEndpoint>('start');

  // Local draft string states for inputs to allow smooth editing without losing focus or rejecting partial input
  const [lengthStr, setLengthStr] = useState<string>('');
  const [angleStr, setAngleStr] = useState<string>('');
  const [heightStr, setHeightStr] = useState<string>('');
  const [thicknessStr, setThicknessStr] = useState<string>('');

  // Inline validation error messages
  const [errors, setErrors] = useState<{
    length?: string;
    angle?: string;
    height?: string;
    thickness?: string;
  }>({});

  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  // Synchronize local draft inputs with model whenever the selected wall or geometry changes externally
  useEffect(() => {
    if (!wall || !pStart || !pEnd) return;
    const len = wallLength(pStart, pEnd);
    const ang = formatAngleDegrees(toDegrees(wallAngle(pStart, pEnd)));

    setLengthStr(len.toFixed(2));
    setAngleStr(ang.toFixed(1));
    setHeightStr(wall.height.toFixed(2));
    setThicknessStr(wall.thickness.toFixed(2));
    setErrors({});
    setConfirmDelete(false);
  }, [wall?.id, pStart?.x, pStart?.y, pEnd?.x, pEnd?.y, wall?.height, wall?.thickness]);

  if (!wall || !pStart || !pEnd) {
    return null;
  }

  const currentLen = wallLength(pStart, pEnd);
  const currentAng = formatAngleDegrees(toDegrees(wallAngle(pStart, pEnd)));

  const startConnected = getPointReferenceCount(project, wall.startPointId) > 1;
  const endConnected = getPointReferenceCount(project, wall.endPointId) > 1;

  // Commit Length Change
  const handleCommitLength = () => {
    const val = parseFloat(lengthStr);
    if (isNaN(val) || !isFinite(val) || val < MIN_WALL_LENGTH) {
      setErrors((prev) => ({
        ...prev,
        length: `Min length is ${MIN_WALL_LENGTH}m`,
      }));
      setLengthStr(currentLen.toFixed(2));
      return;
    }

    setErrors((prev) => ({ ...prev, length: undefined }));
    if (Math.abs(val - currentLen) < 0.001) return;

    try {
      const updated = resizeWallTransaction(project, wallId, val, fixedEndpoint);
      onCommitProject(updated, `Resize wall to ${val.toFixed(2)}m`);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, length: err.message || 'Invalid length' }));
      setLengthStr(currentLen.toFixed(2));
    }
  };

  // Commit Angle Change
  const handleCommitAngle = () => {
    const val = parseFloat(angleStr);
    if (isNaN(val) || !isFinite(val)) {
      setErrors((prev) => ({ ...prev, angle: 'Invalid angle' }));
      setAngleStr(currentAng.toFixed(1));
      return;
    }

    setErrors((prev) => ({ ...prev, angle: undefined }));
    if (Math.abs(val - currentAng) < 0.1) return;

    try {
      const rad = toRadians(val);
      const updated = rotateWallTransaction(project, wallId, rad, fixedEndpoint);
      onCommitProject(updated, `Rotate wall to ${val.toFixed(1)}°`);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, angle: err.message || 'Invalid angle' }));
      setAngleStr(currentAng.toFixed(1));
    }
  };

  // Commit Height Change
  const handleCommitHeight = () => {
    const val = parseFloat(heightStr);
    if (isNaN(val) || !isFinite(val) || val <= 0) {
      setErrors((prev) => ({ ...prev, height: 'Height must be > 0' }));
      setHeightStr(wall.height.toFixed(2));
      return;
    }

    setErrors((prev) => ({ ...prev, height: undefined }));
    if (Math.abs(val - wall.height) < 0.001) return;

    const updated = updateWallPropertiesTransaction(project, wallId, { height: val });
    onCommitProject(updated, `Set wall height to ${val.toFixed(2)}m`);
  };

  // Commit Thickness Change
  const handleCommitThickness = () => {
    const val = parseFloat(thicknessStr);
    if (isNaN(val) || !isFinite(val) || val <= 0) {
      setErrors((prev) => ({ ...prev, thickness: 'Thickness must be > 0' }));
      setThicknessStr(wall.thickness.toFixed(2));
      return;
    }

    setErrors((prev) => ({ ...prev, thickness: undefined }));
    if (Math.abs(val - wall.thickness) < 0.001) return;

    const updated = updateWallPropertiesTransaction(project, wallId, { thickness: val });
    onCommitProject(updated, `Set wall thickness to ${val.toFixed(2)}m`);
  };

  // Delete Wall
  const handleDeleteWall = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    const updated = deleteWallTransaction(project, wallId);
    onCommitProject(updated, 'Delete Wall');
    onDeselect();
  };

  return (
    <div
      className="w-full bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/80 shadow-2xl rounded-t-2xl transition-all duration-200 z-30"
      data-testid="wall-inspector"
    >
      {/* Header bar / drag handle */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label={isExpanded ? 'Collapse Inspector' : 'Expand Inspector'}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
            <h3 className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
              Wall Inspector
            </h3>
          </div>
          {/* Connection badge */}
          <div className="ml-2 flex items-center gap-1 text-[11px] text-slate-400 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60">
            {startConnected || endConnected ? (
              <>
                <Link className="w-3 h-3 text-emerald-400" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <Unlink className="w-3 h-3 text-slate-500" />
                <span>Independent</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onDeselect}
            aria-label="Close Inspector"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Content Form */}
      {isExpanded && (
        <div className="p-4 space-y-4 max-h-[46vh] overflow-y-auto">
          {/* Fixed Endpoint Selector (Start vs End) */}
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-400">Fixed Anchor for Length & Angle</span>
              <span className="text-[10px] text-amber-400/90 font-mono">Isolated edit</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFixedEndpoint('start')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                  fixedEndpoint === 'start'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-300" />
                Start Point (S)
              </button>
              <button
                type="button"
                onClick={() => setFixedEndpoint('end')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                  fixedEndpoint === 'end'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-300" />
                End Point (E)
              </button>
            </div>
          </div>

          {/* Primary Numeric Fields: Length and Angle */}
          <div className="grid grid-cols-2 gap-3">
            {/* Length Field */}
            <div className="space-y-1">
              <label htmlFor="wall-length-input" className="flex items-center gap-1 text-[11px] font-medium text-slate-300">
                <Ruler className="w-3.5 h-3.5 text-sky-400" />
                Length ({project.unit})
              </label>
              <div className="relative">
                <input
                  id="wall-length-input"
                  type="number"
                  step="0.05"
                  min={MIN_WALL_LENGTH}
                  value={lengthStr}
                  onChange={(e) => setLengthStr(e.target.value)}
                  onBlur={handleCommitLength}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCommitLength();
                      (e.target as HTMLElement).blur();
                    }
                  }}
                  className={`w-full bg-slate-950 border ${
                    errors.length ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all`}
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                  {project.unit}
                </span>
              </div>
              {errors.length && (
                <p className="text-[10px] text-rose-400 mt-0.5">{errors.length}</p>
              )}
            </div>

            {/* Angle Field */}
            <div className="space-y-1">
              <label htmlFor="wall-angle-input" className="flex items-center gap-1 text-[11px] font-medium text-slate-300">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                Angle (degrees)
              </label>
              <div className="relative">
                <input
                  id="wall-angle-input"
                  type="number"
                  step="1"
                  value={angleStr}
                  onChange={(e) => setAngleStr(e.target.value)}
                  onBlur={handleCommitAngle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCommitAngle();
                      (e.target as HTMLElement).blur();
                    }
                  }}
                  className={`w-full bg-slate-950 border ${
                    errors.angle ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all`}
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">°</span>
              </div>
              {errors.angle && (
                <p className="text-[10px] text-rose-400 mt-0.5">{errors.angle}</p>
              )}
            </div>
          </div>

          {/* Secondary Properties: Height & Thickness */}
          <div className="grid grid-cols-2 gap-3">
            {/* Height Field */}
            <div className="space-y-1">
              <label htmlFor="wall-height-input" className="flex items-center gap-1 text-[11px] font-medium text-slate-300">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Wall Height ({project.unit})
              </label>
              <div className="relative">
                <input
                  id="wall-height-input"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={heightStr}
                  onChange={(e) => setHeightStr(e.target.value)}
                  onBlur={handleCommitHeight}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCommitHeight();
                      (e.target as HTMLElement).blur();
                    }
                  }}
                  className={`w-full bg-slate-950 border ${
                    errors.height ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all`}
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                  {project.unit}
                </span>
              </div>
              {errors.height && (
                <p className="text-[10px] text-rose-400 mt-0.5">{errors.height}</p>
              )}
            </div>

            {/* Thickness Field */}
            <div className="space-y-1">
              <label htmlFor="wall-thickness-input" className="flex items-center gap-1 text-[11px] font-medium text-slate-300">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Wall Thickness ({project.unit})
              </label>
              <div className="relative">
                <input
                  id="wall-thickness-input"
                  type="number"
                  step="0.01"
                  min="0.02"
                  value={thicknessStr}
                  onChange={(e) => setThicknessStr(e.target.value)}
                  onBlur={handleCommitThickness}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCommitThickness();
                      (e.target as HTMLElement).blur();
                    }
                  }}
                  className={`w-full bg-slate-950 border ${
                    errors.thickness ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all`}
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                  {project.unit}
                </span>
              </div>
              {errors.thickness && (
                <p className="text-[10px] text-rose-400 mt-0.5">{errors.thickness}</p>
              )}
            </div>
          </div>

          {/* Delete Action Button */}
          <div className="pt-1 flex items-center justify-between">
            {confirmDelete ? (
              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={handleDeleteWall}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Confirm Delete Wall
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="py-2 px-3 rounded-xl bg-slate-800/70 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-800/60 text-xs font-medium flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected Wall
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
