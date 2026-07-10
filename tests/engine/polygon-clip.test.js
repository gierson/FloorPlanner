// ═══════════════════════════════════════════════════════════════
//  PolygonClip — Unit Tests
// ═══════════════════════════════════════════════════════════════

describe('PolygonClip.clipPolygonByRect — basic cases', () => {
  
  // Helper: create a rectangle polygon
  const rect = (x, y, w, h) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];

  it('clips a polygon fully inside the clip rect → returns same polygon', () => {
    const subject = rect(100, 100, 200, 200);
    const clipRect = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
    const result = PolygonClip.clipPolygonByRect(subject, clipRect);
    
    assert.equal(result.length, 1);
    // Area should be preserved (200*200 = 40000)
    assert.closeTo(PolygonClip.area(result[0]), 40000, 1);
  });

  it('clips a polygon fully outside → returns empty', () => {
    const subject = rect(600, 600, 200, 200);
    const clipRect = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
    const result = PolygonClip.clipPolygonByRect(subject, clipRect);
    
    assert.equal(result.length, 0);
  });

  it('clips a polygon partially overlapping → correct area', () => {
    // Subject: 0,0 → 200,200
    // Clip: 100,100 → 300,300
    // Overlap: 100,100 → 200,200 = 100*100 = 10000
    const subject = rect(0, 0, 200, 200);
    const clipRect = { minX: 100, minY: 100, maxX: 300, maxY: 300 };
    const result = PolygonClip.clipPolygonByRect(subject, clipRect);
    
    assert.equal(result.length, 1);
    assert.closeTo(PolygonClip.area(result[0]), 10000, 1);
  });

  it('clip rect fully contains subject → original area', () => {
    const subject = rect(100, 100, 50, 50);
    const clipRect = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    const result = PolygonClip.clipPolygonByRect(subject, clipRect);
    
    assert.equal(result.length, 1);
    assert.closeTo(PolygonClip.area(result[0]), 2500, 1);
  });

  it('returns empty for null/empty subject', () => {
    assert.equal(PolygonClip.clipPolygonByRect(null, { minX: 0, minY: 0, maxX: 100, maxY: 100 }).length, 0);
    assert.equal(PolygonClip.clipPolygonByRect([], { minX: 0, minY: 0, maxX: 100, maxY: 100 }).length, 0);
  });
});

describe('PolygonClip.clipPolygonByRect — half-overlap', () => {
  it('clips left half of a rectangle', () => {
    // Subject: 0→1000, 0→500
    // Clip: 0→500 (X), 0→500 (Y)
    // Should get left half: 500*500 = 250000
    const subject = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 500 },
      { x: 0, y: 500 },
    ];
    const clipRect = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
    const result = PolygonClip.clipPolygonByRect(subject, clipRect);
    
    assert.equal(result.length, 1);
    assert.closeTo(PolygonClip.area(result[0]), 250000, 1);
  });
});

describe('PolygonClip — polygon properties', () => {
  it('signedArea returns correct value', () => {
    // CW in screen coords (positive)
    const cw = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    assert.closeTo(PolygonClip.signedArea(cw), 10000, 0.1);
  });

  it('area returns absolute value', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ];
    assert.closeTo(PolygonClip.area(poly), 10000, 0.1);
  });

  it('isConvex returns true for rectangle', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    assert.ok(PolygonClip.isConvex(rect));
  });

  it('isConvex returns false for L-shape', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ];
    assert.notOk(PolygonClip.isConvex(lShape));
  });

  it('isAxisAlignedRect returns true for axis-aligned rectangle', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ];
    assert.ok(PolygonClip.isAxisAlignedRect(rect));
  });

  it('isAxisAlignedRect returns false for rotated rectangle', () => {
    const rotated = [
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ];
    assert.notOk(PolygonClip.isAxisAlignedRect(rotated));
  });
});

describe('PolygonClip.rectToPolygon', () => {
  it('creates a 4-vertex polygon from bounds', () => {
    const poly = PolygonClip.rectToPolygon(10, 20, 110, 220);
    assert.arrayLength(poly, 4);
    assert.deepEqual(poly[0], { x: 10, y: 20 });
    assert.deepEqual(poly[1], { x: 110, y: 20 });
    assert.deepEqual(poly[2], { x: 110, y: 220 });
    assert.deepEqual(poly[3], { x: 10, y: 220 });
  });
});

describe('PolygonClip.centroid', () => {
  it('returns center of rectangle', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ];
    const c = PolygonClip.centroid(rect);
    assert.closeTo(c.x, 100, 1);
    assert.closeTo(c.y, 50, 1);
  });
});

describe('PolygonClip.bounds', () => {
  it('returns correct bounding box', () => {
    const poly = [
      { x: 50, y: 100 },
      { x: 300, y: 200 },
      { x: 150, y: 400 },
    ];
    const b = PolygonClip.bounds(poly);
    assert.equal(b.minX, 50);
    assert.equal(b.minY, 100);
    assert.equal(b.maxX, 300);
    assert.equal(b.maxY, 400);
    assert.equal(b.width, 250);
    assert.equal(b.height, 300);
  });
});

// ─── Regression: non-convex subject split via collinear vertices ──────

describe('PolygonClip.clipPolygonByRect — non-convex subject split', () => {
  it('splits a dumbbell-shaped polygon into two pieces when board crosses the neck', () => {
    // This polygon represents a merged floor zone of two rooms connected by a door.
    // The "neck" is the door opening — edges go back and forth on the same line.
    // When a board rectangle spans across the neck, the clipped result should be
    // two separate polygons (one per room), not one polygon with strange diagonals.
    const subject = [
      { x: 1085, y: 2915 },
      { x: 2915, y: 2915 },
      { x: 2915, y: 1610 },
      { x: 3085, y: 1610 },
      { x: 3085, y: 2915 },
      { x: 4915, y: 2915 },
      { x: 4915, y: 1085 },
      { x: 3085, y: 1085 },
      { x: 3085, y: 1228 },
      { x: 2915, y: 1228 },
      { x: 2915, y: 1085 },
      { x: 1085, y: 1085 },
    ];
    const clipRect = { minX: 1845, minY: 1085, maxX: 3225, maxY: 1228 };
    const result = PolygonClip.clipPolygonByRect(subject, clipRect);

    assert.equal(result.length, 2, 'should split into 2 separate polygons');

    // Find each piece by which side of x=3000 they're on
    const p1 = result.find(p => p.some(v => Math.abs(v.x - 1845) < 2));
    const p2 = result.find(p => p.some(v => Math.abs(v.x - 3225) < 2));

    assert.ok(p1, 'First piece (left room) should exist');
    assert.ok(p2, 'Second piece (right room) should exist');

    // Check areas match expected
    assert.closeTo(PolygonClip.area(p1), (2915 - 1845) * (1228 - 1085), 5);
    assert.closeTo(PolygonClip.area(p2), (3225 - 3085) * (1228 - 1085), 5);
  });

  it('all result polygon edges are axis-aligned (no diagonals)', () => {
    const subject = [
      { x: 1085, y: 2915 },
      { x: 2915, y: 2915 },
      { x: 2915, y: 1610 },
      { x: 3085, y: 1610 },
      { x: 3085, y: 2915 },
      { x: 4915, y: 2915 },
      { x: 4915, y: 1085 },
      { x: 3085, y: 1085 },
      { x: 3085, y: 1228 },
      { x: 2915, y: 1228 },
      { x: 2915, y: 1085 },
      { x: 1085, y: 1085 },
    ];
    const clipRect = { minX: 1845, minY: 1085, maxX: 3225, maxY: 1228 };
    const result = PolygonClip.clipPolygonByRect(subject, clipRect);

    for (let pi = 0; pi < result.length; pi++) {
      const poly = result[pi];
      for (let i = 0; i < poly.length; i++) {
        const curr = poly[i];
        const next = poly[(i + 1) % poly.length];
        const dx = Math.abs(next.x - curr.x);
        const dy = Math.abs(next.y - curr.y);
        assert.ok(dx <= 1 || dy <= 1,
          `Polygon ${pi}, edge ${i} is diagonal: (${curr.x},${curr.y}) → (${next.x},${next.y})`
        );
      }
    }
  });
});
