// ═══════════════════════════════════════════════════════════════
//  WasteCalculator — realne zapotrzebowanie desek (pióro-wpust)
//
//  Proste panele: deska przecięta raz daje dwa kawałki z fabrycznym
//  zamkiem na przeciwnych końcach — docinek z końca rzędu nadaje się
//  tylko na start rzędu przy PRZECIWLEGŁEJ ścianie (cięty koniec nie
//  ma zamka). Jodełka: deski A (+45°) i B (−45°) to osobne produkty;
//  wariant konserwatywny — ścinki ukośne są odpadem.
// ═══════════════════════════════════════════════════════════════

const WC_L = 1380;
const WC_W = 193;
const WC_BOARD_AREA = WC_L * WC_W;

const WC_CFG = {
  panelLength: WC_L,
  panelWidth: WC_W,
  pattern: 'straight',
  direction: 0,
};

// Board cell rect in a straight grid at offset (0,0)
function wcBoardRect(row, col) {
  return {
    minX: col * WC_L, minY: row * WC_W,
    maxX: (col + 1) * WC_L, maxY: (row + 1) * WC_W,
  };
}

// Synthetic clipped piece: trim given mm from each side of its board
function wcPiece(row, col, trim = {}) {
  const b = wcBoardRect(row, col);
  const minX = b.minX + (trim.left || 0);
  const maxX = b.maxX - (trim.right || 0);
  const minY = b.minY + (trim.top || 0);
  const maxY = b.maxY - (trim.bottom || 0);
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    row, col,
    sourceBoard: b,
    bounds: { minX, minY, maxX, maxY, width, height },
    area: width * height,
    isFullBoard: Math.abs(width - WC_L) < 0.5 && Math.abs(height - WC_W) < 0.5,
    isCutX: width < WC_L - 0.5,
    isCutY: height < WC_W - 0.5,
    isCut: width < WC_L - 0.5 || height < WC_W - 0.5,
    isRect: true,
  };
}

describe('WasteCalculator — proste panele (pióro-wpust)', () => {

  it('pełne deski: jedna deska na panel, zero odpadu', () => {
    const result = WasteCalculator.compute([wcPiece(0, 0), wcPiece(1, 0)], WC_CFG);
    assert.equal(result.panelsNeeded, 2);
    assert.closeTo(result.wasteArea, 0, 1);
    assert.equal(result.reusedPairs, 0);
  });

  it('docinki z tej samej strony pokoju nie parują się (brak zamka na ciętym końcu)', () => {
    // Dwa rzędy, każdy kończy się docinkiem 620 mm przy prawej ścianie
    // (oba kawałki zachowują ten sam fabryczny koniec deski)
    const panels = [
      wcPiece(0, 0), wcPiece(0, 1, { right: 760 }),
      wcPiece(1, 0), wcPiece(1, 1, { right: 760 }),
    ];
    const result = WasteCalculator.compute(panels, WC_CFG);
    assert.equal(result.panelsNeeded, 4);
    assert.equal(result.reusedPairs, 0);
    const net = panels.reduce((s, p) => s + p.area, 0);
    assert.closeTo(result.wasteArea, 4 * WC_BOARD_AREA - net, 1);
  });

  it('komplementarne docinki (przeciwległe ściany) dzielą jedną deskę', () => {
    // 620 mm przy prawej ścianie (fabryczny lewy koniec) + 690 mm przy
    // lewej ścianie (fabryczny prawy koniec): 620+690 ≤ 1380 → 1 deska
    const panels = [
      wcPiece(0, 0),                     // pełna
      wcPiece(0, 1, { right: 760 }),     // 620, koniec rzędu
      wcPiece(1, 0, { left: 690 }),      // 690, start rzędu
      wcPiece(1, 1, { right: 70 }),      // 1310, koniec rzędu (bez pary)
    ];
    const result = WasteCalculator.compute(panels, WC_CFG);
    assert.equal(result.reusedPairs, 1);
    assert.equal(result.panelsNeeded, 3);
    const net = (1380 + 620 + 690 + 1310) * WC_W;
    assert.closeTo(result.wasteArea, 3 * WC_BOARD_AREA - net, 1);
  });

  it('brak parowania, gdy suma długości nie mieści się w jednej desce', () => {
    const panels = [
      wcPiece(0, 0, { right: 580 }),   // 800, fabryczny lewy koniec
      wcPiece(1, 0, { left: 680 }),    // 700, fabryczny prawy koniec
    ];
    const result = WasteCalculator.compute(panels, WC_CFG);
    assert.equal(result.reusedPairs, 0);
    assert.equal(result.panelsNeeded, 2);
  });

  it('docinek ucięty z obu końców wymaga własnej deski i nie paruje się', () => {
    const panels = [
      wcPiece(0, 0, { left: 100, right: 200 }),  // brak zamka na obu końcach
      wcPiece(1, 0, { left: 900 }),              // 480, fabryczny prawy koniec
    ];
    const result = WasteCalculator.compute(panels, WC_CFG);
    assert.equal(result.reusedPairs, 0);
    assert.equal(result.panelsNeeded, 2);
  });

  it('docinek przycięty wzdłuż (rip) nie jest reużywany', () => {
    const panels = [
      wcPiece(0, 0, { bottom: 93 }),   // zwężony do 100 mm — bez zamka wzdłuż
      wcPiece(1, 0, { left: 690 }),    // komplementarny kandydat długości
    ];
    const result = WasteCalculator.compute(panels, WC_CFG);
    assert.equal(result.reusedPairs, 0);
    assert.equal(result.panelsNeeded, 2);
  });

  it('kawałki wycięte z tej samej deski (np. przez otwór drzwiowy) liczą się raz', () => {
    const panels = [
      wcPiece(0, 0, { right: 980 }),   // 0..400
      wcPiece(0, 0, { left: 900 }),    // 900..1380
    ];
    const result = WasteCalculator.compute(panels, WC_CFG);
    assert.equal(result.panelsNeeded, 1);
    assert.closeTo(result.wasteArea, WC_BOARD_AREA - (400 + 480) * WC_W, 1);
  });

  it('direction 90: parowanie działa wzdłuż osi Y', () => {
    const cfg = { ...WC_CFG, direction: 90 };
    // Deski pionowe: długość wzdłuż Y, szerokość wzdłuż X
    const b0 = { minX: 0, maxX: WC_W, minY: 0, maxY: WC_L };
    const b1 = { minX: 0, maxX: WC_W, minY: -WC_L, maxY: 0 };
    const panels = [
      { // 620 mm, zachowuje fabryczny koniec minY
        row: 0, col: 0, sourceBoard: b0,
        bounds: { minX: 0, minY: 0, maxX: WC_W, maxY: 620, width: WC_W, height: 620 },
        area: WC_W * 620,
        isFullBoard: false, isCutX: true, isCutY: false, isCut: true, isRect: true,
      },
      { // 690 mm, zachowuje fabryczny koniec maxY
        row: 0, col: -1, sourceBoard: b1,
        bounds: { minX: 0, minY: -690, maxX: WC_W, maxY: 0, width: WC_W, height: 690 },
        area: WC_W * 690,
        isFullBoard: false, isCutX: true, isCutY: false, isCut: true, isRect: true,
      },
    ];
    const result = WasteCalculator.compute(panels, cfg);
    assert.equal(result.reusedPairs, 1);
    assert.equal(result.panelsNeeded, 1);
  });

  it('proste panele nie raportują desek A/B', () => {
    const result = WasteCalculator.compute([wcPiece(0, 0)], WC_CFG);
    assert.equal(result.panelsNeededA, null);
    assert.equal(result.panelsNeededB, null);
  });

  it('pusta lista paneli → zera', () => {
    const result = WasteCalculator.compute([], WC_CFG);
    assert.equal(result.panelsNeeded, 0);
    assert.equal(result.wasteArea, 0);
  });
});

describe('WasteCalculator — jodełka (wariant konserwatywny)', () => {

  const HB_CFG = { ...WC_CFG, pattern: 'herringbone' };

  function hbPiece(row, col, angle, area) {
    return { row, col, angle, area, isFullBoard: Math.abs(area - WC_BOARD_AREA) < 1 };
  }

  it('deski A (+45°) i B (−45°) liczone osobno', () => {
    const panels = [
      hbPiece(0, 0, 45, WC_BOARD_AREA / 2),
      hbPiece(0, 2, 45, WC_BOARD_AREA / 3),
      hbPiece(0, 1, -45, WC_BOARD_AREA / 2),
    ];
    const result = WasteCalculator.compute(panels, HB_CFG);
    assert.equal(result.panelsNeededA, 2);
    assert.equal(result.panelsNeededB, 1);
    assert.equal(result.panelsNeeded, 3);
  });

  it('ścinek ukośny = odpad; żadnego parowania między docinkami', () => {
    const panels = [
      hbPiece(0, 0, 45, WC_BOARD_AREA / 10),
      hbPiece(1, 0, 45, WC_BOARD_AREA / 10),
    ];
    const result = WasteCalculator.compute(panels, HB_CFG);
    assert.equal(result.panelsNeeded, 2);
    assert.closeTo(result.wasteArea, 2 * WC_BOARD_AREA - 2 * WC_BOARD_AREA / 10, 1);
  });

  it('mały docinek A nie łata pozycji B (osobne produkty)', () => {
    const panels = [
      hbPiece(0, 0, 45, WC_BOARD_AREA / 10),
      hbPiece(0, 1, -45, WC_BOARD_AREA / 10),
    ];
    const result = WasteCalculator.compute(panels, HB_CFG);
    assert.equal(result.panelsNeededA, 1);
    assert.equal(result.panelsNeededB, 1);
    assert.equal(result.panelsNeeded, 2);
  });

  it('kawałki z tej samej deski jodełki liczą się raz', () => {
    const panels = [
      hbPiece(0, 0, 45, WC_BOARD_AREA / 4),
      hbPiece(0, 0, 45, WC_BOARD_AREA / 4),
    ];
    const result = WasteCalculator.compute(panels, HB_CFG);
    assert.equal(result.panelsNeededA, 1);
    assert.equal(result.panelsNeeded, 1);
  });

  it('pełna deska jodełki bez odpadu', () => {
    const result = WasteCalculator.compute([hbPiece(0, 0, 45, WC_BOARD_AREA)], HB_CFG);
    assert.equal(result.panelsNeeded, 1);
    assert.closeTo(result.wasteArea, 0, 1);
  });
});

describe('WasteCalculator.aggregate — sumowanie statystyk pokojów', () => {

  it('sumuje deski, powierzchnie i odpad; wastePercent od zakupu', () => {
    const agg = WasteCalculator.aggregate([
      { totalArea: 10, wasteArea: 1, totalPanels: 40, cutPanels: 8,
        problematicPanels: 1, panelsNeeded: 42, panelsNeededA: null, panelsNeededB: null },
      { totalArea: 5, wasteArea: 0.5, totalPanels: 20, cutPanels: 4,
        problematicPanels: 0, panelsNeeded: 21, panelsNeededA: null, panelsNeededB: null },
    ]);
    assert.closeTo(agg.totalArea, 15, 0.001);
    assert.closeTo(agg.totalWaste, 1.5, 0.001);
    assert.equal(agg.totalPanels, 60);
    assert.equal(agg.totalCuts, 12);
    assert.equal(agg.totalProblematic, 1);
    assert.equal(agg.panelsNeeded, 63);
    assert.equal(agg.panelsNeededA, null);
    assert.closeTo(agg.wastePercent, (1.5 / 16.5) * 100, 0.01);
  });

  it('sumuje deski A/B dla jodełki', () => {
    const agg = WasteCalculator.aggregate([
      { totalArea: 10, wasteArea: 2, totalPanels: 50, cutPanels: 20,
        problematicPanels: 0, panelsNeeded: 46, panelsNeededA: 23, panelsNeededB: 23 },
      { totalArea: 4, wasteArea: 1, totalPanels: 22, cutPanels: 10,
        problematicPanels: 0, panelsNeeded: 19, panelsNeededA: 10, panelsNeededB: 9 },
    ]);
    assert.equal(agg.panelsNeededA, 33);
    assert.equal(agg.panelsNeededB, 32);
    assert.equal(agg.panelsNeeded, 65);
  });
});

describe('LayoutEngine — statystyki zakupu (integracja)', () => {

  const ENGINE_CFG = {
    panelLength: WC_L, panelWidth: WC_W,
    offsetX: 0, offsetY: 0,
    direction: 0, stagger: 'none',
    minCutWidth: 50, minCutLength: 300,
  };

  it('stagger none: docinki z jednej strony → każdy potrzebuje własnej deski', () => {
    // Pokój 2000×386: 2 rzędy po (pełna 1380 + docinek 620 przy prawej ścianie)
    const room = [
      { x: 0, y: 0 }, { x: 2000, y: 0 },
      { x: 2000, y: 386 }, { x: 0, y: 386 },
    ];
    const { stats } = LayoutEngine.generateLayout(room, ENGINE_CFG);
    assert.equal(stats.totalPanels, 4);
    assert.equal(stats.panelsNeeded, 4);
    const netM2 = (2000 * 386) / 1e6;
    assert.closeTo(stats.wasteArea, (4 * WC_BOARD_AREA) / 1e6 - netM2, 0.001);
    assert.equal(stats.panelsNeededA, null);
  });

  it('stagger half: docinek z prawej ściany zaczyna rząd przy lewej (1 para)', () => {
    // Rząd 0: pełna + 620 (prawa ściana); rząd 1: 690 (lewa) + 1310 (prawa)
    const room = [
      { x: 0, y: 0 }, { x: 2000, y: 0 },
      { x: 2000, y: 386 }, { x: 0, y: 386 },
    ];
    const { stats } = LayoutEngine.generateLayout(room, { ...ENGINE_CFG, stagger: 'half' });
    assert.equal(stats.totalPanels, 4);
    assert.equal(stats.reusedPairs, 1);
    assert.equal(stats.panelsNeeded, 3);
  });

  it('jodełka: raportuje deski A i B, każdy docinek = własna deska', () => {
    const room = [
      { x: 0, y: 0 }, { x: 1500, y: 0 },
      { x: 1500, y: 1500 }, { x: 0, y: 1500 },
    ];
    const layout = LayoutEngine.generateLayout(room, {
      panelLength: 625, panelWidth: 125,
      offsetX: 0, offsetY: 0, direction: 0, stagger: 'none',
      minCutWidth: 50, minCutLength: 300,
      pattern: 'herringbone',
    });
    const { stats } = layout;

    assert.greaterThan(stats.panelsNeededA, 0);
    assert.greaterThan(stats.panelsNeededB, 0);
    assert.equal(stats.panelsNeededA + stats.panelsNeededB, stats.panelsNeeded);

    // Konserwatywnie: liczba desek = liczba fizycznych desek w układzie
    const cells = new Set(layout.panels.map(p => `${p.row}:${p.col}`));
    assert.equal(stats.panelsNeeded, cells.size);

    // Realny odpad jodełki jest wyraźnie większy od zera
    assert.greaterThan(stats.wastePercent, 5);
  });
});

describe('layoutOptimizer.optimizeAll — agregacja zakupu', () => {

  it('aggregateStats.panelsNeeded = suma per pokój', () => {
    const config = {
      panelLength: WC_L, panelWidth: WC_W,
      expansionGap: 10, minCutWidth: 50, minCutLength: 300,
      direction: 0, stagger: 'none', pattern: 'straight',
    };
    const mkRoom = (id, x0, y0) => ({
      id, name: `R${id}`,
      vertices: [
        { x: x0, y: y0 }, { x: x0 + 900, y: y0 },
        { x: x0 + 900, y: y0 + 400 }, { x: x0, y: y0 + 400 },
      ],
      wallIds: [1, 1, 1, 1],
    });
    const result = layoutOptimizer.optimizeAll([mkRoom(1, 0, 0), mkRoom(2, 2000, 0)], config);

    let sumNeeded = 0, sumWaste = 0;
    for (const [, r] of result.results) {
      sumNeeded += r.stats.panelsNeeded;
      sumWaste += r.stats.wasteArea;
    }
    assert.equal(result.aggregateStats.panelsNeeded, sumNeeded);
    assert.closeTo(result.aggregateStats.totalWaste, sumWaste, 0.001);
  });
});
