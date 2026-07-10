/**
 * PolygonClip — Geometric operations for polygon clipping
 * 
 * Core algorithm: Sutherland-Hodgman for clipping any polygon against
 * a convex clip polygon (rectangle). Works correctly for non-convex
 * subjects (room polygons) since the clip (board rectangle) is always convex.
 * 
 * All coordinates in millimeters (mm).
 */
const PolygonClip = {

  // ─── Sutherland-Hodgman Clip ───────────────────────────────────────

  /**
   * Clip a polygon against an axis-aligned rectangle.
   * 
   * Since the clip rectangle is convex, Sutherland-Hodgman is exact.
   * We clip against each of the 4 half-planes (left, right, top, bottom).
   * 
   * For non-convex subjects the result may self-intersect — we split
   * such results into simple sub-polygons via _splitSelfIntersecting().
   * 
   * @param {Array<{x:number, y:number}>} subject - polygon to clip (room)
   * @param {{minX:number, minY:number, maxX:number, maxY:number}} rect - clip rectangle (board)
   * @returns {Array<Array<{x:number, y:number}>>} array of result polygons (may be 0, 1, or more)
   */
  clipPolygonByRect(subject, rect) {
    if (!subject || subject.length < 3) return [];

    // Clip against each edge of the rectangle in sequence
    let output = subject;

    // Left edge:  x >= minX
    output = this._clipByEdge(output, rect.minX, 'left');
    if (output.length < 3) return [];

    // Right edge: x <= maxX
    output = this._clipByEdge(output, rect.maxX, 'right');
    if (output.length < 3) return [];

    // Top edge:   y >= minY
    output = this._clipByEdge(output, rect.minY, 'top');
    if (output.length < 3) return [];

    // Bottom edge: y <= maxY
    output = this._clipByEdge(output, rect.maxY, 'bottom');
    if (output.length < 3) return [];

    // Remove duplicate vertices
    output = this._removeDuplicates(output);
    if (output.length < 3) return [];

    // Insert collinear vertices: for dumbbell shapes, Sutherland-Hodgman may
    // produce edges that pass through polygon vertices without explicitly
    // including them, preventing _splitCollinearOpposite from detecting
    // zero-width necks. This step inserts those missing vertices.
    output = this._insertCollinearVertices(output);

    // Split collinear-opposite edges ("dumbbell" shapes from multi-door walls)
    const splitPolygons = this._splitCollinearOpposite(output);
    if (splitPolygons.length > 1) {
      // Process each sub-polygon through the rest of the pipeline
      const allResults = [];
      for (const subPoly of splitPolygons) {
        const cleaned = this._removeDuplicates(subPoly);
        if (cleaned.length < 3) continue;
        const area = this.signedArea(cleaned);
        if (Math.abs(area) < 0.5) continue;
        allResults.push(cleaned);
      }
      return allResults;
    }

    // Check for self-intersections (can happen with non-convex subjects)
    const area = this.signedArea(output);
    if (Math.abs(area) < 0.5) return []; // degenerate

    // For simple cases (convex or well-behaved), return single polygon
    // For complex cases, split into separate polygons
    if (this.isConvex(output) || !this._hasSelfIntersection(output)) {
      return [output];
    }

    return this._splitSelfIntersecting(output);
  },

  /**
   * Clip a polygon against an arbitrary convex polygon.
   *
   * Generalized Sutherland-Hodgman: clips against each edge of the convex
   * clip polygon (not just axis-aligned half-planes).
   *
   * @param {Array<{x:number, y:number}>} subject - polygon to clip (room)
   * @param {Array<{x:number, y:number}>} clipPoly - convex clip polygon (rotated board)
   * @returns {Array<Array<{x:number, y:number}>>} array of result polygons
   */
  clipPolygonByConvex(subject, clipPoly) {
    if (!subject || subject.length < 3) return [];
    if (!clipPoly || clipPoly.length < 3) return [];

    // Ensure clip polygon is CCW in screen coords (negative signed area in Y-down).
    // _clipByLine assumes "inside" is to the LEFT of each edge,
    // which is correct for CCW winding in Y-down coordinates.
    let clip = clipPoly;
    if (this.signedArea(clip) > 0) {
      clip = [...clip].reverse();
    }

    let output = subject;

    // Clip against each edge of the convex clip polygon
    const cn = clip.length;
    for (let i = 0; i < cn; i++) {
      const edgeStart = clip[i];
      const edgeEnd = clip[(i + 1) % cn];

      output = this._clipByLine(output, edgeStart, edgeEnd);
      if (output.length < 3) return [];
    }

    // Post-processing — same as clipPolygonByRect
    output = this._removeDuplicates(output);
    if (output.length < 3) return [];

    output = this._insertCollinearVertices(output);

    const splitPolygons = this._splitCollinearOpposite(output);
    if (splitPolygons.length > 1) {
      const allResults = [];
      for (const subPoly of splitPolygons) {
        const cleaned = this._removeDuplicates(subPoly);
        if (cleaned.length < 3) continue;
        const area = this.signedArea(cleaned);
        if (Math.abs(area) < 0.5) continue;
        allResults.push(cleaned);
      }
      return allResults;
    }

    const area = this.signedArea(output);
    if (Math.abs(area) < 0.5) return [];

    if (this.isConvex(output) || !this._hasSelfIntersection(output)) {
      return [output];
    }

    return this._splitSelfIntersecting(output);
  },

  /**
   * Clip polygon against a single line (half-plane defined by edgeStart→edgeEnd).
   * Points on the LEFT side of the edge (CCW winding) are "inside".
   * @private
   */
  _clipByLine(polygon, edgeStart, edgeEnd) {
    if (polygon.length < 3) return [];

    const output = [];
    const n = polygon.length;

    // Edge direction vector
    const ex = edgeEnd.x - edgeStart.x;
    const ey = edgeEnd.y - edgeStart.y;

    for (let i = 0; i < n; i++) {
      const current = polygon[i];
      const next = polygon[(i + 1) % n];

      // Cross product: positive means LEFT of edge (inside)
      const currCross = (current.x - edgeStart.x) * ey - (current.y - edgeStart.y) * ex;
      const nextCross = (next.x - edgeStart.x) * ey - (next.y - edgeStart.y) * ex;

      const currInside = currCross >= -0.001;
      const nextInside = nextCross >= -0.001;

      if (currInside) {
        output.push(current);
        if (!nextInside) {
          // Exiting: add intersection
          const pt = this._lineLineIntersection(current, next, edgeStart, edgeEnd);
          if (pt) output.push(pt);
        }
      } else if (nextInside) {
        // Entering: add intersection
        const pt = this._lineLineIntersection(current, next, edgeStart, edgeEnd);
        if (pt) output.push(pt);
      }
    }

    return output;
  },

  /**
   * Clip polygon against one half-plane edge (Sutherland-Hodgman step)
   * @private
   */
  _clipByEdge(polygon, value, side) {
    if (polygon.length < 3) return [];

    const output = [];
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
      const current = polygon[i];
      const next = polygon[(i + 1) % n];

      const currInside = this._isInside(current, value, side);
      const nextInside = this._isInside(next, value, side);

      if (currInside) {
        output.push(current);
        if (!nextInside) {
          // Exiting: add intersection
          output.push(this._intersectEdge(current, next, value, side));
        }
      } else if (nextInside) {
        // Entering: add intersection
        output.push(this._intersectEdge(current, next, value, side));
      }
      // Both outside: skip
    }

    return output;
  },

  /**
   * Check if a point is on the "inside" of a half-plane
   * @private
   */
  _isInside(point, value, side) {
    switch (side) {
      case 'left':   return point.x >= value - 0.001;
      case 'right':  return point.x <= value + 0.001;
      case 'top':    return point.y >= value - 0.001;
      case 'bottom': return point.y <= value + 0.001;
    }
  },

  /**
   * Find intersection of segment (a→b) with half-plane boundary
   * @private
   */
  _intersectEdge(a, b, value, side) {
    let t;
    if (side === 'left' || side === 'right') {
      t = (value - a.x) / (b.x - a.x);
    } else {
      t = (value - a.y) / (b.y - a.y);
    }
    t = Math.max(0, Math.min(1, t));
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
    };
  },

  // ─── Polygon Properties ────────────────────────────────────────────

  /**
   * Signed area (positive = CCW in math coords, negative = CW)
   * In screen coords (Y-down), CCW has negative signed area.
   */
  signedArea(polygon) {
    const n = polygon.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }
    return area / 2;
  },

  /**
   * Absolute area of polygon
   */
  area(polygon) {
    return Math.abs(this.signedArea(polygon));
  },

  /**
   * Bounding box
   */
  bounds(polygon) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  },

  /**
   * Centroid (center of mass) of a polygon
   */
  centroid(polygon) {
    const n = polygon.length;
    let cx = 0, cy = 0, a = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cross = polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
      cx += (polygon[i].x + polygon[j].x) * cross;
      cy += (polygon[i].y + polygon[j].y) * cross;
      a += cross;
    }
    a /= 2;
    if (Math.abs(a) < 0.001) {
      // Degenerate — fallback to average
      return {
        x: polygon.reduce((s, p) => s + p.x, 0) / n,
        y: polygon.reduce((s, p) => s + p.y, 0) / n,
      };
    }
    cx /= (6 * a);
    cy /= (6 * a);
    return { x: cx, y: cy };
  },

  /**
   * Check if polygon is convex
   */
  isConvex(polygon) {
    const n = polygon.length;
    if (n < 3) return false;

    let sign = 0;
    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];
      const c = polygon[(i + 2) % n];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 0.01) continue; // collinear
      if (sign === 0) {
        sign = cross > 0 ? 1 : -1;
      } else if ((cross > 0 ? 1 : -1) !== sign) {
        return false;
      }
    }
    return true;
  },

  /**
   * Check if polygon is approximately rectangular (4 vertices, ~90° angles)
   */
  isRectangular(polygon) {
    if (polygon.length !== 4) return false;
    // Check all angles are ~90°
    for (let i = 0; i < 4; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % 4];
      const c = polygon[(i + 2) % 4];
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      const len1 = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      const len2 = Math.sqrt((c.x - b.x) ** 2 + (c.y - b.y) ** 2);
      if (len1 < 0.1 || len2 < 0.1) return false;
      const cosAngle = dot / (len1 * len2);
      if (Math.abs(cosAngle) > 0.05) return false; // should be ~0 for 90°
    }
    return true;
  },

  /**
   * Check if polygon is axis-aligned rectangular
   */
  isAxisAlignedRect(polygon) {
    if (polygon.length !== 4) return false;
    const EPSILON = 0.5;
    for (let i = 0; i < 4; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % 4];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx > EPSILON && dy > EPSILON) return false;
    }
    return true;
  },

  // ─── Self-Intersection Detection & Splitting ──────────────────────

  /**
   * Check if a polygon has self-intersecting edges
   * @private
   */
  _hasSelfIntersection(polygon) {
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent
        if (this._segmentsIntersect(
          polygon[i], polygon[(i + 1) % n],
          polygon[j], polygon[(j + 1) % n]
        )) {
          return true;
        }
      }
    }
    return false;
  },

  /**
   * Check if two segments intersect (proper intersection, not touching)
   * @private
   */
  _segmentsIntersect(a1, a2, b1, b2) {
    const d1 = this._cross(b1, b2, a1);
    const d2 = this._cross(b1, b2, a2);
    const d3 = this._cross(a1, a2, b1);
    const d4 = this._cross(a1, a2, b2);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    return false;
  },

  _cross(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  },

  /**
   * Split a self-intersecting polygon into non-self-intersecting parts.
   * For the flooring use case, this mainly handles the case where a board
   * spans the inner corner of an L-shaped room.
   * 
   * Strategy: find the self-intersection point, split into two sub-polygons.
   * @private
   */
  _splitSelfIntersecting(polygon) {
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;

        const a1 = polygon[i], a2 = polygon[(i + 1) % n];
        const b1 = polygon[j], b2 = polygon[(j + 1) % n];

        if (this._segmentsIntersect(a1, a2, b1, b2)) {
          // Find intersection point
          const pt = this._lineLineIntersection(a1, a2, b1, b2);
          if (!pt) continue;

          // Split into two polygons at the intersection
          // Poly1: vertices i+1 .. j, then intersection point
          const poly1 = [];
          for (let k = (i + 1) % n; k !== (j + 1) % n; k = (k + 1) % n) {
            poly1.push(polygon[k]);
          }
          poly1.push(pt);

          // Poly2: vertices j+1 .. i, then intersection point
          const poly2 = [];
          for (let k = (j + 1) % n; k !== (i + 1) % n; k = (k + 1) % n) {
            poly2.push(polygon[k]);
          }
          poly2.push(pt);

          // Recursively split if needed
          const results = [];
          if (poly1.length >= 3 && Math.abs(this.signedArea(poly1)) > 0.5) {
            if (this._hasSelfIntersection(poly1)) {
              results.push(...this._splitSelfIntersecting(poly1));
            } else {
              results.push(poly1);
            }
          }
          if (poly2.length >= 3 && Math.abs(this.signedArea(poly2)) > 0.5) {
            if (this._hasSelfIntersection(poly2)) {
              results.push(...this._splitSelfIntersecting(poly2));
            } else {
              results.push(poly2);
            }
          }
          return results;
        }
      }
    }

    // No intersection found — return as-is
    return [polygon];
  },

  /**
   * Split polygon at collinear-opposite edges ("dumbbell" / "bowtie" pinch).
   *
   * When a panel rectangle is clipped against a room polygon that has a thin
   * wall peninsula (wall between two doors), Sutherland-Hodgman produces a
   * single polygon with two parts connected by a zero-width neck: two edges
   * that overlap on the same line segment but go in opposite directions.
   *
   * This method detects such edge pairs and splits the polygon into the
   * two separate parts.
   */

  /**
   * For each edge A→B, find other vertices of the polygon that lie on the
   * segment A→B (within a tolerance). Insert them in order between A and B.
   * This is crucial to detect opposite-direction collinear edges when the
   * polygon boundary overlaps itself or goes along the clipping boundary.
   *
   * @param {Array<{x:number,y:number}>} polygon
   * @returns {Array<{x:number,y:number}>} polygon with collinear vertices inserted
   * @private
   */
  _insertCollinearVertices(polygon) {
    const n = polygon.length;
    if (n < 3) return polygon;

    const result = [];
    const TOL = 1.0; // mm tolerance

    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];
      result.push({ x: a.x, y: a.y });

      // Find all other vertices that lie on segment a → b
      const onSegment = [];
      for (let j = 0; j < n; j++) {
        if (j === i || j === (i + 1) % n) continue;
        const v = polygon[j];

        const dist = Geometry.distanceToSegment(v, a, b);
        if (dist < TOL) {
          // Check that it's not too close to the endpoints
          if (Geometry.distance(v, a) > TOL && Geometry.distance(v, b) > TOL) {
            onSegment.push({ x: v.x, y: v.y });
          }
        }
      }

      if (onSegment.length > 0) {
        // Sort by distance from a
        onSegment.sort((p1, p2) => Geometry.distance(p1, a) - Geometry.distance(p2, a));
        result.push(...onSegment);
      }
    }

    // Remove only consecutive duplicates (keep non-adjacent duplicates — they are pinch points)
    const deduped = [result[0]];
    for (let i = 1; i < result.length; i++) {
      const prev = deduped[deduped.length - 1];
      if (Math.abs(result[i].x - prev.x) > TOL || Math.abs(result[i].y - prev.y) > TOL) {
        deduped.push(result[i]);
      }
    }
    // Check first/last
    if (deduped.length > 1) {
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (Math.abs(first.x - last.x) <= TOL && Math.abs(first.y - last.y) <= TOL) {
        deduped.pop();
      }
    }
    return deduped;
  },

  _splitCollinearOpposite(polygon) {
    const n = polygon.length;
    if (n < 6) return [polygon]; // need at least 6 for a valid dumbbell

    const TOL = 1.5;
    const ptEq = (a, b) => Math.abs(a.x - b.x) <= TOL && Math.abs(a.y - b.y) <= TOL;

    // Look for edge pairs where edge-i goes A→B and edge-j goes B→A
    // (or close enough), indicating a zero-width neck
    for (let i = 0; i < n; i++) {
      const a1 = polygon[i];
      const a2 = polygon[(i + 1) % n];

      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const b1 = polygon[j];
        const b2 = polygon[(j + 1) % n];

        // Check for opposite-direction overlap: a1≈b2 and a2≈b1
        if (ptEq(a1, b2) && ptEq(a2, b1)) {
          // Split at the pinch point
          // Poly1: from i+1 to j (inclusive)
          const poly1 = [];
          for (let k = (i + 1) % n; ; k = (k + 1) % n) {
            poly1.push(polygon[k]);
            if (k === j) break;
          }
          // Poly2: from j+1 to i (inclusive)
          const poly2 = [];
          for (let k = (j + 1) % n; ; k = (k + 1) % n) {
            poly2.push(polygon[k]);
            if (k === i) break;
          }

          // Recursively split each half
          const results = [];
          if (poly1.length >= 3 && Math.abs(this.signedArea(poly1)) > 0.5) {
            results.push(...this._splitCollinearOpposite(poly1));
          }
          if (poly2.length >= 3 && Math.abs(this.signedArea(poly2)) > 0.5) {
            results.push(...this._splitCollinearOpposite(poly2));
          }
          return results;
        }
      }
    }

    return [polygon];
  },

  /**
   * Line-line intersection (infinite lines)
   * @private
   */
  _lineLineIntersection(a1, a2, b1, b2) {
    const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
    if (Math.abs(d) < 1e-10) return null;

    const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
    return {
      x: a1.x + t * (a2.x - a1.x),
      y: a1.y + t * (a2.y - a1.y),
    };
  },

  // ─── Utilities ─────────────────────────────────────────────────────

  /**
   * Remove duplicate consecutive vertices
   * @private
   */
  _removeDuplicates(polygon) {
    // Pass 1: remove consecutive duplicates
    let result = [];
    for (let i = 0; i < polygon.length; i++) {
      const prev = result[result.length - 1];
      if (!prev || Math.abs(polygon[i].x - prev.x) > 0.01 || Math.abs(polygon[i].y - prev.y) > 0.01) {
        result.push(polygon[i]);
      }
    }
    // Check last vs first
    if (result.length > 1) {
      const first = result[0], last = result[result.length - 1];
      if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
        result.pop();
      }
    }

    // Pass 2: remove collinear vertices (3 consecutive points on same line)
    if (result.length < 3) return result;
    const cleaned = [];
    const n = result.length;
    for (let i = 0; i < n; i++) {
      const prev = result[(i - 1 + n) % n];
      const curr = result[i];
      const next = result[(i + 1) % n];
      // Cross product to check collinearity
      const cross = (curr.x - prev.x) * (next.y - prev.y)
                  - (curr.y - prev.y) * (next.x - prev.x);
      if (Math.abs(cross) > 0.1) {
        cleaned.push(curr); // Not collinear — keep
      }
    }

    return cleaned.length >= 3 ? cleaned : result;
  },

  /**
   * Create rectangle polygon from bounds
   * Returns CCW winding in screen coords (Y-down)
   */
  rectToPolygon(minX, minY, maxX, maxY) {
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  },

  /**
   * Check if polygon A contains polygon B entirely
   */
  contains(outer, inner) {
    return inner.every(p => Geometry.isPointInPolygon(p, outer));
  },

  /**
   * Check if a segment lies on the boundary of a polygon (within tolerance)
   * Used to detect if a panel edge is against a room wall
   */
  isEdgeOnPolygonBoundary(edgeStart, edgeEnd, polygon, tolerance = 1.0) {
    // Check midpoint distance to each polygon edge
    const mid = {
      x: (edgeStart.x + edgeEnd.x) / 2,
      y: (edgeStart.y + edgeEnd.y) / 2,
    };

    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];
      const dist = Geometry.distanceToSegment(mid, a, b);
      if (dist < tolerance) return true;
    }
    return false;
  },
};
