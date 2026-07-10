/**
 * CommandManager — Command pattern for undo/redo
 * @description Maintains a history stack of reversible operations.
 */
class CommandManager {
  /**
   * @param {number} [maxHistory=50] - Maximum undo stack size
   */
  constructor(maxHistory = 50) {
    /** @type {Array<Command>} */
    this._undoStack = [];
    /** @type {Array<Command>} */
    this._redoStack = [];
    this._maxHistory = maxHistory;
  }

  /**
   * Execute a command and push to undo stack
   * @param {Command} command - { execute(), undo(), description }
   */
  execute(command) {
    try {
      command.execute();
      this._undoStack.push(command);

      // Trim stack if exceeds max
      if (this._undoStack.length > this._maxHistory) {
        this._undoStack.shift();
      }

      // Clear redo stack (new action invalidates future)
      this._redoStack = [];

      eventBus.emit('command:execute', { description: command.description });
      eventBus.emit('command:stackChange', this._getStackInfo());
    } catch (err) {
      console.error('[CommandManager] Execute error:', err);
    }
  }

  /**
   * Undo the last command
   */
  undo() {
    if (this._undoStack.length === 0) return;

    const command = this._undoStack.pop();
    try {
      command.undo();
      this._redoStack.push(command);

      eventBus.emit('command:undo', { description: command.description });
      eventBus.emit('command:stackChange', this._getStackInfo());
    } catch (err) {
      console.error('[CommandManager] Undo error:', err);
    }
  }

  /**
   * Redo the last undone command
   */
  redo() {
    if (this._redoStack.length === 0) return;

    const command = this._redoStack.pop();
    try {
      command.execute();
      this._undoStack.push(command);

      eventBus.emit('command:redo', { description: command.description });
      eventBus.emit('command:stackChange', this._getStackInfo());
    } catch (err) {
      console.error('[CommandManager] Redo error:', err);
    }
  }

  /** @returns {boolean} */
  get canUndo() { return this._undoStack.length > 0; }

  /** @returns {boolean} */
  get canRedo() { return this._redoStack.length > 0; }

  /** @private */
  _getStackInfo() {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoDescription: this.canUndo ? this._undoStack[this._undoStack.length - 1].description : null,
      redoDescription: this.canRedo ? this._redoStack[this._redoStack.length - 1].description : null,
    };
  }

  /**
   * Clear all history
   */
  clear() {
    this._undoStack = [];
    this._redoStack = [];
    eventBus.emit('command:stackChange', this._getStackInfo());
  }
}

// ── Concrete Commands ──────────────────────────────────────

/**
 * Command to add a room
 */
class AddRoomCommand {
  /**
   * @param {Array<{x:number, y:number}>} vertices
   * @param {string} [name]
   */
  constructor(vertices, name) {
    this.vertices = vertices;
    this.name = name;
    this.roomId = null;
    this.description = `Dodaj pokój: ${name || 'nowy'}`;
  }

  execute() {
    const room = appState.addRoom({
      vertices: this.vertices,
      name: this.name,
    });
    this.roomId = room.id;
  }

  undo() {
    if (this.roomId != null) {
      appState.removeRoom(this.roomId);
    }
  }
}

/**
 * Command to delete a room
 */
class DeleteRoomCommand {
  /**
   * @param {number} roomId
   */
  constructor(roomId) {
    this.roomId = roomId;
    this._savedRoom = null;
    this.description = `Usuń pokój #${roomId}`;
  }

  execute() {
    // Save room data for undo
    this._savedRoom = appState.getRoom(this.roomId);
    if (this._savedRoom) {
      this._savedRoom = { ...this._savedRoom, vertices: [...this._savedRoom.vertices] };
    }
    appState.removeRoom(this.roomId);
  }

  undo() {
    if (this._savedRoom) {
      // Re-add with same id (we need to manipulate state directly)
      const rooms = [...appState.get('rooms'), this._savedRoom];
      appState.set('rooms', rooms);
      appState.set('selectedRoomId', this._savedRoom.id);
      eventBus.emit('room:add', this._savedRoom);
    }
  }
}

/**
 * Command to move a vertex
 */
class MoveVertexCommand {
  /**
   * @param {number} roomId
   * @param {number} vertexIndex
   * @param {{x:number, y:number}} oldPos
   * @param {{x:number, y:number}} newPos
   */
  constructor(roomId, vertexIndex, oldPos, newPos) {
    this.roomId = roomId;
    this.vertexIndex = vertexIndex;
    this.oldPos = { ...oldPos };
    this.newPos = { ...newPos };
    this.description = `Przesuń wierzchołek pokoju #${roomId}`;
  }

  execute() {
    const room = appState.getRoom(this.roomId);
    if (!room) return;
    const vertices = room.vertices.map((v, i) =>
      i === this.vertexIndex ? { ...this.newPos } : { ...v }
    );
    appState.updateRoomVertices(this.roomId, vertices);
  }

  undo() {
    const room = appState.getRoom(this.roomId);
    if (!room) return;
    const vertices = room.vertices.map((v, i) =>
      i === this.vertexIndex ? { ...this.oldPos } : { ...v }
    );
    appState.updateRoomVertices(this.roomId, vertices);
  }
}

// Singleton instance
const commandManager = new CommandManager();
