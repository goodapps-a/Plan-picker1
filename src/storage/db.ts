/**
 * Planform Local Persistence (IndexedDB with Fallback) and Project Import/Export
 */

import { Project } from '../model/types';
import { validateProjectModel } from '../geometry/validation';

const DB_NAME = 'planform_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';

// In-memory fallback if IndexedDB is blocked or unavailable
const memoryStore = new Map<string, Project>();

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    } catch (err) {
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Retrieve all projects sorted by updatedAt descending.
 */
export async function getAllProjects(): Promise<Project[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results: Project[] = (request.result || []).map((item) => sanitizeProject(item));
        results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(results);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('[Planform DB] Falling back to memory/localStorage store:', err);
    // Fallback to localStorage or in-memory
    const items = getLocalStorageProjects();
    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return items;
  }
}

/**
 * Retrieve a project by ID.
 */
export async function getProject(id: string): Promise<Project | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const request = store.get(id);

      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
        } else {
          resolve(sanitizeProject(request.result));
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    const fromMem = memoryStore.get(id);
    if (fromMem) return fromMem;
    const local = getLocalStorageProjects().find((p) => p.id === id);
    return local || null;
  }
}

/**
 * Save or update a project.
 */
export async function saveProject(project: Project): Promise<void> {
  const sanitized = sanitizeProject(project);
  const validation = validateProjectModel(sanitized);
  if (!validation.valid) {
    throw new Error(`Cannot save invalid project: ${validation.errors.join(', ')}`);
  }

  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.put(sanitized);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[Planform DB] IndexedDB save failed, using local/memory storage:', err);
    memoryStore.set(sanitized.id, sanitized);
    setLocalStorageProject(sanitized);
  }
}

/**
 * Delete a project by ID.
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    memoryStore.delete(id);
    deleteLocalStorageProject(id);
  }
}

/**
 * Sanitize and validate project data schema.
 */
function sanitizeProject(data: any): Project {
  return {
    id: String(data.id || ''),
    name: String(data.name || 'Untitled Project'),
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    unit: (['m', 'ft', 'mm'].includes(data.unit) ? data.unit : 'm') as Project['unit'],
    defaultWallHeight: Number.isFinite(data.defaultWallHeight) && data.defaultWallHeight > 0 ? data.defaultWallHeight : 3.0,
    defaultWallThickness: Number.isFinite(data.defaultWallThickness) && data.defaultWallThickness > 0 ? data.defaultWallThickness : 0.15,
    points: typeof data.points === 'object' && data.points !== null ? data.points : {},
    walls: typeof data.walls === 'object' && data.walls !== null ? data.walls : {},
    schemaVersion: Number(data.schemaVersion) || 1,
  };
}

/**
 * Export project as downloadable JSON format.
 */
export function exportProjectAsJSON(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Validate and import project from JSON text.
 */
export function importProjectFromJSON(jsonText: string): Project {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Invalid JSON format: file could not be parsed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Imported data must be a valid JSON object.');
  }

  const project = sanitizeProject(parsed);
  const validation = validateProjectModel(project);
  if (!validation.valid) {
    throw new Error(`Project validation failed: ${validation.errors.join('; ')}`);
  }

  return project;
}

// LocalStorage helpers for fallback
function getLocalStorageProjects(): Project[] {
  try {
    const raw = localStorage.getItem('planform_local_projects');
    if (!raw) return Array.from(memoryStore.values());
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(sanitizeProject) : [];
  } catch {
    return Array.from(memoryStore.values());
  }
}

function setLocalStorageProject(project: Project): void {
  try {
    const list = getLocalStorageProjects().filter((p) => p.id !== project.id);
    list.push(project);
    localStorage.setItem('planform_local_projects', JSON.stringify(list));
  } catch {
    // Ignore quota or privacy errors
  }
}

function deleteLocalStorageProject(id: string): void {
  try {
    const list = getLocalStorageProjects().filter((p) => p.id !== id);
    localStorage.setItem('planform_local_projects', JSON.stringify(list));
  } catch {
    // Ignore
  }
}
