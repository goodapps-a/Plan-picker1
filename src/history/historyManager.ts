/**
 * Planform Undo / Redo History Manager
 * Project-specific, immutable snapshot management
 */

import { Point, Wall } from '../model/types';

export interface HistorySnapshot {
  points: Record<string, Point>;
  walls: Record<string, Wall>;
  description?: string;
}

export class HistoryManager {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  /**
   * Pushes a new snapshot onto the undo stack.
   * Clears the redo stack.
   */
  push(snapshot: HistorySnapshot): void {
    // Deep clone points and walls to ensure immutability
    const cloned: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(snapshot.points)),
      walls: JSON.parse(JSON.stringify(snapshot.walls)),
      description: snapshot.description,
    };

    this.undoStack.push(cloned);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Undoes the last action.
   * Takes the current state, pushes it to redoStack, and pops from undoStack.
   */
  undo(currentState: HistorySnapshot): HistorySnapshot | null {
    if (!this.canUndo()) return null;

    const previousState = this.undoStack.pop()!;
    this.redoStack.push({
      points: JSON.parse(JSON.stringify(currentState.points)),
      walls: JSON.parse(JSON.stringify(currentState.walls)),
      description: currentState.description,
    });

    return previousState;
  }

  /**
   * Redoes the next action.
   * Takes the current state, pushes it to undoStack, and pops from redoStack.
   */
  redo(currentState: HistorySnapshot): HistorySnapshot | null {
    if (!this.canRedo()) return null;

    const nextState = this.redoStack.pop()!;
    this.undoStack.push({
      points: JSON.parse(JSON.stringify(currentState.points)),
      walls: JSON.parse(JSON.stringify(currentState.walls)),
      description: currentState.description,
    });

    return nextState;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
