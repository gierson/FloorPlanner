/**
 * Wall Commands — Undoable operations for wall-based editing
 */

/**
 * Command to add a wall (after it's already been added to the graph)
 *
 * The caller (WallTool) mutates the graph first, so the "before" state
 * must be captured by the caller and passed in — a snapshot taken in
 * execute() would already contain the wall and undo would be a no-op.
 */
class AddWallCommand {
  /**
   * @param {WallGraph} graph
   * @param {number} wallId
   * @param {Object|null} beforeSnapshot - graph.serialize() from BEFORE
   *        the wall (and its nodes / node moves) were applied
   */
  constructor(graph, wallId, beforeSnapshot = null) {
    this.graph = graph;
    this.wallId = wallId;
    this._before = beforeSnapshot;
    this._after = null;
    this.description = `Dodaj ścianę #${wallId}`;
  }

  execute() {
    if (this._after) {
      // Redo: restore the state with the wall
      this.graph.deserialize(this._after);
      eventBus.emit('graph:change');
    } else {
      // First run: wall is already in the graph — capture for redo
      this._after = this.graph.serialize();
    }
  }

  undo() {
    if (this._before) {
      this.graph.deserialize(this._before);
      eventBus.emit('graph:change');
    }
  }
}

/**
 * Command to remove a wall
 */
class RemoveWallCommand {
  constructor(graph, wallId) {
    this.graph = graph;
    this.wallId = wallId;
    this._snapshot = null;
    this.description = `Usuń ścianę #${wallId}`;
  }

  execute() {
    this._snapshot = this.graph.serialize();
    this.graph.removeWall(this.wallId);
    eventBus.emit('wall:remove', { wallId: this.wallId });
    eventBus.emit('graph:change');
  }

  undo() {
    if (this._snapshot) {
      this.graph.deserialize(this._snapshot);
      eventBus.emit('graph:change');
    }
  }
}

/**
 * Command to move a node
 */
class MoveNodeCommand {
  constructor(graph, nodeId, oldPos, newPos) {
    this.graph = graph;
    this.nodeId = nodeId;
    this.oldPos = { ...oldPos };
    this.newPos = { ...newPos };
    this.description = `Przesuń węzeł #${nodeId}`;
  }

  execute() {
    this.graph.moveNode(this.nodeId, this.newPos.x, this.newPos.y);
    eventBus.emit('graph:change');
  }

  undo() {
    this.graph.moveNode(this.nodeId, this.oldPos.x, this.oldPos.y);
    eventBus.emit('graph:change');
  }
}

/**
 * Command to set wall length (moves end node)
 */
class SetWallLengthCommand {
  constructor(graph, wallId, oldLength, newLength) {
    this.graph = graph;
    this.wallId = wallId;
    this.oldLength = oldLength;
    this.newLength = newLength;
    this.description = `Zmień długość ściany #${wallId}`;
  }

  execute() {
    this.graph.setWallLength(this.wallId, this.newLength);
    eventBus.emit('graph:change');
  }

  undo() {
    this.graph.setWallLength(this.wallId, this.oldLength);
    eventBus.emit('graph:change');
  }
}

/**
 * Command to add a door
 */
class AddDoorCommand {
  constructor(graph, wallId, position, width) {
    this.graph = graph;
    this.wallId = wallId;
    this.position = position;
    this.width = width;
    this.doorId = null;
    this.description = `Dodaj drzwi`;
  }

  execute() {
    this.doorId = this.graph.addDoor(this.wallId, this.position, this.width);
    eventBus.emit('graph:change');
  }

  undo() {
    if (this.doorId) {
      this.graph.removeDoor(this.doorId);
      eventBus.emit('graph:change');
    }
  }
}

/**
 * Command to update door properties (width, hingeSide, openDirection)
 */
class UpdateDoorCommand {
  constructor(graph, doorId, oldProps, newProps) {
    this.graph = graph;
    this.doorId = doorId;
    this.oldProps = { ...oldProps };
    this.newProps = { ...newProps };
    this.description = `Zmień drzwi #${doorId}`;
  }

  execute() {
    this.graph.updateDoor(this.doorId, this.newProps);
    eventBus.emit('graph:change');
  }

  undo() {
    this.graph.updateDoor(this.doorId, this.oldProps);
    eventBus.emit('graph:change');
  }
}

/**
 * Command to remove a door (undoable)
 */
class RemoveDoorCommand {
  constructor(graph, doorId) {
    this.graph = graph;
    this.doorId = doorId;
    this._savedDoor = null;
    this.description = `Usuń drzwi #${doorId}`;
  }

  execute() {
    // Save door data for undo
    const door = this.graph.doors.get(this.doorId);
    if (door) {
      this._savedDoor = { ...door };
    }
    this.graph.removeDoor(this.doorId);
    appState.set('selectedDoorId', null);
    eventBus.emit('graph:change');
  }

  undo() {
    if (this._savedDoor) {
      // Re-insert the door directly
      this.graph.doors.set(this._savedDoor.id, { ...this._savedDoor });
      this.graph._invalidateCache();
      eventBus.emit('graph:change');
    }
  }
}

/**
 * Command to add a rectangular room (4 walls + 4 nodes)
 */
class AddRectRoomCommand {
  constructor(graph, topLeft, bottomRight, config = {}) {
    this.graph = graph;
    this.topLeft = { ...topLeft };
    this.bottomRight = { ...bottomRight };
    this.config = config;
    this._snapshot = null;
    this.description = `Dodaj prostokątny pokój`;
  }

  execute() {
    this._snapshot = this.graph.serialize();

    const { x: x1, y: y1 } = this.topLeft;
    const { x: x2, y: y2 } = this.bottomRight;
    const config = {
      thickness: this.config.thickness || appState.get('wallDefaults.thickness') || 150,
      type: this.config.type || appState.get('wallDefaults.type') || 'interior',
    };

    // Create 4 nodes
    const n1 = this.graph.addNode(x1, y1);
    const n2 = this.graph.addNode(x2, y1);
    const n3 = this.graph.addNode(x2, y2);
    const n4 = this.graph.addNode(x1, y2);

    // Create 4 walls
    this.graph.addWall(n1, n2, config);
    this.graph.addWall(n2, n3, config);
    this.graph.addWall(n3, n4, config);
    this.graph.addWall(n4, n1, config);

    eventBus.emit('graph:change');
  }

  undo() {
    if (this._snapshot) {
      this.graph.deserialize(this._snapshot);
      eventBus.emit('graph:change');
    }
  }
}
