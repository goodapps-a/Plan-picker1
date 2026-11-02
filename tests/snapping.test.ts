import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSnap, DEFAULT_SNAP_SETTINGS } from '../src/geometry/snapping';
import { Project } from '../src/model/types';

function createMockProject(): Project {
  return {
    id: 'test_proj',
    name: 'Test Project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unit: 'm',
    defaultWallHeight: 3.0,
    defaultWallThickness: 0.15,
    schemaVersion: 1,
    points: {
      pt_1: { id: 'pt_1', x: 0, y: 0 },
      pt_2: { id: 'pt_2', x: 5, y: 0 },
      pt_3: { id: 'pt_3', x: 5, y: 4 },
    },
    walls: {
      wall_1: {
        id: 'wall_1',
        startPointId: 'pt_1',
        endPointId: 'pt_2',
        thickness: 0.15,
        height: 3.0,
        createdAt: 100,
      },
      wall_2: {
        id: 'wall_2',
        startPointId: 'pt_2',
        endPointId: 'pt_3',
        thickness: 0.15,
        height: 3.0,
        createdAt: 200,
      },
    },
  };
}

test('snapping: detects nearby endpoint within screen tolerance', () => {
  const project = createMockProject();
  const zoom = 50; // 50px/m, tolerance 16px => 0.32m
  // Point at (4.9, 0.05) is ~0.11m away from pt_2(5, 0)
  const snap = calculateSnap({ x: 4.9, y: 0.05 }, null, project, zoom, DEFAULT_SNAP_SETTINGS);

  assert.equal(snap.type, 'endpoint');
  assert.equal(snap.targetPointId, 'pt_2');
  assert.equal(snap.point.x, 5);
  assert.equal(snap.point.y, 0);
});

test('snapping: does not snap distant endpoint', () => {
  const project = createMockProject();
  const zoom = 50;
  // Point at (2, 2) is far from all endpoints
  const snap = calculateSnap({ x: 2, y: 2 }, null, project, zoom, {
    ...DEFAULT_SNAP_SETTINGS,
    snapToGrid: false,
    snapToAngles: false,
    snapToWallEdges: false,
  });

  assert.equal(snap.type, 'none');
  assert.equal(snap.point.x, 2);
  assert.equal(snap.point.y, 2);
});

test('snapping: endpoint snap has higher priority than grid snap', () => {
  const project = createMockProject();
  const zoom = 50;
  // Grid size 0.5m. Nearest grid to (4.95, 0.02) might be (5.0, 0.0), but endpoint pt_2 is also at (5,0)
  const snap = calculateSnap({ x: 4.95, y: 0.02 }, null, project, zoom, {
    ...DEFAULT_SNAP_SETTINGS,
    snapToEndpoints: true,
    snapToGrid: true,
  });

  assert.equal(snap.type, 'endpoint');
  assert.equal(snap.targetPointId, 'pt_2');
});

test('snapping: orthogonal and angle snapping relative to reference point', () => {
  const project = createMockProject();
  const zoom = 50;
  const ref = { x: 0, y: 0 };
  // Target at (3.9, 0.1) is close to 0° ortho line (dx=3.9, dy=0.1)
  const snap = calculateSnap({ x: 3.9, y: 0.1 }, ref, project, zoom, {
    ...DEFAULT_SNAP_SETTINGS,
    snapToEndpoints: false,
    snapToWallEdges: false,
    snapToGrid: false,
    snapToAngles: true,
    angleIncrement: 45,
  });

  assert.equal(snap.type, 'angle_align');
  assert.equal(snap.angleDegrees, 0);
  assert.ok(Math.abs(snap.point.y - 0) < 1e-4);
});
