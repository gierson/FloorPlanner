/**
 * Sidebar — Room list + Material config + Laying settings
 */
class Sidebar {
  constructor() {
    this._setupSectionToggle();
    this._setupRoomList();
    this._setupMaterialConfig();
    this._setupLayingSettings();
    this._setupPresetModal();
    this._setupWallSettings();
    this._setupDoorSettings();
    this._setupToolSections();
    this._setupPatternSelect();
    this._setupFloorOffset();
  }

  /** Collapsible sidebar sections */
  _setupSectionToggle() {
    document.querySelectorAll('.sidebar__section-header').forEach(header => {
      header.addEventListener('click', (e) => {
        // Don't toggle if clicking the add button
        if (e.target.closest('.btn-icon')) return;
        const section = header.closest('.sidebar__section');
        section.classList.toggle('collapsed');
      });
    });
  }

  /** Room list rendering — shows auto-detected rooms from wall graph */
  _setupRoomList() {
    const renderList = () => {
      const listEl = document.getElementById('room-list');
      const emptyEl = document.getElementById('rooms-empty');
      const rooms = appState.get('detectedRooms') || [];

      if (!listEl) return;

      // Clear existing room items (keep empty message)
      listEl.querySelectorAll('.room-item').forEach(el => el.remove());

      if (rooms.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';

      rooms.forEach(room => {
        const li = document.createElement('li');
        li.className = 'room-item';
        li.dataset.roomId = room.id;

        const area = room.area || 0;

        li.innerHTML = `
          <span class="room-item__color" style="background:${room.color.stroke}"></span>
          <span class="room-item__name">${room.name}</span>
          <span class="room-item__area">${area.toFixed(2)} m²</span>
        `;

        listEl.appendChild(li);
      });
    };

    eventBus.on('graph:change', renderList);
    eventBus.on('state:change', (d) => {
      if (d.path === 'detectedRooms') renderList();
    });
    eventBus.on('command:undo', renderList);
    eventBus.on('command:redo', renderList);

    // Initial render
    renderList();
  }

  /** Material preset and dimension inputs */
  _setupMaterialConfig() {
    const presetSelect = document.getElementById('material-preset');
    const lengthInput = document.getElementById('panel-length');
    const widthInput = document.getElementById('panel-width');

    if (presetSelect) {
      // Populate options for the active laying pattern
      this._rebuildPresetDropdown();

      presetSelect.addEventListener('change', () => {
        const preset = findPreset(presetSelect.value);
        if (preset) {
          this._applyPreset(preset);
        } else {
          appState.set('material.presetId', 'custom');
        }
        // Clear layout on material change
        eventBus.emit('layout:clear');
      });
    }

    if (lengthInput) {
      lengthInput.addEventListener('change', () => {
        const val = parseInt(lengthInput.value) || 1380;
        appState.set('material.length', val);
        if (presetSelect) presetSelect.value = 'custom';
        appState.set('material.presetId', 'custom');
        eventBus.emit('layout:clear');
      });
    }

    if (widthInput) {
      widthInput.addEventListener('change', () => {
        const val = parseInt(widthInput.value) || 193;
        appState.set('material.width', val);
        if (presetSelect) presetSelect.value = 'custom';
        appState.set('material.presetId', 'custom');
        eventBus.emit('layout:clear');
      });
    }
  }

  /** Laying direction, gap, stagger, min cuts */
  _setupLayingSettings() {
    // Expansion gap
    const gapInput = document.getElementById('expansion-gap');
    if (gapInput) {
      gapInput.addEventListener('change', () => {
        appState.set('laying.expansionGap', parseInt(gapInput.value) || 10);
        eventBus.emit('layout:clear');
      });
    }

    // Min cut dimensions
    const minCutW = document.getElementById('min-cut-width');
    const minCutL = document.getElementById('min-cut-length');
    if (minCutW) minCutW.addEventListener('change', () => {
      appState.set('laying.minCutWidth', parseInt(minCutW.value) || 50);
      eventBus.emit('layout:clear');
    });
    if (minCutL) minCutL.addEventListener('change', () => {
      appState.set('laying.minCutLength', parseInt(minCutL.value) || 300);
      eventBus.emit('layout:clear');
    });

    // Direction toggle
    const dirToggle = document.getElementById('direction-toggle');
    if (dirToggle) {
      dirToggle.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const dir = parseInt(btn.dataset.direction);
          appState.set('laying.direction', dir);
          dirToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          eventBus.emit('layout:clear');
        });
      });
    }

    // Stagger pattern
    const staggerSelect = document.getElementById('stagger-pattern');
    if (staggerSelect) {
      staggerSelect.addEventListener('change', () => {
        appState.set('laying.stagger', staggerSelect.value);
        eventBus.emit('layout:clear');
      });
    }
  }

  /** Save preset modal */
  _setupPresetModal() {
    const saveBtn = document.getElementById('btn-save-preset');
    const modal = document.getElementById('preset-modal');
    const cancelBtn = document.getElementById('preset-cancel');
    const confirmBtn = document.getElementById('preset-save');
    const nameInput = document.getElementById('preset-name');

    if (!saveBtn || !modal) return;

    saveBtn.addEventListener('click', () => {
      const l = appState.get('material.length');
      const w = appState.get('material.width');
      if (nameInput) nameInput.value = `Panel ${l} × ${w} mm`;
      modal.classList.add('visible');
      if (nameInput) nameInput.focus();
    });

    cancelBtn.addEventListener('click', () => modal.classList.remove('visible'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('visible');
    });

    confirmBtn.addEventListener('click', () => {
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) return;

      saveUserPreset({
        name,
        length: appState.get('material.length'),
        width: appState.get('material.width'),
        defaultGap: appState.get('laying.expansionGap'),
        defaultStagger: appState.get('laying.stagger'),
      });

      this._rebuildPresetDropdown();
      modal.classList.remove('visible');
    });
  }

  /**
   * Apply a preset: material dimensions + default gap/stagger, sync inputs
   * @private
   */
  _applyPreset(preset) {
    appState.batch({
      'material.presetId': preset.id,
      'material.length': preset.length,
      'material.width': preset.width,
    });

    const lengthInput = document.getElementById('panel-length');
    const widthInput = document.getElementById('panel-width');
    if (lengthInput) lengthInput.value = preset.length;
    if (widthInput) widthInput.value = preset.width;

    if (preset.defaultGap) {
      appState.set('laying.expansionGap', preset.defaultGap);
      const gapInput = document.getElementById('expansion-gap');
      if (gapInput) gapInput.value = preset.defaultGap;
    }
    if (preset.defaultStagger) {
      appState.set('laying.stagger', preset.defaultStagger);
      const staggerSelect = document.getElementById('stagger-pattern');
      if (staggerSelect) staggerSelect.value = preset.defaultStagger;
    }
  }

  /**
   * Rebuild preset dropdown from presets.js for the active laying pattern.
   * Groups presets by category; "Własne" always holds user presets + custom.
   */
  _rebuildPresetDropdown() {
    const select = document.getElementById('material-preset');
    if (!select) return;

    const pattern = appState.get('laying.pattern') || 'straight';
    const presets = getPresetsForPattern(pattern);

    select.innerHTML = '';

    const groups = new Map();
    for (const p of presets) {
      if (!groups.has(p.category)) groups.set(p.category, []);
      groups.get(p.category).push(p);
    }
    if (!groups.has('Własne')) groups.set('Własne', []);

    for (const [category, items] of groups) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = category;
      for (const p of items) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        optgroup.appendChild(opt);
      }
      if (category === 'Własne') {
        const opt = document.createElement('option');
        opt.value = 'custom';
        opt.textContent = '— Własne wymiary —';
        optgroup.appendChild(opt);
      }
      select.appendChild(optgroup);
    }

    // Restore selection; presets not on this list fall back to 'custom'
    const currentId = appState.get('material.presetId') || 'custom';
    select.value = presets.some(p => p.id === currentId) ? currentId : 'custom';
  }

  /**
   * After a pattern change: refilter presets and, if the active preset
   * doesn't suit the new pattern, switch to the first one that does.
   * @private
   */
  _syncPresetsToPattern() {
    this._rebuildPresetDropdown();

    const select = document.getElementById('material-preset');
    if (!select) return;

    const activeId = appState.get('material.presetId');
    if (select.value === 'custom' && activeId && activeId !== 'custom') {
      const pattern = appState.get('laying.pattern') || 'straight';
      const first = getPresetsForPattern(pattern).find(p => !p.isCustom);
      if (first) {
        select.value = first.id;
        this._applyPreset(first);
      }
    }
  }

  /** Wall settings (thickness, type, drawing reference) */
  _setupWallSettings() {
    const thicknessSelect = document.getElementById('wall-thickness');
    if (thicknessSelect) {
      thicknessSelect.addEventListener('change', () => {
        appState.set('wallDefaults.thickness', parseInt(thicknessSelect.value) || 150);
      });
    }

    const typeSelect = document.getElementById('wall-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        appState.set('wallDefaults.type', typeSelect.value || 'interior');
      });
    }

    const referenceSelect = document.getElementById('wall-reference');
    const referenceHint = document.getElementById('wall-reference-hint');
    if (referenceSelect) {
      referenceSelect.addEventListener('change', () => {
        const ref = referenceSelect.value === 'inner' ? 'inner' : 'axis';
        appState.set('wallDefaults.reference', ref);
        if (referenceHint) referenceHint.style.display = ref === 'inner' ? '' : 'none';
      });
    }
  }

  /** Door settings (width, hinge side, open direction) */
  _setupDoorSettings() {
    const widthSelect = document.getElementById('door-width');
    const hingeSelect = document.getElementById('door-hinge-side');
    const dirSelect = document.getElementById('door-open-direction');
    const hintEl = document.getElementById('door-hint');

    // Update defaults when controls change
    if (widthSelect) {
      widthSelect.addEventListener('change', () => {
        const val = parseInt(widthSelect.value) || 800;
        appState.set('doorDefaults.width', val);
        this._updateSelectedDoor();
      });
    }

    if (hingeSelect) {
      hingeSelect.addEventListener('change', () => {
        appState.set('doorDefaults.hingeSide', hingeSelect.value);
        this._updateSelectedDoor();
      });
    }

    if (dirSelect) {
      dirSelect.addEventListener('change', () => {
        appState.set('doorDefaults.openDirection', dirSelect.value);
        this._updateSelectedDoor();
      });
    }

    // Show keyboard hint when door tool is active
    eventBus.on('state:change', (d) => {
      if (d.path === 'tool') {
        if (hintEl) hintEl.style.display = d.value === 'door' ? '' : 'none';
      }
    });

    // Sync sidebar when a door is selected
    eventBus.on('state:change', (d) => {
      if (d.path === 'selectedDoorId') {
        this._syncDoorToSidebar(d.value);
      }
    });
  }

  /**
   * Sync sidebar door controls to match a selected door's properties
   * @param {number|null} doorId
   * @private
   */
  _syncDoorToSidebar(doorId) {
    if (!doorId || !window._wallGraph) return;
    const door = window._wallGraph.doors.get(doorId);
    if (!door) return;

    const widthSelect = document.getElementById('door-width');
    const hingeSelect = document.getElementById('door-hinge-side');
    const dirSelect = document.getElementById('door-open-direction');

    if (widthSelect) widthSelect.value = String(door.width);
    if (hingeSelect) hingeSelect.value = door.hingeSide || 'left';
    if (dirSelect) dirSelect.value = door.openDirection || 'A';
  }

  /**
   * If a door is selected, update its properties to match sidebar values
   * @private
   */
  _updateSelectedDoor() {
    const doorId = appState.get('selectedDoorId');
    if (!doorId || !window._wallGraph) return;
    const door = window._wallGraph.doors.get(doorId);
    if (!door) return;

    const newWidth = parseInt(document.getElementById('door-width')?.value) || door.width;
    const newHinge = document.getElementById('door-hinge-side')?.value || door.hingeSide;
    const newDir = document.getElementById('door-open-direction')?.value || door.openDirection;

    const oldProps = { width: door.width, hingeSide: door.hingeSide, openDirection: door.openDirection };
    const newProps = { width: newWidth, hingeSide: newHinge, openDirection: newDir };

    // Only execute command if something changed
    if (oldProps.width !== newProps.width || oldProps.hingeSide !== newProps.hingeSide || oldProps.openDirection !== newProps.openDirection) {
      commandManager.execute(new UpdateDoorCommand(window._wallGraph, doorId, oldProps, newProps));
    }
  }

  /** Show/hide wall and door sidebar sections based on active tool */
  _setupToolSections() {
    const wallSection = document.getElementById('section-walls');
    const doorSection = document.getElementById('section-doors');

    const updateSections = (tool) => {
      if (wallSection) wallSection.style.display = tool === 'wall' ? '' : 'none';
      if (doorSection) doorSection.style.display = tool === 'door' ? '' : 'none';
    };

    // Set initial state (default tool is 'wall')
    updateSections(appState.get('tool') || 'wall');

    // React to tool changes
    eventBus.on('tool:change', updateSections);
    eventBus.on('state:change', (d) => {
      if (d.path === 'tool') updateSections(d.value);
    });
  }

  /**
   * Pattern select — toggle direction/stagger visibility for herringbone
   * @private
   */
  _setupPatternSelect() {
    const select = document.getElementById('laying-pattern');
    const straightSettings = document.getElementById('straight-only-settings');

    if (!select) return;

    const updateVisibility = () => {
      const isHerringbone = select.value === 'herringbone';
      if (straightSettings) {
        straightSettings.style.display = isHerringbone ? 'none' : '';
      }
      // Direction toggle serves both patterns — only the label changes
      const dirLabel = document.getElementById('direction-label');
      if (dirLabel) {
        dirLabel.textContent = isHerringbone ? 'Kierunek rzędów jodełki' : 'Kierunek układania';
      }
    };

    select.addEventListener('change', () => {
      appState.set('laying.pattern', select.value);
      updateVisibility();
      this._syncPresetsToPattern();
      eventBus.emit('layout:clear');
    });

    // Sync on init
    select.value = appState.get('laying.pattern') || 'straight';
    updateVisibility();
    this._syncPresetsToPattern();
  }

  /**
   * Floor offset adjustment — show/hide section, handle input changes
   * @private
   */
  _setupFloorOffset() {
    const section = document.getElementById('section-floor-offset');
    const inputX = document.getElementById('floor-offset-x');
    const inputY = document.getElementById('floor-offset-y');
    const resetBtn = document.getElementById('btn-offset-reset');
    const hintText = document.getElementById('offset-hint-text');

    if (!section || !inputX || !inputY) return;

    /** Stored optimizer offsets for reset */
    let optimizedX = 0;
    let optimizedY = 0;

    // Show section and fill inputs after optimization
    eventBus.on('optimize:done', () => {
      const ox = appState.get('laying.manualOffsetX');
      const oy = appState.get('laying.manualOffsetY');

      if (ox !== null && oy !== null) {
        optimizedX = ox;
        optimizedY = oy;

        inputX.value = Math.round(ox);
        inputY.value = Math.round(oy);

        // Set max values based on current material
        inputX.max = appState.get('material.length') - 1;
        inputY.max = appState.get('material.width') - 1;

        // Update hint
        if (hintText) {
          hintText.textContent = `Optymalne: X=${Math.round(ox)}, Y=${Math.round(oy)} mm`;
        }

        section.style.display = '';
      }
    });

    // Hide section when layout is cleared
    eventBus.on('layout:clear', () => {
      section.style.display = 'none';
      inputX.value = '0';
      inputY.value = '0';
      optimizedX = 0;
      optimizedY = 0;
      if (hintText) hintText.textContent = '';
    });

    // Auto re-layout on input change
    const emitAdjust = () => {
      const offsetX = parseInt(inputX.value) || 0;
      const offsetY = parseInt(inputY.value) || 0;

      appState.batch({
        'laying.manualOffsetX': offsetX,
        'laying.manualOffsetY': offsetY,
      });

      eventBus.emit('layout:adjust', { offsetX, offsetY });
    };

    inputX.addEventListener('change', emitAdjust);
    inputY.addEventListener('change', emitAdjust);

    // Also trigger on Enter key for immediate feedback
    const onEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        emitAdjust();
      }
    };
    inputX.addEventListener('keydown', onEnter);
    inputY.addEventListener('keydown', onEnter);

    // Reset to optimizer values
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        inputX.value = Math.round(optimizedX);
        inputY.value = Math.round(optimizedY);
        emitAdjust();
      });
    }
  }
}
