/**
 * LayoutOptimizer — Finds optimal grid offset for panel layout
 * 
 * Uses two-phase grid search:
 *   Phase 1 (coarse): scan offsetX × offsetY at large steps
 *   Phase 2 (fine): refine around best candidate at 1mm steps
 * 
 * Delegates layout generation to LayoutEngine and scoring to LayoutScorer.
 */
const layoutOptimizer = {

  /**
   * Optimize layout for all rooms
   * 
   * @param {Array<Room>} rooms
   * @param {Object} config
   * @returns {{ results: Map, aggregateStats: Object, warnings: Array }}
   */
  optimizeAll(rooms, config) {
    const results = new Map();
    let totalArea = 0;
    let totalWaste = 0;
    let totalPanels = 0;
    let totalCuts = 0;
    let totalProblematic = 0;
    const allWarnings = [];

    for (const room of rooms) {
      const result = this.optimizeRoom(room, config);
      results.set(room.id, result);

      totalArea += result.stats.totalArea;
      totalWaste += result.stats.wasteArea;
      totalPanels += result.stats.totalPanels;
      totalCuts += result.stats.cutPanels;
      totalProblematic += result.stats.problematicPanels || 0;

      for (const w of (result.stats.warnings || [])) {
        allWarnings.push({ ...w, roomId: room.id, roomName: room.name });
      }
    }

    return {
      results,
      aggregateStats: {
        totalArea,
        totalWaste,
        wastePercent: totalArea > 0
          ? (totalWaste / (totalArea + totalWaste)) * 100
          : 0,
        totalPanels,
        totalCuts,
        totalProblematic,
        panelsNeeded: Math.ceil((totalArea + totalWaste) / 
          ((config.panelLength * config.panelWidth) / 1e6)),
      },
      warnings: allWarnings,
    };
  },

  /**
   * Optimize layout for one room
   * 
   * @param {Room} room
   * @param {Object} config
   * @returns {LayoutResult} best layout with insetPolygon attached
   */
  optimizeRoom(room, config) {
    // 1. Inset polygon (expansion gap)
    // Per-edge inset: walls get full gap, door openings get 0
    // Convention: wallIds[k] = wall ID of edge ENDING at vertex k (incoming edge)
    // edgeInsets[i] = inset for edge STARTING at vertex i (outgoing edge, i→i+1)
    // Edge i→(i+1) ends at vertex (i+1), so its wallId = wallIds[(i+1) % n]
    let edgeInsets;
    if (room.wallIds) {
      const n = room.wallIds.length;
      edgeInsets = room.wallIds.map((_, i) => {
        const wallId = room.wallIds[(i + 1) % n];
        return wallId !== null ? config.expansionGap : 0;
      });
    }
    const insetPoly = Geometry.insetRectilinear(room.vertices, config.expansionGap, edgeInsets);

    if (insetPoly.length < 3) {
      console.warn('[Optimizer] Inset polygon degenerate for room', room.name);
      return {
        panels: [], stats: LayoutEngine._emptyStats(),
        insetPolygon: insetPoly,
      };
    }

    const { panelLength, panelWidth } = config;

    // Period of the grid pattern (for cyclic offset search)
    let periodX, periodY;
    if (config.pattern === 'herringbone') {
      // World-space lattice periods of the herringbone tiling:
      // rows along X: (W√2, 0) and (0, L√2); direction 90 swaps the axes
      const rotated = ((((config.direction || 0) % 360) + 360) % 360) % 180 === 90;
      periodX = (rotated ? panelLength : panelWidth) * Math.SQRT2;
      periodY = (rotated ? panelWidth : panelLength) * Math.SQRT2;
    } else {
      periodX = panelLength;
      periodY = panelWidth;
    }

    // 2. Phase 1 — Coarse grid search
    const stepX = Math.max(1, Math.round(periodX / 30));
    const stepY = Math.max(1, Math.round(periodY / 20));

    let bestScore = -Infinity;
    let bestLayout = null;
    let bestOX = 0, bestOY = 0;

    for (let oy = 0; oy < periodY; oy += stepY) {
      for (let ox = 0; ox < periodX; ox += stepX) {
        const layout = LayoutEngine.generateLayout(insetPoly, {
          ...config,
          offsetX: ox,
          offsetY: oy,
        });

        const score = LayoutScorer.score(layout, config);

        if (score > bestScore) {
          bestScore = score;
          bestLayout = layout;
          bestOX = ox;
          bestOY = oy;
        }
      }
    }

    // 3. Phase 2 — Fine refinement around best coarse candidate
    const fineRange = Math.max(stepX, stepY) + 2;

    for (let dy = -fineRange; dy <= fineRange; dy += 1) {
      for (let dx = -fineRange; dx <= fineRange; dx += 1) {
        const ox = ((bestOX + dx) % periodX + periodX) % periodX;
        const oy = ((bestOY + dy) % periodY + periodY) % periodY;

        const layout = LayoutEngine.generateLayout(insetPoly, {
          ...config,
          offsetX: ox,
          offsetY: oy,
        });

        const score = LayoutScorer.score(layout, config);

        if (score > bestScore) {
          bestScore = score;
          bestLayout = layout;
          bestOX = ox;
          bestOY = oy;
        }
      }
    }

    if (!bestLayout) {
      // Fallback: no offset
      bestLayout = LayoutEngine.generateLayout(insetPoly, {
        ...config,
        offsetX: 0,
        offsetY: 0,
      });
    }

    return {
      ...bestLayout,
      insetPolygon: insetPoly,
      bestOffsetX: bestOX,
      bestOffsetY: bestOY,
    };
  },
};
