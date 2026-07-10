/**
 * WasteCalculator — Realistic purchase & waste estimation for
 * tongue-and-groove (pióro-wpust) flooring.
 *
 * Straight pattern:
 *   A board cut once yields two pieces with factory locks on
 *   opposite ends. The piece keeping the board's "min" end fits only
 *   where a row ENDS; the piece keeping the "max" end only where a
 *   row STARTS — i.e. an offcut is reusable at the opposite side of
 *   the room, never at the same side (its cut end has no lock).
 *   Purchase count therefore pairs one min-end piece with one
 *   max-end piece when both lengths fit in a single board.
 *   Pieces ripped along their width, cut at both ends, or
 *   non-rectangular get a dedicated board and their offcut is waste.
 *   Multiple pieces clipped from the same grid cell (a board
 *   crossing a doorway) come from one physical board.
 *
 * Herringbone (conservative):
 *   +45° and −45° panels are mirror-image products (deska A /
 *   deska B) counted separately; diagonal offcuts are never reused —
 *   every board cell consumes one purchased board of its type.
 *
 * All areas in mm².
 */
const WasteCalculator = {

  /**
   * Compute realistic purchase requirements for one room's panels.
   *
   * @param {Array} panels — classified panels from LayoutEngine
   * @param {Object} config — { panelLength, panelWidth, pattern, direction }
   * @returns {{ panelsNeeded:number, panelsNeededA:?number,
   *             panelsNeededB:?number, wasteArea:number, reusedPairs:number }}
   */
  compute(panels, config) {
    const { panelLength, panelWidth } = config;
    const boardArea = panelLength * panelWidth;

    if (!panels || panels.length === 0) {
      return { panelsNeeded: 0, panelsNeededA: null, panelsNeededB: null, wasteArea: 0, reusedPairs: 0 };
    }

    let netArea = 0;
    for (const p of panels) netArea += p.area;

    if (config.pattern === 'herringbone') {
      // One purchased board per grid cell, split by board type
      const cellsA = new Set();
      const cellsB = new Set();
      for (const p of panels) {
        (p.angle > 0 ? cellsA : cellsB).add(p.row + ':' + p.col);
      }
      const panelsNeeded = cellsA.size + cellsB.size;
      return {
        panelsNeeded,
        panelsNeededA: cellsA.size,
        panelsNeededB: cellsB.size,
        wasteArea: panelsNeeded * boardArea - netArea,
        reusedPairs: 0,
      };
    }

    // ── Straight pattern ──
    const TOL = 1.5; // mm, matches LayoutEngine boundary tolerance
    const alongY = config.direction === 90; // board length runs along Y

    // Group pieces by source grid cell — pieces clipped from the
    // same cell share one physical board.
    const groups = new Map();
    for (const p of panels) {
      const key = p.row + ':' + p.col;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    // Collect lengths of pieces eligible for offcut pairing:
    // rectangular, full-width, cut in length, keeping exactly one
    // factory end.
    const minEndKeepers = []; // row-end pieces (factory min end)
    const maxEndKeepers = []; // row-start pieces (factory max end)

    for (const group of groups.values()) {
      if (group.length !== 1) continue;
      const p = group[0];
      if (!p.isRect || !p.sourceBoard || typeof p.sourceBoard.minX !== 'number') continue;

      const b = p.bounds;
      const s = p.sourceBoard;
      const len = alongY ? b.height : b.width;
      const wid = alongY ? b.width : b.height;

      if (wid < panelWidth - TOL) continue;      // ripped — lock edge lost
      if (len >= panelLength - TOL) continue;    // full length — nothing to pair

      const keepsMin = alongY
        ? Math.abs(b.minY - s.minY) <= TOL
        : Math.abs(b.minX - s.minX) <= TOL;
      const keepsMax = alongY
        ? Math.abs(b.maxY - s.maxY) <= TOL
        : Math.abs(b.maxX - s.maxX) <= TOL;

      if (keepsMin === keepsMax) continue; // cut at both ends — no lock left
      (keepsMin ? minEndKeepers : maxEndKeepers).push(len);
    }

    // Maximize pairs (a, b) with a + b ≤ panelLength: sort one list
    // ascending, the other descending, greedily match.
    minEndKeepers.sort((a, b) => a - b);
    maxEndKeepers.sort((a, b) => b - a);
    let pairs = 0;
    let i = 0, j = 0;
    while (i < minEndKeepers.length && j < maxEndKeepers.length) {
      if (minEndKeepers[i] + maxEndKeepers[j] <= panelLength + TOL) {
        pairs++; i++; j++;
      } else {
        j++; // longest remaining max-end piece fits with nothing
      }
    }

    const panelsNeeded = groups.size - pairs;
    return {
      panelsNeeded,
      panelsNeededA: null,
      panelsNeededB: null,
      wasteArea: panelsNeeded * boardArea - netArea,
      reusedPairs: pairs,
    };
  },

  /**
   * Aggregate per-room stats (areas in m², as produced by
   * LayoutEngine stats) into the summary shape.
   *
   * @param {Array<Object>} statsList — per-room stats objects
   * @returns {Object} aggregate stats
   */
  aggregate(statsList) {
    const agg = {
      totalArea: 0, totalWaste: 0, wastePercent: 0,
      totalPanels: 0, totalCuts: 0, totalProblematic: 0,
      panelsNeeded: 0, panelsNeededA: null, panelsNeededB: null,
    };
    for (const s of statsList) {
      agg.totalArea += s.totalArea;
      agg.totalWaste += s.wasteArea;
      agg.totalPanels += s.totalPanels;
      agg.totalCuts += s.cutPanels;
      agg.totalProblematic += s.problematicPanels || 0;
      agg.panelsNeeded += s.panelsNeeded;
      if (s.panelsNeededA != null) {
        agg.panelsNeededA = (agg.panelsNeededA || 0) + s.panelsNeededA;
      }
      if (s.panelsNeededB != null) {
        agg.panelsNeededB = (agg.panelsNeededB || 0) + s.panelsNeededB;
      }
    }
    agg.wastePercent = agg.totalArea > 0
      ? (agg.totalWaste / (agg.totalArea + agg.totalWaste)) * 100
      : 0;
    return agg;
  },
};
