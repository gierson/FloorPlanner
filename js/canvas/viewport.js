/**
 * Viewport — Coordinate transformation, pan & zoom
 * @description Converts between screen (pixel) and world (mm) coordinates.
 *              1 world unit = 1mm. Default scale: 1cm = 2px → 1mm = 0.2px
 */
class Viewport {
  /**
   * @param {HTMLElement} container - The canvas container element
   */
  constructor(container) {
    this.container = container;

    /** Pixels per mm at zoom=1 */
    this.BASE_SCALE = 0.2;

    /** @type {number} Current zoom level */
    this.zoom = 1;

    /** @type {number} Pan offset in pixels */
    this.panX = 0;
    this.panY = 0;

    /** Zoom limits */
    this.MIN_ZOOM = 0.1;
    this.MAX_ZOOM = 10;

    /** Pan state */
    this._isPanning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._panStartOffsetX = 0;
    this._panStartOffsetY = 0;

    this._setupEvents();
    this._centerOrigin();
  }

  /** Effective scale: pixels per mm */
  get scale() {
    return this.BASE_SCALE * this.zoom;
  }

  /**
   * Convert screen coordinates to world (mm)
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{x: number, y: number}}
   */
  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.panX) / this.scale,
      y: (screenY - this.panY) / this.scale,
    };
  }

  /**
   * Convert world (mm) to screen coordinates
   * @param {number} worldX
   * @param {number} worldY
   * @returns {{x: number, y: number}}
   */
  worldToScreen(worldX, worldY) {
    return {
      x: worldX * this.scale + this.panX,
      y: worldY * this.scale + this.panY,
    };
  }

  /**
   * Convert a world distance to screen pixels
   * @param {number} worldDist
   * @returns {number}
   */
  worldToScreenDist(worldDist) {
    return worldDist * this.scale;
  }

  /**
   * Convert a screen distance to world mm
   * @param {number} screenDist
   * @returns {number}
   */
  screenToWorldDist(screenDist) {
    return screenDist / this.scale;
  }

  /**
   * Zoom in/out centered on a screen point
   * @param {number} delta - Positive = zoom in, negative = zoom out
   * @param {number} screenX - Center point X
   * @param {number} screenY - Center point Y
   */
  zoomAt(delta, screenX, screenY) {
    const oldZoom = this.zoom;
    const factor = delta > 0 ? 1.1 : 1 / 1.1;
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * factor));

    if (this.zoom === oldZoom) return;

    // Adjust pan to keep the point under cursor stationary
    const ratio = this.zoom / oldZoom;
    this.panX = screenX - (screenX - this.panX) * ratio;
    this.panY = screenY - (screenY - this.panY) * ratio;

    this._emitChange();
  }

  /**
   * Set zoom level (centered on viewport)
   * @param {number} zoom
   */
  setZoom(zoom) {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const oldZoom = this.zoom;
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));

    const ratio = this.zoom / oldZoom;
    this.panX = cx - (cx - this.panX) * ratio;
    this.panY = cy - (cy - this.panY) * ratio;

    this._emitChange();
  }

  /**
   * Fit all rooms into the viewport
   * @param {Array} rooms - Array of room objects with vertices
   * @param {number} [padding=80] - Padding in pixels
   */
  fitToRooms(rooms, padding = 80) {
    if (!rooms || rooms.length === 0) {
      this._centerOrigin();
      return;
    }

    // Find bounding box of all rooms
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const room of rooms) {
      for (const v of room.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
      }
    }

    const rect = this.container.getBoundingClientRect();
    const viewW = rect.width - padding * 2;
    const viewH = rect.height - padding * 2;
    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;

    // Calculate zoom to fit
    const zoomX = viewW / (worldW * this.BASE_SCALE);
    const zoomY = viewH / (worldH * this.BASE_SCALE);
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, Math.min(zoomX, zoomY)));

    // Center on bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.panX = rect.width / 2 - centerX * this.scale;
    this.panY = rect.height / 2 - centerY * this.scale;

    this._emitChange();
  }

  /**
   * Center origin in the viewport with some offset
   * @private
   */
  _centerOrigin() {
    const rect = this.container.getBoundingClientRect();
    // Place origin at 40% from left, 40% from top
    this.panX = rect.width * 0.35;
    this.panY = rect.height * 0.35;
    this.zoom = 1;
    this._emitChange();
  }

  /** @private */
  _setupEvents() {
    const canvas = this.container;

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.zoomAt(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    // Middle mouse pan
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) { // Middle button
        e.preventDefault();
        this._startPan(e);
      }
    });

    // Space + left click pan (handled via keydown flag)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        this._spaceHeld = true;
        this.container.dataset.tool = 'pan';
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this._spaceHeld = false;
        this.container.dataset.tool = appState.get('tool');
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this._spaceHeld) {
        e.preventDefault();
        this._startPan(e);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        const dx = e.clientX - this._panStartX;
        const dy = e.clientY - this._panStartY;
        this.panX = this._panStartOffsetX + dx;
        this.panY = this._panStartOffsetY + dy;
        this._emitChange();
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (this._isPanning && (e.button === 1 || e.button === 0)) {
        this._isPanning = false;
      }
    });
  }

  /** @private */
  _startPan(e) {
    this._isPanning = true;
    this._panStartX = e.clientX;
    this._panStartY = e.clientY;
    this._panStartOffsetX = this.panX;
    this._panStartOffsetY = this.panY;
  }

  /** @private */
  _emitChange() {
    appState.batch({
      'viewport.offsetX': this.panX,
      'viewport.offsetY': this.panY,
      'viewport.zoom': this.zoom,
    });
    eventBus.emit('viewport:change', {
      panX: this.panX,
      panY: this.panY,
      zoom: this.zoom,
      scale: this.scale,
    });
  }

  /** @returns {boolean} Whether panning is active */
  get isPanning() {
    return this._isPanning || this._spaceHeld;
  }
}
