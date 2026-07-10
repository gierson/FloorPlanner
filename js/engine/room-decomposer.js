/**
 * RoomDecomposer — Scanline algorithm for polygon analysis
 * @description Generates panel layout for complex room shapes (L/T/U).
 * 
 * KEY DESIGN: Tongue-and-groove constraint
 * - Cut edges can ONLY be against walls
 * - Panels must be rectangular (no L-shaped cuts)
 * - At L-shape junctions, we use INTERSECTION of spans for full-height
 *   panels, and DIFFERENCE spans for partial-height panels (cut edge
 *   against the junction wall)
 */
const RoomDecomposer = {

  /**
   * Find horizontal spans inside a polygon at a given Y coordinate
   * Uses ray-casting: cast a horizontal ray, find intersection X coords,
   * pair them into inside segments.
   */
  getSpansAtY(polygon, y) {
    const n = polygon.length;
    const intersections = [];

    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];

      // Skip horizontal edges
      if (Math.abs(a.y - b.y) < 0.1) continue;

      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);

      if (y >= minY && y < maxY) {
        const t = (y - a.y) / (b.y - a.y);
        const x = a.x + t * (b.x - a.x);
        intersections.push(x);
      }
    }

    intersections.sort((a, b) => a - b);

    const spans = [];
    for (let i = 0; i < intersections.length - 1; i += 2) {
      spans.push({
        xStart: intersections[i],
        xEnd: intersections[i + 1],
      });
    }

    return spans;
  },

  /**
   * Find horizontal spans for a Y range, clamped to polygon bbox
   */
  getSpansForYRange(polygon, yMin, yMax) {
    const bbox = Geometry.boundingBox(polygon);
    const overlapMinY = Math.max(yMin, bbox.minY);
    const overlapMaxY = Math.min(yMax, bbox.maxY);
    if (overlapMinY >= overlapMaxY) return [];
    const yMid = (overlapMinY + overlapMaxY) / 2;
    return this.getSpansAtY(polygon, yMid);
  },

  /**
   * Intersect two sorted span arrays — returns spans covered by BOTH A and B
   * @private
   */
  _intersectSpans(spansA, spansB) {
    const result = [];
    let i = 0, j = 0;
    while (i < spansA.length && j < spansB.length) {
      const start = Math.max(spansA[i].xStart, spansB[j].xStart);
      const end = Math.min(spansA[i].xEnd, spansB[j].xEnd);
      if (end - start > 0.5) {
        result.push({ xStart: start, xEnd: end });
      }
      if (spansA[i].xEnd < spansB[j].xEnd) i++;
      else j++;
    }
    return result;
  },

  /**
   * Difference: spans in A that are NOT in B
   * @private
   */
  _differenceSpans(spansA, spansB) {
    if (spansB.length === 0) return spansA.map(s => ({ ...s }));
    const result = [];
    for (const spanA of spansA) {
      let current = spanA.xStart;
      for (const spanB of spansB) {
        if (spanB.xEnd <= current + 0.5) continue;
        if (spanB.xStart >= spanA.xEnd - 0.5) break;
        if (spanB.xStart > current + 0.5) {
          result.push({ xStart: current, xEnd: spanB.xStart });
        }
        current = Math.max(current, spanB.xEnd);
      }
      if (spanA.xEnd - current > 0.5) {
        result.push({ xStart: current, xEnd: spanA.xEnd });
      }
    }
    return result;
  },

  /**
   * Generate all panel positions for a room.
   *
   * For tongue-and-groove panels:
   * - At L/T/U junctions where a horizontal polygon edge crosses a row,
   *   the row is split into COMMON zone (full row height) and EXTRA zones
   *   (partial height, cut edge against junction wall).
   * - No L-shaped cuts are generated.
   */
  generateLayout(polygon, config) {
    const {
      panelLength, panelWidth, offsetX, offsetY,
      direction, stagger, minCutWidth, minCutLength
    } = config;

    let workPoly = polygon;
    if (direction === 90) {
      workPoly = polygon.map(v => ({ x: v.y, y: v.x }));
    }

    const bbox = Geometry.boundingBox(workPoly);
    const panels = [];
    const warnings = [];

    let totalPanels = 0;
    let cutPanels = 0;
    let totalArea = 0;
    let wasteArea = 0;
    let minCutFound = Infinity;

    // Horizontal edge Y-positions for sub-row detection
    const hEdgeYs = Geometry.getHorizontalEdgeYs(workPoly);

    const rowStart = Math.floor((bbox.minY - offsetY) / panelWidth);
    const rowEnd = Math.ceil((bbox.maxY - offsetY) / panelWidth);

    for (let row = rowStart; row <= rowEnd; row++) {
      const rowYMin = offsetY + row * panelWidth;
      const rowYMax = rowYMin + panelWidth;

      if (rowYMax <= bbox.minY || rowYMin >= bbox.maxY) continue;

      // Stagger (based on row, consistent for all sub-zones)
      let staggerOffset = 0;
      if (stagger === 'half') {
        staggerOffset = (row % 2) * (panelLength / 2);
      } else if (stagger === 'third') {
        staggerOffset = (((row % 3) + 3) % 3) * (panelLength / 3);
      } else if (stagger === 'random') {
        staggerOffset = ((row * 7919 + 104729) % panelLength);
        if (staggerOffset < 300) staggerOffset += 300;
        if (staggerOffset > panelLength - 300) staggerOffset = panelLength - 300;
      }

      // Find horizontal edges that cross this row
      const edgesInRow = hEdgeYs.filter(y => y > rowYMin + 0.5 && y < rowYMax - 0.5);
      edgesInRow.sort((a, b) => a - b);

      if (edgesInRow.length === 0) {
        // ── SIMPLE CASE: no junction in this row ──
        const spans = this.getSpansForYRange(workPoly, rowYMin, rowYMax);
        const clipYStart = Math.max(rowYMin, bbox.minY);
        const clipYEnd = Math.min(rowYMax, bbox.maxY);
        this._layPanelsForSpans(
          spans, clipYStart, clipYEnd, row, staggerOffset,
          offsetX, panelLength, panelWidth, direction,
          minCutWidth, minCutLength,
          panels, warnings, { totalPanels, cutPanels, totalArea, minCutFound }
        );
      } else {
        // ── JUNCTION CASE: horizontal edge(s) cross this row ──
        // Build sub-row zones
        const subBounds = [rowYMin, ...edgesInRow, rowYMax];
        const subRowData = [];
        for (let si = 0; si < subBounds.length - 1; si++) {
          const yMin = subBounds[si];
          const yMax = subBounds[si + 1];
          const spans = this.getSpansForYRange(workPoly, yMin, yMax);
          subRowData.push({ yMin, yMax, spans });
        }

        // Find INTERSECTION of all sub-row spans (common zone)
        let commonSpans = subRowData[0].spans;
        for (let i = 1; i < subRowData.length; i++) {
          commonSpans = this._intersectSpans(commonSpans, subRowData[i].spans);
        }

        // 1. Lay FULL-HEIGHT panels in the common zone
        const clipYStart = Math.max(rowYMin, bbox.minY);
        const clipYEnd = Math.min(rowYMax, bbox.maxY);
        this._layPanelsForSpans(
          commonSpans, clipYStart, clipYEnd, row, staggerOffset,
          offsetX, panelLength, panelWidth, direction,
          minCutWidth, minCutLength,
          panels, warnings, { totalPanels, cutPanels, totalArea, minCutFound }
        );

        // 2. Lay PARTIAL-HEIGHT panels in each sub-row's extra zone
        //    (areas covered by this sub-row but NOT in the common zone)
        //    These panels have cut edges only against junction walls
        for (const subRow of subRowData) {
          const extraSpans = this._differenceSpans(subRow.spans, commonSpans);
          if (extraSpans.length > 0) {
            const extraYStart = Math.max(subRow.yMin, bbox.minY);
            const extraYEnd = Math.min(subRow.yMax, bbox.maxY);
            this._layPanelsForSpans(
              extraSpans, extraYStart, extraYEnd, row, staggerOffset,
              offsetX, panelLength, panelWidth, direction,
              minCutWidth, minCutLength,
              panels, warnings, { totalPanels, cutPanels, totalArea, minCutFound }
            );
          }
        }
      }
    }

    // Update stats from accumulated panel data
    totalPanels = panels.length;
    cutPanels = panels.filter(p => p.isCut).length;
    totalArea = panels.reduce((sum, p) => sum + p.actualWidth * p.actualHeight, 0);
    minCutFound = Infinity;
    for (const p of panels) {
      if (p.isCutX && p.actualWidth < minCutFound) minCutFound = p.actualWidth;
      if (p.isCutY && p.actualHeight < minCutFound) minCutFound = p.actualHeight;
    }

    const panelArea = panelLength * panelWidth;
    const usedFullPanels = Math.ceil(totalArea / panelArea);
    wasteArea = usedFullPanels * panelArea - totalArea;

    return {
      panels,
      stats: {
        totalPanels,
        cutPanels,
        fullPanels: totalPanels - cutPanels,
        totalArea: totalArea / 1e6,
        wasteArea: wasteArea / 1e6,
        wastePercent: totalArea > 0 ? (wasteArea / (totalArea + wasteArea)) * 100 : 0,
        minCut: minCutFound === Infinity ? null : minCutFound,
        panelsNeeded: usedFullPanels,
      },
      warnings,
    };
  },

  /**
   * Lay panels along given spans for a specific Y range.
   * Handles clipping, cut detection, direction transform, and warnings.
   * @private
   */
  _layPanelsForSpans(
    spans, clipYStart, clipYEnd, row, staggerOffset,
    offsetX, panelLength, panelWidth, direction,
    minCutWidth, minCutLength,
    panels, warnings, _stats
  ) {
    if (clipYEnd - clipYStart < 0.5) return;

    for (const span of spans) {
      const effectiveOffsetX = offsetX + staggerOffset;
      const panelStart = Math.floor((span.xStart - effectiveOffsetX) / panelLength);
      const panelEnd = Math.ceil((span.xEnd - effectiveOffsetX) / panelLength);

      for (let col = panelStart; col < panelEnd; col++) {
        const px = effectiveOffsetX + col * panelLength;
        const panelXEnd = px + panelLength;

        // Clip X to span
        const cxStart = Math.max(px, span.xStart);
        const cxEnd = Math.min(panelXEnd, span.xEnd);

        if (cxEnd - cxStart < 0.5 || clipYEnd - clipYStart < 0.5) continue;

        const actualWidth = cxEnd - cxStart;
        const actualHeight = clipYEnd - clipYStart;

        const isCutX = actualWidth < panelLength - 0.5;
        const isCutY = actualHeight < panelWidth - 0.5;
        const isCut = isCutX || isCutY;

        const isProblematicWidth = isCutX && actualWidth < minCutLength;
        const isProblematicHeight = isCutY && actualHeight < minCutWidth;
        const isProblematic = isProblematicWidth || isProblematicHeight;

        // Transform back if direction was 90°
        let panelRect;
        if (direction === 90) {
          panelRect = {
            x: clipYStart, y: cxStart,
            width: actualHeight, height: actualWidth,
          };
        } else {
          panelRect = {
            x: cxStart, y: clipYStart,
            width: actualWidth, height: actualHeight,
          };
        }

        panels.push({
          ...panelRect,
          row,
          col,
          isCut,
          isCutX,
          isCutY,
          isProblematic,
          actualWidth,
          actualHeight,
          fullWidth: panelLength,
          fullHeight: panelWidth,
        });

        if (isProblematic) {
          const dimStr = isProblematicWidth
            ? `${Math.round(actualWidth)} mm dł.`
            : `${Math.round(actualHeight)} mm szer.`;
          warnings.push({
            type: 'cut-too-small',
            message: `Docinek ${dimStr} (rząd ${row + 1})`,
            row, col,
            dimension: isProblematicWidth ? actualWidth : actualHeight,
          });
        }
      }
    }
  },
};
