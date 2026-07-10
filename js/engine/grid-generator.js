/**
 * GridGenerator — Generates a regular grid of board rectangles
 * 
 * Pure geometry: no clipping, no room awareness.
 * Creates the ideal grid of panels that will later be clipped
 * against the room polygon by LayoutEngine.
 * 
 * All coordinates in millimeters (mm).
 */
const GridGenerator = {

  /**
   * Generate grid of board rectangles covering a bounding box.
   * 
   * @param {{minX:number, minY:number, maxX:number, maxY:number}} bbox
   *   Bounding box of the room polygon (after inset)
   * @param {Object} config
   * @param {number} config.panelLength - Board length in mm
   * @param {number} config.panelWidth  - Board width (row height) in mm
   * @param {number} config.offsetX     - X offset of the entire grid in mm
   * @param {number} config.offsetY     - Y offset of the entire grid in mm
   * @param {string} config.stagger     - 'third' | 'half' | 'random' | 'none'
   * @param {number} [config.direction=0] - 0 = horizontal, 90 = vertical
   * @returns {Array<BoardRect>} Array of board definitions
   * 
   * BoardRect = {
   *   row: number,          - Row index
   *   col: number,          - Column index
   *   rect: {minX, minY, maxX, maxY},  - Board rectangle in world coords
   *   staggerOffset: number - Stagger applied to this row
   * }
   */
  generate(bbox, config) {
    const {
      panelLength, panelWidth,
      offsetX = 0, offsetY = 0,
      stagger = 'third',
      direction = 0,
    } = config;

    // For vertical direction (90°), swap X/Y roles
    // We generate in "work" coordinates where boards always go along X,
    // then transform back
    let workBbox = bbox;
    if (direction === 90) {
      workBbox = {
        minX: bbox.minY, minY: bbox.minX,
        maxX: bbox.maxY, maxY: bbox.maxX,
      };
    }

    const boards = [];

    // Row range
    const rowStart = Math.floor((workBbox.minY - offsetY) / panelWidth);
    const rowEnd = Math.ceil((workBbox.maxY - offsetY) / panelWidth);

    for (let row = rowStart; row <= rowEnd; row++) {
      const rowYMin = offsetY + row * panelWidth;
      const rowYMax = rowYMin + panelWidth;

      // Skip rows entirely outside bbox
      if (rowYMax <= workBbox.minY || rowYMin >= workBbox.maxY) continue;

      // Calculate stagger for this row
      const staggerOffset = this._getStaggerOffset(row, panelLength, stagger);

      // Column range (accounting for stagger)
      const effectiveOffsetX = offsetX + staggerOffset;
      const colStart = Math.floor((workBbox.minX - effectiveOffsetX) / panelLength);
      const colEnd = Math.ceil((workBbox.maxX - effectiveOffsetX) / panelLength);

      for (let col = colStart; col < colEnd; col++) {
        const boardXMin = effectiveOffsetX + col * panelLength;
        const boardXMax = boardXMin + panelLength;

        // Skip boards entirely outside bbox
        if (boardXMax <= workBbox.minX || boardXMin >= workBbox.maxX) continue;

        // Transform back if direction=90
        let rect;
        if (direction === 90) {
          rect = {
            minX: rowYMin, minY: boardXMin,
            maxX: rowYMax, maxY: boardXMax,
          };
        } else {
          rect = {
            minX: boardXMin, minY: rowYMin,
            maxX: boardXMax, maxY: rowYMax,
          };
        }

        boards.push({
          row,
          col,
          rect,
          staggerOffset,
        });
      }
    }

    return boards;
  },

  /**
   * Calculate stagger offset for a given row
   * @private
   */
  _getStaggerOffset(row, panelLength, stagger) {
    switch (stagger) {
      case 'half':
        return (((row % 2) + 2) % 2) * (panelLength / 2);

      case 'third':
        return (((row % 3) + 3) % 3) * (panelLength / 3);

      case 'random': {
        // Deterministic pseudo-random based on row index
        let offset = ((row * 7919 + 104729) % panelLength);
        // Clamp to avoid too-short pieces at row starts
        const minStagger = Math.min(300, panelLength * 0.2);
        if (offset < minStagger) offset += minStagger;
        if (offset > panelLength - minStagger) offset = panelLength - minStagger;
        return offset;
      }

      case 'none':
      default:
        return 0;
    }
  },
};
