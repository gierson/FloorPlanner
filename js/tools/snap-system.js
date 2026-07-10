/**
 * SnapSystem — Multi-level snapping for wall drawing
 *
 * Priority (highest first):
 * 1. Node snap — snap to existing junction (12px screen threshold)
 * 2. Edge snap — snap to wall edge, creates T-junction (8px)
 * 3. Angle snap — constrain to 0°/45°/90° from anchor (5° tolerance)
 * 4. Grid snap — snap to grid (if enabled)
 * 5. None — raw position rounded to mm
 *
 * All coordinates in mm.
 */
const SnapSystem = {

  /**
   * Apply snapping to a world position
   *
   * @param {{x:number,y:number}} worldPos - raw mouse position in mm
   * @param {WallGraph} graph - wall graph for node/edge snap
   * @param {Viewport} viewport - for screen-to-world threshold conversion
   * @param {Object} options
   * @param {{x:number,y:number}|null} options.anchor - anchor point for angle snap (start of wall)
   * @param {boolean} options.snapToGrid - is grid snap enabled
   * @param {number} options.gridSize - grid size in mm
   * @param {boolean} [options.angleSnap=true]
   * @returns {SnapResult}
   *
   * SnapResult = {
   *   x, y,                // snapped position
   *   type: string,        // 'node' | 'edge' | 'angle' | 'grid' | 'none'
   *   nodeId?: number,     // if type='node', the snapped node
   *   wallId?: number,     // if type='edge', the wall to split
   *   angle?: number,      // if type='angle', the constrained angle
   * }
   */
  snap(worldPos, graph, viewport, options = {}) {
    const {
      anchor = null,
      snapToGrid = true,
      gridSize = 100,
      angleSnap = true,
      nodeSnap = true,
      edgeSnap = true,
    } = options;

    // 1. Node snap (highest priority)
    if (nodeSnap) {
      const nodeThreshold = viewport.screenToWorldDist(12);
      const nodeHit = graph.findNodeNear(worldPos.x, worldPos.y, nodeThreshold);
      if (nodeHit !== null) {
        const node = graph.nodes.get(nodeHit);
        return {
          x: node.x,
          y: node.y,
          type: 'node',
          nodeId: nodeHit,
        };
      }
    }

    // 2. Edge snap (T-junction)
    if (edgeSnap) {
      const edgeThreshold = viewport.screenToWorldDist(8);
      const edgeHit = graph.findWallNear(worldPos.x, worldPos.y, edgeThreshold);
      if (edgeHit) {
        return {
          x: Math.round(edgeHit.projection.x),
          y: Math.round(edgeHit.projection.y),
          type: 'edge',
          wallId: edgeHit.wallId,
        };
      }
    }

    // 3. Angle snap (constrain to 0°/45°/90°/135° from anchor)
    if (angleSnap && anchor) {
      const snapped = this._angleSnap(worldPos, anchor);
      if (snapped) {
        return {
          x: Math.round(snapped.x),
          y: Math.round(snapped.y),
          type: 'angle',
          angle: snapped.angle,
        };
      }
    }

    // 4. Grid snap
    if (snapToGrid && gridSize > 0) {
      return {
        x: Geometry.snapToGrid(worldPos.x, gridSize),
        y: Geometry.snapToGrid(worldPos.y, gridSize),
        type: 'grid',
      };
    }

    // 5. None — round to mm
    return {
      x: Math.round(worldPos.x),
      y: Math.round(worldPos.y),
      type: 'none',
    };
  },

  /**
   * Attempt angle snap to nearest standard angle
   * @private
   * @returns {{x, y, angle}|null}
   */
  _angleSnap(worldPos, anchor) {
    const ANGLE_TOLERANCE = 5 * Math.PI / 180; // 5 degrees
    const STANDARD_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

    const dx = worldPos.x - anchor.x;
    const dy = worldPos.y - anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) return null; // too close to anchor

    const currentAngle = Math.atan2(dy, dx);
    const currentDeg = ((currentAngle * 180 / Math.PI) + 360) % 360;

    // Find nearest standard angle
    let bestAngle = null;
    let bestDiff = ANGLE_TOLERANCE;

    for (const stdDeg of STANDARD_ANGLES) {
      let diff = Math.abs(currentDeg - stdDeg);
      if (diff > 180) diff = 360 - diff;
      const diffRad = diff * Math.PI / 180;

      if (diffRad < bestDiff) {
        bestDiff = diffRad;
        bestAngle = stdDeg;
      }
    }

    if (bestAngle === null) return null;

    const snapRad = bestAngle * Math.PI / 180;
    return {
      x: anchor.x + Math.cos(snapRad) * dist,
      y: anchor.y + Math.sin(snapRad) * dist,
      angle: bestAngle,
    };
  },

  /**
   * Get visual indicators for current snap state
   * @param {SnapResult} snapResult
   * @param {{x:number,y:number}} anchor - optional anchor for angle guide
   * @returns {Array<SnapIndicator>}
   */
  getIndicators(snapResult, anchor) {
    const indicators = [];

    switch (snapResult.type) {
      case 'node':
        indicators.push({
          type: 'circle',
          x: snapResult.x,
          y: snapResult.y,
          radius: 8,
          color: '#34D399', // green
          label: 'Snap: węzeł',
        });
        break;

      case 'edge':
        indicators.push({
          type: 'diamond',
          x: snapResult.x,
          y: snapResult.y,
          size: 6,
          color: '#60A5FA', // blue
          label: 'Snap: ściana',
        });
        break;

      case 'angle':
        if (anchor) {
          indicators.push({
            type: 'guideline',
            from: anchor,
            to: snapResult,
            color: 'rgba(232, 168, 73, 0.3)',
            label: `${snapResult.angle}°`,
          });
        }
        indicators.push({
          type: 'crosshair',
          x: snapResult.x,
          y: snapResult.y,
          color: '#E8A849',
        });
        break;

      case 'grid':
        indicators.push({
          type: 'crosshair',
          x: snapResult.x,
          y: snapResult.y,
          color: 'rgba(232, 168, 73, 0.4)',
        });
        break;
    }

    return indicators;
  },
};
