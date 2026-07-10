/**
 * FloorPlannerApp — Facade orchestrator (wall-based edition)
 * @description Initializes wall graph, canvas layers, tools, and events.
 */
class FloorPlannerApp {
  constructor() {
    console.log('[FloorPlanner] Initializing (wall-based)...');

    // Canvas elements
    const container = document.getElementById('canvas-container');
    const gridCanvas = document.getElementById('grid-canvas');
    const wallCanvas = document.getElementById('room-canvas'); // reuse room-canvas
    const layoutCanvas = document.getElementById('layout-canvas');
    const overlayCanvas = document.getElementById('overlay-canvas');

    if (!container || !gridCanvas || !wallCanvas || !layoutCanvas || !overlayCanvas) {
      console.error('[FloorPlanner] Missing canvas elements!');
      return;
    }

    // ── Wall Graph (core data model) ──
    this.graph = new WallGraph();
    window._wallGraph = this.graph; // expose for debugging

    // ── Initialize modules ──
    this.viewport = new Viewport(container);
    window._viewport = this.viewport;

    // Canvas layers
    this.gridLayer = new GridLayer(gridCanvas, this.viewport);
    this.wallLayer = new WallLayer(wallCanvas, this.viewport);
    this.wallLayer.setGraph(this.graph);
    this.layoutLayer = new LayoutLayer(layoutCanvas, this.viewport);

    // Wall drawing tool
    this.wallTool = new WallTool(this.graph, this.viewport);
    this.wallLayer.setWallTool(this.wallTool);

    // Door placement tool
    this.doorTool = new DoorTool(this.graph, this.viewport);
    this.wallLayer.setDoorTool(this.doorTool);

    // Overlay (mouse events, drawing interaction)
    this.overlayLayer = new WallOverlayLayer(overlayCanvas, this.viewport, this);

    // UI components
    this.toolbar = new Toolbar();
    this.sidebar = new Sidebar();
    this.summaryPanel = new SummaryPanel();

    // ── Project Manager ──
    this.projectManager = new ProjectManager(this.graph);
    this.projectPanel = new ProjectPanel(this.projectManager);

    // ── Wire up events ──
    this._setupOptimization();
    this._setupLayoutClear();

    // Start autosave (every 30s)
    this.projectManager.startAutosave(30000);

    // Check for autosave recovery
    this._checkAutosave();

    console.log('[FloorPlanner] Ready ✓ (wall-based)');
  }

  /**
   * Check for autosave data and offer recovery
   * @private
   */
  _checkAutosave() {
    const autosave = this.projectManager.getAutosave();
    if (autosave && autosave.graph &&
        (autosave.graph.nodes.length > 0 || autosave.graph.walls.length > 0)) {
      const date = autosave.updatedAt
        ? new Date(autosave.updatedAt).toLocaleString('pl-PL')
        : 'nieznana data';
      if (confirm(`Znaleziono automatycznie zapisany projekt "${autosave.name || 'Bez nazwy'}" (${date}). Czy chcesz go przywrócić?`)) {
        this.projectManager.loadSnapshot(autosave);
        this.projectManager.clearAutosave();
      } else {
        this.projectManager.clearAutosave();
      }
    }
  }

  /**
   * Handle optimization request
   * Uses floor zones (merged room polygons) instead of raw rooms
   * @private
   */
  _setupOptimization() {
    /**
     * Stored context from last optimization — used for manual offset adjustment.
     * @type {{ insetPolygons: Map<id, polygon>, config: Object, optimizedOffsets: Map<id, {x,y}>, zones: Array } | null}
     */
    this._lastOptimizationContext = null;

    eventBus.on('optimize:request', () => {
      // Get floor zones from the wall graph
      const zones = this.graph.findFloorZones();
      if (zones.length === 0) {
        console.warn('[FloorPlanner] No rooms detected — draw walls to form closed rooms');
        return;
      }

      console.log(`[FloorPlanner] Optimizing ${zones.length} floor zone(s)...`);

      const config = {
        panelLength: appState.get('material.length'),
        panelWidth: appState.get('material.width'),
        expansionGap: appState.get('laying.expansionGap'),
        minCutWidth: appState.get('laying.minCutWidth'),
        minCutLength: appState.get('laying.minCutLength'),
        direction: appState.get('laying.direction'),
        stagger: appState.get('laying.stagger'),
        pattern: appState.get('laying.pattern') || 'straight',
      };

      try {
        // Convert floor zones to "rooms" format for the optimizer
        const rooms = zones.map(zone => ({
          id: zone.id,
          name: zone.name,
          vertices: zone.polygon, // innerPolygon or merged polygon
          wallIds: zone.wallIds,  // per-edge wall IDs (null = door opening)
        }));

        const result = layoutOptimizer.optimizeAll(rooms, config);

        // Store optimization context for manual offset adjustments
        const insetPolygons = new Map();
        const optimizedOffsets = new Map();
        for (const [roomId, roomResult] of result.results) {
          insetPolygons.set(roomId, roomResult.insetPolygon);
          optimizedOffsets.set(roomId, {
            x: roomResult.bestOffsetX,
            y: roomResult.bestOffsetY,
          });
        }
        this._lastOptimizationContext = { insetPolygons, config, optimizedOffsets, zones };

        // Reset manual offsets to optimizer values
        // Use the first room's optimized offset as the global offset
        const firstOffset = optimizedOffsets.values().next().value || { x: 0, y: 0 };
        appState.batch({
          'laying.manualOffsetX': firstOffset.x,
          'laying.manualOffsetY': firstOffset.y,
        });

        // Store result
        appState.set('layout', result);

        // Update layout layer
        this.layoutLayer.setLayouts(result.results);

        // Update summary panel
        eventBus.emit('optimize:done', result);

        console.log('[FloorPlanner] Optimization complete:', result.aggregateStats);

        if (result.warnings.length > 0) {
          console.warn(`[FloorPlanner] ${result.warnings.length} warning(s):`,
            result.warnings.map(w => w.message));
        }
      } catch (err) {
        console.error('[FloorPlanner] Optimization failed:', err);
      }
    });

    // Manual offset adjustment — re-layout without full grid search
    eventBus.on('layout:adjust', ({ offsetX, offsetY }) => {
      const ctx = this._lastOptimizationContext;
      if (!ctx) {
        console.warn('[FloorPlanner] No optimization context — run optimization first');
        return;
      }

      console.log(`[FloorPlanner] Adjusting floor offset: X=${offsetX}, Y=${offsetY}`);

      try {
        const results = new Map();
        const statsList = [];
        const allWarnings = [];

        for (const [roomId, insetPoly] of ctx.insetPolygons) {
          const layout = LayoutEngine.generateLayout(insetPoly, {
            ...ctx.config,
            offsetX,
            offsetY,
          });

          results.set(roomId, {
            ...layout,
            insetPolygon: insetPoly,
            bestOffsetX: offsetX,
            bestOffsetY: offsetY,
          });

          statsList.push(layout.stats);

          for (const w of (layout.stats.warnings || [])) {
            const zone = ctx.zones.find(z => z.id === roomId);
            allWarnings.push({ ...w, roomId, roomName: zone ? zone.name : `Strefa ${roomId}` });
          }
        }

        const adjustedResult = {
          results,
          aggregateStats: WasteCalculator.aggregate(statsList),
          warnings: allWarnings,
        };

        // Update state and UI
        appState.set('layout', adjustedResult);
        this.layoutLayer.setLayouts(adjustedResult.results);
        eventBus.emit('optimize:done', adjustedResult);

        console.log('[FloorPlanner] Offset adjustment complete:', adjustedResult.aggregateStats);
      } catch (err) {
        console.error('[FloorPlanner] Offset adjustment failed:', err);
      }
    });
  }

  /**
   * Clear layout when wall graph changes
   * @private
   */
  _setupLayoutClear() {
    eventBus.on('layout:clear', () => {
      appState.set('layout', null);
      this.layoutLayer.clear();
      this._lastOptimizationContext = null;
      appState.batch({
        'laying.manualOffsetX': null,
        'laying.manualOffsetY': null,
      });
    });

    // Clear layout when walls change
    eventBus.on('graph:change', () => {
      // Update detected rooms in state (for sidebar)
      const rooms = this.graph.findRooms();
      appState.set('detectedRooms', rooms);
      eventBus.emit('layout:clear');
    });
  }
}

/**
 * WallOverlayLayer — Mouse interaction layer for wall-based editing
 * Handles wall drawing, selecting, deleting, dimension editing.
 */
class WallOverlayLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Viewport} viewport
   * @param {FloorPlannerApp} app
   */
  constructor(canvas, viewport, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;
    this.app = app;
    this.dpr = window.devicePixelRatio || 1;

    this.mouseWorld = null;

    // Drag state for node moving
    this._dragging = null; // { nodeId, startPos }
    this._dragStarted = false;

    this._resizeCanvas();
    this._setupListeners();
  }

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

  _setupListeners() {
    const canvas = this.canvas;

    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));

    document.addEventListener('keydown', (e) => this._onKeyDown(e));

    eventBus.on('viewport:change', () => this._render());
    eventBus.on('graph:change', () => this._render());
    eventBus.on('state:change', (d) => {
      if (d.path === 'tool') this._render();
    });

    const resizeObserver = new ResizeObserver(() => {
      this._resizeCanvas();
      this._render();
    });
    resizeObserver.observe(canvas.parentElement);
  }

  _getWorldPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return this.viewport.screenToWorld(screenX, screenY);
  }

  _onMouseMove(e) {
    if (this.viewport.isPanning) return;

    const worldPos = this._getWorldPos(e);
    this.mouseWorld = worldPos;

    const tool = appState.get('tool');

    // Update coordinate display
    const coordsEl = document.getElementById('cursor-coords');
    if (coordsEl) {
      coordsEl.textContent = `X: ${Math.round(worldPos.x)}  Y: ${Math.round(worldPos.y)}`;
    }

    if (tool === 'wall') {
      this.app.wallTool.onMouseMove(worldPos);
      this.app.wallLayer.render();
    }

    if (tool === 'door') {
      this.app.doorTool.onMouseMove(worldPos);
      this.app.wallLayer.render();
    }

    // Node dragging
    if (this._dragging && this._dragStarted) {
      const snap = SnapSystem.snap(worldPos, this.app.graph, this.viewport, {
        snapToGrid: appState.get('ui.snapToGrid'),
        gridSize: appState.get('ui.gridSize'),
      });
      this.app.graph.moveNode(this._dragging.nodeId, snap.x, snap.y);
      this.app.wallLayer.render();
    }

    this._render();
  }

  _onMouseDown(e) {
    if (e.button !== 0 || this.viewport.isPanning) return;

    const tool = appState.get('tool');
    const worldPos = this._getWorldPos(e);

    switch (tool) {
      case 'wall':
        this.app.wallTool.onClick(worldPos);
        this.app.wallLayer.render();
        break;

      case 'select': {
        // Try node hit first
        const nodeHit = this.app.wallLayer.hitTestNode(worldPos);
        if (nodeHit) {
          const node = this.app.graph.nodes.get(nodeHit.nodeId);
          this._dragging = { nodeId: nodeHit.nodeId, startPos: { x: node.x, y: node.y } };
          this._dragStarted = true;
          appState.set('selectedNodeId', nodeHit.nodeId);
          appState.set('selectedWallId', null);
          appState.set('selectedDoorId', null);
          return;
        }

        // Then door hit
        const doorHit = this.app.wallLayer.hitTestDoor(worldPos);
        if (doorHit) {
          appState.set('selectedDoorId', doorHit.doorId);
          appState.set('selectedWallId', null);
          appState.set('selectedNodeId', null);
          return;
        }

        // Then wall hit
        const wallHit = this.app.wallLayer.hitTestWall(worldPos);
        if (wallHit) {
          appState.set('selectedWallId', wallHit.wallId);
          appState.set('selectedNodeId', null);
          appState.set('selectedDoorId', null);
          return;
        }

        // Deselect
        appState.set('selectedWallId', null);
        appState.set('selectedNodeId', null);
        appState.set('selectedDoorId', null);
        break;
      }

      case 'delete': {
        const wallHit = this.app.wallLayer.hitTestWall(worldPos);
        if (wallHit) {
          commandManager.execute(new RemoveWallCommand(this.app.graph, wallHit.wallId));
        }
        break;
      }

      case 'door': {
        // Place door via DoorTool (with ghost preview snap)
        if (this.app.doorTool.onClick(worldPos)) {
          this.app.wallLayer.render();
        }
        break;
      }
    }
  }

  _onMouseUp(e) {
    if (e.button !== 0) return;

    if (this._dragging && this._dragStarted) {
      const snap = SnapSystem.snap(this._getWorldPos(e), this.app.graph, this.viewport, {
        snapToGrid: appState.get('ui.snapToGrid'),
        gridSize: appState.get('ui.gridSize'),
      });
      commandManager.execute(new MoveNodeCommand(
        this.app.graph,
        this._dragging.nodeId,
        this._dragging.startPos,
        { x: snap.x, y: snap.y }
      ));
    }
    this._dragging = null;
    this._dragStarted = false;
  }

  _onDoubleClick(e) {
    const tool = appState.get('tool');
    if (tool === 'wall') {
      this.app.wallTool.onDoubleClick();
      this.app.wallLayer.render();
    } else if (tool === 'select') {
      // Double-click on a wall dimension → open inline input
      const worldPos = this._getWorldPos(e);
      const wallHit = this.app.wallLayer.hitTestWall(worldPos);
      if (wallHit) {
        const wallLength = this.app.graph.getWallLength(wallHit.wallId);
        const axis = this.app.graph.getWallAxis(wallHit.wallId);
        if (axis) {
          const mid = Geometry.midpoint(axis.start, axis.end);
          const screenMid = this.viewport.worldToScreen(mid.x, mid.y);
          DimensionInput.createOverlayInput(
            screenMid,
            wallLength,
            (newLength) => {
              commandManager.execute(new SetWallLengthCommand(
                this.app.graph, wallHit.wallId, wallLength, newLength
              ));
              this.app.wallLayer.render();
            }
          );
        }
      }
    }
  }

  _onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    // Project shortcuts (Ctrl+S, Ctrl+O)
    if (this.app.projectPanel && this.app.projectPanel.handleKeyDown(e)) return;

    const tool = appState.get('tool');

    // ── Wall tool: route keyboard input for length entry ──
    if (tool === 'wall' && this.app.wallTool.state === 'drawing') {
      // Try forwarding to length input first (digits, dot, comma, units, Backspace)
      if (this.app.wallTool.onKeyPress(e.key)) {
        e.preventDefault();
        this.app.wallLayer.render();
        this._render();
        return;
      }
    }

    switch (e.key) {
      case 'Escape':
      case 'Enter':
        if (tool === 'wall') {
          this.app.wallTool.onKeyDown(e.key);
          this.app.wallLayer.render();
          this._render();
        }
        break;

      // Arrow keys: door direction toggling
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        if (tool === 'door') {
          if (this.app.doorTool.onKeyDown(e.key)) {
            e.preventDefault();
            // Sync sidebar selects to match new defaults
            const hingeSelect = document.getElementById('door-hinge-side');
            const dirSelect = document.getElementById('door-open-direction');
            if (hingeSelect) hingeSelect.value = appState.get('doorDefaults.hingeSide');
            if (dirSelect) dirSelect.value = appState.get('doorDefaults.openDirection');
            this.app.wallLayer.render();
          }
        }
        break;

      case 'w':
      case 'W':
        this._setTool('wall');
        break;

      case 'v':
      case 'V':
        this._setTool('select');
        break;

      case 'd':
      case 'D':
        this._setTool('door');
        break;

      case 'Delete':
      case 'Backspace':
        if (tool === 'select') {
          const selectedWallId = appState.get('selectedWallId');
          const selectedDoorId = appState.get('selectedDoorId');
          if (selectedDoorId) {
            commandManager.execute(new RemoveDoorCommand(this.app.graph, selectedDoorId));
          } else if (selectedWallId) {
            commandManager.execute(new RemoveWallCommand(this.app.graph, selectedWallId));
          }
        }
        break;

      case 'g':
      case 'G':
        appState.set('ui.snapToGrid', !appState.get('ui.snapToGrid'));
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
          this.app.wallLayer.render();
        }
        break;
    }
  }

  _setTool(toolName) {
    // Clear tool-specific state
    if (this.app.doorTool) {
      this.app.doorTool.clear();
    }
    appState.set('tool', toolName);
    document.getElementById('canvas-container').dataset.tool = toolName;
    eventBus.emit('tool:change', toolName);
    this.app.wallLayer.render();
  }

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Draw snap crosshair for wall tool
    const tool = appState.get('tool');
    if (tool === 'wall' && this.app.wallTool.snapResult) {
      const snap = this.app.wallTool.snapResult;
      const screen = this.viewport.worldToScreen(snap.x, snap.y);

      const size = 8;
      ctx.strokeStyle = 'rgba(232, 168, 73, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screen.x - size, screen.y);
      ctx.lineTo(screen.x + size, screen.y);
      ctx.moveTo(screen.x, screen.y - size);
      ctx.lineTo(screen.x, screen.y + size);
      ctx.stroke();
    }
  }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
  window.app = new FloorPlannerApp();
});
