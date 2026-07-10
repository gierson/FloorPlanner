// ═══════════════════════════════════════════════════════════════
//  WallTool — Length Input & Endpoint Calculation Tests
// ═══════════════════════════════════════════════════════════════

// Helper: create a WallTool in drawing state with a start node
function createDrawingTool(startX, startY) {
  const graph = new WallGraph();
  const viewport = {
    screenToWorldDist: (d) => d,
    worldToScreen: (x, y) => ({ x, y }),
    screenToWorld: (x, y) => ({ x, y }),
  };
  const tool = new WallTool(graph, viewport);

  // Set up drawing state
  const nodeId = graph.addNode(startX, startY);
  tool.startNodeId = nodeId;
  tool._chainStartNodeId = nodeId;
  tool.state = 'drawing';

  return { tool, graph };
}

// ─── Length Input State ──────────────────────────────────────

describe('WallTool — lengthInput state management', () => {
  it('starts with lengthInput = null', () => {
    const { tool } = createDrawingTool(0, 0);
    assert.equal(tool.lengthInput, null);
  });

  it('onKeyPress with digit starts input', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyPress('3');
    assert.equal(tool.lengthInput, '3');
  });

  it('onKeyPress accumulates digits', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyPress('3');
    tool.onKeyPress('0');
    tool.onKeyPress('0');
    tool.onKeyPress('0');
    assert.equal(tool.lengthInput, '3000');
  });

  it('onKeyPress Backspace removes last char', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyPress('3');
    tool.onKeyPress('0');
    tool.onKeyPress('0');
    tool.onKeyPress('Backspace');
    assert.equal(tool.lengthInput, '30');
  });

  it('onKeyPress Backspace on single char clears input', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyPress('5');
    tool.onKeyPress('Backspace');
    assert.equal(tool.lengthInput, null);
  });

  it('Escape via onKeyDown clears lengthInput', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyPress('3');
    tool.onKeyPress('0');
    tool.onKeyPress('0');
    tool.onKeyDown('Escape');
    assert.equal(tool.lengthInput, null);
    // Drawing state should be preserved (Escape only clears input, not drawing)
    assert.equal(tool.state, 'drawing');
  });

  it('Escape via onKeyDown cancels drawing when no lengthInput', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyDown('Escape');
    assert.equal(tool.state, 'idle');
  });

  it('onKeyPress allows dot for decimals', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyPress('4');
    tool.onKeyPress('.');
    tool.onKeyPress('5');
    assert.equal(tool.lengthInput, '4.5');
  });

  it('onKeyPress allows "m" for meters', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.onKeyPress('4');
    tool.onKeyPress('m');
    assert.equal(tool.lengthInput, '4m');
  });

  it('onKeyPress does nothing in idle state', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.state = 'idle';
    tool.onKeyPress('3');
    assert.equal(tool.lengthInput, null);
  });
});

// ─── Endpoint Calculation ────────────────────────────────────

describe('WallTool — _computeLengthEndpoint', () => {
  it('computes endpoint to the right (0°)', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 }; // direction = right

    const ep = tool._computeLengthEndpoint(3000);
    assert.closeTo(ep.x, 3000, 1);
    assert.closeTo(ep.y, 0, 1);
  });

  it('computes endpoint downward (90° in screen coords)', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 0, y: 1000 }; // direction = down

    const ep = tool._computeLengthEndpoint(4000);
    assert.closeTo(ep.x, 0, 1);
    assert.closeTo(ep.y, 4000, 1);
  });

  it('computes endpoint to the left (180°)', () => {
    const { tool } = createDrawingTool(1000, 500);
    tool.ghostEnd = { x: 0, y: 500 }; // direction = left

    const ep = tool._computeLengthEndpoint(2000);
    assert.closeTo(ep.x, -1000, 1);
    assert.closeTo(ep.y, 500, 1);
  });

  it('computes endpoint upward (270° / -90°)', () => {
    const { tool } = createDrawingTool(500, 3000);
    tool.ghostEnd = { x: 500, y: 0 }; // direction = up

    const ep = tool._computeLengthEndpoint(1500);
    assert.closeTo(ep.x, 500, 1);
    assert.closeTo(ep.y, 1500, 1);
  });

  it('computes endpoint at 45° diagonal', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 1000 }; // direction = 45° down-right

    const ep = tool._computeLengthEndpoint(1000);
    // At 45°: cos(45°) ≈ 0.707, sin(45°) ≈ 0.707
    const expected = 1000 * Math.cos(Math.PI / 4);
    assert.closeTo(ep.x, expected, 2);
    assert.closeTo(ep.y, expected, 2);
  });

  it('uses start node position correctly', () => {
    const { tool } = createDrawingTool(5000, 3000);
    tool.ghostEnd = { x: 6000, y: 3000 }; // right from (5000, 3000)

    const ep = tool._computeLengthEndpoint(2000);
    assert.closeTo(ep.x, 7000, 1);
    assert.closeTo(ep.y, 3000, 1);
  });
});

// ─── getPreview with lengthInput ─────────────────────────────

describe('WallTool — getPreview with lengthInput', () => {
  it('includes lengthInputText when input is active', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.lengthInput = '3000';

    const preview = tool.getPreview();
    assert.ok(preview);
    assert.equal(preview.lengthInputText, '3000');
  });

  it('preview end reflects computed endpoint from lengthInput', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 }; // direction = right
    tool.lengthInput = '2000';

    const preview = tool.getPreview();
    assert.closeTo(preview.end.x, 2000, 1);
    assert.closeTo(preview.end.y, 0, 1);
    assert.closeTo(preview.length, 2000, 1);
  });

  it('preview has no lengthInputText when input is null', () => {
    const { tool } = createDrawingTool(0, 0);
    tool.ghostEnd = { x: 1000, y: 0 };
    tool.lengthInput = null;

    const preview = tool.getPreview();
    assert.ok(preview);
    assert.equal(preview.lengthInputText, undefined);
  });
});
