// ═══════════════════════════════════════════════════════════════
//  Herringbone — Grid Generator, Clipping & Layout Tests
// ═══════════════════════════════════════════════════════════════

const COS45 = Math.SQRT2 / 2; // ≈ 0.7071

// Simple 4x3m room polygon
const HB_ROOM_4x3 = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];

const HB_CONFIG = {
  panelLength: 600,
  panelWidth: 120,
  offsetX: 0,
  offsetY: 0,
  pattern: 'herringbone',
  expansionGap: 10,
  minCutWidth: 30,
  minCutLength: 100,
};

// ─── PolygonClip.clipPolygonByConvex ─────────────────────────

describe('PolygonClip.clipPolygonByConvex', () => {
  it('clips room by axis-aligned rect (same as clipPolygonByRect)', () => {
    const room = [
      { x: 0, y: 0 }, { x: 1000, y: 0 },
      { x: 1000, y: 1000 }, { x: 0, y: 1000 },
    ];
    const clip = [
      { x: 200, y: 200 }, { x: 800, y: 200 },
      { x: 800, y: 800 }, { x: 200, y: 800 },
    ];
    const results = PolygonClip.clipPolygonByConvex(room, clip);
    assert.ok(results.length >= 1, 'should produce at least one polygon');
    const area = PolygonClip.area(results[0]);
    assert.closeTo(area, 600 * 600, 10, 'clipped area should be 360000 mm²');
  });

  it('clips room by rotated rectangle (diamond)', () => {
    const room = [
      { x: 0, y: 0 }, { x: 1000, y: 0 },
      { x: 1000, y: 1000 }, { x: 0, y: 1000 },
    ];
    // Diamond centered at (500,500), "radius" ~200
    const clip = [
      { x: 500, y: 300 }, { x: 700, y: 500 },
      { x: 500, y: 700 }, { x: 300, y: 500 },
    ];
    const results = PolygonClip.clipPolygonByConvex(room, clip);
    assert.ok(results.length >= 1, 'should produce at least one polygon');
    // Diamond area = 2 * 200 * 200 = 80000
    const area = PolygonClip.area(results[0]);
    assert.closeTo(area, 80000, 100, 'diamond area should be ~80000 mm²');
  });

  it('returns empty when clip polygon is outside room', () => {
    const room = [
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    const clip = [
      { x: 500, y: 500 }, { x: 600, y: 500 },
      { x: 600, y: 600 }, { x: 500, y: 600 },
    ];
    const results = PolygonClip.clipPolygonByConvex(room, clip);
    assert.equal(results.length, 0, 'should return empty for non-overlapping');
  });

  it('returns full clip polygon when it is entirely inside room', () => {
    const room = [
      { x: 0, y: 0 }, { x: 2000, y: 0 },
      { x: 2000, y: 2000 }, { x: 0, y: 2000 },
    ];
    const clip = [
      { x: 400, y: 400 }, { x: 600, y: 400 },
      { x: 600, y: 600 }, { x: 400, y: 600 },
    ];
    const results = PolygonClip.clipPolygonByConvex(room, clip);
    assert.ok(results.length >= 1);
    const area = PolygonClip.area(results[0]);
    assert.closeTo(area, 200 * 200, 10, 'area should equal clip polygon area');
  });

  it('handles null/empty subject', () => {
    const clip = [
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    assert.equal(PolygonClip.clipPolygonByConvex(null, clip).length, 0);
    assert.equal(PolygonClip.clipPolygonByConvex([], clip).length, 0);
  });
});

// ─── HerringboneGenerator ────────────────────────────────────

describe('HerringboneGenerator.generate', () => {
  it('generates boards for a given bbox', () => {
    const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    const boards = HerringboneGenerator.generate(bbox, HB_CONFIG);
    assert.ok(boards.length > 0, 'should produce at least one board');
  });

  it('each board has polygon with 4 vertices', () => {
    const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    const boards = HerringboneGenerator.generate(bbox, HB_CONFIG);
    for (const b of boards) {
      assert.equal(b.polygon.length, 4, `board (${b.row},${b.col}) should have 4 vertices`);
    }
  });

  it('boards alternate between +45° and -45°', () => {
    const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    const boards = HerringboneGenerator.generate(bbox, HB_CONFIG);
    const angles = new Set(boards.map(b => b.angle));
    assert.ok(angles.has(45), 'should have +45° boards');
    assert.ok(angles.has(-45), 'should have -45° boards');
  });

  it('each board polygon has correct area (L × W)', () => {
    const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    const boards = HerringboneGenerator.generate(bbox, HB_CONFIG);
    const expectedArea = HB_CONFIG.panelLength * HB_CONFIG.panelWidth; // 72000
    for (const b of boards.slice(0, 5)) {
      const area = PolygonClip.area(b.polygon);
      assert.closeTo(area, expectedArea, 1,
        `board polygon area should be ${expectedArea}, got ${area}`);
    }
  });

  it('each board has a bbox', () => {
    const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    const boards = HerringboneGenerator.generate(bbox, HB_CONFIG);
    for (const b of boards.slice(0, 3)) {
      assert.ok(typeof b.bbox.minX === 'number', 'bbox.minX should exist');
      assert.ok(b.bbox.maxX > b.bbox.minX, 'bbox should have positive width');
      assert.ok(b.bbox.maxY > b.bbox.minY, 'bbox should have positive height');
    }
  });

  it('respects offsetX/offsetY', () => {
    const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    const boards0 = HerringboneGenerator.generate(bbox, { ...HB_CONFIG, offsetX: 0, offsetY: 0 });
    const boards1 = HerringboneGenerator.generate(bbox, { ...HB_CONFIG, offsetX: 50, offsetY: 30 });

    // Centroids should differ
    const cx0 = boards0[0].polygon.reduce((s, p) => s + p.x, 0) / 4;
    const cx1 = boards1[0].polygon.reduce((s, p) => s + p.x, 0) / 4;
    assert.ok(Math.abs(cx0 - cx1) > 1, 'offset should shift board positions');
  });
});

// ─── HerringboneGenerator — struktura klasycznej jodełki ─────
//
// Deska 625×125 (5:1) — typowa proporcja dla jodełki.
// Te testy weryfikują STRUKTURĘ wzoru, nie tylko obecność paneli.

const HB_CONFIG_625 = {
  panelLength: 625,
  panelWidth: 125,
  offsetX: 0,
  offsetY: 0,
};

/** Point-in-convex-quad via consistent cross-product signs */
function hbPointInQuad(pt, quad) {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

for (const HB_DIR of [0, 90]) {
describe(`HerringboneGenerator — struktura klasycznej jodełki (625×125, direction ${HB_DIR}°)`, () => {
  const bbox = { minX: 0, minY: 0, maxX: 4000, maxY: 4000 };
  const HB_CFG = { ...HB_CONFIG_625, direction: HB_DIR };

  it('generuje panele +45° i −45° w stosunku ~1:1', () => {
    const boards = HerringboneGenerator.generate(bbox, HB_CFG);
    const plus = boards.filter(b => b.angle === 45).length;
    const minus = boards.filter(b => b.angle === -45).length;
    const ratio = plus / minus;
    assert.greaterThan(ratio, 0.7,
      `w jodełce paneli +45° i −45° jest tyle samo; stosunek = ${ratio.toFixed(2)} (${plus}/${minus})`);
    assert.lessThan(ratio, 1.4,
      `w jodełce paneli +45° i −45° jest tyle samo; stosunek = ${ratio.toFixed(2)} (${plus}/${minus})`);
  });

  it('za każdym krótkim końcem panelu leży panel o przeciwnym kącie (połączenie V)', () => {
    const boards = HerringboneGenerator.generate(bbox, HB_CFG);

    // Tylko panele z dala od krawędzi bboxa — mają kompletne sąsiedztwo
    const inner = boards.filter(b =>
      b.bbox.minX > 800 && b.bbox.maxX < 3200 &&
      b.bbox.minY > 800 && b.bbox.maxY < 3200);
    assert.greaterThan(inner.length, 4, 'potrzeba paneli wewnątrz obszaru testowego');

    for (const b of inner) {
      const cx = b.polygon.reduce((s, p) => s + p.x, 0) / 4;
      const cy = b.polygon.reduce((s, p) => s + p.y, 0) / 4;
      // Kierunek długiej osi: +45° → (1,1)/√2, −45° → (1,−1)/√2
      const dir = b.angle === 45
        ? { x: COS45, y: COS45 }
        : { x: COS45, y: -COS45 };
      const dist = HB_CONFIG_625.panelLength / 2 + 3; // 3mm za końcem deski

      for (const s of [1, -1]) {
        const pt = { x: cx + s * dist * dir.x, y: cy + s * dist * dir.y };
        const host = boards.find(o => o !== b && hbPointInQuad(pt, o.polygon));
        assert.ok(host,
          `panel (row=${b.row}, col=${b.col}, ${b.angle}°): brak panelu za końcem ${s > 0 ? '+' : '−'}`);
        assert.equal(host.angle, -b.angle,
          `panel (row=${b.row}, col=${b.col}, ${b.angle}°): za końcem powinien leżeć panel ${-b.angle}°, jest ${host.angle}°`);
      }
    }
  });

  it('panele nie nachodzą na siebie', () => {
    const small = { minX: 0, minY: 0, maxX: 1500, maxY: 1500 };
    const boards = HerringboneGenerator.generate(small, HB_CFG);

    for (let i = 0; i < boards.length; i++) {
      for (let j = i + 1; j < boards.length; j++) {
        const a = boards[i], b = boards[j];
        if (a.bbox.maxX <= b.bbox.minX || a.bbox.minX >= b.bbox.maxX ||
            a.bbox.maxY <= b.bbox.minY || a.bbox.minY >= b.bbox.maxY) continue;

        const parts = PolygonClip.clipPolygonByConvex(a.polygon, b.polygon);
        let overlap = 0;
        for (const p of parts) overlap += PolygonClip.area(p);
        assert.lessThan(overlap, 1,
          `panele (${a.row},${a.col},${a.angle}°) i (${b.row},${b.col},${b.angle}°) nachodzą na siebie: ${overlap.toFixed(1)} mm²`);
      }
    }
  });

  it('panele szczelnie pokrywają obszar (bez dziur)', () => {
    const boards = HerringboneGenerator.generate(bbox, HB_CFG);
    const rect = [
      { x: 1000, y: 1000 }, { x: 2000, y: 1000 },
      { x: 2000, y: 2000 }, { x: 1000, y: 2000 },
    ];

    let covered = 0;
    for (const b of boards) {
      const parts = PolygonClip.clipPolygonByConvex(rect, b.polygon);
      for (const p of parts) covered += PolygonClip.area(p);
    }
    // 1000×1000 kontrolny kwadrat = 1 000 000 mm²
    assert.closeTo(covered, 1e6, 200,
      `suma pól przyciętych paneli powinna równać się polu kwadratu, jest ${covered.toFixed(0)}`);
  });
});
}

// ─── HerringboneGenerator — orientacja wzoru (direction) ─────

describe('HerringboneGenerator — orientacja wzoru (direction)', () => {
  const bbox = { minX: 0, minY: 0, maxX: 4000, maxY: 4000 };
  // Okres kraty jodełki wzdłuż osi rzędów = W√2
  const PERIOD = HB_CONFIG_625.panelWidth * Math.SQRT2;

  const center = (b) => ({
    x: b.polygon.reduce((s, p) => s + p.x, 0) / 4,
    y: b.polygon.reduce((s, p) => s + p.y, 0) / 4,
  });

  const hasSameAngleAt = (boards, b, dx, dy) => {
    const c0 = center(b);
    return boards.some(o => {
      if (o === b || o.angle !== b.angle) return false;
      const c1 = center(o);
      return Math.abs(c1.x - (c0.x + dx)) < 0.5 && Math.abs(c1.y - (c0.y + dy)) < 0.5;
    });
  };

  const innerOf = (boards) => boards.filter(b =>
    b.bbox.minX > 1000 && b.bbox.maxX < 3000 &&
    b.bbox.minY > 1000 && b.bbox.maxY < 3000);

  it('direction 0: rzędy jodełki biegną wzdłuż osi X — okres (W√2, 0)', () => {
    const boards = HerringboneGenerator.generate(bbox, { ...HB_CONFIG_625, direction: 0 });
    const inner = innerOf(boards);
    assert.greaterThan(inner.length, 4, 'potrzeba paneli wewnętrznych');
    for (const b of inner.slice(0, 10)) {
      assert.ok(hasSameAngleAt(boards, b, PERIOD, 0),
        `panel (${b.row},${b.col}): brak sąsiada o tym samym kącie w odległości (W√2, 0)`);
    }
  });

  it('direction 90: rzędy jodełki biegną wzdłuż osi Y — okres (0, W√2)', () => {
    const boards = HerringboneGenerator.generate(bbox, { ...HB_CONFIG_625, direction: 90 });
    const inner = innerOf(boards);
    assert.greaterThan(inner.length, 4, 'potrzeba paneli wewnętrznych');
    for (const b of inner.slice(0, 10)) {
      assert.ok(hasSameAngleAt(boards, b, 0, PERIOD),
        `panel (${b.row},${b.col}): brak sąsiada o tym samym kącie w odległości (0, W√2)`);
      assert.notOk(hasSameAngleAt(boards, b, PERIOD, 0),
        `panel (${b.row},${b.col}): przy direction 90 wzór nie może mieć okresu (W√2, 0)`);
    }
  });

  it('brak direction w configu = direction 0 (kompatybilność wsteczna)', () => {
    const a = HerringboneGenerator.generate(bbox, HB_CONFIG_625);
    const b = HerringboneGenerator.generate(bbox, { ...HB_CONFIG_625, direction: 0 });
    assert.deepEqual(a, b, 'brak direction powinien działać jak direction 0');
  });

  it('180° ≡ 0° oraz 270° ≡ 90° (symetria punktowa jodełki)', () => {
    // Jodełka jest niezmiennicza na obrót o 180° (grupa tapetowa pgg),
    // więc generator normalizuje kierunek modulo 180.
    const d0 = HerringboneGenerator.generate(bbox, { ...HB_CONFIG_625, direction: 0 });
    const d180 = HerringboneGenerator.generate(bbox, { ...HB_CONFIG_625, direction: 180 });
    assert.deepEqual(d180, d0, '180° powinno dawać identyczny układ jak 0°');

    const d90 = HerringboneGenerator.generate(bbox, { ...HB_CONFIG_625, direction: 90 });
    const d270 = HerringboneGenerator.generate(bbox, { ...HB_CONFIG_625, direction: 270 });
    assert.deepEqual(d270, d90, '270° powinno dawać identyczny układ jak 90°');
  });
});

// ─── LayoutEngine — herringbone layout ───────────────────────

describe('LayoutEngine — herringbone layout', () => {
  it('generates panels for a rectangular room', () => {
    // Inset the room first (simulate what optimizer does)
    const insetPoly = Geometry.insetRectilinear(HB_ROOM_4x3, HB_CONFIG.expansionGap);
    const layout = LayoutEngine.generateLayout(insetPoly, HB_CONFIG);

    assert.ok(layout.panels.length > 0, 'should produce panels');
    assert.ok(layout.stats.totalPanels > 0, 'stats should count panels');
  });

  it('full (uncut) panels have area close to L × W', () => {
    const insetPoly = Geometry.insetRectilinear(HB_ROOM_4x3, HB_CONFIG.expansionGap);
    const layout = LayoutEngine.generateLayout(insetPoly, HB_CONFIG);

    const fullPanels = layout.panels.filter(p => p.isFullBoard);
    const expectedArea = HB_CONFIG.panelLength * HB_CONFIG.panelWidth;

    // In a large room, there should be at least some full panels
    assert.ok(fullPanels.length > 0, 'should have at least one full panel');
    for (const p of fullPanels.slice(0, 3)) {
      assert.closeTo(p.area, expectedArea, 5,
        `full panel area should be ~${expectedArea}, got ${p.area}`);
    }
  });

  it('cut panels at walls have isCut = true', () => {
    const insetPoly = Geometry.insetRectilinear(HB_ROOM_4x3, HB_CONFIG.expansionGap);
    const layout = LayoutEngine.generateLayout(insetPoly, HB_CONFIG);

    const cutPanels = layout.panels.filter(p => p.isCut);
    assert.ok(cutPanels.length > 0, 'should have cut panels at walls');

    for (const p of cutPanels.slice(0, 3)) {
      assert.ok(p.area < HB_CONFIG.panelLength * HB_CONFIG.panelWidth,
        'cut panel area should be less than full panel');
    }
  });

  it('panels have angle property', () => {
    const insetPoly = Geometry.insetRectilinear(HB_ROOM_4x3, HB_CONFIG.expansionGap);
    const layout = LayoutEngine.generateLayout(insetPoly, HB_CONFIG);

    for (const p of layout.panels.slice(0, 5)) {
      assert.ok(p.angle === 45 || p.angle === -45,
        `panel angle should be ±45, got ${p.angle}`);
    }
  });

  it('total covered area is close to room area', () => {
    const insetPoly = Geometry.insetRectilinear(HB_ROOM_4x3, HB_CONFIG.expansionGap);
    const layout = LayoutEngine.generateLayout(insetPoly, HB_CONFIG);

    // Room is ~4000x3000 = 12 m², inset reduces slightly
    const roomArea = PolygonClip.area(insetPoly) / 1e6; // m²
    assert.closeTo(layout.stats.totalArea, roomArea, 0.5,
      'total panel area should approximate room area');
  });
});
