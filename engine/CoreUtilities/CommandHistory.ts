/**
 * Command History & Undo/Redo System
 * Implements the Command Pattern for reversible editor actions.
 */

export interface Command {
  name: string;
  execute(): void;
  undo(): void;
  redo?(): void;
}

export type HistoryChangeListener = (canUndo: boolean, canRedo: boolean, undoName?: string, redoName?: string) => void;

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number;
  private listeners: HistoryChangeListener[] = [];

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  /**
   * Execute a command and push it onto the undo stack.
   * If runExecute is false, the action is assumed to have already run interactively (e.g. gizmo drag).
   */
  public execute(command: Command, runExecute: boolean = true): void {
    if (runExecute) {
      try {
        command.execute();
      } catch (err) {
        console.error(`[CommandHistory] Error executing command "${command.name}":`, err);
        return;
      }
    }

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // A new action always clears the redo stack
    this.redoStack = [];
    this.notify();
  }

  /**
   * Undo the most recent command.
   */
  public undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;

    try {
      cmd.undo();
      this.redoStack.push(cmd);
      this.notify();
      return true;
    } catch (err) {
      console.error(`[CommandHistory] Error undoing command "${cmd.name}":`, err);
      return false;
    }
  }

  /**
   * Redo the most recently undone command.
   */
  public redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;

    try {
      if (cmd.redo) {
        cmd.redo();
      } else {
        cmd.execute();
      }
      this.undoStack.push(cmd);
      this.notify();
      return true;
    } catch (err) {
      console.error(`[CommandHistory] Error redoing command "${cmd.name}":`, err);
      return false;
    }
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoName(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.name;
  }

  public getRedoName(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.name;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  public onChange(listener: HistoryChangeListener): void {
    this.listeners.push(listener);
    listener(this.canUndo(), this.canRedo(), this.getUndoName(), this.getRedoName());
  }

  private notify(): void {
    const u = this.canUndo();
    const r = this.canRedo();
    const uName = this.getUndoName();
    const rName = this.getRedoName();
    for (const listener of this.listeners) {
      listener(u, r, uName, rName);
    }
  }
}

