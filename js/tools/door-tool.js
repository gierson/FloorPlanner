/**
 * DoorTool — Interactive door placement tool
 *
 * Provides ghost preview that slides along walls, snap to grid/center,
 * and dimension labels showing distance from wall corners.
 *
 * Usage:
 *   Select "Drzwi" tool → hover over a wall → ghost door slides along wall
 *   Click to place door at the ghost position.
 *   Arrow keys: ←/→ toggle hingeSide, ↑/↓ toggle openDirection
 */
class DoorTool {
  /**
   * @param {WallGraph} graph
   * @param {Viewport} viewport
   */
  constructor(graph, viewport) {
    this.graph = graph;
    this.viewport = viewport;

    /** @type {number} Minimum distance from wall corner (mm) */
    this.minCornerDist = 100;

    // ── Ghost state (updated on every mouse move) ──

    /** @type {number|null} Wall under cursor */
    this.hoveredWallId = null;

    /** @type {number|null} Position along wall axis (mm from start node) */
    this.ghostPosition = null;

    /** @type {boolean} Is current position valid for placement */
    this.isValid = false;

    /** @type {string|null} Snap type: 'center', 'grid', or null */
    this.snapType = null;

    /** @type {number} Distance from wall start to door center (mm) */
    this.distFromStart = 0;

    /** @type {number} Distance from wall end to door center (mm) */
    this.distFromEnd = 0;

    // ── Computed geometry for rendering ──

    /** @type {{x:number,y:number}|null} Door center in world coords */
    this.ghostCenter = null;

    /** @type {Array<{x:number,y:number}>|null} Door opening polygon (4 corners) */
    this.ghostPolygon = null;

    /** @type {{x:number,y:number}|null} Wall axis start */
    this.wallAxisStart = null;

    /** @type {{x:number,y:number}|null} Wall axis end */
    this.wallAxisEnd = null;

    /** @type {number} Wall perpendicular normal X (unit) */
    this.wallNormX = 0;

    /** @type {number} Wall perpendicular normal Y (unit) */
    this.wallNormY = 0;
  }

  /** @returns {number} Current door width from appState defaults */
  get doorWidth() {
    return appState.get('doorDefaults.width') || 800;
  }

  /** @returns {string} Current hinge side from appState defaults */
  get hingeSide() {
    return appState.get('doorDefaults.hingeSide') || 'left';
  }

  /** @returns {string} Current open direction from appState defaults */
  get openDirection() {
    return appState.get('doorDefaults.openDirection') || 'A';
  }

  // ═══════════════════════════════════════════════════════════
  //  EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Handle mouse move — compute ghost door position on nearest wall
   * @param {{x:number,y:number}} worldPos - raw world position
   */
  onMouseMove(worldPos) {
    // Reset state
    this.hoveredWallId = null;
    this.ghostPosition = null;
    this.ghostCenter = null;
    this.ghostPolygon = null;
    this.isValid = false;
    this.snapType = null;

    // Find wall near cursor
    const threshold = this.viewport.screenToWorldDist(15);
    const hit = this.graph.findWallNear(worldPos.x, worldPos.y, threshold);
    if (!hit) return;

    const wall = this.graph.walls.get(hit.wallId);
    if (!wall) return;

    const axis = this.graph.getWallAxis(hit.wallId);
    if (!axis) return;

    const wallLen = this.graph.getWallLength(hit.wallId);
    if (wallLen < this.doorWidth + this.minCornerDist * 2) return; // wall too short

    this.hoveredWallId = hit.wallId;
    this.wallAxisStart = axis.start;
    this.wallAxisEnd = axis.end;

    // Wall direction (unit vector)
    const dx = axis.end.x - axis.start.x;
    const dy = axis.end.y - axis.start.y;
    const udx = dx / wallLen;
    const udy = dy / wallLen;

    // Perpendicular normal (for drawing the door opening rectangle)
    this.wallNormX = -udy;
    this.wallNormY = udx;

    // Project mouse onto wall axis → parametric t → position in mm
    const t = ((worldPos.x - axis.start.x) * dx + (worldPos.y - axis.start.y) * dy)
            / (dx * dx + dy * dy);
    let position = t * wallLen;

    // Clamp to valid range (door center must be at least halfWidth + minCorner from ends)
    const halfW = this.doorWidth / 2;
    const minPos = halfW + this.minCornerDist;
    const maxPos = wallLen - halfW - this.minCornerDist;
    position = Math.max(minPos, Math.min(maxPos, position));

    // Snap to grid
    const gridSize = appState.get('ui.gridSize') || 100;
    const snapToGrid = appState.get('ui.snapToGrid');
    const gridSnapped = Math.round(position / gridSize) * gridSize;

    // Snap to wall center
    const wallCenter = wallLen / 2;
    const centerSnapThreshold = this.viewport.screenToWorldDist(20); // 20px magnetic zone

    if (Math.abs(position - wallCenter) < centerSnapThreshold) {
      // Snap to center
      position = wallCenter;
      this.snapType = 'center';
    } else if (snapToGrid && Math.abs(position - gridSnapped) < centerSnapThreshold) {
      // Snap to grid
      position = Math.max(minPos, Math.min(maxPos, gridSnapped));
      this.snapType = 'grid';
    } else {
      this.snapType = null;
    }

    // Final clamp
    position = Math.max(minPos, Math.min(maxPos, position));

    this.ghostPosition = position;
    this.distFromStart = position;
    this.distFromEnd = wallLen - position;
    this.isValid = true;

    // Compute world geometry for rendering
    const halfT = wall.thickness / 2;

    // Door center on wall axis
    this.ghostCenter = {
      x: axis.start.x + udx * position,
      y: axis.start.y + udy * position,
    };

    // Door opening polygon (rectangle spanning wall thickness at door position)
    const p1Start = position - halfW;
    const p1End = position + halfW;

    const axP1 = { x: axis.start.x + udx * p1Start, y: axis.start.y + udy * p1Start };
    const axP2 = { x: axis.start.x + udx * p1End, y: axis.start.y + udy * p1End };

    this.ghostPolygon = [
      { x: axP1.x + this.wallNormX * halfT, y: axP1.y + this.wallNormY * halfT },
      { x: axP2.x + this.wallNormX * halfT, y: axP2.y + this.wallNormY * halfT },
      { x: axP2.x - this.wallNormX * halfT, y: axP2.y - this.wallNormY * halfT },
      { x: axP1.x - this.wallNormX * halfT, y: axP1.y - this.wallNormY * halfT },
    ];
  }

  /**
   * Handle click — place door at current ghost position
   * @param {{x:number,y:number}} worldPos
   * @returns {boolean} true if door was placed
   */
  onClick(worldPos) {
    // Ensure we have a valid ghost position
    this.onMouseMove(worldPos);

    if (!this.isValid || this.hoveredWallId === null || this.ghostPosition === null) {
      return false;
    }

    commandManager.execute(
      new AddDoorCommand(this.graph, this.hoveredWallId, this.ghostPosition, this.doorWidth)
    );

    // Apply hingeSide and openDirection to the just-created door
    const lastDoorId = this.graph._nextDoorId - 1;
    const door = this.graph.doors.get(lastDoorId);
    if (door) {
      door.hingeSide = this.hingeSide;
      door.openDirection = this.openDirection;
    }

    return true;
  }

  /**
   * Handle keyboard input for direction toggling
   * @param {string} key - key name
   * @returns {boolean} true if key was handled
   */
  onKeyDown(key) {
    switch (key) {
      case 'ArrowLeft':
        appState.set('doorDefaults.hingeSide', 'left');
        return true;
      case 'ArrowRight':
        appState.set('doorDefaults.hingeSide', 'right');
        return true;
      case 'ArrowUp':
        appState.set('doorDefaults.openDirection', 'A');
        return true;
      case 'ArrowDown':
        appState.set('doorDefaults.openDirection', 'B');
        return true;
    }
    return false;
  }

  /**
   * Clear the ghost state (e.g., when switching tools)
   */
  clear() {
    this.hoveredWallId = null;
    this.ghostPosition = null;
    this.ghostCenter = null;
    this.ghostPolygon = null;
    this.isValid = false;
    this.snapType = null;
  }
}
