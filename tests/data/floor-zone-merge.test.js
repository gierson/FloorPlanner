// ═══════════════════════════════════════════════════════════════
//  FloorZone merge — door threshold alignment tests
// ═══════════════════════════════════════════════════════════════

/**
 * Helper: create two adjacent rooms sharing a wall, with a door on the shared wall.
 * Returns the graph so we can call findFloorZones and check the merged polygon.
 * 
 * Layout (walls are axis-aligned):
 *   Room A: (0,0) → (3000,0) → (3000,3000) → (0,3000)
 *   Room B: (3000,0) → (6000,0) → (6000,3000) → (3000,3000)
 *   Shared wall between (3000,0) and (3000,3000) — vertical
 *   Door at position 1500 (center), width 800
 */
function createTwoRoomsWithDoor(g) {
  const n1 = g.addNode(0, 0);
  const n2 = g.addNode(3000, 0);
  const n3 = g.addNode(6000, 0);
  const n4 = g.addNode(6000, 3000);
  const n5 = g.addNode(3000, 3000);
  const n6 = g.addNode(0, 3000);

  // Room A walls
  g.addWall(n1, n2, { thickness: 150 }); // top
  g.addWall(n6, n1, { thickness: 150 }); // left

  // Shared wall (vertical)
  const sharedWallId = g.addWall(n2, n5, { thickness: 150 });

  // Room B walls
  g.addWall(n2, n3, { thickness: 150 }); // top-right  
  g.addWall(n3, n4, { thickness: 150 }); // right
  g.addWall(n4, n5, { thickness: 150 }); // bottom-right

  // Bottom wall for both rooms
  g.addWall(n5, n6, { thickness: 150 }); // bottom

  // Place a door on the shared wall
  g.addDoor(sharedWallId, 1500, 800);

  return { sharedWallId };
}

describe('FloorZone merge — door threshold alignment', () => {
  let g;
  beforeEach(() => { g = new WallGraph(); });

  it('merged floor zone polygon has only axis-aligned edges (no diagonals)', () => {
    createTwoRoomsWithDoor(g);
    const zones = g.findFloorZones();
    
    // Should have exactly 1 zone (2 rooms merged through door)
    assert.equal(zones.length, 1, 'should merge into 1 zone');

    const poly = zones[0].polygon;
    assert.ok(poly.length >= 4, 'polygon should have at least 4 vertices');

    // Check every edge is axis-aligned (dx===0 or dy===0)
    for (let i = 0; i < poly.length; i++) {
      const curr = poly[i];
      const next = poly[(i + 1) % poly.length];
      const dx = Math.abs(next.x - curr.x);
      const dy = Math.abs(next.y - curr.y);
      
      const isAxisAligned = (dx <= 1) || (dy <= 1);
      assert.ok(isAxisAligned,
        `Edge ${i} is diagonal: (${curr.x},${curr.y}) → (${next.x},${next.y}), dx=${dx}, dy=${dy}`
      );
    }
  });

  it('door threshold edges are perpendicular to wall (not diagonal)', () => {
    createTwoRoomsWithDoor(g);
    const zones = g.findFloorZones();
    assert.equal(zones.length, 1);

    const poly = zones[0].polygon;
    
    // The shared wall is vertical (x=3000), so door threshold transitions
    // should be horizontal (dy=0, dx=wall.thickness).
    // Find edges near x=3000 that cross the wall
    let crossingEdges = 0;
    for (let i = 0; i < poly.length; i++) {
      const curr = poly[i];
      const next = poly[(i + 1) % poly.length];
      const dx = Math.abs(next.x - curr.x);
      const dy = Math.abs(next.y - curr.y);
      
      // An edge crossing the wall zone (around x=3000)
      const minX = Math.min(curr.x, next.x);
      const maxX = Math.max(curr.x, next.x);
      if (minX < 3000 && maxX > 2800 && dx > 50) {
        crossingEdges++;
        // This crossing edge should be horizontal (dy ≈ 0)
        assert.ok(dy <= 1,
          `Door threshold edge ${i} should be horizontal but has dy=${dy}: (${curr.x},${curr.y}) → (${next.x},${next.y})`
        );
      }
    }
    
    assert.ok(crossingEdges >= 2, `Expected at least 2 crossing edges (door enter/exit), got ${crossingEdges}`);
  });
});
