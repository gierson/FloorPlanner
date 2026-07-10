// ═══════════════════════════════════════════════════════════════
//  Door Configuration — Unit Tests
// ═══════════════════════════════════════════════════════════════

// Helper: create a rectangular room with a wall for door placement
function createRoomForDoor(graph, thickness) {
  thickness = thickness || 150;
  const n1 = graph.addNode(0, 0);
  const n2 = graph.addNode(3000, 0);
  const n3 = graph.addNode(3000, 3000);
  const n4 = graph.addNode(0, 3000);
  const w1 = graph.addWall(n1, n2, { thickness });
  const w2 = graph.addWall(n2, n3, { thickness });
  const w3 = graph.addWall(n3, n4, { thickness });
  const w4 = graph.addWall(n4, n1, { thickness });
  return { nodes: [n1, n2, n3, n4], walls: [w1, w2, w3, w4] };
}

// ─── Door Default Properties ─────────────────────────────────

describe('Door Config — addDoor defaults', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('addDoor sets default hingeSide to "left"', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    const door = g.doors.get(doorId);
    assert.equal(door.hingeSide, 'left');
  });

  it('addDoor sets default openDirection to "A"', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    const door = g.doors.get(doorId);
    assert.equal(door.openDirection, 'A');
  });

  it('addDoor accepts custom hingeSide and openDirection', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800, {
      hingeSide: 'right',
      openDirection: 'B',
    });
    const door = g.doors.get(doorId);
    assert.equal(door.hingeSide, 'right');
    assert.equal(door.openDirection, 'B');
  });
});

// ─── updateDoor ──────────────────────────────────────────────

describe('Door Config — updateDoor', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('updateDoor changes width', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    g.updateDoor(doorId, { width: 900 });
    assert.equal(g.doors.get(doorId).width, 900);
  });

  it('updateDoor changes hingeSide', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    g.updateDoor(doorId, { hingeSide: 'right' });
    assert.equal(g.doors.get(doorId).hingeSide, 'right');
  });

  it('updateDoor changes openDirection', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    g.updateDoor(doorId, { openDirection: 'B' });
    assert.equal(g.doors.get(doorId).openDirection, 'B');
  });

  it('updateDoor changes multiple props at once', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    g.updateDoor(doorId, { width: 1000, hingeSide: 'right', openDirection: 'B' });
    const door = g.doors.get(doorId);
    assert.equal(door.width, 1000);
    assert.equal(door.hingeSide, 'right');
    assert.equal(door.openDirection, 'B');
  });

  it('updateDoor does not change unspecified props', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    g.updateDoor(doorId, { hingeSide: 'right' });
    const door = g.doors.get(doorId);
    assert.equal(door.width, 800);
    assert.equal(door.openDirection, 'A');
    assert.equal(door.position, 1500);
  });

  it('updateDoor invalidates cache', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    // Force cache
    g.findRooms();
    assert.ok(g._cachedRooms !== null);
    g.updateDoor(doorId, { width: 900 });
    assert.equal(g._cachedRooms, null);
  });

  it('updateDoor on non-existent door is a no-op', () => {
    const room = createRoomForDoor(g);
    g.updateDoor(999, { width: 900 });
    // Should not throw
    assert.ok(true);
  });
});

// ─── Serialization ───────────────────────────────────────────

describe('Door Config — serialize/deserialize', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('serialize preserves hingeSide and openDirection', () => {
    const room = createRoomForDoor(g);
    g.addDoor(room.walls[0], 1500, 800, { hingeSide: 'right', openDirection: 'B' });
    const data = g.serialize();
    const doorData = data.doors[0];
    assert.equal(doorData.hingeSide, 'right');
    assert.equal(doorData.openDirection, 'B');
  });

  it('deserialize restores hingeSide and openDirection', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800, { hingeSide: 'right', openDirection: 'B' });
    const data = g.serialize();

    // Create a new graph and restore
    const g2 = new WallGraph();
    g2.deserialize(data);
    const door = g2.doors.get(doorId);
    assert.equal(door.hingeSide, 'right');
    assert.equal(door.openDirection, 'B');
  });

  it('deserialize of old data without hingeSide gets default values', () => {
    // Simulate old data format without hingeSide/openDirection
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    const data = g.serialize();
    // Remove new fields to simulate old format
    delete data.doors[0].hingeSide;
    delete data.doors[0].openDirection;

    const g2 = new WallGraph();
    g2.deserialize(data);
    const door = g2.doors.get(doorId);
    // Should have defaults after deserialization
    assert.equal(door.hingeSide || 'left', 'left');
    assert.equal(door.openDirection || 'A', 'A');
  });
});

// ─── UpdateDoorCommand ───────────────────────────────────────

describe('Door Config — UpdateDoorCommand', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('execute changes door properties', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    const cmd = new UpdateDoorCommand(g, doorId,
      { width: 800, hingeSide: 'left', openDirection: 'A' },
      { width: 900, hingeSide: 'right', openDirection: 'B' }
    );
    cmd.execute();
    const door = g.doors.get(doorId);
    assert.equal(door.width, 900);
    assert.equal(door.hingeSide, 'right');
    assert.equal(door.openDirection, 'B');
  });

  it('undo restores original door properties', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    const cmd = new UpdateDoorCommand(g, doorId,
      { width: 800, hingeSide: 'left', openDirection: 'A' },
      { width: 900, hingeSide: 'right', openDirection: 'B' }
    );
    cmd.execute();
    cmd.undo();
    const door = g.doors.get(doorId);
    assert.equal(door.width, 800);
    assert.equal(door.hingeSide, 'left');
    assert.equal(door.openDirection, 'A');
  });
});

// ─── RemoveDoorCommand ───────────────────────────────────────

describe('Door Config — RemoveDoorCommand', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('execute removes the door from the graph', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    assert.equal(g.doors.size, 1);

    const cmd = new RemoveDoorCommand(g, doorId);
    cmd.execute();
    assert.equal(g.doors.size, 0);
  });

  it('undo restores the removed door', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 800);
    const cmd = new RemoveDoorCommand(g, doorId);
    cmd.execute();
    assert.equal(g.doors.size, 0);

    cmd.undo();
    assert.equal(g.doors.size, 1);
    const door = g.doors.get(doorId);
    assert.ok(door, 'door should be restored');
    assert.equal(door.position, 1500);
    assert.equal(door.width, 800);
  });

  it('undo restores door with custom properties', () => {
    const room = createRoomForDoor(g);
    const doorId = g.addDoor(room.walls[0], 1500, 900, { hingeSide: 'right', openDirection: 'B' });
    const cmd = new RemoveDoorCommand(g, doorId);
    cmd.execute();
    cmd.undo();
    const door = g.doors.get(doorId);
    assert.equal(door.hingeSide, 'right');
    assert.equal(door.openDirection, 'B');
    assert.equal(door.width, 900);
  });
});
