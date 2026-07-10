// ═══════════════════════════════════════════════════════════════
//  WallTool — rysowanie po krawędzi wewnętrznej (reference: inner)
//
//  Klikane/wpisywane punkty = narożniki PODŁOGI. Oś ściany jest
//  odsuwana o T/2 na zewnątrz, węzły w narożnikach = przecięcia
//  odsuniętych osi. Inner polygon (inset T/2) odtwarza klikany obrys.
// ═══════════════════════════════════════════════════════════════

const INNER_VIEW = {
  screenToWorldDist: (d) => d,
  worldToScreen: (x, y) => ({ x, y }),
  screenToWorld: (x, y) => ({ x, y }),
};

function createInnerTool() {
  appState.set('wallDefaults.reference', 'inner');
  appState.set('wallDefaults.thickness', 150);
  const graph = new WallGraph();
  const tool = new WallTool(graph, INNER_VIEW);
  return { tool, graph };
}

function nodeSet(graph) {
  return [...graph.nodes.values()].map(n => `${n.x},${n.y}`).sort();
}

describe('WallTool inner — zamknięty prostokąt', () => {
  it('węzły osi leżą T/2 na zewnątrz klikanych narożników podłogi', () => {
    const { tool, graph } = createInnerTool();
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });
    tool.onClick({ x: 4000, y: 3000 });
    tool.onClick({ x: 0, y: 3000 });
    tool.onClick({ x: 0, y: 0 }); // domknięcie

    assert.equal(graph.walls.size, 4, 'powinny powstać 4 ściany');
    assert.equal(graph.nodes.size, 4, 'powinny powstać 4 węzły');
    assert.deepEqual(nodeSet(graph),
      ['-75,-75', '-75,3075', '4075,-75', '4075,3075'].sort(),
      'węzły powinny być odsunięte o 75mm na zewnątrz narożników podłogi');
    assert.equal(tool.state, 'idle', 'po domknięciu rysowanie się kończy');
  });

  it('podłoga (inner polygon) ma dokładnie klikane wymiary', () => {
    const { tool, graph } = createInnerTool();
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });
    tool.onClick({ x: 4000, y: 3000 });
    tool.onClick({ x: 0, y: 3000 });
    tool.onClick({ x: 0, y: 0 });

    const rooms = graph.findRooms();
    assert.equal(rooms.length, 1, 'powinien powstać 1 pokój');

    const bbox = Geometry.boundingBox(rooms[0].innerPolygon);
    assert.closeTo(bbox.minX, 0, 0.5, 'lewa krawędź podłogi = 0');
    assert.closeTo(bbox.minY, 0, 0.5, 'górna krawędź podłogi = 0');
    assert.closeTo(bbox.maxX, 4000, 0.5, 'podłoga powinna mieć 4000 szerokości');
    assert.closeTo(bbox.maxY, 3000, 0.5, 'podłoga powinna mieć 3000 wysokości');

    const area = Math.abs(Geometry.polygonSignedArea(rooms[0].innerPolygon));
    assert.closeTo(area, 12e6, 1000, 'pole podłogi = 4000×3000');
  });

  it('rysowanie w przeciwnym kierunku z flipem strony (F) daje ten sam wynik', () => {
    const { tool, graph } = createInnerTool();
    tool.onClick({ x: 0, y: 0 });
    tool.onKeyPress('f'); // ściana po drugiej stronie linii
    tool.onClick({ x: 0, y: 3000 });
    tool.onClick({ x: 4000, y: 3000 });
    tool.onClick({ x: 4000, y: 0 });
    tool.onClick({ x: 0, y: 0 });

    assert.deepEqual(nodeSet(graph),
      ['-75,-75', '-75,3075', '4075,-75', '4075,3075'].sort(),
      'CCW + flip powinno dać identyczne węzły jak CW bez flipa');
  });
});

describe('WallTool inner — łańcuch otwarty i długości', () => {
  it('otwarty łańcuch L: narożnik miterowany, końce prostopadle odsunięte', () => {
    const { tool, graph } = createInnerTool();
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });
    tool.onClick({ x: 4000, y: 3000 });
    tool.onKeyDown('Enter'); // zakończ łańcuch

    assert.equal(graph.walls.size, 2);
    assert.deepEqual(nodeSet(graph),
      ['0,-75', '4075,-75', '4075,3000'].sort(),
      'narożnik = przecięcie odsuniętych osi, końce = odsunięcie prostopadłe');
  });

  it('wpisana długość to wymiar podłogi (po krawędzi wewnętrznej)', () => {
    const { tool, graph } = createInnerTool();
    tool.onClick({ x: 0, y: 0 });
    tool.onMouseMove({ x: 500, y: 0 }); // kierunek w prawo
    tool.onKeyPress('4');
    tool.onKeyPress('0');
    tool.onKeyPress('0');
    tool.onKeyPress('0');
    tool.onKeyDown('Enter');

    assert.equal(graph.walls.size, 1);
    const nodes = nodeSet(graph);
    assert.ok(nodes.includes('0,-75'), `początek osi w (0,-75), jest: ${nodes}`);
    assert.ok(nodes.includes('4000,-75'), `koniec osi w (4000,-75), jest: ${nodes}`);
    assert.deepEqual(tool._innerChain.lastPt, { x: 4000, y: 0 },
      'punkt wewnętrzny łańcucha powinien przesunąć się o wpisaną długość');
  });
});

describe('WallTool inner — ghost preview', () => {
  it('preview zaczyna się w punkcie wewnętrznym, a pas ściany leży na zewnątrz', () => {
    const { tool } = createInnerTool();
    tool.onClick({ x: 0, y: 0 });
    tool.onMouseMove({ x: 1000, y: 0 });

    const p = tool.getPreview();
    assert.ok(p, 'preview powinien istnieć');
    assert.closeTo(p.length, 1000, 0.01, 'długość = odległość punktów wewnętrznych');
    assert.deepEqual(p.start, { x: 0, y: 0 });
    assert.ok(p.polygon, 'preview powinien mieć polygon');
    for (const v of p.polygon) {
      assert.ok(v.y <= 0.001 && v.y >= -150.001,
        `pas ściany powinien leżeć nad linią (0..-150), y=${v.y}`);
    }
  });
});

describe('WallTool inner — snap i regresja trybu osi', () => {
  it('SnapSystem pomija snap do węzłów/ścian przy nodeSnap/edgeSnap=false', () => {
    const graph = new WallGraph();
    graph.addNode(1000, 1000);
    const s = SnapSystem.snap({ x: 1005, y: 1002 }, graph, INNER_VIEW, {
      nodeSnap: false, edgeSnap: false, snapToGrid: true, gridSize: 100,
    });
    assert.notEqual(s.type, 'node', 'nie powinno snapować do węzła');
    assert.equal(s.x, 1000, 'powinno snapować do siatki');
    assert.equal(s.y, 1000);
  });

  it('tryb axis (domyślny) rysuje po osi — bez odsunięć (regresja)', () => {
    appState.set('wallDefaults.reference', 'axis');
    const graph = new WallGraph();
    const tool = new WallTool(graph, INNER_VIEW);
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });

    assert.equal(graph.walls.size, 1);
    assert.deepEqual(nodeSet(graph), ['0,0', '4000,0'].sort(),
      'w trybie osi węzły leżą dokładnie w klikanych punktach');
  });
});
