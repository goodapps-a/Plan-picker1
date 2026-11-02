/**
 * Planform Bottom Mobile Toolbar
 * Primary mode switcher (Select, Draw Wall, Pan) and Snapping Options
 */

import React, { useState } from 'react';
import { EditorMode, SnapSettings } from '../model/types';
import {
  MousePointer,
  PenTool,
  Hand,
  SlidersHorizontal,
  Magnet,
  Grid,
  CornerDownRight,
  Maximize2,
  Check,
  Compass,
  Scissors,
} from 'lucide-react';

interface ToolbarProps {
  mode: EditorMode;
  onSetMode: (mode: EditorMode) => void;
  snapSettings: SnapSettings;
  onUpdateSnapSettings: (settings: SnapSettings) => void;
  continuousDrawing: boolean;
  onToggleContinuous: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  mode,
  onSetMode,
  snapSettings,
  onUpdateSnapSettings,
  continuousDrawing,
  onToggleContinuous,
}) => {
  const [showSnapMenu, setShowSnapMenu] = useState(false);

  return (
    <div className="relative pointer-events-auto" data-testid="bottom-toolbar">
      {/* Snap Settings Popover Menu */}
      {showSnapMenu && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-3.5 shadow-2xl z-40 text-slate-200 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Magnet className="w-3.5 h-3.5 text-sky-400" />
              Snapping & Guides
            </div>
            <button
              onClick={() => setShowSnapMenu(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-slate-800"
            >
              Done
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {/* Endpoints Snap */}
            <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Snap to Endpoints
              </span>
              <input
                type="checkbox"
                checked={snapSettings.snapToEndpoints}
                onChange={(e) =>
                  onUpdateSnapSettings({
                    ...snapSettings,
                    snapToEndpoints: e.target.checked,
                  })
                }
                className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* Wall Edges Snap */}
            <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Snap to Wall Edges (T-Junction)
              </span>
              <input
                type="checkbox"
                checked={snapSettings.snapToWallEdges}
                onChange={(e) =>
                  onUpdateSnapSettings({
                    ...snapSettings,
                    snapToWallEdges: e.target.checked,
                  })
                }
                className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* Intersections Snap */}
            <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                Snap to Intersections
              </span>
              <input
                type="checkbox"
                checked={snapSettings.snapToIntersections}
                onChange={(e) =>
                  onUpdateSnapSettings({
                    ...snapSettings,
                    snapToIntersections: e.target.checked,
                  })
                }
                className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* Orthogonal / 45° Angle Snap */}
            <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-pink-400" />
                Angle Snapping (45° / Ortho)
              </span>
              <input
                type="checkbox"
                checked={snapSettings.snapToAngles}
                onChange={(e) =>
                  onUpdateSnapSettings({
                    ...snapSettings,
                    snapToAngles: e.target.checked,
                  })
                }
                className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* Grid Snap */}
            <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <Grid className="w-3.5 h-3.5 text-amber-400" />
                Grid Snapping (0.5m)
              </span>
              <input
                type="checkbox"
                checked={snapSettings.snapToGrid}
                onChange={(e) =>
                  onUpdateSnapSettings({
                    ...snapSettings,
                    snapToGrid: e.target.checked,
                  })
                }
                className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <div className="h-px bg-slate-800 my-1" />

            {/* Continuous Drawing Chain */}
            <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2 font-medium text-amber-300">
                <CornerDownRight className="w-3.5 h-3.5" />
                Continuous Chain Drawing
              </span>
              <input
                type="checkbox"
                checked={continuousDrawing}
                onChange={onToggleContinuous}
                className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* Primary Floating Toolbar Pill */}
      <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 p-1.5 rounded-2xl shadow-2xl">
        {/* Select Mode */}
        <button
          onClick={() => onSetMode('select')}
          aria-label="Select Mode"
          title="Select & Edit Walls"
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
            mode === 'select'
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
        >
          <MousePointer className="w-4 h-4" />
          <span className="hidden xs:inline">Select</span>
        </button>

        {/* Draw Wall Mode */}
        <button
          onClick={() => onSetMode('draw')}
          aria-label="Draw Wall Mode"
          title="Draw Walls"
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
            mode === 'draw'
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
        >
          <PenTool className="w-4 h-4" />
          <span className="hidden xs:inline">Draw Wall</span>
        </button>

        {/* Trim / Join Mode */}
        <button
          onClick={() => onSetMode('trim')}
          aria-label="Trim / Join Tool"
          title="Trim or Extend Two Walls to Join"
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
            mode === 'trim'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20 ring-1 ring-purple-400'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span className="hidden xs:inline">Trim / Join</span>
        </button>

        <div className="w-px h-6 bg-slate-700/60 mx-1" />

        {/* Snapping Options Toggle */}
        <button
          onClick={() => setShowSnapMenu(!showSnapMenu)}
          aria-label="Snapping Settings"
          title="Configure Snapping"
          className={`p-2.5 rounded-xl transition-all active:scale-95 ${
            showSnapMenu
              ? 'bg-slate-700 text-sky-400'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
        >
          <Magnet className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
