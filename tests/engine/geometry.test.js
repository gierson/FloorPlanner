// ═══════════════════════════════════════════════════════════════
//  Geometry — Unit Tests
// ═══════════════════════════════════════════════════════════════

describe('Geometry.distance', () => {
  it('calculates distance between two points', () => {
    assert.closeTo(Geometry.distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, 0.001);
  });

  it('returns 0 for same point', () => {
    assert.equal(Geometry.distance({ x: 100, y: 200 }, { x: 100, y: 200 }), 0);
  });

  it('works with negative coordinates', () => {
    assert.closeTo(Geometry.distance({ x: -10, y: -20 }, { x: 10, y: 20 }), 
      Math.sqrt(400 + 1600), 0.001);
  });
});

describe('Geometry.distanceToSegment', () => {
  it('returns perpendicular distance when projection is on segment', () => {
    // Point above middle of horizontal segment
    assert.closeTo(
      Geometry.distanceToSegment({ x: 500, y: 0 }, { x: 0, y: 100 }, { x: 1000, y: 100 }),
      100, 0.001
    );
  });

  it('returns distance to nearest endpoint when projection is outside', () => {
    // Point far to the left of segment
    assert.closeTo(
      Geometry.distanceToSegment({ x: -100, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 }),
      100, 0.001
    );
  });

  it('handles zero-length segment (degenerate)', () => {
    assert.closeTo(
      Geometry.distanceToSegment({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }),
      100, 0.001
    );
  });
});

describe('Geometry.midpoint', () => {
  it('calculates midpoint correctly', () => {
    const mid = Geometry.midpoint({ x: 0, y: 0 }, { x: 100, y: 200 });
    assert.equal(mid.x, 50);
    assert.equal(mid.y, 100);
  });
});

describe('Geometry.polygonArea', () => {
  it('calculates area of a 1000x2000mm rectangle', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 2000 },
      { x: 0, y: 2000 },
    ];
    assert.closeTo(Geometry.polygonArea(rect), 2_000_000, 0.1);
  });

  it('calculates area of a triangle', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
    ];
    assert.closeTo(Geometry.polygonArea(tri), 500_000, 0.1);
  });

  it('returns 0 for fewer than 3 vertices', () => {
    assert.equal(Geometry.polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }]), 0);
  });

  it('returns same area regardless of winding order', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    const ccw = [...cw].reverse();
    assert.closeTo(Geometry.polygonArea(cw), Geometry.polygonArea(ccw), 0.001);
  });
});

describe('Geometry.polygonSignedArea', () => {
  it('returns negative for CCW in screen coords (Y-down)', () => {
    // CCW in screen coords: top-left → bottom-left → bottom-right → top-right
    const ccw = [
      { x: 0, y: 0 },
      { x: 0, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 0 },
    ];
    assert.lessThan(Geometry.polygonSignedArea(ccw), 0);
  });

  it('returns positive for CW in screen coords', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    assert.greaterThan(Geometry.polygonSignedArea(cw), 0);
  });
});

describe('Geometry.isPointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ];

  it('returns true for point inside polygon', () => {
    assert.ok(Geometry.isPointInPolygon({ x: 500, y: 500 }, square));
  });

  it('returns false for point outside polygon', () => {
    assert.notOk(Geometry.isPointInPolygon({ x: 1500, y: 500 }, square));
  });

  it('returns false for point far outside', () => {
    assert.notOk(Geometry.isPointInPolygon({ x: -100, y: -100 }, square));
  });
});

describe('Geometry.isRectilinear', () => {
  it('returns true for axis-aligned rectangle', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 2000 },
      { x: 0, y: 2000 },
    ];
    assert.ok(Geometry.isRectilinear(rect));
  });

  it('returns true for L-shaped polygon', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 2000 },
      { x: 0, y: 2000 },
    ];
    assert.ok(Geometry.isRectilinear(lShape));
  });

  it('returns false for triangle', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 500, y: 1000 },
    ];
    assert.notOk(Geometry.isRectilinear(tri));
  });

  it('returns false for diagonal polygon', () => {
    const diag = [
      { x: 0, y: 0 },
      { x: 1000, y: 500 },
      { x: 1000, y: 1500 },
      { x: 0, y: 1000 },
    ];
    assert.notOk(Geometry.isRectilinear(diag));
  });
});

describe('Geometry.insetRectilinear', () => {
  it('insets a rectangle by 10mm on all sides', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 2000 },
      { x: 0, y: 2000 },
    ];
    const inset = Geometry.insetRectilinear(rect, 10);
    
    assert.arrayLength(inset, 4);
    // Check that each vertex moved inward by 10mm
    const bbox = Geometry.boundingBox(inset);
    assert.closeTo(bbox.minX, 10, 1);
    assert.closeTo(bbox.minY, 10, 1);
    assert.closeTo(bbox.maxX, 990, 1);
    assert.closeTo(bbox.maxY, 1990, 1);
  });

  it('returns original vertices for fewer than 4 points', () => {
    const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
    const result = Geometry.insetRectilinear(tri, 10);
    assert.arrayLength(result, 3);
  });
});

describe('Geometry.boundingBox', () => {
  it('returns correct bounding box', () => {
    const poly = [
      { x: 100, y: 200 },
      { x: 500, y: 50 },
      { x: 300, y: 800 },
    ];
    const bb = Geometry.boundingBox(poly);
    assert.equal(bb.minX, 100);
    assert.equal(bb.minY, 50);
    assert.equal(bb.maxX, 500);
    assert.equal(bb.maxY, 800);
  });
});

describe('Geometry.snapToGrid', () => {
  it('snaps to nearest grid point', () => {
    assert.equal(Geometry.snapToGrid(123, 50), 100);
    assert.equal(Geometry.snapToGrid(126, 50), 150);
    assert.equal(Geometry.snapToGrid(100, 100), 100);
  });
});

describe('Geometry.snapPointToGrid', () => {
  it('snaps both coordinates', () => {
    const snapped = Geometry.snapPointToGrid({ x: 123, y: 267 }, 50);
    assert.equal(snapped.x, 100);
    assert.equal(snapped.y, 250);
  });
});

describe('Geometry.formatDimension', () => {
  it('formats as mm by default', () => {
    assert.equal(Geometry.formatDimension(1500), '1500 mm');
  });

  it('formats as cm when requested', () => {
    assert.equal(Geometry.formatDimension(1500, true), '150 cm');
  });

  it('formats fractional cm', () => {
    assert.equal(Geometry.formatDimension(155, true), '15.5 cm');
  });
});

describe('Geometry.ensureCCW', () => {
  it('reverses CW polygon to CCW (in screen coords Y-down)', () => {
    // CW in screen coords has positive signed area
    const cw = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    assert.greaterThan(Geometry.polygonSignedArea(cw), 0); // confirm CW
    
    const ccw = Geometry.ensureCCW(cw);
    assert.lessThan(Geometry.polygonSignedArea(ccw), 0); // now CCW
  });

  it('does not modify already CCW polygon', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 0, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 0 },
    ];
    assert.lessThan(Geometry.polygonSignedArea(ccw), 0); // confirm CCW
    
    const result = Geometry.ensureCCW(ccw);
    assert.lessThan(Geometry.polygonSignedArea(result), 0); // still CCW
  });
});
