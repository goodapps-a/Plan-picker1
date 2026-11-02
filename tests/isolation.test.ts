import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWallTransaction,
  resizeWallTransaction,
  rotateWallTransaction,
  moveWallTransaction,
  updateWallEndpointTransaction,
  deleteWallTransaction,
  splitWallAtPointTransaction,
  trimWallsTransaction,
} from '../src/geometry/transactions';
import { Project } from '../src/model/types';
import { distance, toDegrees, toRadians, wallAngle, wallLength } from '../src/geometry/pureGeometry';
import { validateProjectModel } from '../src/geometry/validation';

function buildThreeConnectedWalls(): { project: Project; wall1Id: string; wall2Id: string; wall3Id: string } {
  let project: Project = {
    id: 'proj_chain',
    name: 'Chain Test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unit: 'm',
    defaultWallHeight: 3.0,
    defaultWallThickness: 0.15,
    schemaVersion: 1,
    points: {},
    walls: {},
  };

  // Wall 1: (0, 0) to (4, 0)
  const res1 = createWallTransaction(project, { point: { x: 0, y: 0 } }, { point: { x: 4, y: 0 } });
  project = res1.project;
  const wall1Id = res1.newWallId;
  const ptB_id = project.walls[wall1Id].endPointId;

  // Wall 2 (middle wall): connects from (4, 0) to (4, 4)
  const res2 = createWallTransaction(project, { point: { x: 4, y: 0 }, pointId: ptB_id }, { point: { x: 4, y: 4 } });
  project = res2.project;
  const wall2Id = res2.newWallId;
  const ptC_id = project.walls[wall2Id].endPointId;

  // Wall 3: connects from (4, 4) to (0, 4)
  const res3 = createWallTransaction(project, { point: { x: 4, y: 4 }, pointId: ptC_id }, { point: { x: 0, y: 4 } });
  project = res3.project;
  const wall3Id = res3.newWallId;

  return { project, wall1Id, wall2Id, wall3Id };
}

test('isolation: 3 connected walls share points initially', () => {
  const { project, wall1Id, wall2Id, wall3Id } = buildThreeConnectedWalls();

  // Wall 1 end should be same point as Wall 2 start
  assert.equal(project.walls[wall1Id].endPointId, project.walls[wall2Id].startPointId);
  // Wall 2 end should be same point as Wall 3 start
  assert.equal(project.walls[wall2Id].endPointId, project.walls[wall3Id].startPointId);

  const val = validateProjectModel(project);
  assert.ok(val.valid);
});

test('isolation: resizing middle wall does NOT change neighboring walls', () => {
  const { project: initialProj, wall1Id, wall2Id, wall3Id } = buildThreeConnectedWalls();

  const w1StartBefore = initialProj.points[initialProj.walls[wall1Id].startPointId];
  const w1EndBefore = initialProj.points[initialProj.walls[wall1Id].endPointId];
  const w3StartBefore = initialProj.points[initialProj.walls[wall3Id].startPointId];
  const w3EndBefore = initialProj.points[initialProj.walls[wall3Id].endPointId];

  // Middle wall length was 4m (from (4,0) to (4,4)). Resize to 6m, keeping 'start' fixed at (4,0).
  const updatedProj = resizeWallTransaction(initialProj, wall2Id, 6.0, 'start');

  const w2 = updatedProj.walls[wall2Id];
  const w2Start = updatedProj.points[w2.startPointId];
  const w2End = updatedProj.points[w2.endPointId];
  const newW2Len = wallLength(w2Start, w2End);

  assert.ok(Math.abs(newW2Len - 6.0) < 1e-4, 'Middle wall length should be exactly 6.0m');
  assert.equal(w2End.y, 6.0, 'Middle wall end y should now be 6.0');

  // CRITICAL CHECK: Wall 1 and Wall 3 must NOT have moved or changed!
  const w1StartAfter = updatedProj.points[updatedProj.walls[wall1Id].startPointId];
  const w1EndAfter = updatedProj.points[updatedProj.walls[wall1Id].endPointId];
  const w3StartAfter = updatedProj.points[updatedProj.walls[wall3Id].startPointId];
  const w3EndAfter = updatedProj.points[updatedProj.walls[wall3Id].endPointId];

  assert.deepEqual(w1StartAfter, w1StartBefore);
  assert.deepEqual(w1EndAfter, w1EndBefore);
  assert.deepEqual(w3StartAfter, w3StartBefore);
  assert.deepEqual(w3EndAfter, w3EndBefore);

  const val = validateProjectModel(updatedProj);
  assert.ok(val.valid, 'Model should remain completely valid after isolated resize');
});

test('isolation: rotating middle wall preserves length and does NOT move neighbors', () => {
  const { project: initialProj, wall1Id, wall2Id, wall3Id } = buildThreeConnectedWalls();

  const w1EndBefore = initialProj.points[initialProj.walls[wall1Id].endPointId];
  const w3StartBefore = initialProj.points[initialProj.walls[wall3Id].startPointId];

  // Rotate middle wall to 45 degrees, fixed at start
  const updatedProj = rotateWallTransaction(initialProj, wall2Id, toRadians(45), 'start');

  const w2 = updatedProj.walls[wall2Id];
  const w2Start = updatedProj.points[w2.startPointId];
  const w2End = updatedProj.points[w2.endPointId];

  assert.ok(Math.abs(wallLength(w2Start, w2End) - 4.0) < 1e-4, 'Length must remain 4m');
  assert.ok(Math.abs(toDegrees(wallAngle(w2Start, w2End)) - 45) < 1e-4, 'Angle must be 45 deg');

  // Wall 1 and Wall 3 must be untouched
  assert.deepEqual(updatedProj.points[updatedProj.walls[wall1Id].endPointId], w1EndBefore);
  assert.deepEqual(updatedProj.points[updatedProj.walls[wall3Id].startPointId], w3StartBefore);

  const val = validateProjectModel(updatedProj);
  assert.ok(val.valid);
});

test('connectivity: moving wall moves shared corners and stretches connected neighbors', () => {
  const { project: initialProj, wall1Id, wall2Id, wall3Id } = buildThreeConnectedWalls();

  // Wall 1: (0, 0) to (4, 0)
  // Wall 2: (4, 0) to (4, 4)
  // Wall 3: (4, 4) to (0, 4)

  // Translate middle wall by dx = 2, dy = 1
  const updatedProj = moveWallTransaction(initialProj, wall2Id, 2, 1);

  const w2 = updatedProj.walls[wall2Id];
  const w2Start = updatedProj.points[w2.startPointId];
  const w2End = updatedProj.points[w2.endPointId];

  assert.equal(w2Start.x, 6);
  assert.equal(w2Start.y, 1);
  assert.equal(w2End.x, 6);
  assert.equal(w2End.y, 5);

  // Neighbors stay connected at the shared endpoints:
  // Wall 1 end should now be at (6, 1) - stretched from 4m to hypot(6, 1)
  const w1End = updatedProj.points[updatedProj.walls[wall1Id].endPointId];
  assert.equal(w1End.x, 6);
  assert.equal(w1End.y, 1);
  assert.equal(updatedProj.walls[wall1Id].endPointId, w2.startPointId);

  // Wall 3 start should now be at (6, 5) - stretched
  const w3Start = updatedProj.points[updatedProj.walls[wall3Id].startPointId];
  assert.equal(w3Start.x, 6);
  assert.equal(w3Start.y, 5);
  assert.equal(updatedProj.walls[wall3Id].startPointId, w2.endPointId);

  const val = validateProjectModel(updatedProj);
  assert.ok(val.valid);
});

test('detachment: dragging a shared endpoint handle detaches it so other wall stays in place', () => {
  const { project: initialProj, wall1Id, wall2Id } = buildThreeConnectedWalls();

  // Wall 2 start was at (4, 0), shared with Wall 1 end.
  // Drag endpoint handle of Wall 2 to (5, -1) without target snap point
  const updatedProj = updateWallEndpointTransaction(initialProj, wall2Id, 'start', { x: 5, y: -1 });

  const w2 = updatedProj.walls[wall2Id];
  const w2Start = updatedProj.points[w2.startPointId];
  assert.equal(w2Start.x, 5);
  assert.equal(w2Start.y, -1);

  // Wall 1 end must NOT have moved; it remains at its original position (4, 0)
  const w1EndAfter = updatedProj.points[updatedProj.walls[wall1Id].endPointId];
  assert.equal(w1EndAfter.x, 4);
  assert.equal(w1EndAfter.y, 0);

  // They are no longer sharing the point; Wall 2 detached cleanly
  assert.notEqual(updatedProj.walls[wall1Id].endPointId, w2.startPointId);

  const val = validateProjectModel(updatedProj);
  assert.ok(val.valid);
});

test('isolation: deleting a wall leaves neighbors intact and cleans orphaned points', () => {
  const { project: initialProj, wall1Id, wall2Id, wall3Id } = buildThreeConnectedWalls();

  const updatedProj = deleteWallTransaction(initialProj, wall2Id);

  assert.equal(updatedProj.walls[wall2Id], undefined);
  assert.ok(updatedProj.walls[wall1Id] !== undefined);
  assert.ok(updatedProj.walls[wall3Id] !== undefined);

  const val = validateProjectModel(updatedProj);
  assert.ok(val.valid);
});

test('isolation: splitting a wall creates collinear segments preserving height and thickness', () => {
  const { project: initialProj, wall1Id } = buildThreeConnectedWalls();
  const origWall = initialProj.walls[wall1Id];

  // Wall 1 is from (0,0) to (4,0). Split at (2.5, 0).
  const splitRes = splitWallAtPointTransaction(initialProj, wall1Id, { x: 2.5, y: 0 });
  const updatedProj = splitRes.project;

  const w1 = updatedProj.walls[splitRes.wallId1];
  const w2 = updatedProj.walls[splitRes.wallId2];

  assert.equal(w1.height, origWall.height);
  assert.equal(w1.thickness, origWall.thickness);
  assert.equal(w2.height, origWall.height);
  assert.equal(w2.thickness, origWall.thickness);

  // Junction point
  const jPt = updatedProj.points[splitRes.junctionPointId];
  assert.equal(jPt.x, 2.5);
  assert.equal(jPt.y, 0);

  const val = validateProjectModel(updatedProj);
  assert.ok(val.valid);
});

test('trim: two disjoint perpendicular walls extend/trim to meet at intersection', () => {
  let project: Project = {
    id: 'proj_trim',
    name: 'Trim Test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unit: 'm',
    defaultWallHeight: 3.0,
    defaultWallThickness: 0.15,
    schemaVersion: 1,
    points: {},
    walls: {},
  };

  // Horizontal wall from (0, 0) to (4, 0)
  const res1 = createWallTransaction(project, { point: { x: 0, y: 0 } }, { point: { x: 4, y: 0 } });
  project = res1.project;
  const w1Id = res1.newWallId;

  // Vertical wall from (5, 1) to (5, 6)
  const res2 = createWallTransaction(project, { point: { x: 5, y: 1 } }, { point: { x: 5, y: 6 } });
  project = res2.project;
  const w2Id = res2.newWallId;

  // Trim/join them
  const trimmedProj = trimWallsTransaction(project, w1Id, w2Id);

  const w1 = trimmedProj.walls[w1Id];
  const w2 = trimmedProj.walls[w2Id];

  // They must share an endpoint now!
  assert.equal(w1.endPointId, w2.startPointId);

  // The shared junction point must be at (5, 0)
  const junction = trimmedProj.points[w1.endPointId];
  assert.equal(junction.x, 5);
  assert.equal(junction.y, 0);

  const val = validateProjectModel(trimmedProj);
  assert.ok(val.valid);
});

