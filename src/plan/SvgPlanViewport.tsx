/**
 * Planform 2D SVG Plan Viewport
 * High-precision architectural drawing canvas with touch/mouse interaction, snapping, and handles
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Project,
  Point,
  Wall,
  EditorMode,
  SnapSettings,
  SnapResult,
  ViewportTransform,
} from '../model/types';
import {
  distance,
  formatAngleDegrees,
  getWallPolygonVertices,
  Point2D,
  screenToWorld,
  toDegrees,
  toRadians,
  wallAngle,
  wallLength,
  worldToScreen,
  computeBoundingBox,
  angleBetweenVectorsDegrees,
} from '../geometry/pureGeometry';
import { calculateSnap, DEFAULT_SNAP_SETTINGS } from '../geometry/snapping';
import {
  createWallTransaction,
  moveWallTransaction,
  updateWallEndpointTransaction,
  getPointReferenceCount,
  trimWallsTransaction,
  resizeWallTransaction,
  rotateWallAtJunctionTransaction,
  deleteWallTransaction,
} from '../geometry/transactions';
import {
  Maximize2,
  RefreshCw,
  Plus,
  Minus,
  Check,
  X,
  Crosshair,
  Compass,
  Scissors,
  Trash2,
  Lock,
  Unlock,
  Edit2,
  RotateCw,
} from 'lucide-react';
import { DimensionEditorModal } from '../components/DimensionEditorModal';

interface SvgPlanViewportProps {
  project: Project;
  mode: EditorMode;
  selectedWallId: string | null;
  onSelectWall: (wallId: string | null) => void;
  onCommitProject: (updatedProject: Project, actionDescription: string) => void;
  snapSettings: SnapSettings;
  continuousDrawing: boolean;
  onFinishChain?: () => void;
  onCancelChain?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  onSetMode?: (mode: EditorMode) => void;
}

export const SvgPlanViewport: React.FC<SvgPlanViewportProps> = ({
  project,
  mode,
  selectedWallId,
  onSelectWall,
  onCommitProject,
  snapSettings,
  continuousDrawing,
  onFinishChain,
  onCancelChain,
  onTypingChange,
  onSetMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport Transform State: panX, panY, zoom (pixels per meter)
  const [transform, setTransform] = useState<ViewportTransform>({
    panX: 200,
    panY: 300,
    zoom: 60, // 60 pixels per meter initially
  });

  // Track viewport container dimensions
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 400,
    height: 600,
  });

  // Drawing state
  const [drawingStartPoint, setDrawingStartPoint] = useState<{
    point: Point2D;
    pointId?: string;
  } | null>(null);

  // Live pointer world position & active snap candidate
  const [currentWorldPointer, setCurrentWorldPointer] = useState<Point2D>({ x: 0, y: 0 });
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null);

  // Drag-to-Draw gesture tracking:
  // User places finger/cursor at Point 1, drags to Point 2, and releases (pointerup) to commit immediately.
  const dragDrawStartRef = useRef<{
    screen: Point2D;
    world: Point2D;
    pointId?: string;
  } | null>(null);
  const isDraggingDrawRef = useRef<boolean>(false);
  const wallTapTimeRef = useRef<number>(0);
  const badgeTapRef = useRef<{ wallId: string; time: number; screen: Point2D } | null>(null);
  const angleTapRef = useRef<{
    junctionPointId: string;
    wallId: string;
    otherWallId: string;
    initialDegrees: number;
    time: number;
    screen: Point2D;
  } | null>(null);

  // Trim / Join tool state
  const [trimFirstWallId, setTrimFirstWallId] = useState<string | null>(null);

  // Direct In-Place Length Editing state
  const [editingLengthWallId, setEditingLengthWallId] = useState<string | null>(null);

  // Graphical Corner Angle Editing state
  const [editingAngleJunction, setEditingAngleJunction] = useState<{
    junctionPointId: string;
    wallId: string;
    otherWallId: string;
    initialDegrees: number;
  } | null>(null);

  // Notify parent if typing/dimension modal is active so bottom toolbar hides
  useEffect(() => {
    const isTyping = Boolean(editingLengthWallId || editingAngleJunction);
    onTypingChange?.(isTyping);
  }, [editingLengthWallId, editingAngleJunction, onTypingChange]);

  // Dragging interaction state
  type DragKind =
    | 'none'
    | 'pan'
    | 'canvas_bg_pan'
    | 'wall_select_pending'
    | 'badge_drag_pending'
    | 'angle_drag_pending'
    | 'wall_body'
    | 'start_handle'
    | 'end_handle';
  const [dragState, setDragState] = useState<{
    kind: DragKind;
    startScreen: Point2D;
    startPan: Point2D;
    initialWorldPos: Point2D;
    deltaWorld: Point2D;
    activeSnapPoint?: Point2D;
    targetSnapPointId?: string;
    pendingWallId?: string;
  }>({
    kind: 'none',
    startScreen: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
    initialWorldPos: { x: 0, y: 0 },
    deltaWorld: { x: 0, y: 0 },
  });

  // Multi-touch gestures tracking for pinch-to-zoom
  const activePointersRef = useRef<Map<number, Point2D>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(60);
  const pinchCenterWorldRef = useRef<Point2D | null>(null);

  // Measure container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 600;
      setViewportSize({ width: w, height: h });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Fit Plan to View
  const handleFitPlan = useCallback(() => {
    const points = Object.values(project.points);
    if (points.length === 0) {
      setTransform({
        panX: viewportSize.width / 2,
        panY: viewportSize.height / 2,
        zoom: 60,
      });
      return;
    }

    const bbox = computeBoundingBox(points);
    const padding = 60; // pixels
    const availWidth = Math.max(100, viewportSize.width - padding * 2);
    const availHeight = Math.max(100, viewportSize.height - padding * 2);

    const bboxW = Math.max(bbox.width, 2);
    const bboxH = Math.max(bbox.height, 2);

    const newZoom = Math.max(15, Math.min(150, Math.min(availWidth / bboxW, availHeight / bboxH)));

    const panX = viewportSize.width / 2 - bbox.centerX * newZoom;
    const panY = viewportSize.height / 2 + bbox.centerY * newZoom;

    setTransform({ panX, panY, zoom: newZoom });
  }, [project.points, viewportSize]);

  // Reset view to default center
  const handleResetView = useCallback(() => {
    setTransform({
      panX: viewportSize.width / 2,
      panY: viewportSize.height / 2,
      zoom: 60,
    });
  }, [viewportSize]);

  // Zoom by step
  const handleZoomStep = useCallback((factor: number) => {
    setTransform((prev) => {
      const newZoom = Math.max(15, Math.min(250, prev.zoom * factor));
      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
      const worldCenter = screenToWorld({ x: centerX, y: centerY }, prev.panX, prev.panY, prev.zoom);

      const newPanX = centerX - worldCenter.x * newZoom;
      const newPanY = centerY + worldCenter.y * newZoom;

      return { panX: newPanX, panY: newPanY, zoom: newZoom };
    });
  }, [viewportSize]);

  // Pointer event coordinate extractor relative to SVG container
  const getContainerCoords = (e: React.PointerEvent): Point2D => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: e.clientX, y: e.clientY };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Convert container screen coordinate to world coordinate
  const toWorld = useCallback(
    (screen: Point2D): Point2D => {
      return screenToWorld(screen, transform.panX, transform.panY, transform.zoom);
    },
    [transform]
  );

  // Convert world coordinate to container screen coordinate
  const toScreen = useCallback(
    (world: Point2D): Point2D => {
      return worldToScreen(world, transform.panX, transform.panY, transform.zoom);
    },
    [transform]
  );

  // Reset drawing & tool states when switching modes
  useEffect(() => {
    if (mode !== 'draw') {
      setDrawingStartPoint(null);
      setActiveSnap(null);
      dragDrawStartRef.current = null;
      isDraggingDrawRef.current = false;
    }
    if (mode !== 'trim') {
      setTrimFirstWallId(null);
    }
    setEditingLengthWallId(null);
    setEditingAngleJunction(null);
  }, [mode]);

  // Sync typing mode state with parent so bottom toolbar hides when typing
  useEffect(() => {
    const isTyping = Boolean(editingLengthWallId || editingAngleJunction);
    onTypingChange?.(isTyping);
  }, [editingLengthWallId, editingAngleJunction, onTypingChange]);

  // Close length editor if the editing wall no longer exists or is deselected
  useEffect(() => {
    if (editingLengthWallId && (!selectedWallId || !project.walls[editingLengthWallId])) {
      setEditingLengthWallId(null);
    }
  }, [selectedWallId, project.walls, editingLengthWallId]);

  // Commit in-place length change with smart anchor (expand/shrink the free, untrimmed endpoint)
  const handleCommitLength = (wallId: string, newLen: number) => {
    const wall = project.walls[wallId];
    if (!wall || !newLen || isNaN(newLen) || newLen < 0.05) {
      setEditingLengthWallId(null);
      return;
    }

    const startUsage = getPointReferenceCount(project, wall.startPointId);
    const endUsage = getPointReferenceCount(project, wall.endPointId);
    let fixedEndpoint: 'start' | 'end' = 'start';
    if (startUsage > 1 && endUsage === 1) {
      // Start is trimmed/connected, end is free -> anchor start, expand/shrink end
      fixedEndpoint = 'start';
    } else if (endUsage > 1 && startUsage === 1) {
      // End is trimmed/connected, start is free -> anchor end, expand/shrink start
      fixedEndpoint = 'end';
    } else {
      fixedEndpoint = 'start';
    }

    try {
      const updated = resizeWallTransaction(project, wallId, newLen, fixedEndpoint);
      onCommitProject(updated, `Resize Wall to ${newLen.toFixed(2)}m`);
    } catch (err: any) {
      console.warn('[Planform] Failed to resize wall:', err);
    }
    setEditingLengthWallId(null);
  };

  // Commit corner angle change around shared junction point
  const handleCommitAngle = (newDeg: number) => {
    if (!editingAngleJunction) return;
    const { junctionPointId, wallId, otherWallId } = editingAngleJunction;
    const wall = project.walls[wallId];
    const otherWall = project.walls[otherWallId];
    const junctionPt = project.points[junctionPointId];
    if (!wall || !otherWall || !junctionPt || isNaN(newDeg) || newDeg < 1 || newDeg > 179) {
      setEditingAngleJunction(null);
      return;
    }

    const pSelOther = wall.startPointId === junctionPointId
      ? project.points[wall.endPointId]
      : project.points[wall.startPointId];
    const pOtherOther = otherWall.startPointId === junctionPointId
      ? project.points[otherWall.endPointId]
      : project.points[otherWall.startPointId];

    if (!pSelOther || !pOtherOther) {
      setEditingAngleJunction(null);
      return;
    }

    const vSel = { x: pSelOther.x - junctionPt.x, y: pSelOther.y - junctionPt.y };
    const vOther = { x: pOtherOther.x - junctionPt.x, y: pOtherOther.y - junctionPt.y };

    const alphaOther = Math.atan2(vOther.y, vOther.x);
    const alphaSel = Math.atan2(vSel.y, vSel.x);
    const deltaAlpha = Math.atan2(Math.sin(alphaSel - alphaOther), Math.cos(alphaSel - alphaOther));
    const sign = deltaAlpha >= 0 ? 1 : -1;

    const targetVectorAngle = alphaOther + sign * (newDeg * Math.PI / 180);

    const targetWallAngle = (wall.startPointId === junctionPointId)
      ? targetVectorAngle
      : targetVectorAngle + Math.PI;

    try {
      const updated = rotateWallAtJunctionTransaction(project, wallId, junctionPointId, targetWallAngle);
      onCommitProject(updated, `Set Corner Angle to ${newDeg.toFixed(1)}°`);
    } catch (err: any) {
      console.warn('[Planform] Failed to rotate wall angle:', err);
    }
    setEditingAngleJunction(null);
  };

  // POINTER DOWN CAPTURE: Always captures multi-touch for pinch-zoom regardless of target
  const handlePointerDownCapture = (e: React.PointerEvent) => {
    const screenCoord = getContainerCoords(e);
    activePointersRef.current.set(e.pointerId, screenCoord);

    // Multi-touch handling: when 2 or more touches are active, immediately cancel any drag and enter pinch-zoom
    if (activePointersRef.current.size >= 2) {
      setDragState({
        kind: 'none',
        startScreen: { x: 0, y: 0 },
        startPan: { x: 0, y: 0 },
        initialWorldPos: { x: 0, y: 0 },
        deltaWorld: { x: 0, y: 0 },
      });
      // Also cancel any drawing drag
      if (drawingStartPoint) {
        setDrawingStartPoint(null);
        dragDrawStartRef.current = null;
        isDraggingDrawRef.current = false;
        setActiveSnap(null);
      }

      const pts = Array.from(activePointersRef.current.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartDistanceRef.current = dist;
      pinchStartZoomRef.current = transform.zoom;

      const midScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      pinchCenterWorldRef.current = toWorld(midScreen);
      return;
    }
  };

  // POINTER DOWN HANDLER (Single touch operations)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (activePointersRef.current.size >= 2) return;
    const screenCoord = getContainerCoords(e);

    // Check if PAN mode is active
    if (mode === 'pan') {
      setDragState({
        kind: 'pan',
        startScreen: screenCoord,
        startPan: { x: transform.panX, y: transform.panY },
        initialWorldPos: toWorld(screenCoord),
        deltaWorld: { x: 0, y: 0 },
      });
      return;
    }

    // DRAW WALL GESTURE START (Always Point 1 of the Drag-to-Draw gesture)
    if (mode === 'draw') {
      const rawWorld = toWorld(screenCoord);
      const snap = calculateSnap(
        rawWorld,
        null, // Point 1 has no previous point
        project,
        transform.zoom,
        snapSettings
      );

      const chosenWorldPoint = snap.point;
      const targetPointId = snap.type === 'endpoint' ? snap.targetPointId : undefined;

      // Starting a new drawing gesture (Drag-to-Draw):
      setDrawingStartPoint({
        point: chosenWorldPoint,
        pointId: targetPointId,
      });
      setActiveSnap(snap);
      setCurrentWorldPointer(chosenWorldPoint);
      dragDrawStartRef.current = {
        screen: screenCoord,
        world: chosenWorldPoint,
        pointId: targetPointId,
      };
      isDraggingDrawRef.current = false;
      return;
    }

    // TRIM MODE - panning or clicking background
    if (mode === 'trim') {
      setDragState({
        kind: 'pan',
        startScreen: screenCoord,
        startPan: { x: transform.panX, y: transform.panY },
        initialWorldPos: toWorld(screenCoord),
        deltaWorld: { x: 0, y: 0 },
      });
      return;
    }

    // SELECT MODE (click on canvas background to pan or deselect)
    if (mode === 'select') {
      const targetEl = e.target as HTMLElement | SVGElement;
      const isCanvasBg = targetEl.tagName === 'svg' || !!targetEl.closest?.('#grid-layer');
      if (isCanvasBg) {
        setDragState({
          kind: 'canvas_bg_pan',
          startScreen: screenCoord,
          startPan: { x: transform.panX, y: transform.panY },
          initialWorldPos: toWorld(screenCoord),
          deltaWorld: { x: 0, y: 0 },
        });
      }
    }
  };

  // POINTER MOVE HANDLER
  const handlePointerMove = (e: React.PointerEvent) => {
    const screenCoord = getContainerCoords(e);
    activePointersRef.current.set(e.pointerId, screenCoord);

    // Multi-touch Pinch Zoom
    if (activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (pinchStartDistanceRef.current && pinchCenterWorldRef.current) {
        const scale = currentDist / pinchStartDistanceRef.current;
        const newZoom = Math.max(15, Math.min(250, pinchStartZoomRef.current * scale));

        const midScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const centerWorld = pinchCenterWorldRef.current;

        const newPanX = midScreen.x - centerWorld.x * newZoom;
        const newPanY = midScreen.y + centerWorld.y * newZoom;

        setTransform({ panX: newPanX, panY: newPanY, zoom: newZoom });
      }
      return;
    }

    const rawWorld = toWorld(screenCoord);
    setCurrentWorldPointer(rawWorld);

    // PAN DRAG (canvas bg pan or standard pan)
    if (dragState.kind === 'pan' || dragState.kind === 'canvas_bg_pan') {
      const dx = screenCoord.x - dragState.startScreen.x;
      const dy = screenCoord.y - dragState.startScreen.y;
      setTransform((prev) => ({
        ...prev,
        panX: dragState.startPan.x + dx,
        panY: dragState.startPan.y + dy,
      }));
      return;
    }

    // If pointer clicked on a wall or badge and dragged, transition smoothly to view pan
    if (
      dragState.kind === 'wall_select_pending' ||
      dragState.kind === 'badge_drag_pending' ||
      dragState.kind === 'angle_drag_pending'
    ) {
      const dx = screenCoord.x - dragState.startScreen.x;
      const dy = screenCoord.y - dragState.startScreen.y;
      if (Math.hypot(dx, dy) > 5) {
        setDragState((prev) => ({ ...prev, kind: 'pan', pendingWallId: undefined }));
        badgeTapRef.current = null;
        angleTapRef.current = null;
        setTransform((prev) => ({
          ...prev,
          panX: dragState.startPan.x + dx,
          panY: dragState.startPan.y + dy,
        }));
      }
      return;
    }

    // DRAW WALL PREVIEW SNAP
    if (mode === 'draw') {
      if (dragDrawStartRef.current) {
        const screenDist = Math.hypot(
          screenCoord.x - dragDrawStartRef.current.screen.x,
          screenCoord.y - dragDrawStartRef.current.screen.y
        );
        if (screenDist > 8) {
          isDraggingDrawRef.current = true;
        }
      }

      const snap = calculateSnap(
        rawWorld,
        drawingStartPoint ? drawingStartPoint.point : null,
        project,
        transform.zoom,
        snapSettings
      );
      setActiveSnap(snap);
      setCurrentWorldPointer(snap.point);
      return;
    }

    // DRAGGING START HANDLE
    if (dragState.kind === 'start_handle' && selectedWallId) {
      const wall = project.walls[selectedWallId];
      if (!wall) return;
      const otherEndPt = project.points[wall.endPointId];

      const snap = calculateSnap(
        rawWorld,
        otherEndPt,
        project,
        transform.zoom,
        snapSettings,
        selectedWallId,
        wall.startPointId
      );
      setActiveSnap(snap);

      setDragState((prev) => ({
        ...prev,
        deltaWorld: {
          x: snap.point.x - prev.initialWorldPos.x,
          y: snap.point.y - prev.initialWorldPos.y,
        },
        activeSnapPoint: snap.point,
        targetSnapPointId: snap.type === 'endpoint' ? snap.targetPointId : undefined,
      }));
      return;
    }

    // DRAGGING END HANDLE
    if (dragState.kind === 'end_handle' && selectedWallId) {
      const wall = project.walls[selectedWallId];
      if (!wall) return;
      const otherStartPt = project.points[wall.startPointId];

      const snap = calculateSnap(
        rawWorld,
        otherStartPt,
        project,
        transform.zoom,
        snapSettings,
        selectedWallId,
        wall.endPointId
      );
      setActiveSnap(snap);

      setDragState((prev) => ({
        ...prev,
        deltaWorld: {
          x: snap.point.x - prev.initialWorldPos.x,
          y: snap.point.y - prev.initialWorldPos.y,
        },
        activeSnapPoint: snap.point,
        targetSnapPointId: snap.type === 'endpoint' ? snap.targetPointId : undefined,
      }));
      return;
    }

    // DRAGGING WALL BODY (TRANSLATION) WITH AXIS CONSTRAINTS
    if (dragState.kind === 'wall_body' && selectedWallId) {
      const wall = project.walls[selectedWallId];
      let dx = rawWorld.x - dragState.initialWorldPos.x;
      let dy = rawWorld.y - dragState.initialWorldPos.y;

      if (wall) {
        const p1 = project.points[wall.startPointId];
        const p2 = project.points[wall.endPointId];
        if (p1 && p2) {
          const wallLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (wallLen > 0.01) {
            const uX = (p2.x - p1.x) / wallLen;
            const uY = (p2.y - p1.y) / wallLen;
            const nX = -uY;
            const nY = uX;

            const dispLen = Math.hypot(dx, dy);
            if (dispLen > 0.04) {
              const candidateDirs = [
                { ux: uX, uy: uY, desc: 'Parallel' },
                { ux: nX, uy: nY, desc: 'Perpendicular' },
                { ux: 1, uy: 0, desc: 'Ortho (0°)' },
                { ux: 0, uy: 1, desc: 'Ortho (90°)' },
                { ux: Math.SQRT1_2, uy: Math.SQRT1_2, desc: '45°' },
                { ux: -Math.SQRT1_2, uy: Math.SQRT1_2, desc: '135°' },
              ];

              let bestSnapDist = Infinity;
              let bestDx = dx;
              let bestDy = dy;
              let bestDesc = '';

              const worldTolerance = Math.max(0.04, (snapSettings.screenTolerancePx * 1.5) / Math.max(transform.zoom, 1));

              for (const dir of candidateDirs) {
                const projScalar = dx * dir.ux + dy * dir.uy;
                const projX = projScalar * dir.ux;
                const projY = projScalar * dir.uy;
                const devDist = Math.hypot(dx - projX, dy - projY);

                if (devDist <= worldTolerance && devDist < bestSnapDist) {
                  bestSnapDist = devDist;
                  bestDx = projX;
                  bestDy = projY;
                  bestDesc = dir.desc;
                }
              }

              if (bestSnapDist < Infinity) {
                dx = bestDx;
                dy = bestDy;
                setActiveSnap({
                  type: 'angle_align',
                  point: { x: dragState.initialWorldPos.x + dx, y: dragState.initialWorldPos.y + dy },
                  description: bestDesc,
                });
              } else {
                setActiveSnap(null);
              }
            }
          }
        }
      }

      setDragState((prev) => ({
        ...prev,
        deltaWorld: { x: dx, y: dy },
      }));
    }
  };

  // POINTER UP HANDLER
  const handlePointerUp = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartDistanceRef.current = null;
      pinchCenterWorldRef.current = null;
    }

    // DRAW WALL MODE: Handle Drag-to-Draw Release
    if (mode === 'draw') {
      try {
        containerRef.current?.releasePointerCapture?.(e.pointerId);
      } catch {}

      if (drawingStartPoint && dragDrawStartRef.current) {
        const screenCoord = getContainerCoords(e);
        const screenDist = Math.hypot(
          screenCoord.x - dragDrawStartRef.current.screen.x,
          screenCoord.y - dragDrawStartRef.current.screen.y
        );

        const rawWorld = toWorld(screenCoord);
        const snap = calculateSnap(
          rawWorld,
          drawingStartPoint.point,
          project,
          transform.zoom,
          snapSettings
        );

        const endPt = snap.point;
        const targetPointId = snap.type === 'endpoint' ? snap.targetPointId : undefined;
        const splitWallId = snap.type === 'wall_edge' ? snap.targetWallId : undefined;
        const worldLen = distance(drawingStartPoint.point, endPt);

        // If user dragged (screen movement >= 10px and world wall length >= 0.15m):
        // Immediately commit the wall on release!
        if (screenDist >= 10 && worldLen >= 0.15) {
          try {
            const res = createWallTransaction(
              project,
              { point: drawingStartPoint.point, pointId: drawingStartPoint.pointId },
              { point: endPt, pointId: targetPointId },
              {
                height: project.defaultWallHeight,
                thickness: project.defaultWallThickness,
                splitWallId,
                splitAt: 'end',
              }
            );

            onCommitProject(res.project, 'Draw Wall');
            onSelectWall(null);
          } catch (err: any) {
            console.error('[Planform] Failed to commit drag-drawn wall:', err);
          }
        }
      }

      // Always reset drawing gesture state on release so next touch starts fresh
      setDrawingStartPoint(null);
      dragDrawStartRef.current = null;
      isDraggingDrawRef.current = false;
      setActiveSnap(null);
      return;
    }

    const { kind, deltaWorld, activeSnapPoint, targetSnapPointId } = dragState;

    // Reset drag state
    setDragState({
      kind: 'none',
      startScreen: { x: 0, y: 0 },
      startPan: { x: 0, y: 0 },
      initialWorldPos: { x: 0, y: 0 },
      deltaWorld: { x: 0, y: 0 },
    });
    setActiveSnap(null);

    // If it was a clean single tap on a wall, select it now!
    if (kind === 'wall_select_pending' && dragState.pendingWallId) {
      const screenCoord = getContainerCoords(e);
      const moveDist = Math.hypot(
        screenCoord.x - dragState.startScreen.x,
        screenCoord.y - dragState.startScreen.y
      );
      const elapsed = Date.now() - (wallTapTimeRef.current || 0);
      if (moveDist < 6 && elapsed < 350) {
        onSelectWall(dragState.pendingWallId);
      }
      return;
    }

    // If it was a clean single tap on a length badge, open editor directly
    if (kind === 'badge_drag_pending' && dragState.pendingWallId) {
      const screenCoord = getContainerCoords(e);
      const moveDist = Math.hypot(
        screenCoord.x - dragState.startScreen.x,
        screenCoord.y - dragState.startScreen.y
      );
      const elapsed = Date.now() - (badgeTapRef.current?.time || 0);
      if (moveDist < 6 && elapsed < 350) {
        const wallId = dragState.pendingWallId;
        onSelectWall(wallId);
        setEditingLengthWallId(wallId);
      }
      badgeTapRef.current = null;
      return;
    }

    // If it was a clean single tap on an angle badge, open angle editor directly
    if (kind === 'angle_drag_pending' && angleTapRef.current) {
      const screenCoord = getContainerCoords(e);
      const moveDist = Math.hypot(
        screenCoord.x - dragState.startScreen.x,
        screenCoord.y - dragState.startScreen.y
      );
      const elapsed = Date.now() - (angleTapRef.current?.time || 0);
      if (moveDist < 6 && elapsed < 350) {
        setEditingAngleJunction({
          junctionPointId: angleTapRef.current.junctionPointId,
          wallId: angleTapRef.current.wallId,
          otherWallId: angleTapRef.current.otherWallId,
          initialDegrees: angleTapRef.current.initialDegrees,
        });
      }
      angleTapRef.current = null;
      return;
    }

    // Commit Endpoint Drag
    if ((kind === 'start_handle' || kind === 'end_handle') && selectedWallId && activeSnapPoint) {
      const endpointType = kind === 'start_handle' ? 'start' : 'end';
      try {
        const updated = updateWallEndpointTransaction(
          project,
          selectedWallId,
          endpointType,
          activeSnapPoint,
          targetSnapPointId
        );
        onCommitProject(updated, `Adjust ${endpointType} endpoint`);
      } catch (err: any) {
        console.warn('[Planform] Failed to commit endpoint adjustment:', err);
      }
      return;
    }

    // Commit Wall Body Translation
    if (kind === 'wall_body' && selectedWallId) {
      const dist = Math.hypot(deltaWorld.x, deltaWorld.y);
      if (dist > 0.02) {
        try {
          const updated = moveWallTransaction(project, selectedWallId, deltaWorld.x, deltaWorld.y);
          onCommitProject(updated, 'Move Wall');
        } catch (err: any) {
          console.warn('[Planform] Failed to commit wall move:', err);
        }
      }
      return;
    }

    // If it was just a tiny click on background in select mode, deselect
    if (kind === 'canvas_bg_pan' && mode === 'select') {
      const moveDist = Math.hypot(
        getContainerCoords(e).x - dragState.startScreen.x,
        getContainerCoords(e).y - dragState.startScreen.y
      );
      if (moveDist < 4) {
        onSelectWall(null);
      }
    }
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const screenPoint = getContainerCoords(e as unknown as React.PointerEvent);
    const worldPoint = toWorld(screenPoint);

    setTransform((prev) => {
      const newZoom = Math.max(15, Math.min(250, prev.zoom * zoomFactor));
      const newPanX = screenPoint.x - worldPoint.x * newZoom;
      const newPanY = screenPoint.y + worldPoint.y * newZoom;
      return { panX: newPanX, panY: newPanY, zoom: newZoom };
    });
  };

  // Select a wall when clicked directly or trim two walls
  const handleWallClick = (e: React.PointerEvent, wallId: string) => {
    if (activePointersRef.current.size >= 2) return;
    if (mode === 'pan') return;
    e.stopPropagation();

    if (mode === 'trim') {
      if (!trimFirstWallId) {
        setTrimFirstWallId(wallId);
      } else if (trimFirstWallId === wallId) {
        setTrimFirstWallId(null);
      } else {
        try {
          const updated = trimWallsTransaction(project, trimFirstWallId, wallId);
          onCommitProject(updated, 'Trim / Join Walls');
          setTrimFirstWallId(null);
          onSelectWall(null);
          onSetMode?.('select');
        } catch (err: any) {
          console.warn('[Planform] Trim failed:', err);
        }
      }
      return;
    }

    if (mode === 'select') {
      const isAlreadySelected = selectedWallId === wallId;

      if (!isAlreadySelected) {
        wallTapTimeRef.current = Date.now();
        // Pending selection: do NOT select wall yet so panning does not select any wall
        setDragState({
          kind: 'wall_select_pending',
          pendingWallId: wallId,
          startScreen: getContainerCoords(e),
          startPan: { x: transform.panX, y: transform.panY },
          initialWorldPos: toWorld(getContainerCoords(e)),
          deltaWorld: { x: 0, y: 0 },
        });
      } else {
        // Wall was ALREADY selected: deliberate drag moves wall and stretches connected rooms
        const rawWorld = toWorld(getContainerCoords(e));
        setDragState({
          kind: 'wall_body',
          startScreen: getContainerCoords(e),
          startPan: { x: transform.panX, y: transform.panY },
          initialWorldPos: rawWorld,
          deltaWorld: { x: 0, y: 0 },
        });
      }
    }
  };

  // Handle start/end handle pointer down
  const handleHandlePointerDown = (
    e: React.PointerEvent,
    wallId: string,
    handleType: 'start' | 'end'
  ) => {
    e.stopPropagation();
    if (activePointersRef.current.size >= 2) return;
    const screenCoord = getContainerCoords(e);
    const rawWorld = toWorld(screenCoord);

    setDragState({
      kind: handleType === 'start' ? 'start_handle' : 'end_handle',
      startScreen: screenCoord,
      startPan: { x: transform.panX, y: transform.panY },
      initialWorldPos: rawWorld,
      deltaWorld: { x: 0, y: 0 },
      activeSnapPoint: rawWorld,
    });
  };

  // Architectural Grid Generation
  const gridElements = useMemo(() => {
    const { panX, panY, zoom } = transform;
    const { width, height } = viewportSize;

    // Determine grid step in meters based on zoom level
    let step = 1.0; // 1m
    if (zoom < 30) step = 2.0;
    if (zoom > 90) step = 0.5;

    // World bounds visible
    const topLeftWorld = screenToWorld({ x: 0, y: 0 }, panX, panY, zoom);
    const bottomRightWorld = screenToWorld({ x: width, y: height }, panX, panY, zoom);

    const minX = Math.floor(topLeftWorld.x / step) * step - step;
    const maxX = Math.ceil(bottomRightWorld.x / step) * step + step;
    const minY = Math.floor(bottomRightWorld.y / step) * step - step;
    const maxY = Math.ceil(topLeftWorld.y / step) * step + step;

    const lines: React.ReactNode[] = [];

    // Vertical grid lines
    for (let x = minX; x <= maxX; x += step) {
      const screenX = panX + x * zoom;
      const isAxis = Math.abs(x) < 1e-4;
      const isMajor = Math.round(x) === x && Math.round(x) % 5 === 0;

      lines.push(
        <line
          key={`gx_${x.toFixed(2)}`}
          x1={screenX}
          y1={0}
          x2={screenX}
          y2={height}
          stroke={isAxis ? '#64748b' : isMajor ? '#334155' : '#1e293b'}
          strokeWidth={isAxis ? 1.5 : isMajor ? 1 : 0.6}
          strokeDasharray={isAxis ? undefined : isMajor ? undefined : '2 2'}
        />
      );

      // Label coordinate along axis
      if (isMajor || isAxis) {
        lines.push(
          <text
            key={`gxl_${x.toFixed(2)}`}
            x={screenX + 3}
            y={height - 8}
            fill="#64748b"
            fontSize="9"
            fontFamily="monospace"
            className="select-none pointer-events-none"
          >
            {x.toFixed(0)}m
          </text>
        );
      }
    }

    // Horizontal grid lines
    for (let y = minY; y <= maxY; y += step) {
      const screenY = panY - y * zoom;
      const isAxis = Math.abs(y) < 1e-4;
      const isMajor = Math.round(y) === y && Math.round(y) % 5 === 0;

      lines.push(
        <line
          key={`gy_${y.toFixed(2)}`}
          x1={0}
          y1={screenY}
          x2={width}
          y2={screenY}
          stroke={isAxis ? '#64748b' : isMajor ? '#334155' : '#1e293b'}
          strokeWidth={isAxis ? 1.5 : isMajor ? 1 : 0.6}
          strokeDasharray={isAxis ? undefined : isMajor ? undefined : '2 2'}
        />
      );

      if (isMajor || isAxis) {
        lines.push(
          <text
            key={`gyl_${y.toFixed(2)}`}
            x={8}
            y={screenY - 3}
            fill="#64748b"
            fontSize="9"
            fontFamily="monospace"
            className="select-none pointer-events-none"
          >
            {y.toFixed(0)}m
          </text>
        );
      }
    }

    return lines;
  }, [transform, viewportSize]);

  // Helper to obtain live real-time position of any point during active wall/handle drag
  const getLivePoint = useCallback(
    (ptId: string, forWallId?: string): Point => {
      const basePt = project.points[ptId];
      if (!basePt) return { id: ptId, x: 0, y: 0 };
      if (!selectedWallId) return basePt;

      const selWall = project.walls[selectedWallId];
      if (!selWall) return basePt;

      if (dragState.kind === 'wall_body') {
        // Any wall connected to the selected wall's start or end point moves live!
        if (ptId === selWall.startPointId || ptId === selWall.endPointId) {
          return {
            ...basePt,
            x: basePt.x + dragState.deltaWorld.x,
            y: basePt.y + dragState.deltaWorld.y,
          };
        }
      } else if (dragState.kind === 'start_handle' && dragState.activeSnapPoint) {
        // ONLY move for the selected wall's endpoint so other connected walls detach and stay in place!
        if (ptId === selWall.startPointId && forWallId === selectedWallId) {
          return {
            ...basePt,
            x: dragState.activeSnapPoint.x,
            y: dragState.activeSnapPoint.y,
          };
        }
      } else if (dragState.kind === 'end_handle' && dragState.activeSnapPoint) {
        // ONLY move for the selected wall's endpoint so other connected walls detach and stay in place!
        if (ptId === selWall.endPointId && forWallId === selectedWallId) {
          return {
            ...basePt,
            x: dragState.activeSnapPoint.x,
            y: dragState.activeSnapPoint.y,
          };
        }
      }

      return basePt;
    },
    [project.points, project.walls, selectedWallId, dragState]
  );

  // Selected wall geometry and derived values
  const selectedWall = selectedWallId ? project.walls[selectedWallId] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 overflow-hidden select-none touch-none"
      onPointerDownCapture={handlePointerDownCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      data-testid="svg-plan-viewport"
    >
      {/* SVG Canvas Surface */}
      <svg
        className="w-full h-full block"
        style={{ touchAction: 'none' }}
      >
        <defs>
          {/* Subtle grid pattern */}
          <marker
            id="dim-arrow-start"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>
          <marker
            id="dim-arrow-end"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>
        </defs>

        {/* 1. Background Grid */}
        <g id="grid-layer">{gridElements}</g>

        {/* 2. Architectural Walls Layer */}
        <g id="walls-layer">
          {Object.values(project.walls).map((wall) => {
            const effectiveP1 = getLivePoint(wall.startPointId, wall.id);
            const effectiveP2 = getLivePoint(wall.endPointId, wall.id);
            if (!effectiveP1 || !effectiveP2) return null;

            const isSelected = wall.id === selectedWallId;

            const s1 = toScreen(effectiveP1);
            const s2 = toScreen(effectiveP2);

            const len = wallLength(effectiveP1, effectiveP2);
            const angleRad = wallAngle(effectiveP1, effectiveP2);
            const angleDeg = formatAngleDegrees(toDegrees(angleRad));

            // Wall thickness in screen pixels
            const screenThickness = Math.max(3, wall.thickness * transform.zoom);

            // 4 polygon corners of thick wall
            const polyWorld = getWallPolygonVertices(effectiveP1, effectiveP2, wall.thickness);
            const polyScreen = polyWorld.map((pt) => toScreen(pt));
            const polyPointsStr = polyScreen.map((p) => `${p.x},${p.y}`).join(' ');

            // Midpoint for dimension label
            const midScreen = {
              x: (s1.x + s2.x) / 2,
              y: (s1.y + s2.y) / 2,
            };

            // Normal offset for dimension label (above wall)
            const nx = -Math.sin(angleRad);
            const ny = -Math.cos(angleRad);
            const labelDist = screenThickness / 2 + 14;
            const labelPos = {
              x: midScreen.x + nx * labelDist,
              y: midScreen.y + ny * labelDist,
            };

            const startUsage = getPointReferenceCount(project, wall.startPointId);
            const endUsage = getPointReferenceCount(project, wall.endPointId);

            return (
              <g
                key={wall.id}
                className="cursor-pointer"
                onPointerDown={(e) => handleWallClick(e, wall.id)}
              >
                {/* Invisible wide hit target for effortless mobile touch selection */}
                <line
                  x1={s1.x}
                  y1={s1.y}
                  x2={s2.x}
                  y2={s2.y}
                  stroke="transparent"
                  strokeWidth={Math.max(28, screenThickness + 20)}
                  strokeLinecap="round"
                />

                {/* Wall Solid Core Polygon & Seamless Revit-Style Joins */}
                {(() => {
                  const isTrimFirst = mode === 'trim' && trimFirstWallId === wall.id;

                  let fillCol = '#e2e8f0';
                  let fillOp = 0.85;
                  let strCol = '#94a3b8';
                  let strW = 1;

                  if (isTrimFirst) {
                    fillCol = '#c084fc';
                    fillOp = 0.5;
                    strCol = '#a855f7';
                    strW = 3;
                  } else if (isSelected) {
                    fillCol = '#38bdf8';
                    fillOp = 0.35;
                    strCol = '#38bdf8';
                    strW = 2;
                  }

                  return (
                    <>
                      {/* Solid Monolithic Wall Fill */}
                      <polygon
                        points={polyPointsStr}
                        fill={fillCol}
                        fillOpacity={fillOp}
                        stroke="none"
                        className={isTrimFirst ? 'animate-pulse' : undefined}
                      />

                      {/* Continuous Corner Junction Discs: Blends connected walls monolithically */}
                      {startUsage > 1 && (
                        <circle
                          cx={s1.x}
                          cy={s1.y}
                          r={screenThickness / 2}
                          fill={fillCol}
                          fillOpacity={fillOp}
                          stroke="none"
                        />
                      )}
                      {endUsage > 1 && (
                        <circle
                          cx={s2.x}
                          cy={s2.y}
                          r={screenThickness / 2}
                          fill={fillCol}
                          fillOpacity={fillOp}
                          stroke="none"
                        />
                      )}

                      {/* Exterior Outlines: Left Face & Right Face */}
                      <line
                        x1={polyScreen[0].x}
                        y1={polyScreen[0].y}
                        x2={polyScreen[1].x}
                        y2={polyScreen[1].y}
                        stroke={strCol}
                        strokeWidth={strW}
                      />
                      <line
                        x1={polyScreen[2].x}
                        y1={polyScreen[2].y}
                        x2={polyScreen[3].x}
                        y2={polyScreen[3].y}
                        stroke={strCol}
                        strokeWidth={strW}
                      />

                      {/* End-Caps: ONLY drawn if the endpoint is FREE (open-ended).
                          Omitted at joined corners so there is NO dividing collision line! */}
                      {startUsage === 1 && (
                        <line
                          x1={polyScreen[3].x}
                          y1={polyScreen[3].y}
                          x2={polyScreen[0].x}
                          y2={polyScreen[0].y}
                          stroke={strCol}
                          strokeWidth={strW}
                        />
                      )}
                      {endUsage === 1 && (
                        <line
                          x1={polyScreen[1].x}
                          y1={polyScreen[1].y}
                          x2={polyScreen[2].x}
                          y2={polyScreen[2].y}
                          stroke={strCol}
                          strokeWidth={strW}
                        />
                      )}

                      {isTrimFirst && (
                        <g transform={`translate(${midScreen.x}, ${midScreen.y - 24})`}>
                          <rect
                            x="-45"
                            y="-9"
                            width="90"
                            height="18"
                            rx="4"
                            fill="#581c87"
                            stroke="#c084fc"
                            strokeWidth="1.5"
                          />
                          <text
                            x="0"
                            y="3"
                            textAnchor="middle"
                            fill="#f5d0fe"
                            fontSize="9"
                            fontWeight="bold"
                            fontFamily="sans-serif"
                            className="select-none pointer-events-none"
                          >
                            1st Wall (Trim)
                          </text>
                        </g>
                      )}
                    </>
                  );
                })()}

                {/* Centerline: subtle dashed only when selected */}
                {isSelected && (
                  <line
                    x1={s1.x}
                    y1={s1.y}
                    x2={s2.x}
                    y2={s2.y}
                    stroke="#38bdf8"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* 3. Selected Wall Interactive Handles & Anchor Indicators */}
        {selectedWall && (
          <g id="selected-handles-layer">
            {(() => {
              const p1 = project.points[selectedWall.startPointId];
              const p2 = project.points[selectedWall.endPointId];
              if (!p1 || !p2) return null;

              let s1 = toScreen(p1);
              let s2 = toScreen(p2);

              if (dragState.kind === 'wall_body') {
                s1 = toScreen({
                  x: p1.x + dragState.deltaWorld.x,
                  y: p1.y + dragState.deltaWorld.y,
                });
                s2 = toScreen({
                  x: p2.x + dragState.deltaWorld.x,
                  y: p2.y + dragState.deltaWorld.y,
                });
              } else if (dragState.kind === 'start_handle' && dragState.activeSnapPoint) {
                s1 = toScreen(dragState.activeSnapPoint);
              } else if (dragState.kind === 'end_handle' && dragState.activeSnapPoint) {
                s2 = toScreen(dragState.activeSnapPoint);
              }

              const startUsage = getPointReferenceCount(project, selectedWall.startPointId);
              const endUsage = getPointReferenceCount(project, selectedWall.endPointId);
              const isStartAnchor = startUsage > 1 && endUsage === 1;
              const isEndAnchor = endUsage > 1 && startUsage === 1;

              return (
                <>
                  {/* Start Endpoint Handle (Greenish) */}
                  <g
                    className="cursor-move"
                    onPointerDown={(e) => handleHandlePointerDown(e, selectedWall.id, 'start')}
                  >
                    <circle
                      cx={s1.x}
                      cy={s1.y}
                      r="16"
                      fill="transparent"
                    />
                    <circle
                      cx={s1.x}
                      cy={s1.y}
                      r="9"
                      fill="#10b981"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      className="shadow-md"
                    />
                    <text
                      x={s1.x}
                      y={s1.y + 3}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="bold"
                      className="pointer-events-none select-none"
                    >
                      S
                    </text>
                    {isStartAnchor && (
                      <g transform={`translate(${s1.x - 28}, ${s1.y - 18})`}>
                        <rect x="0" y="0" width="56" height="14" rx="3" fill="#047857" fillOpacity="0.95" />
                        <text x="28" y="10" textAnchor="middle" fill="#a7f3d0" fontSize="8" fontWeight="bold">
                          Anchor (Fixed)
                        </text>
                      </g>
                    )}
                  </g>

                  {/* End Endpoint Handle (Orange/Amber) */}
                  <g
                    className="cursor-move"
                    onPointerDown={(e) => handleHandlePointerDown(e, selectedWall.id, 'end')}
                  >
                    <circle
                      cx={s2.x}
                      cy={s2.y}
                      r="16"
                      fill="transparent"
                    />
                    <circle
                      cx={s2.x}
                      cy={s2.y}
                      r="9"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      className="shadow-md"
                    />
                    <text
                      x={s2.x}
                      y={s2.y + 3}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="bold"
                      className="pointer-events-none select-none"
                    >
                      E
                    </text>
                    {isEndAnchor && (
                      <g transform={`translate(${s2.x - 28}, ${s2.y - 18})`}>
                        <rect x="0" y="0" width="56" height="14" rx="3" fill="#b45309" fillOpacity="0.95" />
                        <text x="28" y="10" textAnchor="middle" fill="#fde68a" fontSize="8" fontWeight="bold">
                          Anchor (Fixed)
                        </text>
                      </g>
                    )}
                  </g>
                </>
              );
            })()}
          </g>
        )}

        {/* 4. Graphical Angle Arcs Layer for Connected Walls at Junctions */}
        {selectedWall && mode === 'select' && (
          <g id="angle-arcs-layer">
            {(() => {
              const wall = selectedWall;
              const junctions = [
                { ptId: wall.startPointId, isStart: true },
                { ptId: wall.endPointId, isStart: false },
              ];

              return junctions.flatMap(({ ptId, isStart }) => {
                const J = getLivePoint(ptId, wall.id);
                if (!J) return [];

                const otherWalls = Object.values(project.walls).filter(
                  (w) => w.id !== wall.id && (w.startPointId === ptId || w.endPointId === ptId)
                );

                return otherWalls.map((otherWall) => {
                  const pSelOther = isStart
                    ? getLivePoint(wall.endPointId, wall.id)
                    : getLivePoint(wall.startPointId, wall.id);
                  const pOtherOther = otherWall.startPointId === ptId
                    ? getLivePoint(otherWall.endPointId, otherWall.id)
                    : getLivePoint(otherWall.startPointId, otherWall.id);

                  if (!pSelOther || !pOtherOther) return null;

                  const deg = angleBetweenVectorsDegrees(J, pSelOther, pOtherOther);
                  if (deg < 1 || deg > 179) return null;

                  const sJ = toScreen(J);
                  const sSel = toScreen(pSelOther);
                  const sOther = toScreen(pOtherOther);

                  const sv1 = { x: sSel.x - sJ.x, y: sSel.y - sJ.y };
                  const sv2 = { x: sOther.x - sJ.x, y: sOther.y - sJ.y };

                  const th1 = Math.atan2(sv1.y, sv1.x);
                  const th2 = Math.atan2(sv2.y, sv2.x);
                  let dTh = Math.atan2(Math.sin(th2 - th1), Math.cos(th2 - th1));

                  const R = 36;
                  const sweepFlag = dTh > 0 ? 1 : 0;

                  const arcStart = { x: sJ.x + R * Math.cos(th1), y: sJ.y + R * Math.sin(th1) };
                  const arcEnd = { x: sJ.x + R * Math.cos(th2), y: sJ.y + R * Math.sin(th2) };
                  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${R} ${R} 0 0 ${sweepFlag} ${arcEnd.x} ${arcEnd.y}`;

                  const midTh = th1 + dTh / 2;
                  const labelDist = R + 18;
                  const lx = sJ.x + labelDist * Math.cos(midTh);
                  const ly = sJ.y + labelDist * Math.sin(midTh);

                  const isEditingThisAngle =
                    editingAngleJunction?.junctionPointId === J.id &&
                    editingAngleJunction?.wallId === wall.id &&
                    editingAngleJunction?.otherWallId === otherWall.id;

                  return (
                    <g key={`angle_${wall.id}_${otherWall.id}_${J.id}`}>
                      {/* Arc curve */}
                      <path
                        d={arcPath}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        strokeDasharray="3 2"
                      />

                      {/* Junction rays */}
                      <line
                        x1={sJ.x}
                        y1={sJ.y}
                        x2={arcStart.x}
                        y2={arcStart.y}
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        opacity="0.6"
                      />
                      <line
                        x1={sJ.x}
                        y1={sJ.y}
                        x2={arcEnd.x}
                        y2={arcEnd.y}
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        opacity="0.6"
                      />


                      {/* Interactive Angle Badge in native SVG */}
                      <g
                        transform={`translate(${lx}, ${ly})`}
                        className="cursor-pointer"
                        onPointerDown={(e) => {
                          if (activePointersRef.current.size >= 2) return;
                          e.stopPropagation();
                          const screenCoord = getContainerCoords(e);
                          angleTapRef.current = {
                            junctionPointId: J.id,
                            wallId: wall.id,
                            otherWallId: otherWall.id,
                            initialDegrees: deg,
                            time: Date.now(),
                            screen: screenCoord,
                          };
                          setDragState({
                            kind: 'angle_drag_pending',
                            startScreen: screenCoord,
                            startPan: { x: transform.panX, y: transform.panY },
                            initialWorldPos: toWorld(screenCoord),
                            deltaWorld: { x: 0, y: 0 },
                          });
                        }}
                        data-testid={`angle-badge-${J.id}`}
                      >
                        <rect
                          x="-26"
                          y="-11"
                          width="52"
                          height="22"
                          rx="6"
                          fill="#090d16"
                          fillOpacity="0.95"
                          stroke="#f59e0b"
                          strokeWidth="1.5"
                        />
                        <text
                          x="0"
                          y="4"
                          textAnchor="middle"
                          fill="#fbbf24"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="monospace"
                          className="pointer-events-none select-none"
                        >
                          ∠{deg.toFixed(1)}°
                        </text>
                      </g>
                    </g>
                  );
                });
              });
            })()}
          </g>
        )}



        {/* 6. AutoCAD Dynamic Rubberband Preview Line with Ruler Ticks */}
        {mode === 'draw' && drawingStartPoint && (
          <g id="draw-preview-layer">
            {(() => {
              const startScreen = toScreen(drawingStartPoint.point);
              const previewPoint = activeSnap ? activeSnap.point : currentWorldPointer;
              const endScreen = toScreen(previewPoint);

              const previewLen = distance(drawingStartPoint.point, previewPoint);
              const previewAngleRad = wallAngle(drawingStartPoint.point, previewPoint);
              const previewAngleDeg = formatAngleDegrees(toDegrees(previewAngleRad));

              const midX = (startScreen.x + endScreen.x) / 2;
              const midY = (startScreen.y + endScreen.y) / 2;

              const dx = endScreen.x - startScreen.x;
              const dy = endScreen.y - startScreen.y;
              const screenLen = Math.hypot(dx, dy);

              const ticks: React.ReactNode[] = [];
              if (screenLen > 30) {
                const ux = dx / screenLen;
                const uy = dy / screenLen;
                const nx = -uy;
                const ny = ux;
                const stepMeters = 0.5;
                const totalMeters = previewLen;
                for (let m = stepMeters; m < totalMeters; m += stepMeters) {
                  const frac = m / totalMeters;
                  const tx = startScreen.x + ux * frac * screenLen;
                  const ty = startScreen.y + uy * frac * screenLen;
                  const isMajor = Math.round(m * 10) % 10 === 0;
                  const tickSize = isMajor ? 7 : 4;
                  ticks.push(
                    <line
                      key={`tick_${m}`}
                      x1={tx}
                      y1={ty}
                      x2={tx + nx * tickSize}
                      y2={ty + ny * tickSize}
                      stroke="#38bdf8"
                      strokeWidth={isMajor ? 1.5 : 1}
                      opacity="0.8"
                    />
                  );
                }
              }

              return (
                <>
                  {/* Orthogonal X/Y crosshairs from start point across screen */}
                  <line
                    x1="0"
                    y1={startScreen.y}
                    x2={viewportSize.width}
                    y2={startScreen.y}
                    stroke="#38bdf8"
                    strokeWidth="0.8"
                    strokeDasharray="4 4"
                    opacity="0.25"
                  />
                  <line
                    x1={startScreen.x}
                    y1="0"
                    x2={startScreen.x}
                    y2={viewportSize.height}
                    stroke="#38bdf8"
                    strokeWidth="0.8"
                    strokeDasharray="4 4"
                    opacity="0.25"
                  />

                  {/* Start Point Marker */}
                  <circle
                    cx={startScreen.x}
                    cy={startScreen.y}
                    r="6"
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />

                  {/* Rubberband dashed line */}
                  <line
                    x1={startScreen.x}
                    y1={startScreen.y}
                    x2={endScreen.x}
                    y2={endScreen.y}
                    stroke="#38bdf8"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                  />

                  {/* Ruler graduated ticks */}
                  {ticks}

                  {/* Endpoint Preview Marker */}
                  <circle
                    cx={endScreen.x}
                    cy={endScreen.y}
                    r="6"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />

                  {/* AutoCAD Live Dimension & Angle Tag */}
                  <g transform={`translate(${midX}, ${midY - 20})`}>
                    <rect
                      x="-42"
                      y="-12"
                      width="84"
                      height="24"
                      rx="6"
                      fill="#0f172a"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      className="shadow-xl"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                      className="select-none pointer-events-none"
                    >
                      {previewLen.toFixed(2)}m • {previewAngleDeg}°
                    </text>
                  </g>
                </>
              );
            })()}
          </g>
        )}

        {/* 5. Alignment Tracking Guides (AutoCAD/Revit Ortho Extension Lines) */}
        {activeSnap?.trackingGuides && activeSnap.trackingGuides.length > 0 && (
          <g id="tracking-guides-layer">
            {activeSnap.trackingGuides.map((guide, idx) => {
              const sFrom = toScreen(guide.from);
              const sTo = toScreen(guide.to);
              return (
                <g key={`tg_${idx}`}>
                  <line
                    x1={sFrom.x}
                    y1={sFrom.y}
                    x2={sTo.x}
                    y2={sTo.y}
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.65"
                    className="pointer-events-none"
                  />
                  <circle
                    cx={sFrom.x}
                    cy={sFrom.y}
                    r="3.5"
                    fill="#38bdf8"
                    opacity="0.75"
                    className="pointer-events-none"
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* 6. Snap Target Visual Indicator */}
        {activeSnap && activeSnap.type !== 'none' && (
          <g id="snap-indicator-layer">
            {(() => {
              const snapScreen = toScreen(activeSnap.point);
              return (
                <g transform={`translate(${snapScreen.x}, ${snapScreen.y})`}>
                  {/* Outer pulsating ring */}
                  <circle
                    cx="0"
                    cy="0"
                    r="12"
                    fill="none"
                    stroke={
                      activeSnap.type === 'endpoint'
                        ? '#10b981'
                        : activeSnap.type === 'angle_align'
                        ? '#ec4899'
                        : activeSnap.type === 'alignment_guide'
                        ? '#38bdf8'
                        : '#38bdf8'
                    }
                    strokeWidth="2"
                    strokeDasharray={activeSnap.type === 'grid' ? '2 2' : undefined}
                    className="animate-pulse"
                  />
                  {/* Center dot */}
                  <circle
                    cx="0"
                    cy="0"
                    r="3.5"
                    fill={
                      activeSnap.type === 'endpoint'
                        ? '#10b981'
                        : activeSnap.type === 'angle_align'
                        ? '#ec4899'
                        : activeSnap.type === 'alignment_guide'
                        ? '#38bdf8'
                        : '#38bdf8'
                    }
                  />
                  {/* Snap description tag */}
                  <g transform="translate(14, -10)">
                    <rect
                      x="0"
                      y="-10"
                      width={activeSnap.description.length * 7 + 12}
                      height="18"
                      rx="4"
                      fill="#0f172a"
                      fillOpacity="0.9"
                      stroke="#475569"
                      strokeWidth="1"
                    />
                    <text
                      x="6"
                      y="3"
                      fill="#e2e8f0"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="sans-serif"
                      className="select-none pointer-events-none"
                    >
                      {activeSnap.description}
                    </text>
                  </g>
                </g>
              );
            })()}
          </g>
        )}
        {/* 7. Native SVG Dimension Labels (Synchronous with walls, zero jitter, zero lag) */}
        <g id="dimension-labels-layer">
          {Object.values(project.walls).map((wall) => {
            const p1 = getLivePoint(wall.startPointId, wall.id);
            const p2 = getLivePoint(wall.endPointId, wall.id);
            if (!p1 || !p2) return null;
            const isSelected = wall.id === selectedWallId;
            const s1 = toScreen(p1);
            const s2 = toScreen(p2);
            const len = wallLength(p1, p2);
            const midX = (s1.x + s2.x) / 2;
            const midY = (s1.y + s2.y) / 2;

            // Stable screen orientation (normalized so text is never upside down)
            const rawDeg = toDegrees(Math.atan2(s2.y - s1.y, s2.x - s1.x));
            let textAngle = rawDeg;
            if (textAngle > 90) textAngle -= 180;
            else if (textAngle <= -90) textAngle += 180;

            const labelText = `${len.toFixed(2)}m`;
            const boxWidth = Math.max(54, labelText.length * 7.5 + (isSelected ? 20 : 12));
            const boxHeight = 20;

            return (
              <g
                key={`svg_badge_len_${wall.id}`}
                transform={`translate(${midX}, ${midY}) rotate(${textAngle})`}
                className={mode === 'draw' || mode === 'pan' ? 'pointer-events-none' : 'cursor-pointer'}
                onPointerDown={(e) => {
                  if (activePointersRef.current.size >= 2) return;
                  if (mode === 'pan') return;
                  e.stopPropagation();
                  const screenCoord = getContainerCoords(e);
                  badgeTapRef.current = {
                    wallId: wall.id,
                    time: Date.now(),
                    screen: screenCoord,
                  };
                  setDragState({
                    kind: 'badge_drag_pending',
                    pendingWallId: wall.id,
                    startScreen: screenCoord,
                    startPan: { x: transform.panX, y: transform.panY },
                    initialWorldPos: toWorld(screenCoord),
                    deltaWorld: { x: 0, y: 0 },
                  });
                }}
                data-testid={`wall-len-badge-${wall.id}`}
              >
                <rect
                  x={-boxWidth / 2}
                  y={-boxHeight / 2}
                  width={boxWidth}
                  height={boxHeight}
                  rx="5"
                  fill="#090d16"
                  fillOpacity="0.95"
                  stroke={isSelected ? '#38bdf8' : '#334155'}
                  strokeWidth={isSelected ? '2' : '1'}
                />
                <text
                  x={isSelected ? -5 : 0}
                  y="4"
                  textAnchor="middle"
                  fill={isSelected ? '#38bdf8' : '#e2e8f0'}
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="monospace"
                  className="pointer-events-none select-none"
                >
                  {labelText}
                </text>
                {isSelected && (
                  <g transform={`translate(${boxWidth / 2 - 12}, -4)`} className="pointer-events-none">
                    <path
                      d="M0 6 L6 0 L8 2 L2 8 Z"
                      fill="#38bdf8"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* CAD Dimension Editor Modal for Wall Length */}
      {editingLengthWallId && (() => {
        const wall = project.walls[editingLengthWallId];
        if (!wall) return null;
        const p1 = project.points[wall.startPointId];
        const p2 = project.points[wall.endPointId];
        const currentLen = p1 && p2 ? wallLength(p1, p2) : 3.0;
        return (
          <DimensionEditorModal
            isOpen={true}
            type="length"
            initialValue={currentLen}
            wallId={editingLengthWallId}
            onConfirm={(val) => handleCommitLength(editingLengthWallId, val)}
            onClose={() => setEditingLengthWallId(null)}
          />
        );
      })()}

      {/* CAD Dimension Editor Modal for Corner Angle */}
      {editingAngleJunction && (
        <DimensionEditorModal
          isOpen={true}
          type="angle"
          initialValue={editingAngleJunction.initialDegrees}
          onConfirm={(val) => handleCommitAngle(val)}
          onClose={() => setEditingAngleJunction(null)}
        />
      )}

      {/* Right-Side Floating Controls: Only Button 1 (Fit Plan) + Delete Wall button when selected */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 pointer-events-auto">
        {/* Button 1: Fit Plan to Viewport */}
        <button
          onClick={handleFitPlan}
          aria-label="Fit Plan to Viewport"
          title="Fit Plan"
          className="w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 backdrop-blur-md shadow-lg flex items-center justify-center active:scale-95 transition-all"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Delete Selected Wall: Appears on the right side when a wall is clicked/selected */}
        {selectedWallId && mode === 'select' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              try {
                const updated = deleteWallTransaction(project, selectedWallId);
                onCommitProject(updated, 'Delete Wall');
                onSelectWall(null);
                setEditingLengthWallId(null);
                setEditingAngleJunction(null);
              } catch (err: any) {
                console.warn('[Planform] Delete failed:', err);
              }
            }}
            aria-label="Delete Selected Wall"
            title="Delete Selected Wall"
            data-testid="right-side-delete-wall-btn"
            className="w-10 h-10 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 backdrop-blur-md shadow-lg flex items-center justify-center active:scale-95 transition-all animate-in fade-in zoom-in-90"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Drawing Mode Active Status & Continuous Chain Controls */}
      {mode === 'draw' && (
        <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-md text-xs font-medium text-amber-400 flex items-center gap-1.5 shadow-md">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            {drawingStartPoint ? 'Release to finish wall (or tap endpoint)' : 'Drag to draw wall • Press & Drag'}
          </div>

          {drawingStartPoint && (
            <button
              onClick={() => {
                setDrawingStartPoint(null);
                onCancelChain?.();
              }}
              aria-label="Cancel Wall"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 border border-slate-700/80 backdrop-blur-md text-xs flex items-center gap-1 shadow-md active:scale-95 transition-all"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          )}

          {continuousDrawing && drawingStartPoint && (
            <button
              onClick={() => {
                setDrawingStartPoint(null);
                onFinishChain?.();
              }}
              aria-label="Finish Wall Chain"
              className="px-2.5 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-500/80 backdrop-blur-md text-xs font-medium flex items-center gap-1 shadow-md active:scale-95 transition-all"
            >
              <Check className="w-3.5 h-3.5" /> Done
            </button>
          )}
        </div>
      )}

      {/* Trim Mode Active Status Controls */}
      {mode === 'trim' && (
        <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/40 backdrop-blur-md text-xs font-medium text-purple-300 flex items-center gap-1.5 shadow-md">
            <Scissors className="w-3.5 h-3.5 text-purple-400" />
            {trimFirstWallId
              ? 'Wall 1 selected. Tap 2nd wall to trim & join!'
              : 'Tap first wall to trim / join'}
          </div>

          {trimFirstWallId && (
            <button
              onClick={() => setTrimFirstWallId(null)}
              aria-label="Cancel Trim Selection"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 backdrop-blur-md text-xs flex items-center gap-1 shadow-md active:scale-95 transition-all"
            >
              <X className="w-3.5 h-3.5" /> Deselect
            </button>
          )}
        </div>
      )}

      {/* Scale & Coordinate HUD on bottom left, above toolbar */}
      <div className="absolute bottom-20 left-4 z-10 pointer-events-none flex flex-wrap items-center gap-1.5">
        <div className="px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 font-mono shadow backdrop-blur-sm">
          Scale: {Math.round(transform.zoom)} px/m
        </div>
        <div className="px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 font-mono shadow backdrop-blur-sm">
          X: {currentWorldPointer.x.toFixed(2)}m Y: {currentWorldPointer.y.toFixed(2)}m
        </div>
      </div>
    </div>
  );
};
