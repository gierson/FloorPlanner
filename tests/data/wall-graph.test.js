// ═══════════════════════════════════════════════════════════════
//  WallGraph — Unit Tests
// ═══════════════════════════════════════════════════════════════

// Helper: create a rectangular room (4 nodes, 4 walls) and return the graph + IDs
function createRectRoom(graph, x, y, w, h, thickness) {
  thickness = thickness || 150;
  const n1 = graph.addNode(x, y);
  const n2 = graph.addNode(x + w, y);
  const n3 = graph.addNode(x + w, y + h);
  const n4 = graph.addNode(x, y + h);
  const w1 = graph.addWall(n1, n2, { thickness });
  const w2 = graph.addWall(n2, n3, { thickness });
  const w3 = graph.addWall(n3, n4, { thickness });
  const w4 = graph.addWall(n4, n1, { thickness });
  return { nodes: [n1, n2, n3, n4], walls: [w1, w2, w3, w4] };
}

// ─── Node Operations ─────────────────────────────────────────

describe('WallGraph — Nodes', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('addNode creates a node with correct coordinates', () => {
    const id = g.addNode(1000, 2000);
    assert.ok(id > 0);
    const node = g.nodes.get(id);
    assert.equal(node.x, 1000);
    assert.equal(node.y, 2000);
  });

  it('addNode rounds coordinates to integers', () => {
    const id = g.addNode(100.7, 200.3);
    const node = g.nodes.get(id);
    assert.equal(node.x, 101);
    assert.equal(node.y, 200);
  });

  it('each addNode gets a unique ID', () => {
    const id1 = g.addNode(0, 0);
    const id2 = g.addNode(100, 100);
    assert.notEqual(id1, id2);
  });

  it('moveNode updates coordinates', () => {
    const id = g.addNode(0, 0);
    g.moveNode(id, 500, 600);
    const node = g.nodes.get(id);
    assert.equal(node.x, 500);
    assert.equal(node.y, 600);
  });

  it('removeNode deletes the node', () => {
    const id = g.addNode(0, 0);
    g.removeNode(id);
    assert.notOk(g.nodes.has(id));
  });

  it('removeNode also removes connected walls', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(1000, 0);
    const w = g.addWall(n1, n2);
    g.removeNode(n1);
    assert.notOk(g.walls.has(w));
  });

  it('findNodeNear finds node within tolerance', () => {
    const id = g.addNode(500, 500);
    assert.equal(g.findNodeNear(502, 498, 10), id);
  });

  it('findNodeNear returns null outside tolerance', () => {
    g.addNode(500, 500);
    assert.equal(g.findNodeNear(600, 600, 10), null);
  });
});

// ─── Wall Operations ─────────────────────────────────────────

describe('WallGraph — Walls', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('addWall creates a wall between two nodes', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    assert.ok(w > 0);
    assert.equal(g.walls.size, 1);
  });

  it('addWall with default thickness is 150mm', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    assert.equal(g.walls.get(w).thickness, 150);
  });

  it('addWall with custom thickness', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2, { thickness: 200 });
    assert.equal(g.walls.get(w).thickness, 200);
  });

  it('addWall rejects same node (start === end)', () => {
    const n = g.addNode(0, 0);
    const w = g.addWall(n, n);
    assert.equal(w, -1);
  });

  it('addWall prevents duplicates', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w1 = g.addWall(n1, n2);
    const w2 = g.addWall(n1, n2);
    assert.equal(w1, w2); // same wall returned
    assert.equal(g.walls.size, 1);
  });

  it('addWall prevents reverse duplicate', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w1 = g.addWall(n1, n2);
    const w2 = g.addWall(n2, n1);
    assert.equal(w1, w2);
  });

  it('getWallLength returns correct length', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    g.addWall(n1, n2);
    assert.closeTo(g.getWallLength(g.walls.keys().next().value), 3000, 1);
  });

  it('getWallAxis returns start/end points', () => {
    const n1 = g.addNode(100, 200);
    const n2 = g.addNode(500, 200);
    const w = g.addWall(n1, n2);
    const axis = g.getWallAxis(w);
    assert.equal(axis.start.x, 100);
    assert.equal(axis.start.y, 200);
    assert.equal(axis.end.x, 500);
    assert.equal(axis.end.y, 200);
  });

  it('removeWall removes the wall', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    g.removeWall(w);
    assert.notOk(g.walls.has(w));
  });

  it('removeWall also removes doors on that wall', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    const d = g.addDoor(w, 1500, 800);
    g.removeWall(w);
    assert.notOk(g.doors.has(d));
  });

  it('getWallPolygon returns 4 vertices', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    const poly = g.getWallPolygon(w);
    assert.arrayLength(poly, 4);
  });

  it('mergeNodes reconnects walls', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(1000, 0);
    const n3 = g.addNode(1002, 2); // nearly same as n2
    const n4 = g.addNode(1000, 1000);

    g.addWall(n1, n2);
    g.addWall(n3, n4);

    g.mergeNodes(n2, n3);
    
    assert.notOk(g.nodes.has(n3));
    assert.equal(g.walls.size, 2);
    // Wall should now connect n2 → n4
    let foundWall = false;
    for (const wall of g.walls.values()) {
      if ((wall.startNodeId === n2 && wall.endNodeId === n4) ||
          (wall.startNodeId === n4 && wall.endNodeId === n2)) {
        foundWall = true;
      }
    }
    assert.ok(foundWall);
  });
});

// ─── Door Operations ─────────────────────────────────────────

describe('WallGraph — Doors', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('addDoor creates a door on a wall', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    const d = g.addDoor(w, 1500, 800);
    assert.ok(d > 0);
    assert.equal(g.doors.size, 1);
  });

  it('addDoor stores position and width', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    const d = g.addDoor(w, 1500, 900);
    const door = g.doors.get(d);
    assert.equal(door.position, 1500);
    assert.equal(door.width, 900);
    assert.equal(door.wallId, w);
  });

  it('addDoor on non-existent wall returns -1', () => {
    assert.equal(g.addDoor(999, 100, 800), -1);
  });

  it('removeDoor removes the door', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w = g.addWall(n1, n2);
    const d = g.addDoor(w, 1500, 800);
    g.removeDoor(d);
    assert.notOk(g.doors.has(d));
  });

  it('getDoorsOnWall returns doors for a wall', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(5000, 0);
    const w = g.addWall(n1, n2);
    g.addDoor(w, 1500, 800);
    g.addDoor(w, 3500, 800);
    const doors = g.getDoorsOnWall(w);
    assert.arrayLength(doors, 2);
  });
});

// ─── Room Detection ──────────────────────────────────────────

describe('WallGraph — findRooms', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('single rectangle → 1 room', () => {
    createRectRoom(g, 0, 0, 3000, 4000);
    const rooms = g.findRooms();
    assert.equal(rooms.length, 1);
  });

  it('single rectangle has correct area', () => {
    // Room 3000x4000 with 150mm walls → inner ≈ 2850x3850 = 10_972_500 mm²
    createRectRoom(g, 0, 0, 3000, 4000, 150);
    const rooms = g.findRooms();
    const innerArea = rooms[0].area; // in m²
    // Expected: (3000-150) * (4000-150) = 2850 * 3850 = 10_972_500 mm² = 10.9725 m²
    assert.closeTo(innerArea, 10.9725, 0.1);
  });

  it('single rectangle inner polygon has 4 vertices', () => {
    createRectRoom(g, 0, 0, 3000, 4000);
    const rooms = g.findRooms();
    assert.arrayLength(rooms[0].innerPolygon, 4);
  });

  it('no walls → no rooms', () => {
    g.addNode(0, 0);
    g.addNode(1000, 0);
    assert.equal(g.findRooms().length, 0);
  });

  it('open shape (3 walls) → no rooms', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const n3 = g.addNode(3000, 4000);
    const n4 = g.addNode(0, 4000);
    g.addWall(n1, n2);
    g.addWall(n2, n3);
    g.addWall(n3, n4);
    // Missing wall n4→n1 — not closed
    assert.equal(g.findRooms().length, 0);
  });

  it('wall dividing rectangle → 2 rooms', () => {
    // Create rectangle
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(6000, 0);
    const n3 = g.addNode(6000, 4000);
    const n4 = g.addNode(0, 4000);
    g.addWall(n1, n2);
    g.addWall(n2, n3);
    g.addWall(n3, n4);
    g.addWall(n4, n1);
    
    // Add dividing wall at x=3000
    const n5 = g.addNode(3000, 0);
    const n6 = g.addNode(3000, 4000);
    g.addWall(n5, n6);
    
    // Need to split walls at intersection points
    // Actually walls n1→n2 and n4→n3 should pass through n5 and n6
    // Let me rebuild properly
    g.nodes.clear();
    g.walls.clear();
    g._invalidateCache();
    
    // Top edge: two segments
    const a1 = g.addNode(0, 0);
    const a2 = g.addNode(3000, 0);
    const a3 = g.addNode(6000, 0);
    // Bottom edge: two segments
    const a4 = g.addNode(6000, 4000);
    const a5 = g.addNode(3000, 4000);
    const a6 = g.addNode(0, 4000);
    
    // Outer walls
    g.addWall(a1, a2); // top left
    g.addWall(a2, a3); // top right
    g.addWall(a3, a4); // right
    g.addWall(a4, a5); // bottom right
    g.addWall(a5, a6); // bottom left
    g.addWall(a6, a1); // left
    
    // Dividing wall
    g.addWall(a2, a5); // vertical at x=3000
    
    const rooms = g.findRooms();
    assert.equal(rooms.length, 2);
  });
});

// ─── Floor Zones ─────────────────────────────────────────────

describe('WallGraph — findFloorZones', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('single room without doors → 1 zone (same as room)', () => {
    createRectRoom(g, 0, 0, 3000, 4000);
    const zones = g.findFloorZones();
    assert.equal(zones.length, 1);
    assert.arrayLength(zones[0].roomIds, 1);
  });

  it('two rooms with door → 1 floor zone', () => {
    // Two adjacent rooms sharing a wall at x=3000
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const n3 = g.addNode(6000, 0);
    const n4 = g.addNode(6000, 4000);
    const n5 = g.addNode(3000, 4000);
    const n6 = g.addNode(0, 4000);
    
    g.addWall(n1, n2);
    g.addWall(n2, n3);
    g.addWall(n3, n4);
    g.addWall(n4, n5);
    g.addWall(n5, n6);
    g.addWall(n6, n1);
    const dividingWall = g.addWall(n2, n5); // shared wall
    
    // Add a door on the dividing wall
    g.addDoor(dividingWall, 2000, 800);
    
    const zones = g.findFloorZones();
    assert.equal(zones.length, 1); // merged into 1 zone
    assert.arrayLength(zones[0].roomIds, 2); // 2 rooms in the zone
  });

  it('two rooms without door → 2 separate zones', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const n3 = g.addNode(6000, 0);
    const n4 = g.addNode(6000, 4000);
    const n5 = g.addNode(3000, 4000);
    const n6 = g.addNode(0, 4000);
    
    g.addWall(n1, n2);
    g.addWall(n2, n3);
    g.addWall(n3, n4);
    g.addWall(n4, n5);
    g.addWall(n5, n6);
    g.addWall(n6, n1);
    g.addWall(n2, n5); // shared wall, no door
    
    const zones = g.findFloorZones();
    assert.equal(zones.length, 2); // separate zones
  });
});

// ─── Serialization ───────────────────────────────────────────

describe('WallGraph — serialize/deserialize', () => {
  it('round-trips correctly', () => {
    const g1 = new WallGraph();
    createRectRoom(g1, 0, 0, 3000, 4000);
    const n1 = g1.nodes.keys().next().value;
    const n2 = [...g1.nodes.keys()][1];
    const w1 = g1.walls.keys().next().value;
    g1.addDoor(w1, 1500, 800);
    
    const data = g1.serialize();
    
    const g2 = new WallGraph();
    g2.deserialize(data);
    
    assert.equal(g2.nodes.size, g1.nodes.size);
    assert.equal(g2.walls.size, g1.walls.size);
    assert.equal(g2.doors.size, g1.doors.size);
  });
});
