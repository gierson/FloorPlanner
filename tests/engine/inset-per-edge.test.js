// ═══════════════════════════════════════════════════════════════
//  insetRectilinear — per-edge inset distances (door openings)
// ═══════════════════════════════════════════════════════════════

describe('Geometry.insetRectilinear — per-edge inset', () => {
  it('simple rectangle with uniform inset', () => {
    const rect = [
      { x: 0, y: 0 }, { x: 1000, y: 0 },
      { x: 1000, y: 1000 }, { x: 0, y: 1000 },
    ];
    const result = Geometry.insetRectilinear(rect, 10);
    const area = Geometry.polygonArea(result);
    assert.closeTo(area, 980 * 980, 10);
  });

  it('per-edge inset: door edges (inset=0) keep their X position, wall edges inset normally', () => {
    // Merged floor zone with door passage
    const polygon = [
      { x: 75, y: 75 },      // v0
      { x: 3925, y: 75 },    // v1
      { x: 3925, y: 1925 },  // v2
      { x: 2400, y: 1925 },  // v3
      { x: 2400, y: 2075 },  // v4  (door edge v3→v4, vertical, wallId=null)
      { x: 3925, y: 2075 },  // v5
      { x: 3925, y: 3925 },  // v6
      { x: 75, y: 3925 },    // v7
      { x: 75, y: 2075 },    // v8
      { x: 1600, y: 2075 },  // v9
      { x: 1600, y: 1925 },  // v10 (door edge v9→v10, vertical, wallId=null)
      { x: 75, y: 1925 },    // v11
    ];

    // wallIds: edges 3 and 9 are door openings (null)
    const wallIds = [1, 2, 3, null, 5, 6, 7, 8, 9, null, 11, 12];
    const edgeInsets = wallIds.map(wid => wid !== null ? 10 : 0);

    const result = Geometry.insetRectilinear(polygon, 10, edgeInsets);

    // Door edges are VERTICAL (x=1600 and x=2400) with inset=0
    // After inset, those X coordinates should be UNCHANGED
    const doorLeftVerts = result.filter(v => Math.abs(v.x - 1600) < 5);
    const doorRightVerts = result.filter(v => Math.abs(v.x - 2400) < 5);

    assert.ok(doorLeftVerts.length >= 2,
      'Should have vertices at x≈1600 (door left edge)');
    assert.ok(doorRightVerts.length >= 2,
      'Should have vertices at x≈2400 (door right edge)');

    // Door left edge should stay at x=1600 (no inset because wallId=null)
    for (const v of doorLeftVerts) {
      assert.closeTo(v.x, 1600, 2, 'Door left edge should stay at x=1600');
    }
    // Door right edge should stay at x=2400
    for (const v of doorRightVerts) {
      assert.closeTo(v.x, 2400, 2, 'Door right edge should stay at x=2400');
    }

    // Outer walls should be properly insetted
    const topVerts = result.filter(v => v.y < 100);
    for (const v of topVerts) {
      assert.closeTo(v.y, 85, 2, 'Top wall should inset to y=85');
    }

    const leftVerts = result.filter(v => v.x < 100 && v.y > 100 && v.y < 1900);
    for (const v of leftVerts) {
      assert.closeTo(v.x, 85, 2, 'Left wall should inset to x=85');
    }
  });

  it('without edgeInsets, all edges get uniform inset (backward compatible)', () => {
    const rect = [
      { x: 0, y: 0 }, { x: 1000, y: 0 },
      { x: 1000, y: 500 }, { x: 0, y: 500 },
    ];
    // Without edgeInsets parameter
    const result = Geometry.insetRectilinear(rect, 20);
    const area = Geometry.polygonArea(result);
    assert.closeTo(area, 960 * 460, 10);
  });

  it('no spike artifacts: collinear edges with different insets produce step, not spike', () => {
    // Merged polygon with door — edges around the door passage are collinear
    // but have different inset values (wall=10, door=0)
    const polygon = [
      { x: 75, y: 75 },
      { x: 3925, y: 75 },
      { x: 3925, y: 1925 },
      { x: 2400, y: 1925 },
      { x: 2400, y: 2075 },
      { x: 3925, y: 2075 },
      { x: 3925, y: 3925 },
      { x: 75, y: 3925 },
      { x: 75, y: 2075 },
      { x: 1600, y: 2075 },
      { x: 1600, y: 1925 },
      { x: 75, y: 1925 },
    ];
    const wallIds = [1, 2, 3, null, 5, 6, 7, 8, 9, null, 11, 12];
    const edgeInsets = wallIds.map(wid => wid !== null ? 10 : 0);

    const result = Geometry.insetRectilinear(polygon, 10, edgeInsets);

    // All result vertices must be INSIDE the original bounding box (no spikes)
    const bbox = Geometry.boundingBox(polygon);
    for (let i = 0; i < result.length; i++) {
      const v = result[i];
      assert.ok(v.x >= bbox.minX - 1 && v.x <= bbox.maxX + 1,
        'Vertex ' + i + ' x=' + v.x + ' outside bbox [' + bbox.minX + ',' + bbox.maxX + ']');
      assert.ok(v.y >= bbox.minY - 1 && v.y <= bbox.maxY + 1,
        'Vertex ' + i + ' y=' + v.y + ' outside bbox [' + bbox.minY + ',' + bbox.maxY + ']');
    }

    // All edges must be axis-aligned (no diagonals from bad intersections)
    for (let i = 0; i < result.length; i++) {
      const curr = result[i];
      const next = result[(i + 1) % result.length];
      const dx = Math.abs(next.x - curr.x);
      const dy = Math.abs(next.y - curr.y);
      assert.ok(dx <= 1 || dy <= 1,
        'Edge ' + i + ' is diagonal: (' + curr.x + ',' + curr.y + ')→(' + next.x + ',' + next.y + ')');
    }
  });
});
