/**
 * Toolbar — Handles toolbar button states and actions
 */
class Toolbar {
  constructor() {
    this._setupToolButtons();
    this._setupZoomControls();
    this._setupSnapToggle();
    this._setupUndoRedo();
    this._setupOptimize();
    this._updateZoomDisplay();
  }

  /** @private */
  _setupToolButtons() {
    const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');

    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        appState.set('tool', tool);
        document.getElementById('canvas-container').dataset.tool = tool;

        // Update active state
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update label
        const labels = { wall: 'Ściana', door: 'Drzwi', select: 'Zaznacz', delete: 'Usuń' };
        const labelEl = document.getElementById('active-tool-label');
        if (labelEl) labelEl.textContent = `Narzędzie: ${labels[tool] || tool}`;

        eventBus.emit('tool:change', tool);
      });
    });

    // Listen for tool changes from keyboard shortcuts
    eventBus.on('tool:change', (tool) => {
      toolBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
      });
      const labels = { wall: 'Ściana', door: 'Drzwi', select: 'Zaznacz', delete: 'Usuń' };
      const labelEl = document.getElementById('active-tool-label');
      if (labelEl) labelEl.textContent = `Narzędzie: ${labels[tool] || tool}`;
    });
  }

  /** @private */
  _setupZoomControls() {
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const zoomFit = document.getElementById('zoom-fit');

    if (zoomIn) zoomIn.addEventListener('click', () => {
      if (window._viewport) window._viewport.setZoom(window._viewport.zoom * 1.3);
    });
    if (zoomOut) zoomOut.addEventListener('click', () => {
      if (window._viewport) window._viewport.setZoom(window._viewport.zoom / 1.3);
    });
    if (zoomFit) zoomFit.addEventListener('click', () => {
      if (window._viewport) window._viewport.fitToRooms(appState.get('rooms'));
    });

    eventBus.on('viewport:change', () => this._updateZoomDisplay());
  }

  /** @private */
  _updateZoomDisplay() {
    const el = document.getElementById('zoom-level');
    const zoom = appState.get('viewport.zoom') || 1;
    if (el) el.textContent = `${Math.round(zoom * 100)}%`;

    const scaleEl = document.getElementById('canvas-scale');
    if (scaleEl) {
      const pxPerCm = zoom * 0.2 * 10; // BASE_SCALE * zoom * 10mm
      scaleEl.textContent = `Skala: 1cm = ${pxPerCm.toFixed(1)}px`;
    }
  }

  /** @private */
  _setupSnapToggle() {
    const checkbox = document.getElementById('snap-grid');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        appState.set('ui.snapToGrid', checkbox.checked);
      });
    }
  }

  /** @private */
  _setupUndoRedo() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');

    if (undoBtn) undoBtn.addEventListener('click', () => commandManager.undo());
    if (redoBtn) redoBtn.addEventListener('click', () => commandManager.redo());

    eventBus.on('command:stackChange', (info) => {
      if (undoBtn) undoBtn.disabled = !info.canUndo;
      if (redoBtn) redoBtn.disabled = !info.canRedo;
      if (undoBtn) undoBtn.title = info.canUndo ? `Cofnij: ${info.undoDescription} (Ctrl+Z)` : 'Cofnij (Ctrl+Z)';
      if (redoBtn) redoBtn.title = info.canRedo ? `Ponów: ${info.redoDescription} (Ctrl+Shift+Z)` : 'Ponów (Ctrl+Shift+Z)';
    });
  }

  /** @private */
  _setupOptimize() {
    const btn = document.getElementById('btn-optimize');
    if (btn) {
      btn.addEventListener('click', () => {
        eventBus.emit('optimize:request');
      });
    }
  }
}
