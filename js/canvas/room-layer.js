/**
 * RoomLayer — Renders rooms (polygons) on the second canvas layer
 * @description Draws filled polygons, walls, vertices, and dimension labels.
 */
class RoomLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Viewport} viewport
   */
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;
    this.dpr = window.devicePixelRatio || 1;

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
    eventBus.on('viewport:change', () => this.render());
    eventBus.on('room:add', () => this.render());
    eventBus.on('room:remove', () => this.render());
    eventBus.on('room:update', () => this.render());
    eventBus.on('state:change', (d) => {
      if (d.path === 'selectedRoomId' || d.path === 'rooms') {
        this.render();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      this._resizeCanvas();
      this.render();
    });
    resizeObserver.observe(this.canvas.parentElement);
  }

  /**
   * Render all rooms
   */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const rooms = appState.get('rooms');
    const selectedId = appState.get('selectedRoomId');

    for (const room of rooms) {
      const isSelected = room.id === selectedId;
      this._drawRoom(ctx, room, isSelected);
    }
  }

  /**
   * Draw a single room
   * @private
   */
  _drawRoom(ctx, room, isSelected) {
    const vp = this.viewport;
    const vertices = room.vertices;
    if (vertices.length < 3) return;

    // Convert to screen coords
    const screenVerts = vertices.map(v => vp.worldToScreen(v.x, v.y));

    // Fill
    ctx.beginPath();
    ctx.moveTo(screenVerts[0].x, screenVerts[0].y);
    for (let i = 1; i < screenVerts.length; i++) {
      ctx.lineTo(screenVerts[i].x, screenVerts[i].y);
    }
    ctx.closePath();

    ctx.fillStyle = isSelected
      ? room.color.fill.replace('0.08', '0.14')
      : room.color.fill;
    ctx.fill();

    // Walls (stroked)
    ctx.strokeStyle = isSelected ? room.color.stroke : room.color.stroke + '99';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Selected glow
    if (isSelected) {
      ctx.shadowColor = room.color.stroke;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // Dimension labels on walls
    if (appState.get('ui.showDimensions')) {
      this._drawDimensions(ctx, room, screenVerts, isSelected);
    }

    // Vertex handles (only for selected room)
    if (isSelected) {
      this._drawVertexHandles(ctx, screenVerts, room.color.stroke);
    }
  }

  /**
   * Draw dimension labels on each wall
   * @private
   */
  _drawDimensions(ctx, room, screenVerts, isSelected) {
    const n = screenVerts.length;

    for (let i = 0; i < n; i++) {
      const a = screenVerts[i];
      const b = screenVerts[(i + 1) % n];
      const worldA = room.vertices[i];
      const worldB = room.vertices[(i + 1) % n];

      const length = Geometry.segmentLength(worldA, worldB);
      if (length < 1) continue;

      const mid = Geometry.midpoint(a, b);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const label = Geometry.formatDimension(length, length >= 100);

      // Calculate perpendicular offset for label
      const offsetDist = isSelected ? 16 : 12;
      const perpX = -Math.sin(angle) * offsetDist;
      const perpY = Math.cos(angle) * offsetDist;

      ctx.save();
      ctx.translate(mid.x + perpX, mid.y + perpY);

      // Keep text readable (not upside down)
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.rotate(textAngle);

      // Background pill
      ctx.font = `500 ${isSelected ? 11 : 10}px 'JetBrains Mono', monospace`;
      const metrics = ctx.measureText(label);
      const pw = metrics.width + 8;
      const ph = 16;

      ctx.fillStyle = isSelected ? 'rgba(20, 23, 30, 0.9)' : 'rgba(20, 23, 30, 0.75)';
      ctx.beginPath();
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 3);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = 'rgba(232, 168, 73, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Text
      ctx.fillStyle = isSelected ? '#E8A849' : '#8891A5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0.5);

      ctx.restore();
    }
  }

  /**
   * Draw vertex handles for the selected room
   * @private
   */
  _drawVertexHandles(ctx, screenVerts, color) {
    const radius = 5;

    for (const v of screenVerts) {
      // Outer ring
      ctx.beginPath();
      ctx.arc(v.x, v.y, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(12, 14, 18, 0.8)';
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(v.x, v.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Glow
      ctx.beginPath();
      ctx.arc(v.x, v.y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = color + '30';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Hit-test: find which room contains a world point
   * @param {{x:number,y:number}} worldPoint
   * @returns {Object|null} The room, or null
   */
  hitTestRoom(worldPoint) {
    const rooms = appState.get('rooms');
    // Check in reverse order (topmost first)
    for (let i = rooms.length - 1; i >= 0; i--) {
      if (Geometry.isPointInPolygon(worldPoint, rooms[i].vertices)) {
        return rooms[i];
      }
    }
    return null;
  }

  /**
   * Hit-test: find the nearest vertex of the selected room
   * @param {{x:number,y:number}} worldPoint
   * @param {number} [threshold=50] - Max distance in mm
   * @returns {{roomId:number, vertexIndex:number, vertex:{x,y}}|null}
   */
  hitTestVertex(worldPoint, threshold = 50) {
    const selectedId = appState.get('selectedRoomId');
    if (!selectedId) return null;

    const room = appState.getRoom(selectedId);
    if (!room) return null;

    // Adjust threshold based on zoom
    const screenThreshold = 12; // pixels
    const worldThreshold = this.viewport.screenToWorldDist(screenThreshold);

    let closest = null;
    let closestDist = worldThreshold;

    for (let i = 0; i < room.vertices.length; i++) {
      const v = room.vertices[i];
      const dist = Geometry.distance(worldPoint, v);
      if (dist < closestDist) {
        closestDist = dist;
        closest = { roomId: room.id, vertexIndex: i, vertex: { ...v } };
      }
    }

    return closest;
  }

  /**
   * Hit-test: find the nearest wall (edge) of the selected room
   * @param {{x:number,y:number}} worldPoint
   * @returns {{roomId:number, edgeIndex:number, length:number}|null}
   */
  hitTestWall(worldPoint) {
    const selectedId = appState.get('selectedRoomId');
    if (!selectedId) return null;

    const room = appState.getRoom(selectedId);
    if (!room) return null;

    const screenThreshold = 8;
    const worldThreshold = this.viewport.screenToWorldDist(screenThreshold);

    const n = room.vertices.length;
    let closest = null;
    let closestDist = worldThreshold;

    for (let i = 0; i < n; i++) {
      const a = room.vertices[i];
      const b = room.vertices[(i + 1) % n];
      const dist = Geometry.distanceToSegment(worldPoint, a, b);
      if (dist < closestDist) {
        closestDist = dist;
        closest = {
          roomId: room.id,
          edgeIndex: i,
          length: Geometry.segmentLength(a, b),
        };
      }
    }

    return closest;
  }
}
