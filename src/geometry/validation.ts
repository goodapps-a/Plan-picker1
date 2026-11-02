/**
 * Planform Model Validation and Cleanup Engine
 */

import { Project, Point, Wall } from '../model/types';
import { distance, MIN_WALL_LENGTH } from './pureGeometry';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the complete geometric and relational integrity of a project model.
 */
export function validateProjectModel(project: Project): ValidationResult {
  const errors: string[] = [];

  if (!project.id || typeof project.id !== 'string') {
    errors.push('Project must have a valid ID string.');
  }

  if (!project.name || project.name.trim() === '') {
    errors.push('Project name cannot be empty.');
  }

  // Validate points
  const points = project.points || {};
  for (const [pointId, pt] of Object.entries(points)) {
    if (!pt) {
      errors.push(`Point ${pointId} is null or undefined.`);
      continue;
    }
    if (pt.id !== pointId) {
      errors.push(`Point key mismatch: key ${pointId} !== pt.id ${pt.id}.`);
    }
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      errors.push(`Point ${pointId} has non-finite coordinates (${pt.x}, ${pt.y}).`);
    }
  }

  // Validate walls
  const walls = project.walls || {};
  for (const [wallId, wall] of Object.entries(walls)) {
    if (!wall) {
      errors.push(`Wall ${wallId} is null or undefined.`);
      continue;
    }
    if (wall.id !== wallId) {
      errors.push(`Wall key mismatch: key ${wallId} !== wall.id ${wall.id}.`);
    }

    const startPt = points[wall.startPointId];
    const endPt = points[wall.endPointId];

    if (!startPt) {
      errors.push(`Wall ${wallId} references missing start point ${wall.startPointId}.`);
    }
    if (!endPt) {
      errors.push(`Wall ${wallId} references missing end point ${wall.endPointId}.`);
    }

    if (wall.startPointId === wall.endPointId) {
      errors.push(`Wall ${wallId} has identical start and end point IDs.`);
    }

    if (startPt && endPt) {
      const len = distance(startPt, endPt);
      if (len < MIN_WALL_LENGTH) {
        errors.push(`Wall ${wallId} length (${len.toFixed(4)}m) is below minimum (${MIN_WALL_LENGTH}m).`);
      }
    }

    if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) {
      errors.push(`Wall ${wallId} has invalid thickness: ${wall.thickness}`);
    }

    if (!Number.isFinite(wall.height) || wall.height <= 0) {
      errors.push(`Wall ${wallId} has invalid height: ${wall.height}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Removes any points that are no longer referenced by any wall.
 * Returns a new project object with clean points.
 */
export function cleanupOrphanedPoints(project: Project): Project {
  const referencedPointIds = new Set<string>();
  for (const wall of Object.values(project.walls)) {
    referencedPointIds.add(wall.startPointId);
    referencedPointIds.add(wall.endPointId);
  }

  const cleanPoints: Record<string, Point> = {};
  for (const [id, pt] of Object.entries(project.points)) {
    if (referencedPointIds.has(id)) {
      cleanPoints[id] = pt;
    }
  }

  return {
    ...project,
    points: cleanPoints,
  };
}

/**
 * Generates a unique ID for points or walls.
 */
export function generateId(prefix: 'pt' | 'wall' | 'proj'): string {
  const rand = Math.random().toString(36).substring(2, 9);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}_${rand}`;
}
