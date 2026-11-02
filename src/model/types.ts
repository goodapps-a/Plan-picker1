/**
 * Planform Architectural Data Model Types
 * Single Source of Truth for 2D Plan and 3D Visualization
 */

export type MeasurementUnit = 'm' | 'ft' | 'mm';

export interface Point {
  id: string;
  x: number; // Architectural world X coordinate (meters)
  y: number; // Architectural world Y coordinate (meters, positive upwards)
}

export interface Wall {
  id: string;
  startPointId: string;
  endPointId: string;
  thickness: number; // meters, e.g. 0.15
  height: number;    // meters, e.g. 3.00
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  unit: MeasurementUnit;
  defaultWallHeight: number;
  defaultWallThickness: number;
  points: Record<string, Point>;
  walls: Record<string, Wall>;
  schemaVersion: number;
}

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number; // pixels per meter
}

export type EditorMode = 'select' | 'draw' | 'trim' | 'pan';

export type SnapType =
  | 'endpoint'
  | 'wall_intersection'
  | 'wall_edge'
  | 'angle_align'
  | 'alignment_guide'
  | 'grid'
  | 'none';

export interface TrackingGuide {
  from: { x: number; y: number };
  to: { x: number; y: number };
  axis: 'x' | 'y';
}

export interface SnapResult {
  type: SnapType;
  point: { x: number; y: number };
  targetPointId?: string;
  targetWallId?: string;
  angleDegrees?: number;
  description: string;
  trackingGuides?: TrackingGuide[];
}

export interface SnapSettings {
  snapToEndpoints: boolean;
  snapToWallEdges: boolean;
  snapToIntersections: boolean;
  snapToAngles: boolean;
  snapToGrid: boolean;
  gridSize: number; // meters, e.g. 0.5m
  angleIncrement: number; // degrees, e.g. 15 or 45 or 90
  screenTolerancePx: number; // screen pixels, e.g. 14px
}

export type FixedEndpoint = 'start' | 'end';

export type SaveStatus = 'saved' | 'saving' | 'error' | 'unsaved';
