/**
 * GridLayer — Renders the background grid on the first canvas layer
 * @description Adaptive grid density based on zoom level, with ruler markings.
 */
class GridLayer {
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
    this.render();
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

    const resizeObserver = new ResizeObserver(() => {
      this._resizeCanvas();
      this.render();
    });
    resizeObserver.observe(this.canvas.parentElement);
  }

  /**
   * Determine grid spacing based on zoom level
   * @returns {{ minor: number, major: number }} Spacing in mm
   */
  _getGridSpacing() {
    const pixelsPerMm = this.viewport.scale;
    const minPixelSpacing = 12; // Minimum pixels between grid lines

    // Available grid spacings in mm
    const spacings = [10, 50, 100, 500, 1000, 5000];

    let minor = spacings[0];
    for (const s of spacings) {
      if (s * pixelsPerMm >= minPixelSpacing) {
        minor = s;
        break;
      }
    }

    // Major lines every 10× minor, or at least every 100mm
    let major = minor * 10;
    if (major < 100) major = 100;

    return { minor, major };
  }

  /**
   * Render the grid
   */
  render() {
    const ctx = this.ctx;
    const vp = this.viewport;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-canvas').trim() || '#0F1218';
    ctx.fillRect(0, 0, w, h);

    const { minor, major } = this._getGridSpacing();

    // Calculate visible world range
    const topLeft = vp.screenToWorld(0, 0);
    const bottomRight = vp.screenToWorld(w, h);

    // Snap to grid boundaries
    const startX = Math.floor(topLeft.x / minor) * minor;
    const endX = Math.ceil(bottomRight.x / minor) * minor;
    const startY = Math.floor(topLeft.y / minor) * minor;
    const endY = Math.ceil(bottomRight.y / minor) * minor;

    // Draw minor grid lines
    ctx.lineWidth = 0.5;

    for (let x = startX; x <= endX; x += minor) {
      const sx = vp.worldToScreen(x, 0).x;
      const isMajor = Math.abs(x % major) < 0.5;
      const isOrigin = Math.abs(x) < 0.5;

      if (isOrigin) {
        ctx.strokeStyle = 'rgba(232, 168, 73, 0.25)';
        ctx.lineWidth = 1;
      } else if (isMajor) {
        ctx.strokeStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-grid-major').trim() || '#252B38';
        ctx.lineWidth = 0.8;
      } else {
        ctx.strokeStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-grid').trim() || '#1A1E28';
        ctx.lineWidth = 0.5;
      }

      ctx.beginPath();
      ctx.moveTo(Math.round(sx) + 0.5, 0);
      ctx.lineTo(Math.round(sx) + 0.5, h);
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += minor) {
      const sy = vp.worldToScreen(0, y).y;
      const isMajor = Math.abs(y % major) < 0.5;
      const isOrigin = Math.abs(y) < 0.5;

      if (isOrigin) {
        ctx.strokeStyle = 'rgba(232, 168, 73, 0.25)';
        ctx.lineWidth = 1;
      } else if (isMajor) {
        ctx.strokeStyle = '#252B38';
        ctx.lineWidth = 0.8;
      } else {
        ctx.strokeStyle = '#1A1E28';
        ctx.lineWidth = 0.5;
      }

      ctx.beginPath();
      ctx.moveTo(0, Math.round(sy) + 0.5);
      ctx.lineTo(w, Math.round(sy) + 0.5);
      ctx.stroke();
    }

    // Draw ruler markings on edges
    this._drawRuler(ctx, startX, endX, startY, endY, major);

    // Draw origin marker
    this._drawOrigin(ctx);
  }

  /**
   * Draw ruler markings along the top and left edges
   * @private
   */
  _drawRuler(ctx, startX, endX, startY, endY, major) {
    const vp = this.viewport;

    ctx.fillStyle = 'rgba(136, 145, 165, 0.5)';
    ctx.font = `500 9px 'JetBrains Mono', monospace`;
    ctx.textBaseline = 'top';

    // Top ruler (X axis)
    for (let x = startX; x <= endX; x += major) {
      if (Math.abs(x) < 0.5) continue;
      const sx = vp.worldToScreen(x, 0).x;
      const label = this._formatRulerValue(x);

      ctx.textAlign = 'center';
      ctx.fillText(label, sx, 4);
    }

    // Left ruler (Y axis)
    ctx.textAlign = 'left';
    for (let y = startY; y <= endY; y += major) {
      if (Math.abs(y) < 0.5) continue;
      const sy = vp.worldToScreen(0, y).y;
      const label = this._formatRulerValue(y);

      ctx.save();
      ctx.translate(4, sy);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  /**
   * Draw origin crosshair
   * @private
   */
  _drawOrigin(ctx) {
    const vp = this.viewport;
    const origin = vp.worldToScreen(0, 0);

    // Origin dot
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232, 168, 73, 0.6)';
    ctx.fill();

    // "0" label
    ctx.fillStyle = 'rgba(232, 168, 73, 0.5)';
    ctx.font = `600 10px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('0', origin.x + 6, origin.y + 4);
  }

  /**
   * Format ruler value (mm → readable)
   * @private
   */
  _formatRulerValue(mm) {
    const absMm = Math.abs(mm);
    if (absMm >= 1000) {
      return (mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1) + 'm';
    } else if (absMm >= 100) {
      return (mm / 10).toFixed(0) + 'cm';
    }
    return mm + 'mm';
  }
}
