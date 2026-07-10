// ═══════════════════════════════════════════════════════════════
//  Optimizer — Offset Return & Manual Adjustment Tests
// ═══════════════════════════════════════════════════════════════

// Simple 4x3m room polygon (axis-aligned rectangle)
const ROOM_4x3 = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];

const BASE_CONFIG = {
  panelLength: 1380,
  panelWidth: 193,
  expansionGap: 10,
  minCutWidth: 50,
  minCutLength: 300,
  direction: 0,
  stagger: 'third',
};

describe('optimizeRoom returns bestOffset', () => {
  it('returns bestOffsetX and bestOffsetY as numbers', () => {
    const room = {
      id: 1,
      name: 'Test',
      vertices: ROOM_4x3,
      wallIds: [1, 1, 1, 1],
    };
    const result = layoutOptimizer.optimizeRoom(room, BASE_CONFIG);

    assert.ok(typeof result.bestOffsetX === 'number',
      `bestOffsetX should be a number, got ${typeof result.bestOffsetX}`);
    assert.ok(typeof result.bestOffsetY === 'number',
      `bestOffsetY should be a number, got ${typeof result.bestOffsetY}`);
  });

  it('bestOffsetX is in range [0, panelLength)', () => {
    const room = {
      id: 1,
      name: 'Test',
      vertices: ROOM_4x3,
      wallIds: [1, 1, 1, 1],
    };
    const result = layoutOptimizer.optimizeRoom(room, BASE_CONFIG);

    assert.ok(result.bestOffsetX >= 0, `bestOffsetX >= 0, got ${result.bestOffsetX}`);
    assert.ok(result.bestOffsetX < BASE_CONFIG.panelLength,
      `bestOffsetX < panelLength, got ${result.bestOffsetX}`);
  });

  it('bestOffsetY is in range [0, panelWidth)', () => {
    const room = {
      id: 1,
      name: 'Test',
      vertices: ROOM_4x3,
      wallIds: [1, 1, 1, 1],
    };
    const result = layoutOptimizer.optimizeRoom(room, BASE_CONFIG);

    assert.ok(result.bestOffsetY >= 0, `bestOffsetY >= 0, got ${result.bestOffsetY}`);
    assert.ok(result.bestOffsetY < BASE_CONFIG.panelWidth,
      `bestOffsetY < panelWidth, got ${result.bestOffsetY}`);
  });
});

describe('optimizeAll returns bestOffset per room', () => {
  it('each result entry has bestOffsetX and bestOffsetY', () => {
    const rooms = [
      { id: 1, name: 'Room1', vertices: ROOM_4x3, wallIds: [1, 1, 1, 1] },
    ];
    const result = layoutOptimizer.optimizeAll(rooms, BASE_CONFIG);
    const roomResult = result.results.get(1);

    assert.ok(roomResult, 'result for room 1 should exist');
    assert.ok(typeof roomResult.bestOffsetX === 'number',
      `bestOffsetX should be number, got ${typeof roomResult.bestOffsetX}`);
    assert.ok(typeof roomResult.bestOffsetY === 'number',
      `bestOffsetY should be number, got ${typeof roomResult.bestOffsetY}`);
  });
});

describe('Re-layout with manual offset', () => {
  it('generates valid panels with a given offset', () => {
    // First optimize to get insetPolygon
    const room = {
      id: 1,
      name: 'Test',
      vertices: ROOM_4x3,
      wallIds: [1, 1, 1, 1],
    };
    const optResult = layoutOptimizer.optimizeRoom(room, BASE_CONFIG);
    const insetPoly = optResult.insetPolygon;

    // Now re-layout with a manual offset
    const manualConfig = {
      ...BASE_CONFIG,
      offsetX: 100,
      offsetY: 50,
    };
    const relayout = LayoutEngine.generateLayout(insetPoly, manualConfig);

    assert.ok(relayout.panels.length > 0, 'should produce panels');
    assert.ok(relayout.stats.totalPanels > 0, 'should have panel count');
    assert.ok(relayout.stats.totalArea > 0, 'should have positive area');
  });

  it('different offsets produce different panel centroids', () => {
    const room = {
      id: 1,
      name: 'Test',
      vertices: ROOM_4x3,
      wallIds: [1, 1, 1, 1],
    };
    const optResult = layoutOptimizer.optimizeRoom(room, BASE_CONFIG);
    const insetPoly = optResult.insetPolygon;

    const layout1 = LayoutEngine.generateLayout(insetPoly, {
      ...BASE_CONFIG, offsetX: 0, offsetY: 0,
    });
    const layout2 = LayoutEngine.generateLayout(insetPoly, {
      ...BASE_CONFIG, offsetX: 200, offsetY: 50,
    });

    // Compare sum of centroid X positions — should differ with different offsets
    const sumCx1 = layout1.panels.reduce((s, p) => s + p.centroid.x, 0);
    const sumCx2 = layout2.panels.reduce((s, p) => s + p.centroid.x, 0);
    assert.ok(Math.abs(sumCx1 - sumCx2) > 1,
      'different offsets should produce different panel centroid sums');
  });

  it('offset equal to panelLength gives same total area as offset=0', () => {
    const room = {
      id: 1,
      name: 'Test',
      vertices: ROOM_4x3,
      wallIds: [1, 1, 1, 1],
    };
    const optResult = layoutOptimizer.optimizeRoom(room, BASE_CONFIG);
    const insetPoly = optResult.insetPolygon;

    const layout0 = LayoutEngine.generateLayout(insetPoly, {
      ...BASE_CONFIG, offsetX: 0, offsetY: 0,
    });
    const layoutCycle = LayoutEngine.generateLayout(insetPoly, {
      ...BASE_CONFIG, offsetX: BASE_CONFIG.panelLength, offsetY: BASE_CONFIG.panelWidth,
    });

    // Cyclic offset should produce same total area (panels cover same room)
    assert.closeTo(layout0.stats.totalArea, layoutCycle.stats.totalArea, 0.01,
      'cyclic offset should produce same area');
  });
});
