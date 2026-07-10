/**
 * Geometry — Pure utility functions for polygon math
 * @description All coordinates in millimeters (mm)
 */
const Geometry = {

  /**
   * Distance between two points
   * @param {{x:number,y:number}} a
   * @param {{x:number,y:number}} b
   * @returns {number}
   */
  distance(a, b) {
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  },

  /**
   * Distance from a point to a line segment
   * @param {{x:number,y:number}} p
   * @param {{x:number,y:number}} a - Segment start
   * @param {{x:number,y:number}} b - Segment end
   * @returns {number}
   */
  distanceToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return this.distance(p, a);

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return this.distance(p, {
      x: a.x + t * dx,
      y: a.y + t * dy,
    });
  },

  /**
   * Midpoint of a segment
   * @param {{x:number,y:number}} a
   * @param {{x:number,y:number}} b
   * @returns {{x:number,y:number}}
   */
  midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  },

  /**
   * Length of a segment
   * @param {{x:number,y:number}} a
   * @param {{x:number,y:number}} b
   * @returns {number}
   */
  segmentLength(a, b) {
    return this.distance(a, b);
  },

  /**
   * Angle of a segment in radians
   * @param {{x:number,y:number}} a
   * @param {{x:number,y:number}} b
   * @returns {number}
   */
  segmentAngle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  },

  /**
   * Calculate polygon area using the Shoelace formula
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {number} Absolute area (always positive)
   */
  polygonArea(vertices) {
    const n = vertices.length;
    if (n < 3) return 0;

    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }

    return Math.abs(area) / 2;
  },

  /**
   * Determine polygon winding order
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {number} Positive = CCW, Negative = CW
   */
  polygonSignedArea(vertices) {
    const n = vertices.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return area / 2;
  },

  /**
   * Ensure vertices are in counter-clockwise order
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {Array<{x:number,y:number}>} CCW-ordered vertices
   */
  ensureCCW(vertices) {
    // In screen coords (Y-down), CCW winding has negative signed area.
    // If area > 0, vertices are CW → reverse to make CCW.
    if (this.polygonSignedArea(vertices) > 0) {
      return [...vertices].reverse();
    }
    return [...vertices];
  },

  /**
   * Point-in-polygon test (ray casting)
   * @param {{x:number,y:number}} point
   * @param {Array<{x:number,y:number}>} polygon
   * @returns {boolean}
   */
  isPointInPolygon(point, polygon) {
    const n = polygon.length;
    let inside = false;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  },

  /**
   * Bounding box of a polygon
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {{minX:number, minY:number, maxX:number, maxY:number, width:number, height:number}}
   */
  boundingBox(vertices) {
    if (vertices.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  },

  /**
   * Check if a polygon is rectilinear (all edges axis-aligned)
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {boolean}
   */
  isRectilinear(vertices) {
    const n = vertices.length;
    if (n < 4) return false;

    const EPSILON = 0.5; // mm tolerance
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = Math.abs(vertices[j].x - vertices[i].x);
      const dy = Math.abs(vertices[j].y - vertices[i].y);
      if (dx > EPSILON && dy > EPSILON) return false;
    }
    return true;
  },

  /**
   * Inset (shrink) a rectilinear polygon by a given distance
   * For each edge, move it inward by `distance`.
   * @param {Array<{x:number,y:number}>} vertices - CCW-ordered
   * @param {number} distance - Inset distance in mm
   * @returns {Array<{x:number,y:number}>} Inset vertices
   */
  insetPolygon(vertices, distance) {
    const n = vertices.length;
    if (n < 3) return vertices;

    const ccw = this.ensureCCW(vertices);
    const inset = [];

    for (let i = 0; i < n; i++) {
      const prev = ccw[(i - 1 + n) % n];
      const curr = ccw[i];
      const next = ccw[(i + 1) % n];

      // Compute inward normals for the two edges meeting at this vertex
      // Edge prev→curr
      const e1 = { x: curr.x - prev.x, y: curr.y - prev.y };
      const len1 = Math.sqrt(e1.x * e1.x + e1.y * e1.y) || 1;
      const n1 = { x: -e1.y / len1, y: e1.x / len1 }; // left normal for CCW

      // Edge curr→next
      const e2 = { x: next.x - curr.x, y: next.y - curr.y };
      const len2 = Math.sqrt(e2.x * e2.x + e2.y * e2.y) || 1;
      const n2 = { x: -e2.y / len2, y: e2.x / len2 };

      // Average normal (works well for rectilinear polygons with 90° corners)
      // For 90° corners, the bisector is at 45° and has length distance * sqrt(2) / (1 + cos(angle))
      // For rectilinear, we can simply offset each coordinate independently

      const nx = (n1.x + n2.x);
      const ny = (n1.y + n2.y);
      const nlen = Math.sqrt(nx * nx + ny * ny) || 1;

      // For 90° corners the factor is 1/cos(45°) = sqrt(2), but using the formula:
      const dot = n1.x * n2.x + n1.y * n2.y;
      const factor = distance / ((1 + dot) / 2 || 1);

      inset.push({
        x: curr.x + (nx / nlen) * factor * (nlen / 2),
        y: curr.y + (ny / nlen) * factor * (nlen / 2),
      });
    }

    return inset;
  },

  /**
   * Inset for rectilinear polygons using edge-offset approach
   * Offsets each edge inward by distance d, then intersects adjacent
   * offset edges to find new vertex positions.
   * @param {Array<{x:number,y:number}>} vertices - polygon vertices
   * @param {number} d - Default inset distance
   * @param {Array<number>} [edgeInsets] - Optional per-edge inset distances.
   *   edgeInsets[i] = inset distance for edge vertices[i] → vertices[(i+1)%n].
   *   Use 0 for door openings that should not be insetted.
   * @returns {Array<{x:number,y:number}>}
   */
  insetRectilinear(vertices, d, edgeInsets) {
    const n = vertices.length;
    if (n < 4) return [...vertices];

    // Determine if we need to reverse to CCW
    const sa = this.polygonSignedArea(vertices);
    const needsReverse = sa > 0; // CW in Y-down screen → reverse to CCW

    let ccw, mappedEdgeInsets;
    if (needsReverse) {
      ccw = [...vertices].reverse();
      // When reversing: original edge i→(i+1) becomes reversed edge (n-1-i)→(n-i)
      // In the reversed polygon, edge j→(j+1) corresponds to original edge (n-2-j)→(n-1-j)
      // The original edge index for reversed edge j is: (n - 2 - j + n) % n
      if (edgeInsets) {
        mappedEdgeInsets = new Array(n);
        for (let j = 0; j < n; j++) {
          // Reversed edge j (from ccw[j] to ccw[j+1]) was originally:
          // from vertices[n-1-j] to vertices[n-2-j], which is the REVERSE of
          // original edge (n-2-j)→(n-1-j), i.e., original edge index (n-2-j+n)%n
          mappedEdgeInsets[j] = edgeInsets[(n - 2 - j + n) % n];
        }
      }
    } else {
      ccw = [...vertices];
      mappedEdgeInsets = edgeInsets ? [...edgeInsets] : undefined;
    }

    // For each edge, compute the inward-offset line
    // Inward normal for CCW polygon in Y-down: rotate edge direction 90° clockwise → (ey, -ex)
    const offsetEdges = [];
    const validEdgeIndices = []; // track which original edges survived length filter
    for (let i = 0; i < n; i++) {
      const a = ccw[i];
      const b = ccw[(i + 1) % n];
      const edgeX = b.x - a.x;
      const edgeY = b.y - a.y;
      const len = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
      if (len < 0.01) continue;

      // Inward normal (for CCW in Y-down: rotate edge 90° clockwise → (ey, -ex))
      const nx = edgeY / len;
      const ny = -edgeX / len;

      // Per-edge inset distance
      const insetDist = (mappedEdgeInsets && mappedEdgeInsets[i] !== undefined)
        ? mappedEdgeInsets[i] : d;

      // Offset both endpoints
      offsetEdges.push({
        a: { x: a.x + nx * insetDist, y: a.y + ny * insetDist },
        b: { x: b.x + nx * insetDist, y: b.y + ny * insetDist },
        dir: { x: edgeX / len, y: edgeY / len },
        origIdx: i,
      });
    }

    if (offsetEdges.length < 3) return [...vertices];

    // Intersect consecutive offset edges to find new vertices
    const result = [];
    const m = offsetEdges.length;
    const TOL_NEAR = 1.5;
    const ptEq = (a, b) => Math.abs(a.x - b.x) <= TOL_NEAR && Math.abs(a.y - b.y) <= TOL_NEAR;

    for (let i = 0; i < m; i++) {
      const e1 = offsetEdges[i];
      const e2 = offsetEdges[(i + 1) % m];

      // Check if edges are nearly collinear (same direction)
      const dot = e1.dir.x * e2.dir.x + e1.dir.y * e2.dir.y;

      if (dot > 0.99) {
        // Nearly collinear edges with potentially different offsets.
        // Instead of computing a far-away intersection, insert a perpendicular
        // step connecting the end of e1 to the start of e2.
        const p1 = { x: Math.round(e1.b.x), y: Math.round(e1.b.y) };
        const p2 = { x: Math.round(e2.a.x), y: Math.round(e2.a.y) };
        if (ptEq(p1, p2)) {
          // Same offset → single vertex
          result.push(p1);
        } else {
          // Different offsets → insert two vertices (perpendicular step)
          result.push(p1);
          result.push(p2);
        }
      } else {
        const pt = this._lineIntersection(e1.a, e1.b, e2.a, e2.b);
        if (pt) {
          result.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
        } else {
          // Parallel but not collinear — fallback to endpoint
          result.push({ x: Math.round(e1.b.x), y: Math.round(e1.b.y) });
        }
      }
    }

    return result.length >= 3 ? result : [...vertices];
  },

  /**
   * Intersect two infinite lines (each given by two points)
   * @private
   */
  _lineIntersection(p1, p2, p3, p4) {
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(d) < 1e-10) return null; // parallel

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
  },

  /**
   * Get all unique Y-coordinates of horizontal edges in a polygon
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {number[]}
   */
  getHorizontalEdgeYs(vertices) {
    const ys = new Set();
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = Math.abs(vertices[i].x - vertices[j].x);
      const dy = Math.abs(vertices[i].y - vertices[j].y);
      // Skip zero-length edges (duplicate vertices)
      if (dx < 0.5 && dy < 0.5) continue;
      if (dy < 0.5) {
        ys.add(Math.round(vertices[i].y));
      }
    }
    return [...ys].sort((a, b) => a - b);
  },

  /**
   * Get all unique X-coordinates of vertical edges in a polygon
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {number[]}
   */
  getVerticalEdgeXs(vertices) {
    const xs = new Set();
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = Math.abs(vertices[i].x - vertices[j].x);
      const dy = Math.abs(vertices[i].y - vertices[j].y);
      // Skip zero-length edges (duplicate vertices)
      if (dx < 0.5 && dy < 0.5) continue;
      if (dx < 0.5) {
        xs.add(Math.round(vertices[i].x));
      }
    }
    return [...xs].sort((a, b) => a - b);
  },

  /**
   * Snap a value to the nearest grid point
   * @param {number} value
   * @param {number} gridSize
   * @returns {number}
   */
  snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
  },

  /**
   * Snap a point to grid
   * @param {{x:number,y:number}} point
   * @param {number} gridSize
   * @returns {{x:number,y:number}}
   */
  snapPointToGrid(point, gridSize) {
    return {
      x: this.snapToGrid(point.x, gridSize),
      y: this.snapToGrid(point.y, gridSize),
    };
  },

  /**
   * Format mm as human-readable string
   * @param {number} mm
   * @param {boolean} [useCm=false]
   * @returns {string}
   */
  formatDimension(mm, useCm = false) {
    if (useCm) {
      const cm = mm / 10;
      return cm % 1 === 0 ? `${cm} cm` : `${cm.toFixed(1)} cm`;
    }
    return `${Math.round(mm)} mm`;
  },

  /**
   * Line-line intersection (infinite lines through a1→a2 and b1→b2)
   * @param {{x:number,y:number}} a1
   * @param {{x:number,y:number}} a2
   * @param {{x:number,y:number}} b1
   * @param {{x:number,y:number}} b2
   * @returns {{x:number,y:number}|null} intersection point or null if parallel
   */
  _lineIntersection(a1, a2, b1, b2) {
    const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
    if (Math.abs(d) < 1e-10) return null; // parallel

    const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
    return {
      x: a1.x + t * (a2.x - a1.x),
      y: a1.y + t * (a2.y - a1.y),
    };
  },

  /**
   * Bounding box of a polygon
   * @param {Array<{x:number,y:number}>} vertices
   * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
   */
  boundingBox(vertices) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
    return { minX, minY, maxX, maxY };
  },
};
