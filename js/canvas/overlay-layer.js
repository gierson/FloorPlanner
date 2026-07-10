/**
 * OverlayLayer — Interactive drawing/cursor layer (topmost canvas)
 * @description Handles mouse events for drawing rooms, rubber-band lines,
 *              snap indicators, coordinate display, and vertex dragging.
 */
class OverlayLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Viewport} viewport
   * @param {RoomLayer} roomLayer
   */
  constructor(canvas, viewport, roomLayer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;
    this.roomLayer = roomLayer;
    this.dpr = window.devicePixelRatio || 1;

    /** @type {{x:number,y:number}|null} Current mouse position in world coords */
    this.mouseWorld = null;
    /** @type {{x:number,y:number}|null} Snapped mouse position */
    this.mouseSnapped = null;

    // Vertex dragging state
    this._dragging = null; // { roomId, vertexIndex, startPos }
    this._dragStarted = false;

    this._resizeCanvas();
    this._setupListeners();
  }

  /** @private */
  _resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.scale(this.dpr, this.dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  /** @private */
  _setupListeners() {
    const canvas = this.canvas;

    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));

    document.addEventListener('keydown', (e) => this._onKeyDown(e));

    eventBus.on('viewport:change', () => this.render());
    eventBus.on('state:change', (d) => {
      if (d.path === 'tool' || d.path === 'drawing.vertices' || d.path === 'ui.snapToGrid') {
        this.render();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      this._resizeCanvas();
      this.render();
    });
    resizeObserver.observe(canvas.parentElement);
  }

  /**
   * Get snapped or raw world position from mouse event
   * @private
   */
  _getWorldPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.viewport.screenToWorld(screenX, screenY);

    if (appState.get('ui.snapToGrid')) {
      const gridSize = appState.get('ui.gridSize');
      return Geometry.snapPointToGrid(world, gridSize);
    }
    return { x: Math.round(world.x), y: Math.round(world.y) };
  }

  /** @private */
  _onMouseMove(e) {
    if (this.viewport.isPanning) return;

    const worldPos = this._getWorldPos(e);
    this.mouseWorld = worldPos;
    this.mouseSnapped = worldPos;

    // Update coordinate display
    const coordsEl = document.getElementById('cursor-coords');
    if (coordsEl) {
      coordsEl.textContent = `X: ${worldPos.x}  Y: ${worldPos.y}`;
    }

    // Vertex dragging
    if (this._dragging && this._dragStarted) {
      appState.updateRoomVertices(
        this._dragging.roomId,
        appState.getRoom(this._dragging.roomId).vertices.map((v, i) =>
          i === this._dragging.vertexIndex ? { ...worldPos } : v
        )
      );
    }

    this.render();
  }

  /** @private */
  _onMouseDown(e) {
    if (e.button !== 0 || this.viewport.isPanning) return;

    const tool = appState.get('tool');
    const worldPos = this._getWorldPos(e);

    switch (tool) {
      case 'draw':
        this._handleDrawClick(worldPos);
        break;
      case 'select':
        this._handleSelectDown(worldPos);
        break;
      case 'delete':
        this._handleDeleteClick(worldPos);
        break;
    }
  }

  /** @private */
  _onMouseUp(e) {
    if (e.button !== 0) return;

    if (this._dragging && this._dragStarted) {
      const worldPos = this._getWorldPos(e);
      // Create undo command
      commandManager.execute(
        new MoveVertexCommand(
          this._dragging.roomId,
          this._dragging.vertexIndex,
          this._dragging.startPos,
          worldPos
        )
      );
      // The execute above will re-apply the move; we need to prevent double-move
      // Actually the vertices are already at the new position from mousemove,
      // and the command.execute() will set them again — this is fine.
    }
    this._dragging = null;
    this._dragStarted = false;
  }

  /** @private */
  _onDoubleClick(e) {
    const tool = appState.get('tool');
    if (tool === 'draw') {
      this._finishDrawing();
    }
  }

  /** @private */
  _onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    const tool = appState.get('tool');

    switch (e.key) {
      case 'Escape':
        if (tool === 'draw' && appState.get('drawing.isActive')) {
          appState.set('drawing.isActive', false);
          appState.set('drawing.vertices', []);
          this.render();
        }
        break;

      case 'Enter':
        if (tool === 'draw') {
          this._finishDrawing();
        }
        break;

      case 'n':
      case 'N':
        appState.set('tool', 'draw');
        this.canvas.parentElement.dataset.tool = 'draw';
        eventBus.emit('tool:change', 'draw');
        break;

      case 'v':
      case 'V':
        appState.set('tool', 'select');
        this.canvas.parentElement.dataset.tool = 'select';
        eventBus.emit('tool:change', 'select');
        break;

      case 'Delete':
      case 'Backspace':
        if (tool === 'select') {
          const selectedId = appState.get('selectedRoomId');
          if (selectedId) {
            commandManager.execute(new DeleteRoomCommand(selectedId));
          }
        }
        break;

      case 'g':
      case 'G':
        appState.set('ui.snapToGrid', !appState.get('ui.snapToGrid'));
        const snapCheckbox = document.getElementById('snap-grid');
        if (snapCheckbox) snapCheckbox.checked = appState.get('ui.snapToGrid');
        break;

      case 'z':
      case 'Z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            commandManager.redo();
          } else {
            commandManager.undo();
          }
        }
        break;
    }
  }

  // ── Drawing Logic ──

  /** @private */
  _handleDrawClick(worldPos) {
    const drawing = appState.get('drawing');
    const vertices = drawing.vertices || [];

    if (!drawing.isActive) {
      // Start new drawing
      appState.set('drawing.isActive', true);
      appState.set('drawing.vertices', [worldPos]);
    } else {
      // Check if closing the polygon (click near first vertex)
      if (vertices.length >= 3) {
        const first = vertices[0];
        const dist = Geometry.distance(worldPos, first);
        const closeThreshold = this.viewport.screenToWorldDist(15);

        if (dist < closeThreshold) {
          this._finishDrawing();
          return;
        }
      }

      // Add vertex
      appState.set('drawing.vertices', [...vertices, worldPos]);
    }
    this.render();
  }

  /** @private */
  _finishDrawing() {
    const vertices = appState.get('drawing.vertices') || [];
    if (vertices.length < 3) return;

    // Create room via command (undoable)
    const cmd = new AddRoomCommand(vertices);
    commandManager.execute(cmd);

    // Reset drawing state
    appState.set('drawing.isActive', false);
    appState.set('drawing.vertices', []);
    this.render();
  }

  // ── Select Logic ──

  /** @private */
  _handleSelectDown(worldPos) {
    // First check vertex hit
    const vertexHit = this.roomLayer.hitTestVertex(worldPos);
    if (vertexHit) {
      this._dragging = {
        roomId: vertexHit.roomId,
        vertexIndex: vertexHit.vertexIndex,
        startPos: { ...vertexHit.vertex },
      };
      this._dragStarted = true;
      return;
    }

    // Then check room hit
    const roomHit = this.roomLayer.hitTestRoom(worldPos);
    if (roomHit) {
      appState.set('selectedRoomId', roomHit.id);
    } else {
      appState.set('selectedRoomId', null);
    }
  }

  // ── Delete Logic ──

  /** @private */
  _handleDeleteClick(worldPos) {
    const roomHit = this.roomLayer.hitTestRoom(worldPos);
    if (roomHit) {
      commandManager.execute(new DeleteRoomCommand(roomHit.id));
    }
  }

  // ── Rendering ──

  /**
   * Render the overlay (drawing preview, snap indicator, close indicator)
   */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const tool = appState.get('tool');
    const drawing = appState.get('drawing');

    // Draw active drawing preview
    if (tool === 'draw' && drawing.isActive && drawing.vertices.length > 0) {
      this._renderDrawingPreview(ctx, drawing.vertices);
    }

    // Draw snap indicator
    if (this.mouseSnapped && appState.get('ui.snapToGrid') && tool === 'draw') {
      this._renderSnapIndicator(ctx);
    }
  }

  /**
   * Render the polygon being drawn
   * @private
   */
  _renderDrawingPreview(ctx, vertices) {
    const vp = this.viewport;
    const screenVerts = vertices.map(v => vp.worldToScreen(v.x, v.y));

    if (screenVerts.length === 0) return;

    // Draw completed edges
    ctx.beginPath();
    ctx.moveTo(screenVerts[0].x, screenVerts[0].y);
    for (let i = 1; i < screenVerts.length; i++) {
      ctx.lineTo(screenVerts[i].x, screenVerts[i].y);
    }
    ctx.strokeStyle = '#E8A849';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    // Rubber band line to cursor
    if (this.mouseSnapped) {
      const mouseScreen = vp.worldToScreen(this.mouseSnapped.x, this.mouseSnapped.y);
      const last = screenVerts[screenVerts.length - 1];

      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(mouseScreen.x, mouseScreen.y);
      ctx.strokeStyle = 'rgba(232, 168, 73, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Close line (from cursor back to first vertex) — dashed
      if (screenVerts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(mouseScreen.x, mouseScreen.y);
        ctx.lineTo(screenVerts[0].x, screenVerts[0].y);
        ctx.strokeStyle = 'rgba(232, 168, 73, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Dimension label on rubber band
      const worldDist = Geometry.distance(
        vertices[vertices.length - 1],
        this.mouseSnapped
      );
      if (worldDist > 10) {
        const mid = Geometry.midpoint(last, mouseScreen);
        const label = Geometry.formatDimension(worldDist, worldDist >= 100);

        ctx.font = `500 10px 'JetBrains Mono', monospace`;
        ctx.fillStyle = 'rgba(232, 168, 73, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, mid.x, mid.y - 6);
      }

      // Close indicator (when near first vertex)
      if (screenVerts.length >= 3) {
        const dist = Geometry.distance(
          { x: mouseScreen.x, y: mouseScreen.y },
          screenVerts[0]
        );
        if (dist < 20) {
          ctx.beginPath();
          ctx.arc(screenVerts[0].x, screenVerts[0].y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = '#34D399';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
          ctx.fill();
        }
      }
    }

    // Vertex dots
    for (const sv of screenVerts) {
      ctx.beginPath();
      ctx.arc(sv.x, sv.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#E8A849';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sv.x, sv.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232, 168, 73, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /**
   * Render snap-to-grid indicator
   * @private
   */
  _renderSnapIndicator(ctx) {
    if (!this.mouseSnapped) return;

    const screen = this.viewport.worldToScreen(this.mouseSnapped.x, this.mouseSnapped.y);

    // Crosshair
    const size = 8;
    ctx.strokeStyle = 'rgba(232, 168, 73, 0.4)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(screen.x - size, screen.y);
    ctx.lineTo(screen.x + size, screen.y);
    ctx.moveTo(screen.x, screen.y - size);
    ctx.lineTo(screen.x, screen.y + size);
    ctx.stroke();

    // Dot
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232, 168, 73, 0.6)';
    ctx.fill();
  }
}
