/**
 * HerringboneGenerator — Classic herringbone (45°) grid
 *
 * Works in a rotated frame (u,v): u = (x+y)/√2, v = (x−y)/√2.
 * In that frame +45° panels become axis-aligned L×W rects ("H")
 * and −45° panels become W×L rects ("V"). Classic herringbone is
 * the staircase tessellation of those rects:
 *
 *   H(i,k) corner: (k·W + i·L,      k·W − i·L)          size L×W
 *   V(i,k) corner: (k·W + i·L + L,  k·W − i·L + W − L)  size W×L
 *
 * k = step within a staircase (lattice vector s = (W, W)),
 * i = staircase index      (lattice vector t = (L, −L)).
 *
 * Each H short end butts a V long side and vice versa (the V-joint).
 * The unit cell |s × t| = 2LW holds exactly one H and one V panel,
 * so the tiling is gap- and overlap-free for any L, W.
 *
 * World-space periods of the pattern: (W√2, 0) and (0, L√2).
 *
 * Orientation (config.direction, degrees): 0 — chevron rows run along
 * the X axis (base layout), 90 — rows run along the Y axis. The pattern
 * is invariant under 180° rotation (rotating about the centre of any
 * plank maps the tiling onto itself — wallpaper group pgg), so the
 * direction is normalized modulo 180: 180 ≡ 0, 270 ≡ 90.
 */
const HerringboneGenerator = {

  generate(bbox, config) {
    const direction = ((((config.direction || 0) % 360) + 360) % 360) % 180;
    if (direction !== 90) {
      return this._generateBase(bbox, config);
    }

    // direction 90: generate in a frame rotated −90° about the bbox
    // centre, then rotate the boards back by +90°. The axis-aligned
    // bbox rotated about its own centre is the bbox with swapped
    // half-extents; the world offset maps to the frame as (oy, −ox).
    const c = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
    const halfX = (bbox.maxX - bbox.minX) / 2;
    const halfY = (bbox.maxY - bbox.minY) / 2;
    const frameBbox = {
      minX: c.x - halfY, maxX: c.x + halfY,
      minY: c.y - halfX, maxY: c.y + halfX,
    };

    const base = this._generateBase(frameBbox, {
      ...config,
      offsetX: config.offsetY || 0,
      offsetY: -(config.offsetX || 0),
    });

    return base.map(b => {
      const polygon = b.polygon.map(p => ({
        x: c.x - (p.y - c.y),
        y: c.y + (p.x - c.x),
      }));
      // +90° rotation swaps the diagonals: +45° ↔ −45°
      return {
        row: b.row,
        col: b.col,
        polygon,
        angle: -b.angle,
        bbox: this._polygonBbox(polygon),
      };
    });
  },

  /** @private — base layout: chevron rows along the X axis */
  _generateBase(bbox, config) {
    const {
      panelLength: L,
      panelWidth: W,
      offsetX = 0,
      offsetY = 0,
    } = config;

    const C = Math.SQRT2 / 2;
    const S2 = Math.SQRT2;
    const halfL = (L * C) / 2;
    const halfW = (W * C) / 2;

    // Compute bbox extents in (u,v) space
    const corners = [
      { x: bbox.minX, y: bbox.minY },
      { x: bbox.maxX, y: bbox.minY },
      { x: bbox.maxX, y: bbox.maxY },
      { x: bbox.minX, y: bbox.maxY },
    ];

    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const c of corners) {
      const u = (c.x + c.y) / S2;
      const v = (c.x - c.y) / S2;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }

    const margin = L + W;
    uMin -= margin;
    uMax += margin;
    vMin -= margin;
    vMax += margin;

    const offU = (offsetX + offsetY) / S2;
    const offV = (offsetX - offsetY) / S2;

    const uLo = uMin - offU, uHi = uMax - offU;
    const vLo = vMin - offV, vHi = vMax - offV;

    // Panel centers sit near u ≈ k·W + i·L, v ≈ k·W − i·L, so:
    //   i ≈ (u − v) / 2L,  k ≈ (u + v) / 2W
    const iStart = Math.floor((uLo - vHi) / (2 * L)) - 1;
    const iEnd = Math.ceil((uHi - vLo) / (2 * L)) + 1;
    const kStart = Math.floor((uLo + vLo) / (2 * W)) - 1;
    const kEnd = Math.ceil((uHi + vHi) / (2 * W)) + 1;

    const boards = [];

    const pushBoard = (u, v, angle, row, col) => {
      const cx = (u + v) * C;
      const cy = (u - v) * C;
      const polygon = this._makePanel(cx, cy, halfL, halfW, angle);
      const boardBbox = this._polygonBbox(polygon);

      if (boardBbox.maxX < bbox.minX - 1 || boardBbox.minX > bbox.maxX + 1 ||
          boardBbox.maxY < bbox.minY - 1 || boardBbox.minY > bbox.maxY + 1) {
        return;
      }
      boards.push({ row, col, polygon, angle, bbox: boardBbox });
    };

    for (let i = iStart; i <= iEnd; i++) {
      for (let k = kStart; k <= kEnd; k++) {
        const uBase = k * W + i * L + offU;
        const vBase = k * W - i * L + offV;

        // H: +45° panel, L×W in (u,v)
        pushBoard(uBase + L / 2, vBase + W / 2, 45, i, 2 * k);

        // V: −45° panel, W×L in (u,v)
        pushBoard(uBase + L + W / 2, vBase + W - L / 2, -45, i, 2 * k + 1);
      }
    }

    return boards;
  },

  /** @private */
  _makePanel(cx, cy, halfL, halfW, angle) {
    if (angle === 45) {
      return [
        { x: cx - halfL + halfW, y: cy - halfL - halfW },
        { x: cx + halfL + halfW, y: cy + halfL - halfW },
        { x: cx + halfL - halfW, y: cy + halfL + halfW },
        { x: cx - halfL - halfW, y: cy - halfL + halfW },
      ];
    } else {
      return [
        { x: cx - halfL - halfW, y: cy + halfL - halfW },
        { x: cx + halfL - halfW, y: cy - halfL - halfW },
        { x: cx + halfL + halfW, y: cy - halfL + halfW },
        { x: cx - halfL + halfW, y: cy + halfL + halfW },
      ];
    }
  },

  /** @private */
  _polygonBbox(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  },
};
