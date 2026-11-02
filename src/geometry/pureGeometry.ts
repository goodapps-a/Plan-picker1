/**
 * Pure Architectural Geometry Functions
 * No dependencies on React, DOM, SVG, or Three.js
 */

export interface Point2D {
  x: number;
  y: number;
}

export const MIN_WALL_LENGTH = 0.05; // 5 cm minimum length
export const GEOM_EPSILON = 1e-6;

/**
 * Euclidean distance between two 2D points.
 */
export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/**
 * Wall length between start and end.
 */
export function wallLength(p1: Point2D, p2: Point2D): number {
  return distance(p1, p2);
}

/**
 * Wall angle in radians from positive X axis, CCW positive.
 * Range: (-PI, PI]
 */
export function wallAngle(p1: Point2D, p2: Point2D): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Convert radians to degrees.
 */
export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Convert degrees to radians.
 */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Normalize an angle in degrees to [0, 360).
 */
export function normalizeAngleDegrees(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * Normalize angle in degrees to display friendly [-180, 180] or [0, 360).
 */
export function formatAngleDegrees(degrees: number): number {
  const norm = normalizeAngleDegrees(degrees);
  return Math.round(norm * 100) / 100;
}

/**
 * Checks if two points are equal within a given tolerance.
 */
export function pointsEqual(p1: Point2D, p2: Point2D, tolerance = 0.001): boolean {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y) <= tolerance;
}

/**
 * Project a point onto a line segment [a, b].
 * Returns projected point and projection parameter t clamped to [0, 1].
 */
export function projectPointOntoSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { point: Point2D; t: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < GEOM_EPSILON) {
    const d = distance(p, a);
    return { point: { x: a.x, y: a.y }, t: 0, distance: d };
  }

  // Parameter t of projection on line a->b
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  const clampedT = Math.max(0, Math.min(1, t));

  const projX = a.x + clampedT * dx;
  const projY = a.y + clampedT * dy;
  const projPoint = { x: projX, y: projY };

  return {
    point: projPoint,
    t: clampedT,
    distance: distance(p, projPoint),
  };
}

/**
 * Shortest distance from point to segment [a, b].
 */
export function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  return projectPointOntoSegment(p, a, b).distance;
}

/**
 * Check if two line segments [p1, p2] and [p3, p4] intersect.
 * Returns intersection point if they intersect properly (or optionally at endpoints).
 */
export function segmentIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
  includeEndpoints = true
): { point: Point2D; t1: number; t2: number } | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < GEOM_EPSILON) {
    // Parallel or collinear
    return null;
  }

  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;

  const t1 = (dx * d2y - dy * d2x) / cross;
  const t2 = (dx * d1y - dy * d1x) / cross;

  const minT = includeEndpoints ? -GEOM_EPSILON : GEOM_EPSILON;
  const maxT = includeEndpoints ? 1 + GEOM_EPSILON : 1 - GEOM_EPSILON;
  if (t1 >= minT && t1 <= maxT && t2 >= minT && t2 <= maxT) {
    return {
      point: {
        x: p1.x + t1 * d1x,
        y: p1.y + t1 * d1y,
      },
      t1: Math.max(0, Math.min(1, t1)),
      t2: Math.max(0, Math.min(1, t2)),
    };
  }

  return null;
}

/**
 * Check if two infinite lines through [p1, p2] and [p3, p4] intersect.
 * Returns intersection point or null if parallel.
 */
export function infiniteLineIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < GEOM_EPSILON) {
    return null; // Parallel
  }

  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;

  const t1 = (dx * d2y - dy * d2x) / cross;
  return {
    x: p1.x + t1 * d1x,
    y: p1.y + t1 * d1y,
  };
}

/**
 * Calculates the interior angle in degrees between two vectors originating from junction J.
 * Returns value between 0° and 180°.
 */
export function angleBetweenVectorsDegrees(
  junction: Point2D,
  target1: Point2D,
  target2: Point2D
): number {
  const a1 = Math.atan2(target1.y - junction.y, target1.x - junction.x);
  const a2 = Math.atan2(target2.y - junction.y, target2.x - junction.x);
  let diff = Math.abs(a1 - a2);
  if (diff > Math.PI) {
    diff = 2 * Math.PI - diff;
  }
  return (diff * 180) / Math.PI;
}

/**
 * Given a fixed point, length, and angle (radians), compute the other endpoint.
 */
export function calculateWallEndpoint(
  fixedPoint: Point2D,
  length: number,
  angleRad: number
): Point2D {
  return {
    x: fixedPoint.x + length * Math.cos(angleRad),
    y: fixedPoint.y + length * Math.sin(angleRad),
  };
}

/**
 * Translate a point by delta (dx, dy).
 */
export function translatePoint(point: Point2D, dx: number, dy: number): Point2D {
  return {
    x: point.x + dx,
    y: point.y + dy,
  };
}

/**
 * Screen-to-world coordinate transformation.
 * World coordinate system: Positive X to right, Positive Y upwards.
 * Screen coordinate system: Positive X to right, Positive Y downwards.
 */
export function screenToWorld(
  screen: Point2D,
  panX: number,
  panY: number,
  zoom: number
): Point2D {
  return {
    x: (screen.x - panX) / zoom,
    y: (panY - screen.y) / zoom,
  };
}

/**
 * World-to-screen coordinate transformation.
 * Inverse of screenToWorld.
 */
export function worldToScreen(
  world: Point2D,
  panX: number,
  panY: number,
  zoom: number
): Point2D {
  return {
    x: panX + world.x * zoom,
    y: panY - world.y * zoom,
  };
}

/**
 * Compute the bounding box of a collection of points in world coordinates.
 */
export function computeBoundingBox(points: Point2D[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} {
  if (points.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Calculate polygon/outline vertices of a thick wall in 2D.
 * Computes the 4 corners of the rectangular wall envelope in world coordinates.
 */
export function getWallPolygonVertices(
  p1: Point2D,
  p2: Point2D,
  thickness: number
): [Point2D, Point2D, Point2D, Point2D] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);

  if (len < GEOM_EPSILON) {
    return [p1, p1, p1, p1];
  }

  // Normal vector perpendicular to wall direction
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);

  return [
    { x: p1.x + nx, y: p1.y + ny }, // Corner 1 (Start Left)
    { x: p2.x + nx, y: p2.y + ny }, // Corner 2 (End Left)
    { x: p2.x - nx, y: p2.y - ny }, // Corner 3 (End Right)
    { x: p1.x - nx, y: p1.y - ny }, // Corner 4 (Start Right)
  ];
}
