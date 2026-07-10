/**
 * LayoutEngine — Core layout generation via polygon clipping
 * 
 * Pipeline:
 * 1. Generate board grid (GridGenerator)
 * 2. Clip each board against room polygon (PolygonClip)
 * 3. Classify each clipped piece (full / cut / problematic)
 * 4. Detect edge types (tongue / groove / wall-cut / field-cut)
 * 5. Return structured panel data
 * 
 * All coordinates in millimeters (mm).
 */
const LayoutEngine = {

  /**
   * Generate a complete panel layout for one room.
   * 
   * @param {Array<{x:number,y:number}>} roomPolygon - Inset polygon (after expansion gap)
   * @param {Object} config
   * @param {number} config.panelLength   - Board length in mm
   * @param {number} config.panelWidth    - Board width in mm
   * @param {number} config.offsetX       - Grid X offset in mm
   * @param {number} config.offsetY       - Grid Y offset in mm
   * @param {number} config.direction     - 0 = horizontal, 90 = vertical
   * @param {string} config.stagger       - 'third' | 'half' | 'random' | 'none'
   * @param {number} config.minCutWidth   - Min acceptable cut width in mm
   * @param {number} config.minCutLength  - Min acceptable cut length in mm
   * @returns {LayoutResult}
   */
  generateLayout(roomPolygon, config) {
    const {
      panelLength, panelWidth,
      offsetX, offsetY,
      direction, stagger,
      minCutWidth, minCutLength,
    } = config;

    if (!roomPolygon || roomPolygon.length < 3) {
      return { panels: [], stats: this._emptyStats() };
    }

    // Route to herringbone layout if requested
    if (config.pattern === 'herringbone') {
      return this._generateHerringboneLayout(roomPolygon, config);
    }

    const bbox = Geometry.boundingBox(roomPolygon);

    // 1. Generate board grid
    const boards = GridGenerator.generate(bbox, {
      panelLength, panelWidth,
      offsetX, offsetY,
      direction, stagger,
    });

    // 2. Clip each board against room polygon & classify
    const panels = [];

    for (const board of boards) {
      // Quick rejection: if board bbox doesn't overlap room bbox
      if (board.rect.maxX <= bbox.minX || board.rect.minX >= bbox.maxX ||
          board.rect.maxY <= bbox.minY || board.rect.minY >= bbox.maxY) {
        continue;
      }

      // Clip room polygon by board rectangle
      const clippedPolygons = PolygonClip.clipPolygonByRect(roomPolygon, board.rect);

      for (const clipPoly of clippedPolygons) {
        const clipArea = PolygonClip.area(clipPoly);
        if (clipArea < 1) continue; // < 1 mm² → skip

        // Classify this panel
        const panel = this._classifyPanel(clipPoly, board, roomPolygon, config);
        panels.push(panel);
      }
    }

    // 3. Compute statistics
    const stats = this._computeStats(panels, config);

    return { panels, stats };
  },

  /**
   * Classify a clipped panel piece
   * @private
   */
  _classifyPanel(clipPoly, board, roomPolygon, config) {
    const { panelLength, panelWidth, minCutLength, minCutWidth, direction } = config;

    const clipArea = PolygonClip.area(clipPoly);
    const clipBounds = PolygonClip.bounds(clipPoly);
    const boardArea = panelLength * panelWidth;

    const isFullBoard = Math.abs(clipArea - boardArea) < 1; // 1 mm² tolerance

    // Determine actual dimensions from bounds
    // For direction=0: width is along X (panelLength), height is along Y (panelWidth)
    // For direction=90: width is along Y, height is along X
    let actualWidth, actualHeight;
    if (direction === 90) {
      actualWidth = clipBounds.height;  // along board length axis
      actualHeight = clipBounds.width;  // along board width axis
    } else {
      actualWidth = clipBounds.width;
      actualHeight = clipBounds.height;
    }

    const isCutX = actualWidth < panelLength - 0.5;
    const isCutY = actualHeight < panelWidth - 0.5;
    const isCut = isCutX || isCutY;

    // Problematic cut detection
    const isProblematicWidth = isCutX && actualWidth < minCutLength;
    const isProblematicHeight = isCutY && actualHeight < minCutWidth;
    const isProblematic = isProblematicWidth || isProblematicHeight;

    // Detect edge types (tongue/groove/cut)
    const edges = this._detectEdges(clipPoly, board, roomPolygon, config);

    // Shape classification
    const isRect = PolygonClip.isAxisAlignedRect(clipPoly);
    const isConvex = isRect || PolygonClip.isConvex(clipPoly);

    // Panel centroid for label positioning
    const centroid = PolygonClip.centroid(clipPoly);

    return {
      // Geometry — primary representation
      polygon: clipPoly,
      bounds: clipBounds,
      centroid,
      area: clipArea,

      // Grid position
      row: board.row,
      col: board.col,
      sourceBoard: board.rect,

      // Classification
      isFullBoard,
      isCut,
      isCutX,
      isCutY,
      isProblematic,
      isRect,
      isConvex,

      // Dimensions (for compatibility & labels)
      actualWidth,
      actualHeight,
      fullWidth: panelLength,
      fullHeight: panelWidth,
      width: clipBounds.width,
      height: clipBounds.height,
      x: clipBounds.minX,
      y: clipBounds.minY,

      // Edge metadata
      edges,
    };
  },

  /**
   * Detect the type of each edge of the clipped panel.
   * 
   * For each edge of the clipped polygon:
   * - If it lies on a room polygon boundary → 'wall-cut' (acceptable)
   * - If it lies on a board rectangle boundary AND is an original board edge:
   *   - Top/bottom edges → 'groove' / 'tongue' (alternating)
   *   - Left/right edges → 'end-groove' / 'end-tongue'
   * - Otherwise → 'field-cut' (problematic: cut not against a wall)
   * 
   * @private
   */
  _detectEdges(clipPoly, board, roomPolygon, config) {
    const edges = [];
    const n = clipPoly.length;
    const TOLERANCE = 1.5; // mm tolerance for boundary detection

    for (let i = 0; i < n; i++) {
      const start = clipPoly[i];
      const end = clipPoly[(i + 1) % n];
      const mid = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      };
      const length = Geometry.distance(start, end);

      if (length < 0.1) continue;

      // Determine edge direction/side
      const side = this._classifyEdgeSide(start, end, board.rect);

      // Check if edge lies on room boundary (→ wall cut)
      const isOnWall = PolygonClip.isEdgeOnPolygonBoundary(start, end, roomPolygon, TOLERANCE);

      // Check if edge lies on board boundary (→ original tongue/groove)
      const isOnBoard = this._isEdgeOnBoardBoundary(start, end, board.rect, TOLERANCE);

      let type;
      if (isOnBoard && !isOnWall) {
        // Original board edge — tongue or groove
        if (side === 'top' || side === 'bottom') {
          type = (board.row % 2 === 0) 
            ? (side === 'top' ? 'groove' : 'tongue')
            : (side === 'top' ? 'tongue' : 'groove');
        } else {
          // Left/right: end joints
          type = side === 'left' ? 'end-groove' : 'end-tongue';
        }
      } else if (isOnWall) {
        // Edge lies on room wall → acceptable cut
        type = 'wall-cut';
      } else {
        // Not on wall, not original board edge → field cut (problematic)
        type = 'field-cut';
      }

      edges.push({ type, side, start, end, length });
    }

    return edges;
  },

  /**
   * Classify which side of the board rectangle an edge is closest to
   * @private
   */
  _classifyEdgeSide(start, end, boardRect) {
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const dx = Math.abs(start.x - end.x);
    const dy = Math.abs(start.y - end.y);

    if (dy < dx) {
      // Mostly horizontal edge → top or bottom
      return Math.abs(mid.y - boardRect.minY) < Math.abs(mid.y - boardRect.maxY) ? 'top' : 'bottom';
    } else {
      // Mostly vertical edge → left or right
      return Math.abs(mid.x - boardRect.minX) < Math.abs(mid.x - boardRect.maxX) ? 'left' : 'right';
    }
  },

  /**
   * Check if an edge lies on the boundary of a board rectangle
   * @private
   */
  _isEdgeOnBoardBoundary(start, end, boardRect, tolerance) {
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    // Check each side
    if (Math.abs(mid.y - boardRect.minY) < tolerance) return true; // top
    if (Math.abs(mid.y - boardRect.maxY) < tolerance) return true; // bottom
    if (Math.abs(mid.x - boardRect.minX) < tolerance) return true; // left
    if (Math.abs(mid.x - boardRect.maxX) < tolerance) return true; // right

    return false;
  },

  // ─── Herringbone Layout ──────────────────────────────────────────

  /**
   * Generate layout for herringbone pattern.
   * Uses HerringboneGenerator + clipPolygonByConvex.
   * @private
   */
  _generateHerringboneLayout(roomPolygon, config) {
    const { panelLength, panelWidth, offsetX, offsetY, direction, minCutWidth, minCutLength } = config;
    const bbox = Geometry.boundingBox(roomPolygon);

    // 1. Generate herringbone grid
    const boards = HerringboneGenerator.generate(bbox, {
      panelLength, panelWidth, offsetX, offsetY, direction,
    });

    // 2. Clip each board against room polygon & classify
    const panels = [];

    for (const board of boards) {
      // Quick rejection via bbox
      if (board.bbox.maxX <= bbox.minX || board.bbox.minX >= bbox.maxX ||
          board.bbox.maxY <= bbox.minY || board.bbox.minY >= bbox.maxY) {
        continue;
      }

      // Clip room polygon by rotated board polygon
      const clippedPolygons = PolygonClip.clipPolygonByConvex(roomPolygon, board.polygon);

      for (const clipPoly of clippedPolygons) {
        const clipArea = PolygonClip.area(clipPoly);
        if (clipArea < 1) continue;

        const panel = this._classifyHerringbonePanel(clipPoly, board, roomPolygon, config);
        panels.push(panel);
      }
    }

    // 3. Compute statistics
    const stats = this._computeStats(panels, config);
    return { panels, stats };
  },

  /**
   * Classify a clipped herringbone panel.
   * Measures dimensions along the panel's rotated axes, not screen axes.
   * @private
   */
  _classifyHerringbonePanel(clipPoly, board, roomPolygon, config) {
    const { panelLength, panelWidth, minCutLength, minCutWidth } = config;

    const clipArea = PolygonClip.area(clipPoly);
    const clipBounds = PolygonClip.bounds(clipPoly);
    const boardArea = panelLength * panelWidth;
    const isFullBoard = Math.abs(clipArea - boardArea) < 1;

    // Measure dimensions along the panel's rotated axes
    const angleRad = board.angle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // Board centroid as projection origin
    const boardCenter = PolygonClip.centroid(board.polygon);

    let minProj = Infinity, maxProj = -Infinity;
    let minPerp = Infinity, maxPerp = -Infinity;
    for (const v of clipPoly) {
      const dx = v.x - boardCenter.x;
      const dy = v.y - boardCenter.y;
      const proj = dx * cosA + dy * sinA;    // along panel length
      const perp = -dx * sinA + dy * cosA;   // along panel width
      if (proj < minProj) minProj = proj;
      if (proj > maxProj) maxProj = proj;
      if (perp < minPerp) minPerp = perp;
      if (perp > maxPerp) maxPerp = perp;
    }
    const actualLength = maxProj - minProj;
    const actualWidth = maxPerp - minPerp;

    const isCutLength = actualLength < panelLength - 0.5;
    const isCutWidth = actualWidth < panelWidth - 0.5;
    const isCut = isCutLength || isCutWidth;

    const isProblematic = (isCutLength && actualLength < minCutLength) ||
                          (isCutWidth && actualWidth < minCutWidth);

    const centroid = PolygonClip.centroid(clipPoly);

    return {
      // Geometry
      polygon: clipPoly,
      bounds: clipBounds,
      centroid,
      area: clipArea,

      // Grid position
      row: board.row,
      col: board.col,
      angle: board.angle,
      sourceBoard: board.polygon,

      // Classification
      isFullBoard,
      isCut,
      isCutX: isCutLength,
      isCutY: isCutWidth,
      isProblematic,
      isRect: false,  // rotated panels are never axis-aligned
      isConvex: PolygonClip.isConvex(clipPoly),

      // Dimensions (along panel axes, not screen axes)
      actualWidth: actualLength,   // "width" in UI = length along panel
      actualHeight: actualWidth,   // "height" in UI = width along panel
      fullWidth: panelLength,
      fullHeight: panelWidth,
      width: clipBounds.width,
      height: clipBounds.height,
      x: clipBounds.minX,
      y: clipBounds.minY,

      // Edge metadata (simplified for herringbone)
      edges: [],
    };
  },

  /**
   * Compute aggregate statistics for a set of panels
   * @private
   */
  _computeStats(panels, config) {
    let totalPanels = panels.length;
    let cutPanels = 0;
    let problematicPanels = 0;
    let totalArea = 0;
    let minCutDim = Infinity;
    let fieldCutCount = 0;

    const warnings = [];

    for (const panel of panels) {
      totalArea += panel.area;

      if (panel.isCut) {
        cutPanels++;
        const minDim = Math.min(panel.actualWidth, panel.actualHeight);
        if (minDim < minCutDim) minCutDim = minDim;
      }

      if (panel.isProblematic) {
        problematicPanels++;
        const dimStr = panel.isCutX && panel.actualWidth < config.minCutLength
          ? `${Math.round(panel.actualWidth)} mm dł.`
          : `${Math.round(panel.actualHeight)} mm szer.`;
        warnings.push({
          type: 'cut-too-small',
          message: `Docinek ${dimStr} (rząd ${panel.row + 1})`,
          row: panel.row,
          col: panel.col,
          dimension: Math.min(panel.actualWidth, panel.actualHeight),
        });
      }

      // Check for field cuts
      if (panel.edges && panel.edges.some(e => e.type === 'field-cut')) {
        fieldCutCount++;
      }
    }

    // Realistic purchase count: tongue-and-groove offcut reuse rules
    // (straight: opposite-wall pairing; herringbone: A/B boards,
    // conservative — diagonal offcuts are waste)
    const purchase = WasteCalculator.compute(panels, config);

    return {
      totalPanels,
      cutPanels,
      fullPanels: totalPanels - cutPanels,
      problematicPanels,
      fieldCutCount,
      totalArea: totalArea / 1e6,        // mm² → m²
      wasteArea: purchase.wasteArea / 1e6,
      wastePercent: totalArea > 0
        ? (purchase.wasteArea / (totalArea + purchase.wasteArea)) * 100
        : 0,
      minCut: minCutDim === Infinity ? null : minCutDim,
      panelsNeeded: purchase.panelsNeeded,
      panelsNeededA: purchase.panelsNeededA,
      panelsNeededB: purchase.panelsNeededB,
      reusedPairs: purchase.reusedPairs,
      warnings,
    };
  },

  /**
   * Empty stats for degenerate cases
   * @private
   */
  _emptyStats() {
    return {
      totalPanels: 0, cutPanels: 0, fullPanels: 0,
      problematicPanels: 0, fieldCutCount: 0,
      totalArea: 0, wasteArea: 0, wastePercent: 0,
      minCut: null, panelsNeeded: 0,
      panelsNeededA: null, panelsNeededB: null, reusedPairs: 0,
      warnings: [],
    };
  },
};
