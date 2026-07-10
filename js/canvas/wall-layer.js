/**
 * WallLayer — Renders walls, nodes, doors, and room fills
 *
 * Replaces the old RoomLayer for wall-based editing.
 * Draws:
 *   - Wall polygons (rectangles with thickness)
 *   - Junction nodes (handles at wall connections)
 *   - Door openings (gaps in walls)
 *   - Room fills (from detected innerPolygons)
 *   - Dimension labels on walls
 *   - Ghost preview for wall being drawn
 */
class WallLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Viewport} viewport
   */
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;
    this.dpr = window.devicePixelRatio || 1;

    /** @type {WallGraph|null} */
    this.graph = null;

    /** @type {WallTool|null} */
    this.wallTool = null;

    /** @type {DoorTool|null} */
    this.doorTool = null;

    this._resizeCanvas();
    this._setupListeners();
  }

  /** @private */
  _resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.scale(this.dpr, this.dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  /** @private */
  _setupListeners() {
    eventBus.on('viewport:change', () => this.render());
    eventBus.on('graph:change', () => this.render());
    eventBus.on('wall:add', () => this.render());
    eventBus.on('wall:remove', () => this.render());
    eventBus.on('state:change', (d) => {
      if (d.path === 'selectedWallId' || d.path === 'selectedNodeId' ||
          d.path === 'selectedDoorId' ||
          d.path === 'tool' || d.path === 'wallDefaults.thickness' ||
          d.path === 'doorDefaults.hingeSide' || d.path === 'doorDefaults.openDirection' ||
          d.path === 'doorDefaults.width') {
        this.render();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      this._resizeCanvas();
      this.render();
    });
    resizeObserver.observe(this.canvas.parentElement);
  }

  /**
   * Set the wall graph reference
   * @param {WallGraph} graph
   */
  setGraph(graph) {
    this.graph = graph;
  }

  /**
   * Set the wall tool reference (for ghost preview)
   * @param {WallTool} tool
   */
  setWallTool(tool) {
    this.wallTool = tool;
  }

  /**
   * Set the door tool reference (for ghost preview)
   * @param {DoorTool} tool
   */
  setDoorTool(tool) {
    this.doorTool = tool;
  }

  // ═══════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ═══════════════════════════════════════════════════════════

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.graph) return;

    const vp = this.viewport;
    const selectedWallId = appState.get('selectedWallId');
    const selectedNodeId = appState.get('selectedNodeId');

    // 1. Draw room fills (detected rooms)
    this._drawRoomFills(ctx, vp);

    // 2. Draw walls
    this._drawWalls(ctx, vp, selectedWallId);

    // 3. Draw doors
    this._drawDoors(ctx, vp);

    // 4. Draw nodes (junction handles)
    this._drawNodes(ctx, vp, selectedNodeId);

    // 5. Draw dimension labels
    this._drawDimensions(ctx, vp, selectedWallId);

    // 6. Draw ghost preview (wall being drawn)
    this._drawGhostWall(ctx, vp);

    // 7. Draw ghost door preview
    this._drawGhostDoor(ctx, vp);

    // 8. Draw snap indicators
    this._drawSnapIndicators(ctx, vp);
  }

  // ═══════════════════════════════════════════════════════════
  //  ROOM FILLS
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawRoomFills(ctx, vp) {
    const rooms = this.graph.findRooms();

    for (const room of rooms) {
      if (!room.innerPolygon || room.innerPolygon.length < 3) continue;

      const screenPoly = room.innerPolygon.map(p => vp.worldToScreen(p.x, p.y));

      // Fill
      ctx.beginPath();
      ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
      for (let i = 1; i < screenPoly.length; i++) {
        ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = room.color.fill;
      ctx.fill();

      // Room name label
      const centroid = PolygonClip.centroid(room.innerPolygon);
      const screenCenter = vp.worldToScreen(centroid.x, centroid.y);
      const areaStr = `${room.area.toFixed(2)} m²`;

      ctx.font = `600 12px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = room.color.stroke + 'CC';
      ctx.fillText(room.name, screenCenter.x, screenCenter.y - 8);
      ctx.font = `400 10px 'Inter', sans-serif`;
      ctx.fillStyle = room.color.stroke + '99';
      ctx.fillText(areaStr, screenCenter.x, screenCenter.y + 8);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  WALLS
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawWalls(ctx, vp, selectedWallId) {
    for (const wall of this.graph.walls.values()) {
      const polygon = this.graph.getWallPolygon(wall.id);
      if (!polygon) continue;

      const screenPoly = polygon.map(p => vp.worldToScreen(p.x, p.y));
      const isSelected = wall.id === selectedWallId;

      // Fill
      ctx.beginPath();
      ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
      for (let i = 1; i < screenPoly.length; i++) {
        ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
      }
      ctx.closePath();

      if (wall.type === 'exterior') {
        ctx.fillStyle = isSelected ? 'rgba(140, 140, 160, 0.6)' : 'rgba(100, 105, 120, 0.5)';
      } else {
        ctx.fillStyle = isSelected ? 'rgba(120, 125, 140, 0.5)' : 'rgba(80, 85, 100, 0.4)';
      }
      ctx.fill();

      // Stroke
      ctx.strokeStyle = isSelected ? '#E8A849' : 'rgba(140, 145, 165, 0.5)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Selected glow
      if (isSelected) {
        ctx.shadowColor = '#E8A849';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  DOORS
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawDoors(ctx, vp) {
    const selectedDoorId = appState.get('selectedDoorId');

    for (const door of this.graph.doors.values()) {
      const wall = this.graph.walls.get(door.wallId);
      if (!wall) continue;

      const axis = this.graph.getWallAxis(door.wallId);
      if (!axis) continue;

      const wallLen = this.graph.getWallLength(door.wallId);
      if (wallLen < 1) continue;

      const isSelected = door.id === selectedDoorId;

      // Door position along wall (FIX: parentheses around the full expression before Math.min/max)
      const t1 = Math.max(0, (door.position - door.width / 2) / wallLen);
      const t2 = Math.min(1, (door.position + door.width / 2) / wallLen);

      const p1 = {
        x: axis.start.x + (axis.end.x - axis.start.x) * t1,
        y: axis.start.y + (axis.end.y - axis.start.y) * t1,
      };
      const p2 = {
        x: axis.start.x + (axis.end.x - axis.start.x) * t2,
        y: axis.start.y + (axis.end.y - axis.start.y) * t2,
      };

      // Draw door opening (clear the wall, draw an arc)
      const sp1 = vp.worldToScreen(p1.x, p1.y);
      const sp2 = vp.worldToScreen(p2.x, p2.y);
      const halfT = wall.thickness / 2;

      // Door gap: compute the rectangle covering the wall at the door opening
      const dx = axis.end.x - axis.start.x;
      const dy = axis.end.y - axis.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len * halfT;
      const ny = dx / len * halfT;

      // Slightly extend the gap to cover wall strokes cleanly
      const extend = 1; // 1mm extra to cover antialiased edges
      const gapDx = (axis.end.x - axis.start.x) / len * extend;
      const gapDy = (axis.end.y - axis.start.y) / len * extend;

      const doorPoly = [
        vp.worldToScreen(p1.x + nx - gapDx, p1.y + ny - gapDy),
        vp.worldToScreen(p2.x + nx + gapDx, p2.y + ny + gapDy),
        vp.worldToScreen(p2.x - nx + gapDx, p2.y - ny + gapDy),
        vp.worldToScreen(p1.x - nx - gapDx, p1.y - ny - gapDy),
      ];

      // Use compositing to cleanly erase the wall at the door opening
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(doorPoly[0].x, doorPoly[0].y);
      for (let i = 1; i < doorPoly.length; i++) {
        ctx.lineTo(doorPoly[i].x, doorPoly[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.fill();
      ctx.restore();

      // Door color — turkusowy (distinct from golden walls/panels)
      const doorColor = isSelected ? 'rgba(45, 212, 191, 0.9)' : 'rgba(45, 212, 191, 0.6)';
      const doorArcColor = isSelected ? 'rgba(45, 212, 191, 0.5)' : 'rgba(45, 212, 191, 0.3)';

      // Door symbol: arc swing
      const doorScreenWidth = vp.worldToScreenDist(door.width);
      if (doorScreenWidth > 15) {
        // Determine hinge side and open direction
        const hingeSide = door.hingeSide || 'left';
        const openDir = door.openDirection || 'A';

        // Pivot point: 'left' = p1 (start of opening), 'right' = p2 (end of opening)
        const pivotSp = hingeSide === 'left' ? sp1 : sp2;
        const farSp = hingeSide === 'left' ? sp2 : sp1;

        // Wall unit direction on screen
        const wallAngle = Math.atan2(sp2.y - sp1.y, sp2.x - sp1.x);

        // Arc direction depends on openDirection: 'A' = one side, 'B' = other side
        // 'A' = arc swings toward wall perpendicular (screen normal direction)
        // 'B' = arc swings toward opposite perpendicular
        let arcStart, arcEnd;
        if (hingeSide === 'left') {
          if (openDir === 'A') {
            arcStart = wallAngle - Math.PI / 2;
            arcEnd = wallAngle;
          } else {
            arcStart = wallAngle;
            arcEnd = wallAngle + Math.PI / 2;
          }
        } else {
          // Right hinge: pivot at p2, arc goes backward
          if (openDir === 'A') {
            arcStart = wallAngle + Math.PI;
            arcEnd = wallAngle + Math.PI / 2;
          } else {
            arcStart = wallAngle - Math.PI / 2;
            arcEnd = wallAngle + Math.PI;
          }
        }

        // Draw arc
        ctx.beginPath();
        const ccw = (hingeSide === 'right' && openDir === 'A') ||
                     (hingeSide === 'left' && openDir === 'B');
        ctx.arc(pivotSp.x, pivotSp.y, doorScreenWidth, arcStart, arcEnd, ccw);
        ctx.strokeStyle = doorArcColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Door line (the leaf/panel of the door)
        ctx.beginPath();
        ctx.moveTo(pivotSp.x, pivotSp.y);
        ctx.lineTo(farSp.x, farSp.y);
        ctx.strokeStyle = doorColor;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Selected door glow
        if (isSelected) {
          ctx.shadowColor = 'rgba(45, 212, 191, 0.5)';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(pivotSp.x, pivotSp.y);
          ctx.lineTo(farSp.x, farSp.y);
          ctx.stroke();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  NODES (Junction Handles)
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawNodes(ctx, vp, selectedNodeId) {
    for (const node of this.graph.nodes.values()) {
      const screen = vp.worldToScreen(node.x, node.y);
      const isSelected = node.id === selectedNodeId;
      const wallCount = this.graph.getWallsAtNode(node.id).length;

      const radius = isSelected ? 5 : (wallCount > 2 ? 4 : 3);

      // Background
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(12, 14, 18, 0.8)';
      ctx.fill();

      // Node dot
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#E8A849' : (wallCount > 2 ? '#60A5FA' : '#8891A5');
      ctx.fill();

      // Glow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232, 168, 73, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  DIMENSION LABELS
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawDimensions(ctx, vp, selectedWallId) {
    if (!appState.get('ui.showDimensions')) return;

    for (const wall of this.graph.walls.values()) {
      const axis = this.graph.getWallAxis(wall.id);
      if (!axis) continue;

      const length = this.graph.getWallLength(wall.id);
      if (length < 10) continue;

      const screenA = vp.worldToScreen(axis.start.x, axis.start.y);
      const screenB = vp.worldToScreen(axis.end.x, axis.end.y);
      const mid = Geometry.midpoint(screenA, screenB);
      const angle = Math.atan2(screenB.y - screenA.y, screenB.x - screenA.x);

      const isSelected = wall.id === selectedWallId;
      const label = DimensionInput.format(length, 'auto');

      // Perpendicular offset
      const offsetDist = isSelected ? 16 : 12;
      const perpX = -Math.sin(angle) * offsetDist;
      const perpY = Math.cos(angle) * offsetDist;

      ctx.save();
      ctx.translate(mid.x + perpX, mid.y + perpY);

      // Keep text readable
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.rotate(textAngle);

      // Background pill
      ctx.font = `500 ${isSelected ? 11 : 10}px 'JetBrains Mono', monospace`;
      const metrics = ctx.measureText(label);
      const pw = metrics.width + 8;
      const ph = 16;

      ctx.fillStyle = isSelected ? 'rgba(20, 23, 30, 0.9)' : 'rgba(20, 23, 30, 0.75)';
      ctx.beginPath();
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 3);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = 'rgba(232, 168, 73, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Text
      ctx.fillStyle = isSelected ? '#E8A849' : '#8891A5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0.5);

      ctx.restore();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  GHOST PREVIEW (wall being drawn)
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawGhostWall(ctx, vp) {
    if (!this.wallTool) return;
    const preview = this.wallTool.getPreview();
    if (!preview) return;

    // Ghost wall polygon
    if (preview.polygon) {
      const screenPoly = preview.polygon.map(p => vp.worldToScreen(p.x, p.y));

      ctx.beginPath();
      ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
      for (let i = 1; i < screenPoly.length; i++) {
        ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(232, 168, 73, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(232, 168, 73, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axis line
    const screenStart = vp.worldToScreen(preview.start.x, preview.start.y);
    const screenEnd = vp.worldToScreen(preview.end.x, preview.end.y);

    ctx.beginPath();
    ctx.moveTo(screenStart.x, screenStart.y);
    ctx.lineTo(screenEnd.x, screenEnd.y);
    ctx.strokeStyle = 'rgba(232, 168, 73, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();

    // Dimension label or length input
    if (preview.length > 10 || preview.lengthInputText !== undefined) {
      const mid = Geometry.midpoint(screenStart, screenEnd);

      if (preview.lengthInputText !== undefined) {
        // ── Active length input mode: render styled input pill ──
        const inputText = preview.lengthInputText || '';
        // Show blinking cursor (toggle every 500ms)
        const showCursor = Math.floor(Date.now() / 500) % 2 === 0;
        const displayText = inputText + (showCursor ? '|' : ' ');
        const parsedMm = DimensionInput.parse(inputText);
        const isValid = parsedMm !== null && parsedMm >= 50;

        ctx.font = `600 11px 'JetBrains Mono', monospace`;
        const metrics = ctx.measureText(displayText || '0000');
        const pw = Math.max(metrics.width + 16, 60);
        const ph = 20;

        // Background pill
        ctx.fillStyle = 'rgba(20, 23, 30, 0.95)';
        ctx.beginPath();
        ctx.roundRect(mid.x - pw / 2, mid.y - 10 - ph / 2, pw, ph, 4);
        ctx.fill();

        // Border (gold when valid, red when invalid)
        ctx.strokeStyle = isValid || inputText.length === 0
          ? '#E8A849'
          : '#F87171';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#E8A849';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, mid.x, mid.y - 10);

        // Show parsed dimension below in smaller font
        if (parsedMm !== null && parsedMm > 0) {
          const dimLabel = DimensionInput.format(parsedMm, 'auto');
          ctx.font = `400 9px 'JetBrains Mono', monospace`;
          ctx.fillStyle = 'rgba(136, 145, 165, 0.8)';
          ctx.fillText(dimLabel, mid.x, mid.y + 6);
        }

        // Request re-render for cursor blink animation
        requestAnimationFrame(() => this.render());
      } else {
        // ── Normal dimension label ──
        const label = DimensionInput.format(preview.length, 'auto');

        ctx.font = `500 10px 'JetBrains Mono', monospace`;
        ctx.fillStyle = 'rgba(232, 168, 73, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, mid.x, mid.y - 6);
      }
    }

    // Start/end dots
    ctx.beginPath();
    ctx.arc(screenStart.x, screenStart.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#E8A849';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(screenEnd.x, screenEnd.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = preview.snap?.type === 'node' ? '#34D399' : '#E8A849';
    ctx.fill();

    // Close indicator
    if (preview.canClose) {
      const chainStart = this.graph.nodes.get(preview.chainStartNodeId);
      if (chainStart) {
        const screenCS = vp.worldToScreen(chainStart.x, chainStart.y);
        ctx.beginPath();
        ctx.arc(screenCS.x, screenCS.y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
        ctx.fill();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  GHOST DOOR PREVIEW
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawGhostDoor(ctx, vp) {
    if (!this.doorTool || !this.doorTool.hoveredWallId) return;
    const dt = this.doorTool;

    // ── 1. Highlight the hovered wall ──
    const wallPoly = this.graph.getWallPolygon(dt.hoveredWallId);
    if (wallPoly) {
      const screenPoly = wallPoly.map(p => vp.worldToScreen(p.x, p.y));
      ctx.beginPath();
      ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
      for (let i = 1; i < screenPoly.length; i++) {
        ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (!dt.ghostPolygon || !dt.isValid) return;

    // ── 2. Ghost door opening (translucent rectangle) ──
    const ghostScreen = dt.ghostPolygon.map(p => vp.worldToScreen(p.x, p.y));

    ctx.beginPath();
    ctx.moveTo(ghostScreen[0].x, ghostScreen[0].y);
    for (let i = 1; i < ghostScreen.length; i++) {
      ctx.lineTo(ghostScreen[i].x, ghostScreen[i].y);
    }
    ctx.closePath();

    // Fill with accent color — turkusowy
    const isSnapped = dt.snapType !== null;
    ctx.fillStyle = isSnapped
      ? 'rgba(52, 211, 153, 0.25)'   // green when snapped
      : 'rgba(45, 212, 191, 0.20)';  // turkusowy otherwise
    ctx.fill();

    // Dashed border
    ctx.strokeStyle = isSnapped
      ? 'rgba(52, 211, 153, 0.8)'
      : 'rgba(45, 212, 191, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 3. Door swing arc (uses current door tool settings) ──
    if (dt.wallAxisStart && dt.wallAxisEnd && dt.ghostCenter) {
      const wall = this.graph.walls.get(dt.hoveredWallId);
      const halfT = wall ? wall.thickness / 2 : 75;
      const doorWidth = dt.doorWidth;
      const hingeSide = dt.hingeSide || 'left';
      const openDir = dt.openDirection || 'A';

      // Arc pivot at door edge
      const wallLen = this.graph.getWallLength(dt.hoveredWallId);
      const udx = (dt.wallAxisEnd.x - dt.wallAxisStart.x) / wallLen;
      const udy = (dt.wallAxisEnd.y - dt.wallAxisStart.y) / wallLen;

      // Pivot: left hinge = start of opening, right hinge = end of opening
      const pivotDist = hingeSide === 'left'
        ? dt.ghostPosition - doorWidth / 2
        : dt.ghostPosition + doorWidth / 2;

      // Offset toward openDirection side
      const perpSign = openDir === 'A' ? 1 : -1;
      const pivotWorld = {
        x: dt.wallAxisStart.x + udx * pivotDist + dt.wallNormX * halfT * perpSign,
        y: dt.wallAxisStart.y + udy * pivotDist + dt.wallNormY * halfT * perpSign,
      };
      const pivotScreen = vp.worldToScreen(pivotWorld.x, pivotWorld.y);
      const arcRadius = vp.worldToScreenDist(doorWidth);

      if (arcRadius > 12) {
        const doorAngle = Math.atan2(udy, udx);
        let arcStart, arcEnd, ccw;

        if (hingeSide === 'left') {
          if (openDir === 'A') {
            arcStart = doorAngle - Math.PI / 2;
            arcEnd = doorAngle;
            ccw = false;
          } else {
            arcStart = doorAngle;
            arcEnd = doorAngle + Math.PI / 2;
            ccw = true;
          }
        } else {
          if (openDir === 'A') {
            arcStart = doorAngle + Math.PI;
            arcEnd = doorAngle + Math.PI / 2;
            ccw = true;
          } else {
            arcStart = doorAngle - Math.PI / 2;
            arcEnd = doorAngle + Math.PI;
            ccw = false;
          }
        }

        ctx.beginPath();
        ctx.arc(pivotScreen.x, pivotScreen.y, arcRadius, arcStart, arcEnd, ccw);
        ctx.strokeStyle = isSnapped
          ? 'rgba(52, 211, 153, 0.3)'
          : 'rgba(45, 212, 191, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── 4. Dimension labels (distance from wall corners) ──
    if (dt.wallAxisStart && dt.wallAxisEnd && dt.ghostCenter) {
      const screenStart = vp.worldToScreen(dt.wallAxisStart.x, dt.wallAxisStart.y);
      const screenEnd = vp.worldToScreen(dt.wallAxisEnd.x, dt.wallAxisEnd.y);
      const screenCenter = vp.worldToScreen(dt.ghostCenter.x, dt.ghostCenter.y);

      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textBaseline = 'middle';

      // Dimension line from wall start to door center
      const labelDistStart = DimensionInput.format(dt.distFromStart, 'auto');
      const labelDistEnd = DimensionInput.format(dt.distFromEnd, 'auto');

      // Offset perpendicular to wall for label positioning
      const wall = this.graph.walls.get(dt.hoveredWallId);
      const halfT = wall ? wall.thickness / 2 : 75;
      const labelOffset = vp.worldToScreenDist(halfT) + 14;

      const normSX = dt.wallNormX;
      const normSY = dt.wallNormY;

      // Left dimension (start → door center)
      const midLeft = {
        x: (screenStart.x + screenCenter.x) / 2 + normSX * labelOffset,
        y: (screenStart.y + screenCenter.y) / 2 + normSY * labelOffset,
      };

      ctx.fillStyle = 'rgba(45, 212, 191, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(labelDistStart, midLeft.x, midLeft.y);

      // Right dimension (door center → end)
      const midRight = {
        x: (screenCenter.x + screenEnd.x) / 2 + normSX * labelOffset,
        y: (screenCenter.y + screenEnd.y) / 2 + normSY * labelOffset,
      };
      ctx.fillText(labelDistEnd, midRight.x, midRight.y);

      // Dimension guide lines (thin dashes)
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      // Start → door
      const guideStartS = { x: screenStart.x + normSX * labelOffset * 0.5, y: screenStart.y + normSY * labelOffset * 0.5 };
      const guideDoorLS = { x: screenCenter.x + normSX * labelOffset * 0.5, y: screenCenter.y + normSY * labelOffset * 0.5 };
      ctx.beginPath();
      ctx.moveTo(guideStartS.x, guideStartS.y);
      ctx.lineTo(guideDoorLS.x, guideDoorLS.y);
      ctx.stroke();

      // Door → end
      const guideDoorRS = { x: screenCenter.x + normSX * labelOffset * 0.5, y: screenCenter.y + normSY * labelOffset * 0.5 };
      const guideEndS = { x: screenEnd.x + normSX * labelOffset * 0.5, y: screenEnd.y + normSY * labelOffset * 0.5 };
      ctx.beginPath();
      ctx.moveTo(guideDoorRS.x, guideDoorRS.y);
      ctx.lineTo(guideEndS.x, guideEndS.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── 5. Snap indicator ──
    if (dt.snapType && dt.ghostCenter) {
      const sc = vp.worldToScreen(dt.ghostCenter.x, dt.ghostCenter.y);

      if (dt.snapType === 'center') {
        // Center snap: small diamond with label
        ctx.beginPath();
        ctx.moveTo(sc.x, sc.y - 6);
        ctx.lineTo(sc.x + 6, sc.y);
        ctx.lineTo(sc.x, sc.y + 6);
        ctx.lineTo(sc.x - 6, sc.y);
        ctx.closePath();
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(52, 211, 153, 0.2)';
        ctx.fill();

        // "Środek" label
        ctx.font = "600 9px 'Inter', sans-serif";
        ctx.fillStyle = 'rgba(52, 211, 153, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('ŚRODEK', sc.x, sc.y - 10);

      } else if (dt.snapType === 'grid') {
        // Grid snap: small cross
        ctx.beginPath();
        ctx.moveTo(sc.x - 5, sc.y);
        ctx.lineTo(sc.x + 5, sc.y);
        ctx.moveTo(sc.x, sc.y - 5);
        ctx.lineTo(sc.x, sc.y + 5);
        ctx.strokeStyle = '#60A5FA';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SNAP INDICATORS
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _drawSnapIndicators(ctx, vp) {
    if (!this.wallTool || !this.wallTool.snapResult) return;

    const snap = this.wallTool.snapResult;
    const screen = vp.worldToScreen(snap.x, snap.y);

    switch (snap.type) {
      case 'node':
        // Green circle
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;

      case 'edge':
        // Blue diamond
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y - 6);
        ctx.lineTo(screen.x + 6, screen.y);
        ctx.lineTo(screen.x, screen.y + 6);
        ctx.lineTo(screen.x - 6, screen.y);
        ctx.closePath();
        ctx.strokeStyle = '#60A5FA';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;

      case 'angle':
        // Extended guide line
        if (this.wallTool.startNodeId) {
          const startNode = this.graph.nodes.get(this.wallTool.startNodeId);
          if (startNode) {
            const screenAnchor = vp.worldToScreen(startNode.x, startNode.y);
            ctx.beginPath();
            ctx.moveTo(screenAnchor.x, screenAnchor.y);
            // Extend beyond the snap point
            const dx = screen.x - screenAnchor.x;
            const dy = screen.y - screenAnchor.y;
            ctx.lineTo(screenAnchor.x + dx * 1.5, screenAnchor.y + dy * 1.5);
            ctx.strokeStyle = 'rgba(232, 168, 73, 0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  HIT TESTING
  // ═══════════════════════════════════════════════════════════

  /**
   * Hit-test for walls
   * @param {{x:number,y:number}} worldPoint
   * @returns {{wallId: number}|null}
   */
  hitTestWall(worldPoint) {
    const threshold = this.viewport.screenToWorldDist(8);
    const hit = this.graph.findWallNear(worldPoint.x, worldPoint.y, threshold);
    return hit ? { wallId: hit.wallId } : null;
  }

  /**
   * Hit-test for nodes
   * @param {{x:number,y:number}} worldPoint
   * @returns {{nodeId: number}|null}
   */
  hitTestNode(worldPoint) {
    const threshold = this.viewport.screenToWorldDist(12);
    const nodeId = this.graph.findNodeNear(worldPoint.x, worldPoint.y, threshold);
    return nodeId ? { nodeId } : null;
  }

  /**
   * Hit-test for rooms (point in polygon)
   * @param {{x:number,y:number}} worldPoint
   * @returns {WGRoom|null}
   */
  hitTestRoom(worldPoint) {
    const rooms = this.graph.findRooms();
    for (let i = rooms.length - 1; i >= 0; i--) {
      if (rooms[i].innerPolygon &&
          Geometry.isPointInPolygon(worldPoint, rooms[i].innerPolygon)) {
        return rooms[i];
      }
    }
    return null;
  }

  /**
   * Hit-test for doors — checks if point is within the door opening rectangle
   * @param {{x:number,y:number}} worldPoint
   * @returns {{doorId: number}|null}
   */
  hitTestDoor(worldPoint) {
    const threshold = this.viewport.screenToWorldDist(8);

    for (const door of this.graph.doors.values()) {
      const wall = this.graph.walls.get(door.wallId);
      if (!wall) continue;

      const axis = this.graph.getWallAxis(door.wallId);
      if (!axis) continue;

      const wallLen = this.graph.getWallLength(door.wallId);
      if (wallLen < 1) continue;

      // Compute door rectangle in world coords
      const halfW = door.width / 2;
      const halfT = wall.thickness / 2 + threshold;
      const dx = axis.end.x - axis.start.x;
      const dy = axis.end.y - axis.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const udx = dx / len;
      const udy = dy / len;
      const nx = -udy;
      const ny = udx;

      // Door center on wall axis
      const cx = axis.start.x + udx * door.position;
      const cy = axis.start.y + udy * door.position;

      // Door rectangle corners
      const doorPoly = [
        { x: cx - udx * halfW + nx * halfT, y: cy - udy * halfW + ny * halfT },
        { x: cx + udx * halfW + nx * halfT, y: cy + udy * halfW + ny * halfT },
        { x: cx + udx * halfW - nx * halfT, y: cy + udy * halfW - ny * halfT },
        { x: cx - udx * halfW - nx * halfT, y: cy - udy * halfW - ny * halfT },
      ];

      if (Geometry.isPointInPolygon(worldPoint, doorPoly)) {
        return { doorId: door.id };
      }
    }

    return null;
  }
}
