/**
 * LayoutScorer — Configurable scoring function for layout evaluation
 * 
 * Evaluates a generated layout and returns a single score (higher = better).
 * Considers waste, short cuts, field cuts, pattern regularity, and edge quality.
 * 
 * Three scoring modes:
 * - 'aesthetic'    — prioritize visual quality and even cuts
 * - 'economic'     — minimize waste
 * - 'installation' — minimize difficult cuts and field cuts
 */
const LayoutScorer = {

  /**
   * Score a layout result
   * 
   * @param {LayoutResult} layout - from LayoutEngine.generateLayout()
   * @param {Object} config - layout config (panelLength, panelWidth, minCutLength, etc.)
   * @param {string} [mode='aesthetic'] - scoring mode
   * @returns {number} score (higher = better)
   */
  score(layout, config, mode = 'aesthetic') {
    if (!layout || !layout.panels || layout.panels.length === 0) {
      return -Infinity;
    }

    const { panels, stats } = layout;
    const { minCutLength, minCutWidth, panelLength, panelWidth } = config;

    const weights = this._getWeights(mode);

    // ── 1. Waste penalty ──
    // Lower waste is better
    const wastePenalty = stats.wastePercent;

    // ── 2. Short cut penalty ──
    // Heavily penalize cuts shorter than minCutLength or minCutWidth
    let shortCutPenalty = 0;
    let shortCutCount = 0;
    for (const panel of panels) {
      if (!panel.isCut) continue;

      if (panel.isCutX && panel.actualWidth < minCutLength) {
        const deficit = minCutLength - panel.actualWidth;
        shortCutPenalty += deficit * deficit; // quadratic penalty
        shortCutCount++;
      }
      if (panel.isCutY && panel.actualHeight < minCutWidth) {
        const deficit = minCutWidth - panel.actualHeight;
        shortCutPenalty += deficit * deficit;
        shortCutCount++;
      }
    }
    // Normalize by number of panels
    shortCutPenalty = panels.length > 0
      ? shortCutPenalty / panels.length
      : 0;

    // ── 3. Field cut penalty ──
    // Cuts NOT adjacent to walls are unacceptable for tongue-and-groove
    const fieldCutPenalty = stats.fieldCutCount * 1000;

    // ── 4. Cut balance score ──
    // Prefer layouts where opposite-side cuts are balanced
    // (e.g., left cut ≈ right cut instead of 30mm left + 1000mm right)
    let balancePenalty = 0;
    if (panels.length > 0) {
      // Group cuts by row and check balance per row
      const rowCuts = new Map();
      for (const panel of panels) {
        if (!panel.isCutX) continue;
        if (!rowCuts.has(panel.row)) rowCuts.set(panel.row, []);
        rowCuts.get(panel.row).push(panel);
      }

      for (const [, rowPanels] of rowCuts) {
        if (rowPanels.length < 2) continue;

        // Sort by X position to find leftmost and rightmost cuts
        rowPanels.sort((a, b) => a.x - b.x);
        const leftCut = rowPanels[0].actualWidth;
        const rightCut = rowPanels[rowPanels.length - 1].actualWidth;

        // Penalize imbalance — squared difference normalized by panel length
        const diff = Math.abs(leftCut - rightCut);
        balancePenalty += (diff * diff) / (panelLength * panelLength);
      }

      balancePenalty /= rowCuts.size || 1;
    }

    // ── 5. Min cut dimension score ──
    // Reward larger minimum cuts
    let minCutScore = 0;
    if (stats.minCut !== null) {
      minCutScore = Math.max(0, stats.minCut);
    }

    // ── Combine ──
    const score =
      -(wastePenalty * weights.waste)
      -(shortCutPenalty * weights.shortCut)
      -(fieldCutPenalty * weights.fieldCut)
      -(balancePenalty * weights.balance)
      +(minCutScore * weights.minCut);

    return score;
  },

  /**
   * Get weight configuration for a scoring mode
   * @private
   */
  _getWeights(mode) {
    switch (mode) {
      case 'economic':
        return {
          waste: 2.0,       // waste is primary concern
          shortCut: 0.5,
          fieldCut: 100.0,  // still unacceptable
          balance: 0.2,
          minCut: 0.01,
        };

      case 'installation':
        return {
          waste: 0.5,
          shortCut: 3.0,     // difficult cuts penalized heavily
          fieldCut: 100.0,
          balance: 1.0,
          minCut: 0.05,
        };

      case 'aesthetic':
      default:
        return {
          waste: 1.0,
          shortCut: 2.0,
          fieldCut: 100.0,
          balance: 1.5,      // visual balance matters
          minCut: 0.03,
        };
    }
  },
};
