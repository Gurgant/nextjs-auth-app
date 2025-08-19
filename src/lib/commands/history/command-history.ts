import { ExecutedCommand } from '../base/command.interface'

export class CommandHistory {
  private undoStack: ExecutedCommand[] = []
  private redoStack: ExecutedCommand[] = []
  private maxSize: number
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize
  }
  
  /**
   * Add a command to history
   */
  add(command: ExecutedCommand): void {
    this.undoStack.push(command)
    
    // Clear redo stack when new command is executed
    this.redoStack = []
    
    // Maintain max size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift() // Remove oldest
    }
  }
  
  /**
   * Get the last undoable command
   */
  getLastUndoable(): ExecutedCommand | null {
    // Find the last command that can be undone
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      if (this.undoStack[i].undoable) {
        return this.undoStack[i]
      }
    }
    return null
  }
  
  /**
   * Get the last redoable command
   */
  getLastRedoable(): ExecutedCommand | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1] : null
  }
  
  /**
   * Move command from undo to redo stack
   */
  moveToRedoStack(command: ExecutedCommand): void {
    const index = this.undoStack.findIndex(c => c === command)
    if (index !== -1) {
      this.undoStack.splice(index, 1)
      this.redoStack.push(command)
    }
  }
  
  /**
   * Move command from redo to undo stack
   */
  moveToUndoStack(command: ExecutedCommand): void {
    const index = this.redoStack.findIndex(c => c === command)
    if (index !== -1) {
      this.redoStack.splice(index, 1)
      this.undoStack.push(command)
    }
  }
  
  /**
   * Get all commands in history
   */
  getAll(): ExecutedCommand[] {
    return [...this.undoStack]
  }
  
  /**
   * Get commands by user
   */
  getByUser(userId: string): ExecutedCommand[] {
    return this.undoStack.filter(cmd => cmd.metadata.userId === userId)
  }
  
  /**
   * Get commands in date range
   */
  getByDateRange(start: Date, end: Date): ExecutedCommand[] {
    return this.undoStack.filter(cmd => 
      cmd.timestamp >= start && cmd.timestamp <= end
    )
  }
  
  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
  
  /**
   * Get history stats
   */
  getStats() {
    return {
      undoStackSize: this.undoStack.length,
      redoStackSize: this.redoStack.length,
      totalCommands: this.undoStack.length + this.redoStack.length,
      undoableCommands: this.undoStack.filter(c => c.undoable).length,
      maxSize: this.maxSize
    }
  }
}