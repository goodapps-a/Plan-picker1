import test from 'node:test';
import assert from 'node:assert/strict';
import { exportProjectAsJSON, importProjectFromJSON } from '../src/storage/db';
import { HistoryManager } from '../src/history/historyManager';
import { Project } from '../src/model/types';

test('persistence: export and import valid project', () => {
  const original: Project = {
    id: 'proj_export_test',
    name: 'Sample Villa',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unit: 'm',
    defaultWallHeight: 2.8,
    defaultWallThickness: 0.2,
    schemaVersion: 1,
    points: {
      p1: { id: 'p1', x: 0, y: 0 },
      p2: { id: 'p2', x: 6, y: 0 },
    },
    walls: {
      w1: {
        id: 'w1',
        startPointId: 'p1',
        endPointId: 'p2',
        thickness: 0.2,
        height: 2.8,
        createdAt: Date.now(),
      },
    },
  };

  const jsonStr = exportProjectAsJSON(original);
  assert.ok(typeof jsonStr === 'string' && jsonStr.length > 50);

  const imported = importProjectFromJSON(jsonStr);
  assert.equal(imported.id, original.id);
  assert.equal(imported.name, original.name);
  assert.equal(imported.walls.w1.thickness, 0.2);
  assert.equal(imported.points.p2.x, 6);
});

test('persistence: reject invalid import with malformed json or missing endpoints', () => {
  assert.throws(() => {
    importProjectFromJSON('not a json');
  });

  // Missing endpoints
  const brokenProject = JSON.stringify({
    id: 'broken',
    name: 'Broken',
    points: {},
    walls: {
      w1: { id: 'w1', startPointId: 'p1', endPointId: 'p2', thickness: 0.15, height: 3 },
    },
  });

  assert.throws(() => {
    importProjectFromJSON(brokenProject);
  });
});

test('history: undo and redo preserve exact snapshots', () => {
  const history = new HistoryManager(10);

  const state1 = {
    points: { p1: { id: 'p1', x: 0, y: 0 }, p2: { id: 'p2', x: 4, y: 0 } },
    walls: { w1: { id: 'w1', startPointId: 'p1', endPointId: 'p2', thickness: 0.15, height: 3, createdAt: 1 } },
  };

  const state2 = {
    points: { p1: { id: 'p1', x: 0, y: 0 }, p2: { id: 'p2', x: 6, y: 0 } },
    walls: { w1: { id: 'w1', startPointId: 'p1', endPointId: 'p2', thickness: 0.15, height: 3, createdAt: 1 } },
  };

  history.push(state1);
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);

  const restored1 = history.undo(state2);
  assert.ok(restored1 !== null);
  assert.equal(restored1?.points.p2.x, 4);
  assert.equal(history.canRedo(), true);

  const restored2 = history.redo(restored1!);
  assert.ok(restored2 !== null);
  assert.equal(restored2?.points.p2.x, 6);
});
