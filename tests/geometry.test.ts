import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distance,
  wallLength,
  wallAngle,
  toDegrees,
  toRadians,
  normalizeAngleDegrees,
  screenToWorld,
  worldToScreen,
  calculateWallEndpoint,
  MIN_WALL_LENGTH,
  projectPointOntoSegment,
  segmentIntersection,
} from '../src/geometry/pureGeometry';

test('geometry: distance and length calculations', () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 3, y: 4 };
  assert.equal(distance(p1, p2), 5);
  assert.equal(wallLength(p1, p2), 5);
});

test('geometry: horizontal and vertical wall angles', () => {
  const origin = { x: 0, y: 0 };
  const east = { x: 5, y: 0 };
  const north = { x: 0, y: 5 };
  const west = { x: -5, y: 0 };
  const south = { x: 0, y: -5 };

  assert.equal(toDegrees(wallAngle(origin, east)), 0);
  assert.equal(toDegrees(wallAngle(origin, north)), 90);
  assert.equal(normalizeAngleDegrees(toDegrees(wallAngle(origin, west))), 180);
  assert.equal(normalizeAngleDegrees(toDegrees(wallAngle(origin, south))), 270);
});

test('geometry: diagonal wall length and angle', () => {
  const p1 = { x: 1, y: 1 };
  const p2 = { x: 4, y: 4 };
  const len = wallLength(p1, p2);
  const angleDeg = toDegrees(wallAngle(p1, p2));

  assert.ok(Math.abs(len - Math.sqrt(18)) < 1e-6);
  assert.ok(Math.abs(angleDeg - 45) < 1e-6);
});

test('geometry: angle normalization', () => {
  assert.equal(normalizeAngleDegrees(0), 0);
  assert.equal(normalizeAngleDegrees(360), 0);
  assert.equal(normalizeAngleDegrees(-90), 270);
  assert.equal(normalizeAngleDegrees(450), 90);
});

test('geometry: screenToWorld and worldToScreen are exact inverses', () => {
  const panX = 150;
  const panY = 300;
  const zoom = 40; // 40 pixels per meter

  const worldOriginal = { x: 2.75, y: -4.5 };
  const screen = worldToScreen(worldOriginal, panX, panY, zoom);
  const worldRecovered = screenToWorld(screen, panX, panY, zoom);

  assert.ok(Math.abs(worldOriginal.x - worldRecovered.x) < 1e-6);
  assert.ok(Math.abs(worldOriginal.y - worldRecovered.y) < 1e-6);
});

test('geometry: calculateWallEndpoint produces accurate point at angle', () => {
  const start = { x: 2, y: 3 };
  const length = 5;
  const angleRad = toRadians(30);

  const end = calculateWallEndpoint(start, length, angleRad);
  assert.ok(Math.abs(distance(start, end) - 5) < 1e-6);
  assert.ok(Math.abs(toDegrees(wallAngle(start, end)) - 30) < 1e-6);
});

test('geometry: projection onto segment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  const p = { x: 4, y: 3 };

  const proj = projectPointOntoSegment(p, a, b);
  assert.equal(proj.point.x, 4);
  assert.equal(proj.point.y, 0);
  assert.equal(proj.distance, 3);
  assert.equal(proj.t, 0.4);
});

test('geometry: segment intersection detection', () => {
  const a1 = { x: 0, y: 2 };
  const a2 = { x: 4, y: 2 };
  const b1 = { x: 2, y: 0 };
  const b2 = { x: 2, y: 4 };

  const inter = segmentIntersection(a1, a2, b1, b2);
  assert.ok(inter !== null);
  assert.equal(inter.point.x, 2);
  assert.equal(inter.point.y, 2);
});
