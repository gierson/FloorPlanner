// ═══════════════════════════════════════════════════════════════
//  AddWallCommand — undo/redo
//
//  Bug: snapshot był robiony w execute(), czyli już PO dodaniu
//  ściany przez WallTool — undo przywracało stan ZE ścianą (no-op).
// ═══════════════════════════════════════════════════════════════

const CMD_VIEW = {
  screenToWorldDist: (d) => d,
  worldToScreen: (x, y) => ({ x, y }),
  screenToWorld: (x, y) => ({ x, y }),
};

function createWallToolFor(reference) {
  appState.set('wallDefaults.reference', reference);
  appState.set('wallDefaults.thickness', 150);
  const graph = new WallGraph();
  const tool = new WallTool(graph, CMD_VIEW);
  commandManager.clear();
  return { graph, tool };
}

function cmdNodeSet(graph) {
  return [...graph.nodes.values()].map(n => `${n.x},${n.y}`).sort();
}

describe('AddWallCommand — undo/redo', () => {
  it('undo usuwa narysowaną ścianę wraz z węzłami', () => {
    const { graph, tool } = createWallToolFor('axis');
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });
    assert.equal(graph.walls.size, 1);

    commandManager.undo();
    assert.equal(graph.walls.size, 0, 'undo powinno usunąć ścianę');
    assert.equal(graph.nodes.size, 0, 'undo powinno usunąć osierocone węzły');
  });

  it('redo przywraca cofniętą ścianę', () => {
    const { graph, tool } = createWallToolFor('axis');
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });

    commandManager.undo();
    commandManager.redo();
    assert.equal(graph.walls.size, 1, 'redo powinno przywrócić ścianę');
    assert.equal(graph.nodes.size, 2, 'redo powinno przywrócić oba węzły');
  });

  it('undo w łańcuchu cofa po jednej ścianie', () => {
    const { graph, tool } = createWallToolFor('axis');
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });
    tool.onClick({ x: 4000, y: 3000 });
    assert.equal(graph.walls.size, 2);

    commandManager.undo();
    assert.equal(graph.walls.size, 1, 'pierwsze undo usuwa ostatnią ścianę');
    commandManager.undo();
    assert.equal(graph.walls.size, 0, 'drugie undo usuwa pierwszą ścianę');
    assert.equal(graph.nodes.size, 0, 'graf powinien być pusty');
  });

  it('undo w trybie inner cofa też miterowanie węzła narożnego', () => {
    const { graph, tool } = createWallToolFor('inner');
    tool.onClick({ x: 0, y: 0 });
    tool.onClick({ x: 4000, y: 0 });
    tool.onClick({ x: 4000, y: 3000 });
    tool.onKeyDown('Escape'); // zakończ rysowanie

    assert.ok(cmdNodeSet(graph).includes('4075,-75'),
      'narożnik powinien być zmiterowany przed undo');

    commandManager.undo(); // cofnij drugą ścianę
    assert.equal(graph.walls.size, 1);
    assert.deepEqual(cmdNodeSet(graph), ['0,-75', '4000,-75'].sort(),
      'węzeł narożny powinien wrócić na odsunięcie prostopadłe (4000,-75)');
  });
});
