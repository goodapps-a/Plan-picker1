/**
 * Planform Snapping Engine
 * Evaluates candidate snap points using screen-space tolerances and deterministic priority.
 */

import { Point, Project, SnapResult, SnapSettings, TrackingGuide } from '../model/types';
import {
  distance,
  Point2D,
  projectPointOntoSegment,
  segmentIntersection,
  toDegrees,
  toRadians,
  normalizeAngleDegrees,
  GEOM_EPSILON,
} from './pureGeometry';

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  snapToEndpoints: true,
  snapToWallEdges: true,
  snapToIntersections: true,
  snapToAngles: true,
  snapToGrid: true,
  gridSize: 0.5, // 0.5 meters default grid
  angleIncrement: 45, // 45° increments (0°, 45°, 90°, 135°, 180°, etc.)
  screenTolerancePx: 16, // 16 CSS pixels
};

/**
 * Finds the best snap point for a given raw world coordinate.
 *
 * @param rawWorld Target point in architectural world space.
 * @param referencePoint Optional starting point of the wall being drawn/modified, used for angular snapping.
 * @param project The active project containing points and walls.
 * @param zoom Current viewport zoom (pixels per world meter).
 * @param settings Snapping configuration.
 * @param excludeWallId Optional wall ID to exclude from self-snapping (e.g. wall being dragged).
 * @param excludePointId Optional point ID to exclude from self-snapping.
 */
export function calculateSnap(
  rawWorld: Point2D,
  referencePoint: Point2D | null,
  project: Project,
  zoom: number,
  settings: SnapSettings = DEFAULT_SNAP_SETTINGS,
  excludeWallId?: string,
  excludePointId?: string
): SnapResult {
  const worldTolerance = Math.max(0.02, settings.screenTolerancePx / Math.max(zoom, 1));
  const points = project.points;
  const walls = project.walls;

  // 1. PRIORITY 1: Existing Endpoints / Junctions (generous magnetic capture)
  if (settings.snapToEndpoints) {
    const endpointTolerance = Math.max(0.04, (settings.screenTolerancePx * 1.5) / Math.max(zoom, 1));
    let closestPt: Point | null = null;
    let closestDist = Infinity;

    for (const pt of Object.values(points)) {
      if (excludePointId && pt.id === excludePointId) continue;
      const d = distance(rawWorld, pt);
      if (d <= endpointTolerance && d < closestDist) {
        closestDist = d;
        closestPt = pt;
      }
    }

    if (closestPt) {
      return {
        type: 'endpoint',
        point: { x: closestPt.x, y: closestPt.y },
        targetPointId: closestPt.id,
        description: 'Endpoint',
      };
    }
  }

  // 2. PRIORITY 2: Wall Intersections
  if (settings.snapToIntersections) {
    const wallList = Object.values(walls).filter((w) => w.id !== excludeWallId);
    let closestInter: Point2D | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < wallList.length; i++) {
      const w1 = wallList[i];
      const p1 = points[w1.startPointId];
      const p2 = points[w1.endPointId];
      if (!p1 || !p2) continue;

      for (let j = i + 1; j < wallList.length; j++) {
        const w2 = wallList[j];
        const p3 = points[w2.startPointId];
        const p4 = points[w2.endPointId];
        if (!p3 || !p4) continue;

        // Skip if they share an endpoint (already handled by endpoint snap)
        if (
          w1.startPointId === w2.startPointId ||
          w1.startPointId === w2.endPointId ||
          w1.endPointId === w2.startPointId ||
          w1.endPointId === w2.endPointId
        ) {
          continue;
        }

        const inter = segmentIntersection(p1, p2, p3, p4, true);
        if (inter) {
          const d = distance(rawWorld, inter.point);
          if (d <= worldTolerance && d < closestDist) {
            closestDist = d;
            closestInter = inter.point;
          }
        }
      }
    }

    if (closestInter) {
      return {
        type: 'wall_intersection',
        point: closestInter,
        description: 'Intersection',
      };
    }
  }

  // 3. PRIORITY 3: Points along an existing wall segment (for T-junctions / splits)
  if (settings.snapToWallEdges) {
    let closestEdgePoint: Point2D | null = null;
    let closestDist = Infinity;
    let targetWallId: string | undefined = undefined;

    for (const wall of Object.values(walls)) {
      if (wall.id === excludeWallId) continue;
      const p1 = points[wall.startPointId];
      const p2 = points[wall.endPointId];
      if (!p1 || !p2) continue;

      const proj = projectPointOntoSegment(rawWorld, p1, p2);
      // Ensure projection is strictly interior (not within tolerance of endpoints)
      const dStart = distance(proj.point, p1);
      const dEnd = distance(proj.point, p2);

      if (dStart > worldTolerance && dEnd > worldTolerance) {
        if (proj.distance <= worldTolerance && proj.distance < closestDist) {
          closestDist = proj.distance;
          closestEdgePoint = proj.point;
          targetWallId = wall.id;
        }
      }
    }

    if (closestEdgePoint && targetWallId) {
      return {
        type: 'wall_edge',
        point: closestEdgePoint,
        targetWallId,
        description: 'On Wall',
      };
    }
  }

  // 4. PRIORITY 4: Point Alignment Tracking Guides (Orthogonal extension to existing points)
  // When a point aligns horizontally or vertically with another point
  if (settings.snapToAngles) {
    let snappedX = rawWorld.x;
    let snappedY = rawWorld.y;
    let hasSnapX = false;
    let hasSnapY = false;
    const trackingGuides: TrackingGuide[] = [];

    // If referencePoint exists and angle snap is enabled, check if referencePoint constrains ortho direction
    let orthoFromRef: 'h' | 'v' | null = null;
    if (referencePoint) {
      const rdx = rawWorld.x - referencePoint.x;
      const rdy = rawWorld.y - referencePoint.y;
      if (Math.hypot(rdx, rdy) > worldTolerance) {
        const angleDeg = normalizeAngleDegrees(toDegrees(Math.atan2(rdy, rdx)));
        if (Math.abs(angleDeg - 0) <= 8 || Math.abs(angleDeg - 180) <= 8 || Math.abs(angleDeg - 360) <= 8) {
          orthoFromRef = 'h';
          snappedY = referencePoint.y;
          hasSnapY = true;
        } else if (Math.abs(angleDeg - 90) <= 8 || Math.abs(angleDeg - 270) <= 8) {
          orthoFromRef = 'v';
          snappedX = referencePoint.x;
          hasSnapX = true;
        }
      }
    }

    // Find other points in the project that align on X (vertical line) or Y (horizontal line)
    let closestXDist = worldTolerance;
    let closestYDist = worldTolerance;
    let alignPtX: Point | null = null;
    let alignPtY: Point | null = null;

    for (const pt of Object.values(points)) {
      if (excludePointId && pt.id === excludePointId) continue;
      if (referencePoint && Math.hypot(pt.x - referencePoint.x, pt.y - referencePoint.y) < GEOM_EPSILON) continue;

      // Check X alignment (vertical guide from pt to snapped point)
      if (!hasSnapX || orthoFromRef !== 'v') {
        const dx = Math.abs(rawWorld.x - pt.x);
        if (dx <= closestXDist) {
          closestXDist = dx;
          alignPtX = pt;
        }
      }

      // Check Y alignment (horizontal guide from pt to snapped point)
      if (!hasSnapY || orthoFromRef !== 'h') {
        const dy = Math.abs(rawWorld.y - pt.y);
        if (dy <= closestYDist) {
          closestYDist = dy;
          alignPtY = pt;
        }
      }
    }

    if (alignPtX) {
      snappedX = alignPtX.x;
      hasSnapX = true;
    }
    if (alignPtY) {
      snappedY = alignPtY.y;
      hasSnapY = true;
    }

    if (alignPtX) {
      trackingGuides.push({
        from: { x: alignPtX.x, y: alignPtX.y },
        to: { x: snappedX, y: snappedY },
        axis: 'y', // vertical tracking line
      });
    }
    if (alignPtY) {
      trackingGuides.push({
        from: { x: alignPtY.x, y: alignPtY.y },
        to: { x: snappedX, y: snappedY },
        axis: 'x', // horizontal tracking line
      });
    }

    if (trackingGuides.length > 0) {
      return {
        type: 'alignment_guide',
        point: { x: snappedX, y: snappedY },
        description: trackingGuides.length > 1 ? 'Ortho Intersection' : 'Alignment Guide',
        trackingGuides,
      };
    }
  }

  // 5. PRIORITY 5: Angular Alignment (Ortho / 45° relative to reference point)
  if (settings.snapToAngles && referencePoint) {
    const dx = rawWorld.x - referencePoint.x;
    const dy = rawWorld.y - referencePoint.y;
    const currentDist = Math.hypot(dx, dy);

    if (currentDist > worldTolerance) {
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = normalizeAngleDegrees(toDegrees(angleRad));

      // Test increments: 0, 45, 90, 135, 180, 225, 270, 315
      const inc = settings.angleIncrement || 45;
      const nearestMultiple = Math.round(angleDeg / inc) * inc;
      const diffDeg = Math.abs(angleDeg - nearestMultiple);

      // Convert angular difference to world distance at current radius
      const angularDist = currentDist * Math.sin(toRadians(diffDeg));
      if (angularDist <= worldTolerance || diffDeg <= 5) {
        const snappedRad = toRadians(nearestMultiple);
        const snappedX = referencePoint.x + currentDist * Math.cos(snappedRad);
        const snappedY = referencePoint.y + currentDist * Math.sin(snappedRad);

        let desc = `${nearestMultiple % 360}°`;
        if (nearestMultiple % 90 === 0) desc = `Ortho (${nearestMultiple % 360}°)`;

        return {
          type: 'angle_align',
          point: { x: snappedX, y: snappedY },
          angleDegrees: nearestMultiple % 360,
          description: desc,
        };
      }
    }
  }

  // 5. PRIORITY 5: Grid Snapping
  if (settings.snapToGrid && settings.gridSize > 0) {
    const gs = settings.gridSize;
    const gridX = Math.round(rawWorld.x / gs) * gs;
    const gridY = Math.round(rawWorld.y / gs) * gs;
    const d = distance(rawWorld, { x: gridX, y: gridY });

    // Grid snap must also fall within reasonable snap tolerance
    if (d <= worldTolerance * 1.5) {
      return {
        type: 'grid',
        point: { x: gridX, y: gridY },
        description: `Grid (${gs}m)`,
      };
    }
  }

  // 6. Free placement fallback
  return {
    type: 'none',
    point: { x: rawWorld.x, y: rawWorld.y },
    description: 'Free',
  };
}
