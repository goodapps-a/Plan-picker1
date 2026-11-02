/**
 * Planform Geometric Transactions
 * Enforces single-wall isolation, clean detachment, splitting, and atomic updates.
 */

import { Point, Project, Wall, FixedEndpoint } from '../model/types';
import {
  calculateWallEndpoint,
  distance,
  infiniteLineIntersection,
  MIN_WALL_LENGTH,
  Point2D,
  pointsEqual,
  translatePoint,
  wallAngle,
  wallLength,
} from './pureGeometry';
import { cleanupOrphanedPoints, generateId, validateProjectModel } from './validation';

/**
 * Returns how many walls reference a given pointId in the project.
 */
export function getPointReferenceCount(project: Project, pointId: string): number {
  let count = 0;
  for (const wall of Object.values(project.walls)) {
    if (wall.startPointId === pointId) count++;
    if (wall.endPointId === pointId) count++;
  }
  return count;
}

/**
 * Create a new wall between two points.
 * Handles point reuse if snapped to existing point IDs or creates new point records.
 * If startPointId or endPointId is not provided, creates new points.
 * If an endpoint snapped to a wall edge, splits that wall into two collinear segments.
 */
export function createWallTransaction(
  project: Project,
  start: { point: Point2D; pointId?: string },
  end: { point: Point2D; pointId?: string },
  options?: {
    height?: number;
    thickness?: number;
    splitWallId?: string; // If endpoint snapped to a wall interior
    splitAt?: 'start' | 'end';
  }
): { project: Project; newWallId: string } {
  let currentProject: Project = {
    ...project,
    points: { ...project.points },
    walls: { ...project.walls },
    updatedAt: new Date().toISOString(),
  };

  const height = options?.height ?? project.defaultWallHeight ?? 3.0;
  const thickness = options?.thickness ?? project.defaultWallThickness ?? 0.15;

  // Handle interior wall split if requested
  if (options?.splitWallId && options.splitAt) {
    const splitPoint = options.splitAt === 'start' ? start.point : end.point;
    const splitRes = splitWallAtPointTransaction(currentProject, options.splitWallId, splitPoint);
    currentProject = splitRes.project;
    if (options.splitAt === 'start') {
      start.pointId = splitRes.junctionPointId;
    } else {
      end.pointId = splitRes.junctionPointId;
    }
  }

  // Resolve start point
  let startId = start.pointId;
  if (!startId || !currentProject.points[startId]) {
    // Check if there is an existing point very close to start (within 0.001m)
    const existing = Object.values(currentProject.points).find((p) =>
      pointsEqual(p, start.point, 0.001)
    );
    if (existing) {
      startId = existing.id;
    } else {
      startId = generateId('pt');
      currentProject.points[startId] = {
        id: startId,
        x: start.point.x,
        y: start.point.y,
      };
    }
  }

  // Resolve end point
  let endId = end.pointId;
  if (!endId || !currentProject.points[endId]) {
    const existing = Object.values(currentProject.points).find((p) =>
      pointsEqual(p, end.point, 0.001)
    );
    if (existing) {
      endId = existing.id;
    } else {
      endId = generateId('pt');
      currentProject.points[endId] = {
        id: endId,
        x: end.point.x,
        y: end.point.y,
      };
    }
  }

  if (startId === endId) {
    throw new Error('Wall start and end points cannot be identical.');
  }

  const p1 = currentProject.points[startId];
  const p2 = currentProject.points[endId];
  const len = distance(p1, p2);

  if (len < MIN_WALL_LENGTH) {
    throw new Error(`Wall length ${len.toFixed(3)}m is below minimum of ${MIN_WALL_LENGTH}m.`);
  }

  const newWallId = generateId('wall');
  currentProject.walls[newWallId] = {
    id: newWallId,
    startPointId: startId,
    endPointId: endId,
    thickness,
    height,
    createdAt: Date.now(),
  };

  const cleaned = cleanupOrphanedPoints(currentProject);
  return { project: cleaned, newWallId };
}

/**
 * Splits an existing wall at a specific point along its segment into two collinear walls.
 * Both segments inherit the thickness and height of the original wall.
 */
export function splitWallAtPointTransaction(
  project: Project,
  wallId: string,
  splitPoint: Point2D
): { project: Project; junctionPointId: string; wallId1: string; wallId2: string } {
  const originalWall = project.walls[wallId];
  if (!originalWall) {
    throw new Error(`Wall ${wallId} not found.`);
  }

  const pStart = project.points[originalWall.startPointId];
  const pEnd = project.points[originalWall.endPointId];
  if (!pStart || !pEnd) {
    throw new Error(`Endpoints of wall ${wallId} not found.`);
  }

  // Create junction point
  const junctionPointId = generateId('pt');
  const junctionPoint: Point = {
    id: junctionPointId,
    x: splitPoint.x,
    y: splitPoint.y,
  };

  const wallId1 = wallId; // reuse original wall ID for segment 1 to maintain continuity
  const wallId2 = generateId('wall');

  const newPoints = {
    ...project.points,
    [junctionPointId]: junctionPoint,
  };

  const newWalls = {
    ...project.walls,
    [wallId1]: {
      ...originalWall,
      endPointId: junctionPointId,
    },
    [wallId2]: {
      id: wallId2,
      startPointId: junctionPointId,
      endPointId: originalWall.endPointId,
      thickness: originalWall.thickness,
      height: originalWall.height,
      createdAt: Date.now(),
    },
  };

  const updatedProject = cleanupOrphanedPoints({
    ...project,
    points: newPoints,
    walls: newWalls,
    updatedAt: new Date().toISOString(),
  });

  return {
    project: updatedProject,
    junctionPointId,
    wallId1,
    wallId2,
  };
}

/**
 * Delete a wall and remove any points that are left orphaned.
 */
export function deleteWallTransaction(project: Project, wallId: string): Project {
  if (!project.walls[wallId]) {
    return project;
  }

  const nextWalls = { ...project.walls };
  delete nextWalls[wallId];

  const updatedProject: Project = {
    ...project,
    walls: nextWalls,
    updatedAt: new Date().toISOString(),
  };

  return cleanupOrphanedPoints(updatedProject);
}

/**
 * RESIZE WALL (ISOLATED)
 * Changes the selected wall's length while preserving its angle.
 * The fixedEndpoint stays stationary; the other endpoint is recalculated.
 * If the moving endpoint was shared with other walls, DETACH it into a new point
 * so neighboring walls do NOT move!
 */
export function resizeWallTransaction(
  project: Project,
  wallId: string,
  newLength: number,
  fixedEndpoint: FixedEndpoint = 'start'
): Project {
  const wall = project.walls[wallId];
  if (!wall) return project;

  if (newLength < MIN_WALL_LENGTH) {
    throw new Error(`Length must be at least ${MIN_WALL_LENGTH}m.`);
  }

  const pStart = project.points[wall.startPointId];
  const pEnd = project.points[wall.endPointId];
  if (!pStart || !pEnd) return project;

  const currentAngle = wallAngle(pStart, pEnd);

  const nextPoints = { ...project.points };
  const nextWalls = { ...project.walls };

  if (fixedEndpoint === 'start') {
    // Start is fixed, end moves.
    const newEndCoord = calculateWallEndpoint(pStart, newLength, currentAngle);

    // Check if current end point is shared by other walls
    const endSharedCount = getPointReferenceCount(project, wall.endPointId);
    let targetEndPointId = wall.endPointId;

    if (endSharedCount > 1) {
      // Detach: create new point for the selected wall's end
      targetEndPointId = generateId('pt');
    }

    nextPoints[targetEndPointId] = {
      id: targetEndPointId,
      x: newEndCoord.x,
      y: newEndCoord.y,
    };

    nextWalls[wallId] = {
      ...wall,
      endPointId: targetEndPointId,
    };
  } else {
    // End is fixed, start moves.
    // Vector from end to start is (currentAngle + PI)
    const newStartCoord = calculateWallEndpoint(pEnd, newLength, currentAngle + Math.PI);

    const startSharedCount = getPointReferenceCount(project, wall.startPointId);
    let targetStartPointId = wall.startPointId;

    if (startSharedCount > 1) {
      // Detach: create new point for the selected wall's start
      targetStartPointId = generateId('pt');
    }

    nextPoints[targetStartPointId] = {
      id: targetStartPointId,
      x: newStartCoord.x,
      y: newStartCoord.y,
    };

    nextWalls[wallId] = {
      ...wall,
      startPointId: targetStartPointId,
    };
  }

  const updated: Project = {
    ...project,
    points: nextPoints,
    walls: nextWalls,
    updatedAt: new Date().toISOString(),
  };

  return cleanupOrphanedPoints(updated);
}

/**
 * ROTATE WALL (ISOLATED)
 * Changes the selected wall's angle while preserving its length.
 * The fixedEndpoint stays stationary; the moving endpoint is recalculated.
 * Detaches moving endpoint if shared with other walls.
 */
export function rotateWallTransaction(
  project: Project,
  wallId: string,
  newAngleRad: number,
  fixedEndpoint: FixedEndpoint = 'start'
): Project {
  const wall = project.walls[wallId];
  if (!wall) return project;

  const pStart = project.points[wall.startPointId];
  const pEnd = project.points[wall.endPointId];
  if (!pStart || !pEnd) return project;

  const len = wallLength(pStart, pEnd);
  const nextPoints = { ...project.points };
  const nextWalls = { ...project.walls };

  if (fixedEndpoint === 'start') {
    const newEndCoord = calculateWallEndpoint(pStart, len, newAngleRad);

    const endSharedCount = getPointReferenceCount(project, wall.endPointId);
    let targetEndPointId = wall.endPointId;

    if (endSharedCount > 1) {
      targetEndPointId = generateId('pt');
    }

    nextPoints[targetEndPointId] = {
      id: targetEndPointId,
      x: newEndCoord.x,
      y: newEndCoord.y,
    };

    nextWalls[wallId] = {
      ...wall,
      endPointId: targetEndPointId,
    };
  } else {
    // End is fixed, start moves
    const newStartCoord = calculateWallEndpoint(pEnd, len, newAngleRad + Math.PI);

    const startSharedCount = getPointReferenceCount(project, wall.startPointId);
    let targetStartPointId = wall.startPointId;

    if (startSharedCount > 1) {
      targetStartPointId = generateId('pt');
    }

    nextPoints[targetStartPointId] = {
      id: targetStartPointId,
      x: newStartCoord.x,
      y: newStartCoord.y,
    };

    nextWalls[wallId] = {
      ...wall,
      startPointId: targetStartPointId,
    };
  }

  const updated: Project = {
    ...project,
    points: nextPoints,
    walls: nextWalls,
    updatedAt: new Date().toISOString(),
  };

  return cleanupOrphanedPoints(updated);
}

/**
 * MOVE WALL
 * Translates the wall by (dx, dy).
 * Preserves topological connectivity: moving a wall moves its start and end junction points,
 * causing any connected neighboring walls to stretch/contract seamlessly to keep corners joined.
 */
export function moveWallTransaction(
  project: Project,
  wallId: string,
  dx: number,
  dy: number,
  options?: {
    targetSnapStartPointId?: string;
    targetSnapEndPointId?: string;
  }
): Project {
  const wall = project.walls[wallId];
  if (!wall) return project;

  const pStart = project.points[wall.startPointId];
  const pEnd = project.points[wall.endPointId];
  if (!pStart || !pEnd) return project;

  const nextPoints = { ...project.points };
  const nextWalls = { ...project.walls };

  const movedStartCoord = translatePoint(pStart, dx, dy);
  const movedEndCoord = translatePoint(pEnd, dx, dy);

  // START POINT HANDLING: Translate shared point directly so connected walls stretch to follow
  let finalStartId = wall.startPointId;
  if (options?.targetSnapStartPointId && project.points[options.targetSnapStartPointId] && options.targetSnapStartPointId !== wall.startPointId) {
    finalStartId = options.targetSnapStartPointId;
  } else {
    nextPoints[finalStartId] = {
      ...pStart,
      x: movedStartCoord.x,
      y: movedStartCoord.y,
    };
  }

  // END POINT HANDLING: Translate shared point directly so connected walls stretch to follow
  let finalEndId = wall.endPointId;
  if (options?.targetSnapEndPointId && project.points[options.targetSnapEndPointId] && options.targetSnapEndPointId !== wall.endPointId) {
    finalEndId = options.targetSnapEndPointId;
  } else {
    nextPoints[finalEndId] = {
      ...pEnd,
      x: movedEndCoord.x,
      y: movedEndCoord.y,
    };
  }

  if (finalStartId === finalEndId) {
    throw new Error('Moved wall endpoints collapsed to same point.');
  }

  nextWalls[wallId] = {
    ...wall,
    startPointId: finalStartId,
    endPointId: finalEndId,
  };

  const updated: Project = {
    ...project,
    points: nextPoints,
    walls: nextWalls,
    updatedAt: new Date().toISOString(),
  };

  return cleanupOrphanedPoints(updated);
}

/**
 * DRAG ENDPOINT
 * Moves either start or end endpoint to newPos.
 * Preserves junction connectivity: moving a shared corner endpoint updates the corner point
 * for all connected walls so the room boundary stays closed.
 */
export function updateWallEndpointTransaction(
  project: Project,
  wallId: string,
  endpoint: 'start' | 'end',
  newPos: Point2D,
  targetSnapPointId?: string
): Project {
  const wall = project.walls[wallId];
  if (!wall) return project;

  const otherPointId = endpoint === 'start' ? wall.endPointId : wall.startPointId;
  const otherPoint = project.points[otherPointId];
  if (!otherPoint) return project;

  const newLength = distance(newPos, otherPoint);
  if (newLength < MIN_WALL_LENGTH) {
    throw new Error(`Wall length ${newLength.toFixed(3)}m is below minimum ${MIN_WALL_LENGTH}m.`);
  }

  const nextPoints = { ...project.points };
  const nextWalls = { ...project.walls };

  const currentMovedPointId = endpoint === 'start' ? wall.startPointId : wall.endPointId;
  let finalPointId = currentMovedPointId;

  if (targetSnapPointId && project.points[targetSnapPointId]) {
    if (targetSnapPointId === otherPointId) {
      throw new Error('Cannot connect endpoint to the opposite endpoint of the same wall.');
    }
    finalPointId = targetSnapPointId;
  } else {
    // If this endpoint was shared with other walls, detach into its own point so other walls stay in place!
    const sharedCount = getPointReferenceCount(project, currentMovedPointId);
    if (sharedCount > 1) {
      finalPointId = generateId('pt');
    }
    nextPoints[finalPointId] = {
      id: finalPointId,
      x: newPos.x,
      y: newPos.y,
    };
  }

  nextWalls[wallId] = {
    ...wall,
    startPointId: endpoint === 'start' ? finalPointId : wall.startPointId,
    endPointId: endpoint === 'end' ? finalPointId : wall.endPointId,
  };

  const updated: Project = {
    ...project,
    points: nextPoints,
    walls: nextWalls,
    updatedAt: new Date().toISOString(),
  };

  return cleanupOrphanedPoints(updated);
}

/**
 * Update wall height or thickness.
 */
export function updateWallPropertiesTransaction(
  project: Project,
  wallId: string,
  props: { height?: number; thickness?: number }
): Project {
  const wall = project.walls[wallId];
  if (!wall) return project;

  const nextWalls = {
    ...project.walls,
    [wallId]: {
      ...wall,
      ...(props.height !== undefined && props.height > 0 ? { height: props.height } : {}),
      ...(props.thickness !== undefined && props.thickness > 0 ? { thickness: props.thickness } : {}),
    },
  };

  return {
    ...project,
    walls: nextWalls,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * TRIM / EXTEND TWO WALLS TO JOIN AT INTERSECTION
 * Connects two walls by trimming or extending them to their mutual intersection point.
 * Both walls now share the resulting junction point.
 */
export function trimWallsTransaction(
  project: Project,
  wallId1: string,
  wallId2: string
): Project {
  if (wallId1 === wallId2) return project;

  const w1 = project.walls[wallId1];
  const w2 = project.walls[wallId2];
  if (!w1 || !w2) return project;

  const p1Start = project.points[w1.startPointId];
  const p1End = project.points[w1.endPointId];
  const p2Start = project.points[w2.startPointId];
  const p2End = project.points[w2.endPointId];
  if (!p1Start || !p1End || !p2Start || !p2End) return project;

  // Check if they already share a point
  if (
    w1.startPointId === w2.startPointId ||
    w1.startPointId === w2.endPointId ||
    w1.endPointId === w2.startPointId ||
    w1.endPointId === w2.endPointId
  ) {
    return project; // Already joined
  }

  const nextPoints = { ...project.points };
  const nextWalls = { ...project.walls };

  // 1. Try infinite line intersection
  const inter = infiniteLineIntersection(p1Start, p1End, p2Start, p2End);

  let targetIntersection: Point2D;
  let trimStart1: boolean;
  let trimStart2: boolean;

  if (inter) {
    targetIntersection = inter;

    // Determine which endpoint of Wall 1 to move to the intersection
    const d1Start = distance(p1Start, inter);
    const d1End = distance(p1End, inter);
    trimStart1 = d1Start < d1End;

    // Determine which endpoint of Wall 2 to move
    const d2Start = distance(p2Start, inter);
    const d2End = distance(p2End, inter);
    trimStart2 = d2Start < d2End;

    // Validate that resulting walls would have length >= MIN_WALL_LENGTH
    const remainingP1 = trimStart1 ? p1End : p1Start;
    const remainingP2 = trimStart2 ? p2End : p2Start;

    if (
      distance(remainingP1, inter) < MIN_WALL_LENGTH ||
      distance(remainingP2, inter) < MIN_WALL_LENGTH
    ) {
      // Intersection collapses wall length below minimum, cannot trim
      return project;
    }
  } else {
    // Parallel lines: find closest pair of endpoints and weld to their midpoint
    const pairs = [
      { p1: p1Start, isStart1: true, p2: p2Start, isStart2: true, dist: distance(p1Start, p2Start) },
      { p1: p1Start, isStart1: true, p2: p2End, isStart2: false, dist: distance(p1Start, p2End) },
      { p1: p1End, isStart1: false, p2: p2Start, isStart2: true, dist: distance(p1End, p2Start) },
      { p1: p1End, isStart1: false, p2: p2End, isStart2: false, dist: distance(p1End, p2End) },
    ];
    pairs.sort((a, b) => a.dist - b.dist);
    const best = pairs[0];

    targetIntersection = {
      x: (best.p1.x + best.p2.x) / 2,
      y: (best.p1.y + best.p2.y) / 2,
    };
    trimStart1 = best.isStart1;
    trimStart2 = best.isStart2;
  }

  // Create shared junction point
  const junctionPointId = generateId('pt');
  nextPoints[junctionPointId] = {
    id: junctionPointId,
    x: targetIntersection.x,
    y: targetIntersection.y,
  };

  nextWalls[wallId1] = {
    ...w1,
    startPointId: trimStart1 ? junctionPointId : w1.startPointId,
    endPointId: !trimStart1 ? junctionPointId : w1.endPointId,
  };

  nextWalls[wallId2] = {
    ...w2,
    startPointId: trimStart2 ? junctionPointId : w2.startPointId,
    endPointId: !trimStart2 ? junctionPointId : w2.endPointId,
  };

  const updated: Project = {
    ...project,
    points: nextPoints,
    walls: nextWalls,
    updatedAt: new Date().toISOString(),
  };

  return cleanupOrphanedPoints(updated);
}

/**
 * ROTATE WALL AROUND A SHARED JUNCTION POINT
 * Changes the angle of a wall with respect to a junction point without moving the junction.
 */
export function rotateWallAtJunctionTransaction(
  project: Project,
  wallId: string,
  junctionPointId: string,
  newAngleRad: number
): Project {
  const wall = project.walls[wallId];
  if (!wall) return project;

  const isStart = wall.startPointId === junctionPointId;
  const isEnd = wall.endPointId === junctionPointId;
  if (!isStart && !isEnd) return project;

  return rotateWallTransaction(project, wallId, newAngleRad, isStart ? 'start' : 'end');
}

