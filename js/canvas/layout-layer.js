/**
 * LayoutLayer — Renders the optimized panel layout on the third canvas layer
 * @description Draws panel grid clipped to room polygons with color-coded cuts.
 */
class LayoutLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Viewport} viewport
   */
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;
    this.dpr = window.devicePixelRatio || 1;

    /** @type {Map<number, Object>} roomId → layout result */
    this.layouts = new Map();

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
    eventBus.on('layout:update', () => this.render());

    const resizeObserver = new ResizeObserver(() => {
      this._resizeCanvas();
      this.render();
    });
    resizeObserver.observe(this.canvas.parentElement);
  }

  /**
   * Set layout results and render
   * @param {Map<number, Object>} layouts - roomId → layout result
   */
  setLayouts(layouts) {
    this.layouts = layouts;
    this.render();
  }

  /**
   * Clear all layouts
   */
  clear() {
    this.layouts.clear();
    this.render();
  }

  /**
   * Render all panel layouts
   */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!appState.get('ui.showLayout')) return;

    // Iterate over layout results directly (keyed by room/zone id)
    for (const [id, layout] of this.layouts) {
      if (!layout || !layout.panels || layout.panels.length === 0) continue;

      // Build a room-like context from detectedRooms or use insetPolygon
      const detectedRooms = appState.get('detectedRooms') || [];
      const room = detectedRooms.find(r => r.id === id) || {
        id,
        name: `Strefa ${id}`,
        innerPolygon: layout.insetPolygon,
        vertices: layout.insetPolygon, // compat
      };

      this._renderRoomLayout(ctx, room, layout);
    }
  }

  /**
   * Render panels for one room
   * @private
   */
  _renderRoomLayout(ctx, room, layout) {
    const vp = this.viewport;
    const panels = layout.panels;

    if (!panels || panels.length === 0) return;

    // Create clip path from room polygon (inset)
    const insetPoly = layout.insetPolygon;
    if (insetPoly && insetPoly.length >= 3) {
      ctx.save();
      ctx.beginPath();
      const first = vp.worldToScreen(insetPoly[0].x, insetPoly[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < insetPoly.length; i++) {
        const pt = vp.worldToScreen(insetPoly[i].x, insetPoly[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.clip();
    }

    // Draw panels as polygons
    for (const panel of panels) {
      // Use polygon if available, fall back to bounds rectangle
      const poly = panel.polygon;
      if (!poly || poly.length < 3) continue;

      // Convert polygon to screen coords
      const screenPts = poly.map(p => vp.worldToScreen(p.x, p.y));

      // Quick size check via bounds
      const screenBounds = {
        minX: Math.min(...screenPts.map(p => p.x)),
        maxX: Math.max(...screenPts.map(p => p.x)),
        minY: Math.min(...screenPts.map(p => p.y)),
        maxY: Math.max(...screenPts.map(p => p.y)),
      };
      const screenW = screenBounds.maxX - screenBounds.minX;
      const screenH = screenBounds.maxY - screenBounds.minY;
      if (screenW < 1 || screenH < 1) continue;

      // Build path
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.closePath();

      // Fill color based on status
      if (panel.isProblematic) {
        ctx.fillStyle = 'rgba(248, 113, 113, 0.35)';
      } else if (panel.isCut) {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(232, 168, 73, 0.15)';
      }
      ctx.fill();

      // Border
      if (panel.isProblematic) {
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
      } else if (panel.isCut) {
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
      } else {
        ctx.strokeStyle = 'rgba(232, 168, 73, 0.35)';
      }
      ctx.lineWidth = 1;
      ctx.stroke();

      // Dimension label on cut panels (if zoomed in enough)
      if (panel.isCut && screenW > 30 && screenH > 14) {
        const label = `${Math.round(panel.actualWidth)}×${Math.round(panel.actualHeight)}`;
        ctx.font = `500 ${Math.min(10, screenH * 0.6)}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = panel.isProblematic
          ? 'rgba(248, 113, 113, 0.9)'
          : 'rgba(136, 145, 165, 0.8)';
        // Position label at polygon centroid
        const centroid = panel.centroid || {
          x: (panel.bounds.minX + panel.bounds.maxX) / 2,
          y: (panel.bounds.minY + panel.bounds.maxY) / 2,
        };
        const screenCentroid = vp.worldToScreen(centroid.x, centroid.y);

        // Rotate label for herringbone panels
        if (panel.angle) {
          ctx.save();
          ctx.translate(screenCentroid.x, screenCentroid.y);
          ctx.rotate(panel.angle * Math.PI / 180);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(label, screenCentroid.x, screenCentroid.y);
        }
      }
    }

    // Draw direction arrow
    if (panels.length > 0) {
      this._drawDirectionArrow(ctx, room, layout);
    }

    if (insetPoly && insetPoly.length >= 3) {
      ctx.restore();
    }
  }

  /**
   * Draw laying direction indicator
   * @private
   */
  _drawDirectionArrow(ctx, room, layout) {
    const vp = this.viewport;
    const poly = room.innerPolygon || room.vertices || layout.insetPolygon;
    if (!poly || poly.length < 3) return;
    const bbox = Geometry.boundingBox(poly);
    const direction = appState.get('laying.direction');

    const centerX = (bbox.minX + bbox.maxX) / 2;
    const centerY = (bbox.minY + bbox.maxY) / 2;
    const screenCenter = vp.worldToScreen(centerX, centerY);

    const arrowLen = 30;

    ctx.save();
    ctx.translate(screenCenter.x, screenCenter.y);
    if (direction === 90) ctx.rotate(Math.PI / 2);

    ctx.strokeStyle = 'rgba(232, 168, 73, 0.4)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(-arrowLen / 2, 0);
    ctx.lineTo(arrowLen / 2, 0);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(arrowLen / 2 - 8, -6);
    ctx.lineTo(arrowLen / 2, 0);
    ctx.lineTo(arrowLen / 2 - 8, 6);
    ctx.stroke();

    ctx.restore();
  }
}
