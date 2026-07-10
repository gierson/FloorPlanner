/**
 * WallTool — Drawing tool for walls
 *
 * States: idle → drawing → idle
 *
 * Usage:
 *   Click to place wall start → click to place wall end
 *   Chain mode: continue from end of previous wall
 *   Snap to first node to close loop → triggers room detection
 *   Double-click or Enter to finish chain
 *   Escape to cancel current wall
 */
class WallTool {
  /**
   * @param {WallGraph} graph
   * @param {Viewport} viewport
   */
  constructor(graph, viewport) {
    this.graph = graph;
    this.viewport = viewport;

    /** @type {'idle'|'drawing'} */
    this.state = 'idle';

    /** @type {number|null} Start node of current wall being drawn */
    this.startNodeId = null;

    /** @type {{x:number,y:number}|null} Ghost end position (snapped mouse) */
    this.ghostEnd = null;

    /** @type {SnapResult|null} Current snap result */
    this.snapResult = null;

    /** @type {boolean} Continue from end of last wall */
    this.chainMode = true;

    /** @type {number|null} Last created node (for chain mode) */
    this._lastEndNodeId = null;

    /** @type {number|null} First node of current chain (for close detection) */
    this._chainStartNodeId = null;

    /** @type {string|null} Keyboard length input buffer (e.g. "3000", "4.5m") */
    this.lengthInput = null;

    /** @type {number} Inner mode: wall side relative to travel direction (+1 = left in y-down, F flips) */
    this.side = 1;

    /** @type {boolean} Is the current chain drawn in inner-edge mode */
    this._innerActive = false;

    /**
     * Inner mode chain state. Clicked points are FLOOR corners; wall
     * centerlines are offset outward by thickness/2, corner nodes are
     * intersections of adjacent offset lines (miter).
     * @type {{startPt:{x,y}, lastPt:{x,y}, segs:Array}|null}
     */
    this._innerChain = null;
  }

  /** Active drawing reference: 'axis' (centerline) or 'inner' (floor edge) */
  _reference() {
    return appState.get('wallDefaults.reference') || 'axis';
  }

  // ═══════════════════════════════════════════════════════════
  //  EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Handle mouse move — update ghost preview and snap
   * @param {{x:number,y:number}} worldPos - raw world position
   */
  onMouseMove(worldPos) {
    const inner = this.state === 'drawing'
      ? this._innerActive
      : this._reference() === 'inner';

    // Determine anchor for angle snap
    let anchor = null;
    if (this.state === 'drawing') {
      if (this._innerActive && this._innerChain) {
        anchor = { ...this._innerChain.lastPt };
      } else if (this.startNodeId) {
        const startNode = this.graph.nodes.get(this.startNodeId);
        if (startNode) anchor = { x: startNode.x, y: startNode.y };
      }
    }

    // Apply snap — in inner mode clicked points are floor corners,
    // so snapping to centerline nodes/edges would mix reference frames
    this.snapResult = SnapSystem.snap(worldPos, this.graph, this.viewport, {
      anchor,
      snapToGrid: appState.get('ui.snapToGrid'),
      gridSize: appState.get('ui.gridSize'),
      angleSnap: true,
      nodeSnap: !inner,
      edgeSnap: !inner,
    });

    this.ghostEnd = { x: this.snapResult.x, y: this.snapResult.y };
  }

  /**
   * Handle mouse click — place wall endpoint
   * @param {{x:number,y:number}} worldPos - raw world position
   */
  onClick(worldPos) {
    // Apply snap first
    this.onMouseMove(worldPos);
    const snap = this.snapResult;
    if (!snap) return;

    if (this.state === 'idle') {
      this._startDrawing(snap);
    } else if (this.state === 'drawing') {
      this._placeEndpoint(snap);
    }
  }

  /**
   * Handle double click — finish chain
   */
  onDoubleClick() {
    this._finishChain();
  }

  /**
   * Handle key press (Escape / Enter)
   * @param {string} key
   */
  onKeyDown(key) {
    switch (key) {
      case 'Escape':
        if (this.lengthInput !== null) {
          // First Escape: cancel the length input, keep drawing
          this.lengthInput = null;
        } else {
          this._cancelCurrent();
        }
        break;
      case 'Enter':
        if (this.lengthInput !== null && this.state === 'drawing') {
          this._placeByLength();
        } else {
          this._finishChain();
        }
        break;
    }
  }

  /**
   * Handle keyboard input for length entry during drawing.
   * Called for digit keys, dots, commas, unit letters, and Backspace.
   * @param {string} key - the key that was pressed
   * @returns {boolean} true if the key was consumed
   */
  onKeyPress(key) {
    if (this.state !== 'drawing') return false;

    // Digits, dot, comma
    if (/^[0-9]$/.test(key) || key === '.' || key === ',') {
      if (this.lengthInput === null) this.lengthInput = '';
      this.lengthInput += key;
      return true;
    }

    // Inner mode: flip wall side
    if ((key === 'f' || key === 'F') && this._innerActive) {
      this.side = -this.side;
      return true;
    }

    // Unit letters (m, c for cm)
    if (key === 'm' || key === 'c') {
      if (this.lengthInput !== null) {
        this.lengthInput += key;
        return true;
      }
      return false;
    }

    // Backspace
    if (key === 'Backspace') {
      if (this.lengthInput !== null) {
        this.lengthInput = this.lengthInput.slice(0, -1);
        if (this.lengthInput.length === 0) this.lengthInput = null;
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Compute endpoint position based on typed length and current mouse direction.
   * Pure computation — no side effects.
   * @param {number} lengthMm - desired wall length in mm
   * @returns {{x:number, y:number}} computed endpoint in world coords
   */
  _computeLengthEndpoint(lengthMm) {
    if (!this.ghostEnd) return this.ghostEnd;

    // Base point: inner mode measures from the floor corner, axis mode from the node
    let base = null;
    if (this._innerActive && this._innerChain) {
      base = this._innerChain.lastPt;
    } else {
      const startNode = this.graph.nodes.get(this.startNodeId);
      if (startNode) base = { x: startNode.x, y: startNode.y };
    }
    if (!base) return this.ghostEnd;

    // Direction angle from base to current mouse position
    const angle = Math.atan2(
      this.ghostEnd.y - base.y,
      this.ghostEnd.x - base.x
    );

    return {
      x: Math.round(base.x + Math.cos(angle) * lengthMm),
      y: Math.round(base.y + Math.sin(angle) * lengthMm),
    };
  }

  /**
   * Place wall endpoint using the typed length + mouse direction.
   * @private
   */
  _placeByLength() {
    if (!this.lengthInput || this.state !== 'drawing') return;

    const parsedMm = DimensionInput.parse(this.lengthInput);
    const validation = DimensionInput.validate(parsedMm, 50, 30000);

    if (!validation.valid) {
      // Invalid input — clear and stay in drawing mode
      this.lengthInput = null;
      return;
    }

    // Compute endpoint
    const ep = this._computeLengthEndpoint(parsedMm);

    // Create snap-like object for _placeEndpoint
    const snap = { x: ep.x, y: ep.y, type: 'grid' };

    // Clear length input before placing (avoid re-trigger)
    this.lengthInput = null;

    // Reuse existing placement logic
    this._placeEndpoint(snap);
  }

  // ═══════════════════════════════════════════════════════════
  //  DRAWING LOGIC
  // ═══════════════════════════════════════════════════════════

  /**
   * Start drawing from a point
   * @private
   */
  _startDrawing(snap) {
    // Graph state before the chain's first mutation (start node / wall split) —
    // consumed by the first placed wall so its undo removes the start node too
    this._pendingBefore = this.graph.serialize();

    if (this._reference() === 'inner') {
      // Inner mode: the clicked point is a FLOOR corner; nodes are
      // created lazily when the first segment direction is known
      this._innerActive = true;
      this._innerChain = {
        startPt: { x: snap.x, y: snap.y },
        lastPt: { x: snap.x, y: snap.y },
        segs: [],
      };
      this.startNodeId = null;
      this._chainStartNodeId = null;
      this.state = 'drawing';
      return;
    }

    let nodeId;

    if (snap.type === 'node') {
      // Snap to existing node
      nodeId = snap.nodeId;
    } else if (snap.type === 'edge') {
      // Split wall to create T-junction
      nodeId = this.graph.splitWall(snap.wallId, { x: snap.x, y: snap.y });
    } else {
      // Create new node
      nodeId = this.graph.addNode(snap.x, snap.y);
    }

    this.startNodeId = nodeId;
    this._chainStartNodeId = nodeId;
    this.state = 'drawing';
  }

  /**
   * Place the end of the current wall
   * @private
   */
  _placeEndpoint(snap) {
    if (this._innerActive) {
      this._placeInnerEndpoint({ x: snap.x, y: snap.y });
      return;
    }

    // State before this wall's mutations (first wall: before the start node)
    const before = this._pendingBefore || this.graph.serialize();
    this._pendingBefore = null;

    let endNodeId;

    if (snap.type === 'node') {
      endNodeId = snap.nodeId;
    } else if (snap.type === 'edge') {
      endNodeId = this.graph.splitWall(snap.wallId, { x: snap.x, y: snap.y });
    } else {
      endNodeId = this.graph.addNode(snap.x, snap.y);
    }

    // Don't create zero-length wall
    if (endNodeId === this.startNodeId) {
      this._pendingBefore = before;
      return;
    }

    // Create wall
    const config = {
      thickness: appState.get('wallDefaults.thickness') || 150,
      type: appState.get('wallDefaults.type') || 'interior',
    };

    const wallId = this.graph.addWall(this.startNodeId, endNodeId, config);

    // Execute as command for undo
    if (wallId > 0) {
      commandManager.execute(new AddWallCommand(this.graph, wallId, before));
    }

    this._lastEndNodeId = endNodeId;

    // Check if we closed a loop
    if (endNodeId === this._chainStartNodeId && this._chainStartNodeId !== null) {
      // Closed! Detect rooms
      this._finishChain();
      return;
    }

    // Chain mode: start next wall from this endpoint
    if (this.chainMode) {
      this.startNodeId = endNodeId;
      // Stay in drawing state
    } else {
      this.state = 'idle';
      this.startNodeId = null;
    }

    // Notify state change
    eventBus.emit('wall:add', { wallId });
    eventBus.emit('graph:change');
  }

  /**
   * Place a segment endpoint in inner-edge mode.
   *
   * pt is a FLOOR corner. The wall centerline is the interior segment
   * offset by thickness/2 to this.side. Shared corner nodes are moved
   * to the intersection of adjacent offset lines (miter) — the miter
   * point lies on both centerlines, so already placed walls only
   * lengthen/shorten, never skew.
   * @private
   */
  _placeInnerEndpoint(pt) {
    const chain = this._innerChain;
    if (!chain) return;

    const a = chain.lastPt;

    // Close the loop when clicking near the chain's starting floor corner
    const closeThreshold = this.viewport.screenToWorldDist(20);
    const closing = chain.segs.length >= 2 &&
      Geometry.distance(pt, chain.startPt) < closeThreshold;

    const b = closing ? { ...chain.startPt } : { x: pt.x, y: pt.y };
    const len = Geometry.distance(a, b);
    if (len < 1) return;

    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const thickness = appState.get('wallDefaults.thickness') || 150;
    const halfT = thickness / 2;
    // Offset from interior line to wall centerline (side: +1 = left of travel in y-down)
    const off = { x: d.y * halfT * this.side, y: -d.x * halfT * this.side };

    const prev = chain.segs[chain.segs.length - 1] || null;

    // State before this segment's mutations (node adds / miter moves)
    const before = this._pendingBefore || this.graph.serialize();
    this._pendingBefore = null;

    // Start node: first segment creates it at the perpendicular offset;
    // later segments reuse the previous end node, slid to the miter point
    let startNodeId;
    if (!prev) {
      startNodeId = this.graph.addNode(Math.round(a.x + off.x), Math.round(a.y + off.y));
    } else {
      startNodeId = prev.endNodeId;
      const m = Geometry._lineIntersection(
        { x: prev.a.x + prev.off.x, y: prev.a.y + prev.off.y },
        { x: prev.a.x + prev.off.x + prev.d.x, y: prev.a.y + prev.off.y + prev.d.y },
        { x: a.x + off.x, y: a.y + off.y },
        { x: a.x + off.x + d.x, y: a.y + off.y + d.y }
      );
      if (m) this.graph.moveNode(startNodeId, Math.round(m.x), Math.round(m.y));
    }

    let endNodeId;
    if (closing) {
      // Reuse the first node and slide it to the miter of the closing
      // segment with the first segment
      const first = chain.segs[0];
      endNodeId = first.startNodeId;
      const m0 = Geometry._lineIntersection(
        { x: a.x + off.x, y: a.y + off.y },
        { x: a.x + off.x + d.x, y: a.y + off.y + d.y },
        { x: first.a.x + first.off.x, y: first.a.y + first.off.y },
        { x: first.a.x + first.off.x + first.d.x, y: first.a.y + first.off.y + first.d.y }
      );
      if (m0) this.graph.moveNode(endNodeId, Math.round(m0.x), Math.round(m0.y));
    } else {
      endNodeId = this.graph.addNode(Math.round(b.x + off.x), Math.round(b.y + off.y));
    }

    if (endNodeId === startNodeId) return;

    const config = {
      thickness,
      type: appState.get('wallDefaults.type') || 'interior',
    };
    const wallId = this.graph.addWall(startNodeId, endNodeId, config);
    if (wallId > 0) {
      commandManager.execute(new AddWallCommand(this.graph, wallId, before));
    }

    chain.segs.push({ a: { ...a }, b: { ...b }, d, off, startNodeId, endNodeId });
    chain.lastPt = { ...b };
    this._lastEndNodeId = endNodeId;

    if (closing) {
      this._finishChain();
      return;
    }

    if (!this.chainMode) {
      this.state = 'idle';
      this._innerActive = false;
      this._innerChain = null;
    }

    eventBus.emit('wall:add', { wallId });
    eventBus.emit('graph:change');
  }

  /**
   * Finish the current chain (stop drawing)
   * @private
   */
  _finishChain() {
    this.state = 'idle';
    this.startNodeId = null;
    this._chainStartNodeId = null;
    this.ghostEnd = null;
    this.snapResult = null;
    this._innerActive = false;
    this._innerChain = null;

    // Trigger room re-detection
    eventBus.emit('graph:change');
  }

  /**
   * Cancel the current wall (not the whole chain)
   * @private
   */
  _cancelCurrent() {
    if (this.state === 'drawing') {
      this.state = 'idle';
      this.startNodeId = null;
      this._chainStartNodeId = null;
      this.ghostEnd = null;
      this.snapResult = null;
      this._innerActive = false;
      this._innerChain = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDERING DATA
  // ═══════════════════════════════════════════════════════════

  /**
   * Get data needed to render the drawing preview
   * @returns {WallToolPreview|null}
   */
  getPreview() {
    if (this.state !== 'drawing' || !this.ghostEnd) {
      return null;
    }

    let start;
    if (this._innerActive && this._innerChain) {
      start = { ...this._innerChain.lastPt };
    } else {
      if (!this.startNodeId) return null;
      const startNode = this.graph.nodes.get(this.startNodeId);
      if (!startNode) return null;
      start = { x: startNode.x, y: startNode.y };
    }

    // If length input is active, compute endpoint from typed length + direction
    let end = this.ghostEnd;
    let lengthInputText;
    if (this.lengthInput !== null) {
      lengthInputText = this.lengthInput;
      const parsedMm = DimensionInput.parse(this.lengthInput);
      if (parsedMm !== null && parsedMm > 0) {
        end = this._computeLengthEndpoint(parsedMm);
      }
    }

    const length = Geometry.distance(start, end);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    // Compute wall polygon preview
    const thickness = appState.get('wallDefaults.thickness') || 150;
    const halfT = thickness / 2;
    const len = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    let polygon = null;

    if (len > 0.1) {
      if (this._innerActive) {
        // Inner mode: the drawn line is the floor edge — the wall band
        // lies entirely on this.side of it (full thickness)
        const nx = (end.y - start.y) / len * thickness * this.side;
        const ny = -(end.x - start.x) / len * thickness * this.side;
        polygon = [
          { x: start.x, y: start.y },
          { x: end.x,   y: end.y },
          { x: end.x + nx,   y: end.y + ny },
          { x: start.x + nx, y: start.y + ny },
        ];
      } else {
        const nx = -(end.y - start.y) / len * halfT;
        const ny = (end.x - start.x) / len * halfT;
        polygon = [
          { x: start.x + nx, y: start.y + ny },
          { x: end.x + nx,   y: end.y + ny },
          { x: end.x - nx,   y: end.y - ny },
          { x: start.x - nx, y: start.y - ny },
        ];
      }
    }

    // Check if near chain start (close indicator)
    let canClose = false;
    if (this._innerActive && this._innerChain) {
      canClose = this._innerChain.segs.length >= 2 &&
        Geometry.distance(end, this._innerChain.startPt) < this.viewport.screenToWorldDist(20);
    } else if (this._chainStartNodeId && this._chainStartNodeId !== this.startNodeId) {
      const chainStart = this.graph.nodes.get(this._chainStartNodeId);
      if (chainStart) {
        const closeDist = Geometry.distance(end, chainStart);
        canClose = closeDist < this.viewport.screenToWorldDist(20);
      }
    }

    const result = {
      start,
      end,
      length,
      angle,
      polygon,
      thickness,
      snap: this.snapResult,
      canClose,
      chainStartNodeId: this._chainStartNodeId,
    };

    if (lengthInputText !== undefined) {
      result.lengthInputText = lengthInputText;
    }

    return result;
  }
}
