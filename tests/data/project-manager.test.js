// ═══════════════════════════════════════════════════════════════
//  ProjectManager — Unit Tests (TDD: RED phase)
// ═══════════════════════════════════════════════════════════════

// ─── createSnapshot ──────────────────────────────────────────

describe('ProjectManager — createSnapshot', () => {
  let pm, g;
  beforeEach(() => {
    g = new WallGraph();
    pm = new ProjectManager(g);
  });

  it('returns object with version, name, graph, settings', () => {
    const snap = pm.createSnapshot('Test Project');
    assert.equal(snap.version, 1);
    assert.equal(snap.name, 'Test Project');
    assert.ok(snap.graph, 'should have graph');
    assert.ok(snap.settings, 'should have settings');
    assert.ok(snap.createdAt, 'should have createdAt');
    assert.ok(snap.updatedAt, 'should have updatedAt');
  });

  it('graph contains serialized nodes, walls, doors', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(3000, 0);
    const w1 = g.addWall(n1, n2);
    g.addDoor(w1, 1500, 800);

    const snap = pm.createSnapshot('With data');
    assert.equal(snap.graph.nodes.length, 2);
    assert.equal(snap.graph.walls.length, 1);
    assert.equal(snap.graph.doors.length, 1);
  });

  it('settings contain material, laying, wallDefaults, doorDefaults', () => {
    const snap = pm.createSnapshot('Settings test');
    assert.ok(snap.settings.material, 'should have material');
    assert.ok(snap.settings.laying, 'should have laying');
    assert.ok(snap.settings.wallDefaults, 'should have wallDefaults');
    assert.ok(snap.settings.doorDefaults, 'should have doorDefaults');
  });

  it('settings reflect current appState values', () => {
    appState.set('material.length', 999);
    appState.set('laying.expansionGap', 15);
    const snap = pm.createSnapshot('State test');
    assert.equal(snap.settings.material.length, 999);
    assert.equal(snap.settings.laying.expansionGap, 15);
    // Restore defaults for other tests
    appState.set('material.length', 1380);
    appState.set('laying.expansionGap', 10);
  });

  it('uses default name if none provided', () => {
    const snap = pm.createSnapshot();
    assert.ok(snap.name.length > 0, 'should have a non-empty default name');
  });
});

// ─── loadSnapshot ────────────────────────────────────────────

describe('ProjectManager — loadSnapshot', () => {
  let pm, g;
  beforeEach(() => {
    g = new WallGraph();
    pm = new ProjectManager(g);
  });

  it('restores graph nodes, walls, doors', () => {
    // Build some data
    const n1 = g.addNode(100, 200);
    const n2 = g.addNode(3000, 200);
    const n3 = g.addNode(3000, 3000);
    const n4 = g.addNode(100, 3000);
    g.addWall(n1, n2);
    g.addWall(n2, n3);
    g.addWall(n3, n4);
    const w4 = g.addWall(n4, n1);
    g.addDoor(w4, 1500, 800);

    const snap = pm.createSnapshot('Roundtrip');

    // Clear graph
    g.deserialize({ nodes: [], walls: [], doors: [] });
    assert.equal(g.nodes.size, 0);

    // Restore
    pm.loadSnapshot(snap);
    assert.equal(g.nodes.size, 4);
    assert.equal(g.walls.size, 4);
    assert.equal(g.doors.size, 1);
  });

  it('restores appState settings', () => {
    appState.set('material.length', 1234);
    appState.set('laying.stagger', 'half');
    const snap = pm.createSnapshot('Settings');

    // Change settings
    appState.set('material.length', 999);
    appState.set('laying.stagger', 'random');

    // Restore
    pm.loadSnapshot(snap);
    assert.equal(appState.get('material.length'), 1234);
    assert.equal(appState.get('laying.stagger'), 'half');

    // Cleanup
    appState.set('material.length', 1380);
    appState.set('laying.stagger', 'third');
  });

  it('sets currentProjectId and clears isDirty', () => {
    const snap = pm.createSnapshot('Named');
    snap._storageId = 'test-123';
    pm.loadSnapshot(snap);
    assert.equal(pm.currentProjectId, 'test-123');
    assert.equal(pm.isDirty, false);
  });
});

// ─── Round-trip ──────────────────────────────────────────────

describe('ProjectManager — round-trip', () => {
  let pm, g;
  beforeEach(() => {
    g = new WallGraph();
    pm = new ProjectManager(g);
  });

  it('save → load produces identical graph state', () => {
    const n1 = g.addNode(0, 0);
    const n2 = g.addNode(5000, 0);
    const n3 = g.addNode(5000, 4000);
    const n4 = g.addNode(0, 4000);
    g.addWall(n1, n2, { thickness: 200 });
    g.addWall(n2, n3, { thickness: 200 });
    g.addWall(n3, n4, { thickness: 200 });
    const w4 = g.addWall(n4, n1, { thickness: 200 });
    g.addDoor(w4, 2000, 900);

    const snap = pm.createSnapshot('Roundtrip test');
    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json);

    // Clear and reload
    g.deserialize({ nodes: [], walls: [], doors: [] });
    pm.loadSnapshot(parsed);

    // Verify
    assert.equal(g.nodes.size, 4);
    assert.equal(g.walls.size, 4);
    assert.equal(g.doors.size, 1);

    const node1 = g.nodes.get(n1);
    assert.equal(node1.x, 0);
    assert.equal(node1.y, 0);

    const wall = g.walls.get(w4);
    assert.equal(wall.thickness, 200);
  });

  it('JSON.stringify produces valid parseable string', () => {
    g.addNode(0, 0);
    g.addNode(1000, 0);
    const snap = pm.createSnapshot('JSON test');
    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.name, 'JSON test');
  });
});

// ─── Validation / backward compatibility ─────────────────────

describe('ProjectManager — validation', () => {
  let pm, g;
  beforeEach(() => {
    g = new WallGraph();
    pm = new ProjectManager(g);
  });

  it('loadSnapshot with missing settings uses current defaults', () => {
    const snap = {
      version: 1,
      name: 'Old project',
      graph: { nodes: [], walls: [], doors: [] },
      // no settings property
    };
    // Should not throw
    pm.loadSnapshot(snap);
    // appState should keep its current values
    assert.ok(appState.get('material.length') > 0);
  });

  it('loadSnapshot with partial settings merges with defaults', () => {
    const snap = {
      version: 1,
      name: 'Partial',
      graph: { nodes: [], walls: [], doors: [] },
      settings: {
        material: { length: 2000 },
        // no laying, wallDefaults, doorDefaults
      },
    };
    pm.loadSnapshot(snap);
    assert.equal(appState.get('material.length'), 2000);
    // laying should keep defaults
    assert.ok(appState.get('laying.expansionGap') > 0);
    // Cleanup
    appState.set('material.length', 1380);
  });

  it('loadSnapshot with version=1 is accepted', () => {
    const snap = pm.createSnapshot('V1');
    snap.version = 1;
    pm.loadSnapshot(snap); // should not throw
    assert.ok(true);
  });
});

// ─── exportToBlob / parseImport ──────────────────────────────

describe('ProjectManager — export/import helpers', () => {
  let pm, g;
  beforeEach(() => {
    g = new WallGraph();
    pm = new ProjectManager(g);
  });

  it('toJSON returns valid JSON string', () => {
    g.addNode(0, 0);
    g.addNode(1000, 0);
    const snap = pm.createSnapshot('Export test');
    const json = pm.toJSON(snap);
    assert.ok(typeof json === 'string');
    const parsed = JSON.parse(json);
    assert.equal(parsed.name, 'Export test');
  });

  it('fromJSON parses valid JSON string', () => {
    const snap = pm.createSnapshot('Import test');
    const json = JSON.stringify(snap);
    const parsed = pm.fromJSON(json);
    assert.equal(parsed.name, 'Import test');
    assert.equal(parsed.version, 1);
  });

  it('fromJSON throws on invalid JSON', () => {
    assert.throws(() => pm.fromJSON('not valid json{{{'));
  });

  it('fromJSON throws on missing version', () => {
    assert.throws(() => pm.fromJSON(JSON.stringify({ name: 'no version' })));
  });

  it('fromJSON throws on missing graph', () => {
    assert.throws(() => pm.fromJSON(JSON.stringify({ version: 1, name: 'no graph' })));
  });
});

// ─── isDirty tracking ────────────────────────────────────────

describe('ProjectManager — dirty tracking', () => {
  let pm, g;
  beforeEach(() => {
    g = new WallGraph();
    pm = new ProjectManager(g);
  });

  it('starts as not dirty', () => {
    assert.equal(pm.isDirty, false);
  });

  it('markDirty sets isDirty to true', () => {
    pm.markDirty();
    assert.equal(pm.isDirty, true);
  });

  it('clearDirty sets isDirty to false', () => {
    pm.markDirty();
    pm.clearDirty();
    assert.equal(pm.isDirty, false);
  });

  it('createSnapshot does not change dirty flag', () => {
    pm.markDirty();
    pm.createSnapshot('test');
    assert.equal(pm.isDirty, true);
  });

  it('loadSnapshot clears dirty flag', () => {
    pm.markDirty();
    const snap = pm.createSnapshot('test');
    pm.loadSnapshot(snap);
    assert.equal(pm.isDirty, false);
  });
});

// ─── localStorage operations ─────────────────────────────────

describe('ProjectManager — localStorage', () => {
  let pm, g;
  beforeEach(() => {
    g = new WallGraph();
    pm = new ProjectManager(g);
    // Clear any existing project data
    pm._clearAllStorage();
  });

  it('saveToStorage returns a project id', () => {
    const id = pm.saveToStorage('My Project');
    assert.ok(id, 'should return an id');
    assert.ok(typeof id === 'string');
  });

  it('listFromStorage returns saved projects', () => {
    pm.saveToStorage('Project A');
    pm.currentProjectId = null; // reset so next save creates new
    pm.saveToStorage('Project B');
    const list = pm.listFromStorage();
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Project A');
    assert.equal(list[1].name, 'Project B');
  });

  it('loadFromStorage restores project', () => {
    const n1 = g.addNode(100, 200);
    const n2 = g.addNode(3000, 200);
    g.addWall(n1, n2);
    const id = pm.saveToStorage('Saved');

    // Clear graph
    g.deserialize({ nodes: [], walls: [], doors: [] });
    assert.equal(g.nodes.size, 0);

    // Load
    const loaded = pm.loadFromStorage(id);
    assert.ok(loaded, 'should return truthy');
    assert.equal(g.nodes.size, 2);
    assert.equal(g.walls.size, 1);
  });

  it('deleteFromStorage removes project', () => {
    const id = pm.saveToStorage('To Delete');
    assert.equal(pm.listFromStorage().length, 1);
    pm.deleteFromStorage(id);
    assert.equal(pm.listFromStorage().length, 0);
  });

  it('renameInStorage changes project name', () => {
    const id = pm.saveToStorage('Old Name');
    pm.renameInStorage(id, 'New Name');
    const list = pm.listFromStorage();
    assert.equal(list[0].name, 'New Name');
  });

  it('saveToStorage updates existing project when currentProjectId matches', () => {
    const id = pm.saveToStorage('First Save');
    pm.currentProjectId = id;

    // Modify graph
    g.addNode(500, 500);
    pm.saveToStorage('First Save');

    // Should still be 1 project, not 2
    const list = pm.listFromStorage();
    assert.equal(list.length, 1);
  });

  it('loadFromStorage returns false for non-existent id', () => {
    const result = pm.loadFromStorage('nonexistent-id');
    assert.equal(result, false);
  });
});
