/**
 * WallGraph — Planar Straight-Line Graph for wall-based floor plans
 *
 * Core data model:
 *   Nodes (junctions) — points where walls meet
 *   Walls (edges)     — wall segments with thickness
 *   Doors (openings)  — gaps in walls, allow floor continuity
 *
 * Derived data (computed on demand):
 *   Rooms  — minimal cycles in the planar graph
 *   Floor Zones — groups of rooms connected through doors/openings
 *
 * All coordinates in millimeters (mm).
 */
class WallGraph {
  constructor() {
    /** @type {Map<number, WGNode>} */
    this.nodes = new Map();
    /** @type {Map<number, WGWall>} */
    this.walls = new Map();
    /** @type {Map<number, WGDoor>} */
    this.doors = new Map();

    this._nextNodeId = 1;
    this._nextWallId = 1;
    this._nextDoorId = 1;

    /** @type {Array<WGRoom>|null} cached room detection result */
    this._cachedRooms = null;
    /** @type {Array<WGFloorZone>|null} cached floor zones */
    this._cachedFloorZones = null;
  }

  // ═══════════════════════════════════════════════════════════
  //  NODES
  // ═══════════════════════════════════════════════════════════

  /**
   * Add a node (junction point)
   * @param {number} x - X coordinate in mm
   * @param {number} y - Y coordinate in mm
   * @returns {number} node id
   */
  addNode(x, y) {
    const id = this._nextNodeId++;
    this.nodes.set(id, { id, x: Math.round(x), y: Math.round(y) });
    this._invalidateCache();
    return id;
  }

  /**
   * Move a node to a new position
   * @param {number} nodeId
   * @param {number} x
   * @param {number} y
   */
  moveNode(nodeId, x, y) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.x = Math.round(x);
    node.y = Math.round(y);
    this._invalidateCache();
  }

  /**
   * Remove a node (and all connected walls)
   * @param {number} nodeId
   */
  removeNode(nodeId) {
    // Remove all walls connected to this node
    for (const [wallId, wall] of this.walls) {
      if (wall.startNodeId === nodeId || wall.endNodeId === nodeId) {
        this.walls.delete(wallId);
        // Remove doors on this wall
        for (const [doorId, door] of this.doors) {
          if (door.wallId === wallId) this.doors.delete(doorId);
        }
      }
    }
    this.nodes.delete(nodeId);
    this._invalidateCache();
  }

  /**
   * Find a node near a point (within tolerance)
   * @param {number} x
   * @param {number} y
   * @param {number} [tolerance=5] mm
   * @returns {number|null} node id or null
   */
  findNodeNear(x, y, tolerance = 5) {
    let bestId = null;
    let bestDist = tolerance;
    for (const [id, node] of this.nodes) {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * Merge two nodes into one (snap). All walls referencing nodeB now use nodeA.
   * @param {number} nodeA - node to keep
   * @param {number} nodeB - node to remove
   */
  mergeNodes(nodeA, nodeB) {
    if (nodeA === nodeB) return;
    if (!this.nodes.has(nodeA) || !this.nodes.has(nodeB)) return;

    for (const wall of this.walls.values()) {
      if (wall.startNodeId === nodeB) wall.startNodeId = nodeA;
      if (wall.endNodeId === nodeB) wall.endNodeId = nodeA;
    }

    // Remove degenerate walls (start === end)
    for (const [wallId, wall] of this.walls) {
      if (wall.startNodeId === wall.endNodeId) {
        this.walls.delete(wallId);
      }
    }

    this.nodes.delete(nodeB);
    this._invalidateCache();
  }

  // ═══════════════════════════════════════════════════════════
  //  WALLS
  // ═══════════════════════════════════════════════════════════

  /**
   * Add a wall between two nodes
   * @param {number} startNodeId
   * @param {number} endNodeId
   * @param {Object} [config]
   * @param {number} [config.thickness=150] mm
   * @param {string} [config.type='interior'] 'exterior'|'interior'|'partition'
   * @returns {number} wall id
   */
  addWall(startNodeId, endNodeId, config = {}) {
    if (startNodeId === endNodeId) return -1;
    if (!this.nodes.has(startNodeId) || !this.nodes.has(endNodeId)) return -1;

    // Check for duplicate wall
    for (const wall of this.walls.values()) {
      if ((wall.startNodeId === startNodeId && wall.endNodeId === endNodeId) ||
          (wall.startNodeId === endNodeId && wall.endNodeId === startNodeId)) {
        return wall.id; // already exists
      }
    }

    const id = this._nextWallId++;
    this.walls.set(id, {
      id,
      startNodeId,
      endNodeId,
      thickness: config.thickness || 150,
      type: config.type || 'interior',
    });
    this._invalidateCache();
    return id;
  }

  /**
   * Remove a wall
   * @param {number} wallId
   */
  removeWall(wallId) {
    const wall = this.walls.get(wallId);
    if (!wall) return;

    // Remove doors on this wall
    for (const [doorId, door] of this.doors) {
      if (door.wallId === wallId) this.doors.delete(doorId);
    }

    this.walls.delete(wallId);

    // Remove orphan nodes (nodes with no walls)
    this._removeOrphanNodes();
    this._invalidateCache();
  }

  /**
   * Get wall axis (center line) as two points
   * @param {number} wallId
   * @returns {{start: {x,y}, end: {x,y}}|null}
   */
  getWallAxis(wallId) {
    const wall = this.walls.get(wallId);
    if (!wall) return null;
    const start = this.nodes.get(wall.startNodeId);
    const end = this.nodes.get(wall.endNodeId);
    if (!start || !end) return null;
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
  }

  /**
   * Get wall length in mm
   * @param {number} wallId
   * @returns {number}
   */
  getWallLength(wallId) {
    const axis = this.getWallAxis(wallId);
    if (!axis) return 0;
    return Math.sqrt(
      (axis.end.x - axis.start.x) ** 2 +
      (axis.end.y - axis.start.y) ** 2
    );
  }

  /**
   * Set wall length by moving the end node along the wall axis
   * @param {number} wallId
   * @param {number} newLength in mm
   */
  setWallLength(wallId, newLength) {
    const wall = this.walls.get(wallId);
    if (!wall) return;
    const axis = this.getWallAxis(wallId);
    if (!axis) return;

    const currentLen = this.getWallLength(wallId);
    if (currentLen < 0.1) return;

    const dx = (axis.end.x - axis.start.x) / currentLen;
    const dy = (axis.end.y - axis.start.y) / currentLen;

    this.moveNode(wall.endNodeId,
      axis.start.x + dx * newLength,
      axis.start.y + dy * newLength
    );
  }

  /**
   * Get wall polygon (rectangle with thickness) for rendering
   * @param {number} wallId
   * @returns {Array<{x:number,y:number}>|null} 4 vertices
   */
  getWallPolygon(wallId) {
    const wall = this.walls.get(wallId);
    if (!wall) return null;
    const axis = this.getWallAxis(wallId);
    if (!axis) return null;

    const halfT = wall.thickness / 2;
    const dx = axis.end.x - axis.start.x;
    const dy = axis.end.y - axis.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.1) return null;

    // Perpendicular normal
    const nx = -dy / len * halfT;
    const ny = dx / len * halfT;

    return [
      { x: axis.start.x + nx, y: axis.start.y + ny },
      { x: axis.end.x + nx,   y: axis.end.y + ny },
      { x: axis.end.x - nx,   y: axis.end.y - ny },
      { x: axis.start.x - nx, y: axis.start.y - ny },
    ];
  }

  /**
   * Get all walls connected to a node
   * @param {number} nodeId
   * @returns {Array<number>} wall ids
   */
  getWallsAtNode(nodeId) {
    const result = [];
    for (const [wallId, wall] of this.walls) {
      if (wall.startNodeId === nodeId || wall.endNodeId === nodeId) {
        result.push(wallId);
      }
    }
    return result;
  }

  /**
   * Split a wall at a point, creating a new node and two new walls
   * @param {number} wallId
   * @param {{x:number,y:number}} point
   * @returns {number} new node id
   */
  splitWall(wallId, point) {
    const wall = this.walls.get(wallId);
    if (!wall) return -1;

    const newNodeId = this.addNode(point.x, point.y);

    // Create two new walls with same properties
    const config = { thickness: wall.thickness, type: wall.type };
    this.addWall(wall.startNodeId, newNodeId, config);
    this.addWall(newNodeId, wall.endNodeId, config);

    // Move doors to appropriate new wall
    for (const [doorId, door] of this.doors) {
      if (door.wallId === wallId) {
        // Determine which new wall the door belongs to
        // (based on position along the original wall)
        // For simplicity, remove doors on split walls — user must re-add
        this.doors.delete(doorId);
      }
    }

    // Remove original wall
    this.walls.delete(wallId);
    this._invalidateCache();
    return newNodeId;
  }

  // ═══════════════════════════════════════════════════════════
  //  DOORS
  // ═══════════════════════════════════════════════════════════

  /**
   * Add a door (opening) to a wall
   * @param {number} wallId
   * @param {number} position - distance from start node along wall axis (mm)
   * @param {number} width - door width (mm), default 800
   * @param {Object} [options]
   * @param {string} [options.hingeSide='left'] - 'left' | 'right' — hinge at start vs end of opening
   * @param {string} [options.openDirection='A'] - 'A' | 'B' — which side of the wall the door swings toward
   * @returns {number} door id
   */
  addDoor(wallId, position, width = 800, options = {}) {
    if (!this.walls.has(wallId)) return -1;
    const id = this._nextDoorId++;
    this.doors.set(id, {
      id,
      wallId,
      position,   // mm from start node
      width,      // mm
      hingeSide: options.hingeSide || 'left',       // 'left' | 'right'
      openDirection: options.openDirection || 'A',   // 'A' | 'B'
    });
    this._invalidateCache();
    return id;
  }

  /**
   * Remove a door
   * @param {number} doorId
   */
  removeDoor(doorId) {
    this.doors.delete(doorId);
    this._invalidateCache();
  }

  /**
   * Update door properties (width, hingeSide, openDirection)
   * @param {number} doorId
   * @param {Object} props - properties to update
   * @param {number} [props.width]
   * @param {string} [props.hingeSide] - 'left' | 'right'
   * @param {string} [props.openDirection] - 'A' | 'B'
   */
  updateDoor(doorId, props) {
    const door = this.doors.get(doorId);
    if (!door) return;
    if (props.width !== undefined) door.width = props.width;
    if (props.hingeSide !== undefined) door.hingeSide = props.hingeSide;
    if (props.openDirection !== undefined) door.openDirection = props.openDirection;
    this._invalidateCache();
  }

  /**
   * Get doors on a wall
   * @param {number} wallId
   * @returns {Array<WGDoor>}
   */
  getDoorsOnWall(wallId) {
    const result = [];
    for (const door of this.doors.values()) {
      if (door.wallId === wallId) result.push(door);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  //  ROOM DETECTION (half-edge traversal)
  // ═══════════════════════════════════════════════════════════

  /**
   * Detect all rooms (minimal cycles in the planar graph).
   *
   * Algorithm: half-edge traversal
   * 1. Build adjacency: node → sorted neighbors (by angle)
   * 2. For each half-edge (u→v): follow "next CW edge" until cycle
   * 3. Filter: keep only CW cycles (rooms), skip CCW (outer boundary)
   *
   * @returns {Array<WGRoom>}
   */
  findRooms() {
    if (this._cachedRooms) return this._cachedRooms;

    // Build adjacency with angular sorting
    const adj = this._buildAdjacency();

    // Track used half-edges
    const usedHalfEdges = new Set();
    const cycles = [];

    for (const [nodeId, neighbors] of adj) {
      for (let ni = 0; ni < neighbors.length; ni++) {
        const startEdge = `${nodeId}->${neighbors[ni].nodeId}`;
        if (usedHalfEdges.has(startEdge)) continue;

        // Trace a cycle
        const cycle = this._traceCycle(nodeId, neighbors[ni].nodeId, adj, usedHalfEdges);
        if (cycle && cycle.length >= 3) {
          cycles.push(cycle);
        }
      }
    }

    // Build room objects with inner polygons
    const rooms = [];
    let roomIdx = 1;

    for (const cycle of cycles) {
      const innerPoly = this._buildInnerPolygon(cycle);
      if (!innerPoly || innerPoly.length < 3) continue;

      // Check winding: in screen coords (Y-down), the Y axis is flipped vs math convention.
      // CW on screen = CCW mathematically = POSITIVE signed area = interior room.
      // CCW on screen = CW mathematically = NEGATIVE signed area = outer boundary.
      const area = Geometry.polygonSignedArea(innerPoly);
      if (area <= 0) continue; // Negative or zero = outer boundary or degenerate, skip

      const absArea = Math.abs(area);
      if (absArea < 100) continue; // too small (< 100 mm² ≈ 1cm²)

      // Collect wall IDs in this cycle
      const wallIds = cycle.map(he => he.wallId);

      rooms.push({
        id: roomIdx++,
        name: `Pokój ${roomIdx - 1}`,
        wallIds,
        innerPolygon: innerPoly,
        area: absArea / 1e6, // mm² → m²
        color: ROOM_COLORS[(roomIdx - 2) % ROOM_COLORS.length],
      });
    }

    this._cachedRooms = rooms;
    return rooms;
  }

  /**
   * Build adjacency list: nodeId → [{nodeId, wallId, angle}] sorted by angle
   * @private
   */
  _buildAdjacency() {
    const adj = new Map();

    // Initialize all nodes
    for (const nodeId of this.nodes.keys()) {
      adj.set(nodeId, []);
    }

    for (const wall of this.walls.values()) {
      const startNode = this.nodes.get(wall.startNodeId);
      const endNode = this.nodes.get(wall.endNodeId);
      if (!startNode || !endNode) continue;

      // Forward half-edge: start → end
      const angleForward = Math.atan2(
        endNode.y - startNode.y,
        endNode.x - startNode.x
      );
      adj.get(wall.startNodeId).push({
        nodeId: wall.endNodeId,
        wallId: wall.id,
        angle: angleForward,
      });

      // Backward half-edge: end → start
      const angleBackward = Math.atan2(
        startNode.y - endNode.y,
        startNode.x - endNode.x
      );
      adj.get(wall.endNodeId).push({
        nodeId: wall.startNodeId,
        wallId: wall.id,
        angle: angleBackward,
      });
    }

    // Sort neighbors by angle (CW order in screen coords)
    for (const [, neighbors] of adj) {
      neighbors.sort((a, b) => a.angle - b.angle);
    }

    return adj;
  }

  /**
   * Trace a cycle starting from half-edge (fromNode → toNode)
   * by always taking the "next CW" neighbor at each junction.
   * @private
   */
  _traceCycle(fromNode, toNode, adj, usedHalfEdges) {
    const cycle = [];
    let currentFrom = fromNode;
    let currentTo = toNode;
    const MAX_STEPS = 100;

    for (let step = 0; step < MAX_STEPS; step++) {
      const heKey = `${currentFrom}->${currentTo}`;
      if (usedHalfEdges.has(heKey)) {
        // Already part of another cycle — only valid if we've come full circle
        if (currentTo === fromNode && cycle.length >= 3) break;
        return null;
      }
      usedHalfEdges.add(heKey);

      // Find the wall for this half-edge
      let wallId = null;
      for (const wall of this.walls.values()) {
        if ((wall.startNodeId === currentFrom && wall.endNodeId === currentTo) ||
            (wall.startNodeId === currentTo && wall.endNodeId === currentFrom)) {
          wallId = wall.id;
          break;
        }
      }

      cycle.push({
        fromNode: currentFrom,
        toNode: currentTo,
        wallId,
      });

      // Check if cycle is complete
      if (currentTo === fromNode) break;

      // Find "next CW" edge at currentTo
      const neighbors = adj.get(currentTo);
      if (!neighbors || neighbors.length === 0) return null;

      // The incoming direction angle
      const incomingAngle = Math.atan2(
        this.nodes.get(currentFrom).y - this.nodes.get(currentTo).y,
        this.nodes.get(currentFrom).x - this.nodes.get(currentTo).x
      );

      // Find the next neighbor CW from the incoming direction
      // CW in screen coords = decreasing angle
      let bestIdx = -1;
      let bestAngleDiff = Infinity;

      for (let i = 0; i < neighbors.length; i++) {
        if (neighbors[i].nodeId === currentFrom) continue; // don't go back

        let diff = incomingAngle - neighbors[i].angle;
        // Normalize to (0, 2π)
        while (diff <= 0) diff += Math.PI * 2;
        while (diff > Math.PI * 2) diff -= Math.PI * 2;

        if (diff < bestAngleDiff) {
          bestAngleDiff = diff;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) {
        // Dead end — only one wall at this node (the one we came from)
        // Try to go back to the same wall (for dead-end corridors)
        return null;
      }

      currentFrom = currentTo;
      currentTo = neighbors[bestIdx].nodeId;
    }

    return cycle;
  }

  /**
   * Build the inner polygon for a room cycle.
   * The inner polygon is offset inward by wall thickness / 2.
   *
   * For each wall in the cycle, we take the inner edge (the side facing
   * the room interior) and connect them to form the room polygon.
   *
   * @private
   */
  _buildInnerPolygon(cycle) {
    if (!cycle || cycle.length < 3) return null;

    const points = [];

    for (let i = 0; i < cycle.length; i++) {
      const he = cycle[i];
      const wall = this.walls.get(he.wallId);
      if (!wall) continue;

      const from = this.nodes.get(he.fromNode);
      const to = this.nodes.get(he.toNode);
      if (!from || !to) continue;

      const halfT = wall.thickness / 2;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.1) continue;

      // Inner normal: for CW cycle on screen, room interior is on the RIGHT side.
      // Right-side perpendicular in screen coords (Y-down): (-dy/len, dx/len)
      const nx = -dy / len * halfT;
      const ny = dx / len * halfT;

      // Inner edge: offset both endpoints by the inner normal
      points.push(
        { x: from.x + nx, y: from.y + ny },
        { x: to.x + nx, y: to.y + ny },
      );
    }

    if (points.length < 6) return null; // Need at least 3 wall segments

    // Now we have pairs of points (inner-start, inner-end) per wall.
    // To get the actual room polygon, we intersect consecutive inner edges.
    const polygon = [];
    const numWalls = cycle.length;

    for (let i = 0; i < numWalls; i++) {
      const j = (i + 1) % numWalls;
      // Current wall inner edge: points[2*i] → points[2*i+1]
      // Next wall inner edge: points[2*j] → points[2*j+1]
      const a1 = points[2 * i];
      const a2 = points[2 * i + 1];
      const b1 = points[2 * j];
      const b2 = points[2 * j + 1];

      // Intersect the two lines
      const pt = Geometry._lineIntersection(a1, a2, b1, b2);
      if (pt) {
        polygon.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
      } else {
        // Parallel edges — use the endpoint
        polygon.push({ x: Math.round(a2.x), y: Math.round(a2.y) });
      }
    }

    return polygon;
  }

  // ═══════════════════════════════════════════════════════════
  //  FLOOR ZONES (continuous floor across rooms)
  // ═══════════════════════════════════════════════════════════

  /**
   * Compute floor zones: groups of rooms connected through doors/openings.
   *
   * Rooms sharing a wall that has a door = same floor zone.
   * The floor zone polygon is the UNION of all room inner polygons,
   * minus any remaining wall intersections.
   *
   * @returns {Array<WGFloorZone>}
   */
  findFloorZones() {
    if (this._cachedFloorZones) return this._cachedFloorZones;

    const rooms = this.findRooms();
    if (rooms.length === 0) {
      this._cachedFloorZones = [];
      return [];
    }

    // Build a graph: roomA -- roomB if they share a wall WITH a door
    const wallToRooms = new Map(); // wallId → [roomIdx, ...]
    for (let ri = 0; ri < rooms.length; ri++) {
      for (const wallId of rooms[ri].wallIds) {
        if (!wallToRooms.has(wallId)) wallToRooms.set(wallId, []);
        wallToRooms.get(wallId).push(ri);
      }
    }

    // Find connecting walls (walls shared by 2 rooms AND have a door)
    const connectingWalls = new Set();
    for (const [wallId, roomIndices] of wallToRooms) {
      if (roomIndices.length >= 2) {
        const doorsOnWall = this.getDoorsOnWall(wallId);
        if (doorsOnWall.length > 0) {
          connectingWalls.add(wallId);
        }
      }
    }

    // Union-Find to group rooms into zones
    const parent = rooms.map((_, i) => i);
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (a, b) => { parent[find(a)] = find(b); };

    for (const wallId of connectingWalls) {
      const rIndices = wallToRooms.get(wallId);
      for (let k = 1; k < rIndices.length; k++) {
        union(rIndices[0], rIndices[k]);
      }
    }

    // Group rooms by zone root
    const zoneGroups = new Map(); // root → [roomIdx, ...]
    for (let ri = 0; ri < rooms.length; ri++) {
      const root = find(ri);
      if (!zoneGroups.has(root)) zoneGroups.set(root, []);
      zoneGroups.get(root).push(ri);
    }

    // Build floor zones
    const zones = [];
    let zoneIdx = 1;
    for (const [, roomIndices] of zoneGroups) {
      const zoneRooms = roomIndices.map(ri => rooms[ri]);

      let polygon, wallIds;
      if (zoneRooms.length === 1) {
        // Single room zone — use inner polygon directly
        polygon = zoneRooms[0].innerPolygon;
        wallIds = zoneRooms[0].wallIds;
      } else {
        // Multi-room zone — union inner polygons
        // For rectilinear rooms, we can use a simple approach:
        // take all inner polygons and merge them
        const mergeResult = this._unionRoomPolygons(zoneRooms, connectingWalls);
        polygon = mergeResult.polygon;
        wallIds = mergeResult.wallIds;
      }

      if (!polygon || polygon.length < 3) continue;

      const area = Geometry.polygonArea(polygon) / 1e6;

      zones.push({
        id: zoneIdx++,
        roomIds: zoneRooms.map(r => r.id),
        rooms: zoneRooms,
        polygon, // merged floor polygon
        wallIds, // per-edge wall IDs (null = door opening)
        area,
        name: zoneRooms.length === 1
          ? zoneRooms[0].name
          : zoneRooms.map(r => r.name).join(' + '),
      });
    }

    this._cachedFloorZones = zones;
    return zones;
  }

  /**
   * Merge room polygons into a single floor zone polygon.
   *
   * For connected rooms with doors: creates a merged polygon that walks
   * through each room's edges and bridges across door openings.
   * The partition wall segments (non-door parts) remain as edges,
   * preserving the wall boundary for expansion gap and panel clipping.
   *
   * @private
   */
  _unionRoomPolygons(zoneRooms, connectingWalls) {
    if (zoneRooms.length < 2) {
      return {
        polygon: zoneRooms[0]?.innerPolygon || [],
        wallIds: zoneRooms[0]?.wallIds || [],
      };
    }

    // Start with the first room
    let mergedPoly = [...zoneRooms[0].innerPolygon];
    let mergedWallIds = [...zoneRooms[0].wallIds];
    const mergedRoomIds = new Set([zoneRooms[0].id]);

    // Iteratively merge rooms through connecting walls with doors
    let changed = true;
    while (changed) {
      changed = false;

      for (const wallId of connectingWalls) {
        // Find a merged room and an unmerged room sharing this wall
        let mergedRoom = null, newRoom = null;

        for (const room of zoneRooms) {
          if (!room.wallIds.includes(wallId)) continue;
          if (mergedRoomIds.has(room.id)) {
            mergedRoom = room;
          } else {
            newRoom = room;
          }
        }

        if (!mergedRoom || !newRoom) continue;

        const doors = this.getDoorsOnWall(wallId);
        if (doors.length === 0) continue;

        // Merge newRoom into the result polygon through door(s)
        const result = this._mergePolygonPairThroughDoors(
          mergedPoly, mergedWallIds,
          newRoom.innerPolygon, newRoom.wallIds,
          wallId, doors
        );

        if (result) {
          mergedPoly = result.polygon;
          mergedWallIds = result.wallIds;
          mergedRoomIds.add(newRoom.id);
          changed = true;
          break; // restart the loop
        }
      }
    }

    return { polygon: mergedPoly, wallIds: mergedWallIds };
  }

  /**
   * Merge two polygons through door openings on a shared wall.
   *
   * Algorithm:
   * 1. Find the shared edge in each polygon (edge lying on the connecting wall)
   * 2. Compute door opening positions in world coordinates
   * 3. Build merged polygon by:
   *    - Walking polyA's edges normally
   *    - At the shared edge: walk to first door → bridge to polyB →
   *      walk all of polyB → bridge back to polyA → continue polyA
   *
   * @param {Array} polyA - First polygon (already merged or single room)
   * @param {Array} wallIdsA - Wall IDs for each edge of polyA
   * @param {Array} polyB - Second polygon (new room to merge)
   * @param {Array} wallIdsB - Wall IDs for each edge of polyB
   * @param {number} sharedWallId - The connecting wall ID
   * @param {Array} doors - Doors on the shared wall
   * @returns {{ polygon: Array, wallIds: Array } | null}
   * @private
   */
  _mergePolygonPairThroughDoors(polyA, wallIdsA, polyB, wallIdsB, sharedWallId, doors) {
    const nA = polyA.length;
    const nB = polyB.length;

    // Find shared edge index in each polygon
    const wIdxA = wallIdsA.indexOf(sharedWallId);
    const wIdxB = wallIdsB.indexOf(sharedWallId);
    if (wIdxA === -1 || wIdxB === -1) return null;

    const sharedStartIdxA = (wIdxA - 1 + nA) % nA;
    const sharedEndIdxA = wIdxA;
    const sharedStartIdxB = (wIdxB - 1 + nB) % nB;
    const sharedEndIdxB = wIdxB;

    // Get wall geometry
    const wall = this.walls.get(sharedWallId);
    if (!wall) return null;
    const wallAxis = this.getWallAxis(sharedWallId);
    const wallLen = this.getWallLength(sharedWallId);
    if (wallLen < 1) return null;

    const halfT = wall.thickness / 2;

    // Wall axis unit direction and perpendicular
    const wdx = wallAxis.end.x - wallAxis.start.x;
    const wdy = wallAxis.end.y - wallAxis.start.y;
    const wnx = wdx / wallLen;
    const wny = wdy / wallLen;

    // Determine perpendicular direction toward polyA
    // Use the wall axis vector to compute a true perpendicular (not midpoint-based,
    // which can be skewed by inset corner offsets)
    const aMidX = (polyA[sharedStartIdxA].x + polyA[sharedEndIdxA].x) / 2;
    const aMidY = (polyA[sharedStartIdxA].y + polyA[sharedEndIdxA].y) / 2;
    const wallMidX = (wallAxis.start.x + wallAxis.end.x) / 2;
    const wallMidY = (wallAxis.start.y + wallAxis.end.y) / 2;
    const toAx = aMidX - wallMidX;
    const toAy = aMidY - wallMidY;

    // True perpendicular from wall axis: rotate unit direction by 90°
    const px1 = -wny;
    const py1 = wnx;
    // Choose the direction pointing toward polyA
    const dot = toAx * px1 + toAy * py1;
    if (Math.abs(dot) < 0.01) return null; // degenerate — can't determine side
    const pAx = dot > 0 ? px1 : -px1;
    const pAy = dot > 0 ? py1 : -py1;

    // ── Determine if polyA's shared edge runs in the same direction as wall axis ──
    // Compute distance of sharedStartIdxA and sharedEndIdxA along wall axis
    const distStart = (polyA[sharedStartIdxA].x - wallAxis.start.x) * wnx
                    + (polyA[sharedStartIdxA].y - wallAxis.start.y) * wny;
    const distEnd = (polyA[sharedEndIdxA].x - wallAxis.start.x) * wnx
                  + (polyA[sharedEndIdxA].y - wallAxis.start.y) * wny;
    // If distStart > distEnd, polyA walks the shared edge in REVERSE direction
    // relative to wall axis → flip the wall axis for consistent processing
    const reversed = distStart > distEnd;

    // Working axis: may be flipped so that polyA always walks increasing distance
    let wAxisStart, wAxisEnd, wNx, wNy;
    if (reversed) {
      wAxisStart = { x: wallAxis.end.x, y: wallAxis.end.y };
      wAxisEnd = { x: wallAxis.start.x, y: wallAxis.start.y };
      wNx = -wnx;
      wNy = -wny;
    } else {
      wAxisStart = { x: wallAxis.start.x, y: wallAxis.start.y };
      wAxisEnd = { x: wallAxis.end.x, y: wallAxis.end.y };
      wNx = wnx;
      wNy = wny;
    }

    // Sort doors by position along wall axis, remap if reversed
    const sortedDoors = [...doors].sort((a, b) => a.position - b.position);

    // Compute door segments with potentially flipped positions
    const doorSegs = sortedDoors.map(d => {
      let pos = d.position;
      if (reversed) pos = wallLen - pos;
      return {
        enterDist: Math.max(0, pos - d.width / 2),
        exitDist: Math.min(wallLen, pos + d.width / 2),
      };
    });
    // Re-sort by enterDist (needed if reversed flipped the order)
    doorSegs.sort((a, b) => a.enterDist - b.enterDist);

    // Helper: world position at distance along working axis, offset toward A or B
    const ptOnA = (dist) => ({
      x: Math.round(wAxisStart.x + wNx * dist + pAx * halfT),
      y: Math.round(wAxisStart.y + wNy * dist + pAy * halfT),
    });
    const ptOnB = (dist) => ({
      x: Math.round(wAxisStart.x + wNx * dist - pAx * halfT),
      y: Math.round(wAxisStart.y + wNy * dist - pAy * halfT),
    });

    // Tolerance for deduplication
    const TOL = 2;
    const ptNear = (a, b) => Math.abs(a.x - b.x) <= TOL && Math.abs(a.y - b.y) <= TOL;

    const result = [];
    const newWallIds = [];

    const push = (pt, wallId) => {
      if (result.length > 0 && ptNear(result[result.length - 1], pt)) return;
      result.push({ x: pt.x, y: pt.y });
      newWallIds.push(wallId);
    };

    // ── Walk polyA. At the shared edge, splice in the multi-door detour. ──
    for (let i = 0; i < nA; i++) {
      if (i === sharedStartIdxA) {
        // Emit sharedStartIdxA vertex
        push(polyA[i], wallIdsA[i]);

        // ── A's shared edge → first door enter ──
        push(ptOnA(doorSegs[0].enterDist), sharedWallId);

        // ── Bridge to B through first door ──
        push(ptOnB(doorSegs[0].enterDist), null);

        // ── Walk B: enterB → B corner → B outer → B other corner ──
        push(polyB[sharedEndIdxB], sharedWallId);

        for (let j = 1; j < nB; j++) {
          const bIdx = (sharedEndIdxB + j) % nB;
          push(polyB[bIdx], wallIdsB[bIdx]);
          if (bIdx === sharedStartIdxB) break;
        }

        // ── Walk B's shared edge back, segmented by doors ──
        //
        // After B's outer perimeter, we're at polyB[sharedStartIdxB].
        // Walk B's shared edge toward enterB, breaking at doors.
        // Stop at door[0]'s EXIT (not enter) to avoid revisiting enterB.

        // From polyB[sharedStartIdxB] to last door's exit
        push(ptOnB(doorSegs[doorSegs.length - 1].exitDist), sharedWallId);

        // Doors in reverse: last → second
        for (let d = doorSegs.length - 1; d >= 1; d--) {
          // Door[d] opening on B side
          push(ptOnB(doorSegs[d].enterDist), null);
          // Wall between door[d] and door[d-1] on B side
          push(ptOnB(doorSegs[d - 1].exitDist), sharedWallId);
        }

        // We're now at ptOnB(doorSegs[0].exitDist) — first door's EXIT on B
        // (NOT enterDist, which was already visited)

        // ── Bridge back to A at first door's EXIT ──
        // This is axis-aligned: ptOnB(door0.exit) → ptOnA(door0.exit)
        push(ptOnA(doorSegs[0].exitDist), null);

        // ── Walk A's shared edge from door[0].exit to sharedEndIdxA ──
        // This segment includes wall-between-doors and subsequent door openings
        if (doorSegs.length > 1) {
          for (let d = 1; d < doorSegs.length; d++) {
            // Wall between door[d-1] exit and door[d] enter on A side
            push(ptOnA(doorSegs[d].enterDist), sharedWallId);
            // Door[d] opening on A side
            push(ptOnA(doorSegs[d].exitDist), null);
          }
        }

        // Continue: sharedEndIdxA will be pushed with sharedWallId

      } else if (i === sharedEndIdxA) {
        push(polyA[i], sharedWallId);
      } else {
        push(polyA[i], wallIdsA[i]);
      }
    }

    return { polygon: result, wallIds: newWallIds };
  }

  // ═══════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════

  /** Remove nodes with no walls attached */
  _removeOrphanNodes() {
    const connected = new Set();
    for (const wall of this.walls.values()) {
      connected.add(wall.startNodeId);
      connected.add(wall.endNodeId);
    }
    for (const nodeId of [...this.nodes.keys()]) {
      if (!connected.has(nodeId)) {
        this.nodes.delete(nodeId);
      }
    }
  }

  /** Invalidate cached room/zone computations */
  _invalidateCache() {
    this._cachedRooms = null;
    this._cachedFloorZones = null;
  }

  /**
   * Find the nearest wall to a point
   * @param {number} x
   * @param {number} y
   * @param {number} [tolerance=20] mm
   * @returns {{wallId: number, distance: number, projection: {x,y}}|null}
   */
  findWallNear(x, y, tolerance = 20) {
    let best = null;
    let bestDist = tolerance;

    for (const wall of this.walls.values()) {
      const axis = this.getWallAxis(wall.id);
      if (!axis) continue;

      const dist = Geometry.distanceToSegment({ x, y }, axis.start, axis.end);
      if (dist < bestDist) {
        bestDist = dist;

        // Compute projection point on the wall axis
        const dx = axis.end.x - axis.start.x;
        const dy = axis.end.y - axis.start.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((x - axis.start.x) * dx + (y - axis.start.y) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));

        best = {
          wallId: wall.id,
          distance: dist,
          projection: {
            x: axis.start.x + t * dx,
            y: axis.start.y + t * dy,
          },
        };
      }
    }

    return best;
  }

  // ═══════════════════════════════════════════════════════════
  //  SERIALIZATION
  // ═══════════════════════════════════════════════════════════

  /** Export state for save/undo */
  serialize() {
    return {
      nodes: [...this.nodes.entries()].map(([, n]) => ({ ...n })),
      walls: [...this.walls.entries()].map(([, w]) => ({ ...w })),
      doors: [...this.doors.entries()].map(([, d]) => ({ ...d })),
      _nextNodeId: this._nextNodeId,
      _nextWallId: this._nextWallId,
      _nextDoorId: this._nextDoorId,
    };
  }

  /** Import state from saved data */
  deserialize(data) {
    this.nodes.clear();
    this.walls.clear();
    this.doors.clear();

    for (const n of data.nodes) this.nodes.set(n.id, { ...n });
    for (const w of data.walls) this.walls.set(w.id, { ...w });
    for (const d of (data.doors || [])) this.doors.set(d.id, { ...d });

    this._nextNodeId = data._nextNodeId || 1;
    this._nextWallId = data._nextWallId || 1;
    this._nextDoorId = data._nextDoorId || 1;
    this._invalidateCache();
  }
}
