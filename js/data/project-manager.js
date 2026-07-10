/**
 * ProjectManager — Save/Load/Export/Import projects
 * @description Manages project persistence via localStorage and file download/upload.
 *              Projects are saved as .fp files (JSON format).
 */
class ProjectManager {
  /**
   * @param {WallGraph} graph - The wall graph instance
   */
  constructor(graph) {
    this.graph = graph;
    /** @type {string|null} Currently loaded project id (localStorage key) */
    this.currentProjectId = null;
    /** @type {boolean} Whether there are unsaved changes */
    this.isDirty = false;
    /** @type {number|null} Autosave interval timer */
    this._autosaveTimer = null;
    /** @type {string} Current project name */
    this.currentProjectName = 'Nowy projekt';

    this._STORAGE_INDEX_KEY = 'floorplanner_projects';
    this._STORAGE_PREFIX = 'floorplanner_project_';
    this._AUTOSAVE_KEY = 'floorplanner_autosave';
    this._idCounter = 0;
  }

  // ═══════════════════════════════════════════════════════════
  //  SNAPSHOT — Create / Load
  // ═══════════════════════════════════════════════════════════

  /**
   * Create a project snapshot (serializable object)
   * @param {string} [name] - Project name
   * @returns {Object} Snapshot object ready for JSON.stringify
   */
  createSnapshot(name) {
    const now = new Date().toISOString();
    return {
      version: 1,
      name: name || this.currentProjectName || 'Nowy projekt',
      createdAt: now,
      updatedAt: now,
      graph: this.graph.serialize(),
      settings: {
        material: {
          presetId: appState.get('material.presetId'),
          length: appState.get('material.length'),
          width: appState.get('material.width'),
        },
        laying: {
          expansionGap: appState.get('laying.expansionGap'),
          minCutWidth: appState.get('laying.minCutWidth'),
          minCutLength: appState.get('laying.minCutLength'),
          direction: appState.get('laying.direction'),
          stagger: appState.get('laying.stagger'),
        },
        wallDefaults: {
          thickness: appState.get('wallDefaults.thickness'),
          type: appState.get('wallDefaults.type'),
        },
        doorDefaults: {
          width: appState.get('doorDefaults.width'),
          hingeSide: appState.get('doorDefaults.hingeSide'),
          openDirection: appState.get('doorDefaults.openDirection'),
        },
      },
    };
  }

  /**
   * Load a project snapshot into the app
   * @param {Object} data - Snapshot object (from createSnapshot or parsed JSON)
   */
  loadSnapshot(data) {
    // Restore graph
    this.graph.deserialize(data.graph || { nodes: [], walls: [], doors: [] });

    // Restore settings (merge with current defaults for backward compat)
    if (data.settings) {
      const s = data.settings;
      if (s.material) {
        if (s.material.presetId !== undefined) appState.set('material.presetId', s.material.presetId);
        if (s.material.length !== undefined) appState.set('material.length', s.material.length);
        if (s.material.width !== undefined) appState.set('material.width', s.material.width);
      }
      if (s.laying) {
        if (s.laying.expansionGap !== undefined) appState.set('laying.expansionGap', s.laying.expansionGap);
        if (s.laying.minCutWidth !== undefined) appState.set('laying.minCutWidth', s.laying.minCutWidth);
        if (s.laying.minCutLength !== undefined) appState.set('laying.minCutLength', s.laying.minCutLength);
        if (s.laying.direction !== undefined) appState.set('laying.direction', s.laying.direction);
        if (s.laying.stagger !== undefined) appState.set('laying.stagger', s.laying.stagger);
      }
      if (s.wallDefaults) {
        if (s.wallDefaults.thickness !== undefined) appState.set('wallDefaults.thickness', s.wallDefaults.thickness);
        if (s.wallDefaults.type !== undefined) appState.set('wallDefaults.type', s.wallDefaults.type);
      }
      if (s.doorDefaults) {
        if (s.doorDefaults.width !== undefined) appState.set('doorDefaults.width', s.doorDefaults.width);
        if (s.doorDefaults.hingeSide !== undefined) appState.set('doorDefaults.hingeSide', s.doorDefaults.hingeSide);
        if (s.doorDefaults.openDirection !== undefined) appState.set('doorDefaults.openDirection', s.doorDefaults.openDirection);
      }
    }

    // Update project state
    this.currentProjectName = data.name || 'Nowy projekt';
    if (data._storageId) {
      this.currentProjectId = data._storageId;
    }
    this.isDirty = false;

    // Clear layout (derived data, will be recalculated)
    appState.set('layout', null);

    // Notify
    eventBus.emit('graph:change');
    eventBus.emit('project:loaded', { name: this.currentProjectName });
  }

  // ═══════════════════════════════════════════════════════════
  //  DIRTY TRACKING
  // ═══════════════════════════════════════════════════════════

  /** Mark project as having unsaved changes */
  markDirty() {
    this.isDirty = true;
    eventBus.emit('project:dirty', true);
  }

  /** Clear dirty flag (after save) */
  clearDirty() {
    this.isDirty = false;
    eventBus.emit('project:dirty', false);
  }

  // ═══════════════════════════════════════════════════════════
  //  JSON SERIALIZATION (for file export/import)
  // ═══════════════════════════════════════════════════════════

  /**
   * Convert snapshot to JSON string
   * @param {Object} snapshot - From createSnapshot()
   * @returns {string} JSON string
   */
  toJSON(snapshot) {
    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * Parse and validate JSON string into a snapshot
   * @param {string} jsonString
   * @returns {Object} Validated snapshot
   * @throws {Error} If JSON is invalid or missing required fields
   */
  fromJSON(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Nieprawidłowy format pliku — nie udało się sparsować JSON');
    }

    if (!data.version) {
      throw new Error('Brak wersji projektu — plik może być uszkodzony');
    }
    if (!data.graph) {
      throw new Error('Brak danych grafu — plik może być uszkodzony');
    }

    return data;
  }

  // ═══════════════════════════════════════════════════════════
  //  LOCALSTORAGE — Save / List / Load / Delete / Rename
  // ═══════════════════════════════════════════════════════════

  /**
   * Save current project to localStorage
   * @param {string} [name] - Project name (uses current if omitted)
   * @returns {string|null} Project id, or null on error
   */
  saveToStorage(name) {
    const projectName = name || this.currentProjectName || 'Nowy projekt';
    const snapshot = this.createSnapshot(projectName);
    const isUpdate = this.currentProjectId !== null;
    const id = isUpdate ? this.currentProjectId : 'proj_' + Date.now() + '_' + (this._idCounter++);

    try {
      // Save project data
      localStorage.setItem(this._STORAGE_PREFIX + id, JSON.stringify(snapshot));

      // Update index
      const index = this._loadIndex();
      const existing = index.findIndex(p => p.id === id);

      const meta = {
        id,
        name: projectName,
        createdAt: existing >= 0 ? index[existing].createdAt : snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      };

      if (existing >= 0) {
        index[existing] = meta;
      } else {
        index.push(meta);
      }

      localStorage.setItem(this._STORAGE_INDEX_KEY, JSON.stringify(index));

      // Update state
      this.currentProjectId = id;
      this.currentProjectName = projectName;
      this.clearDirty();

      eventBus.emit('project:saved', { id, name: projectName });
      return id;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        eventBus.emit('project:error', { message: 'Brak miejsca w pamięci przeglądarki. Usuń stare projekty lub wyeksportuj je do plików.' });
      } else {
        console.error('[ProjectManager] Save error:', e);
        eventBus.emit('project:error', { message: 'Nie udało się zapisać projektu: ' + e.message });
      }
      return null;
    }
  }

  /**
   * List all projects saved in localStorage
   * @returns {Array<{id, name, createdAt, updatedAt}>}
   */
  listFromStorage() {
    return this._loadIndex();
  }

  /**
   * Load a project from localStorage by id
   * @param {string} id
   * @returns {boolean} Success
   */
  loadFromStorage(id) {
    try {
      const raw = localStorage.getItem(this._STORAGE_PREFIX + id);
      if (!raw) return false;

      const data = JSON.parse(raw);
      data._storageId = id;
      this.loadSnapshot(data);
      return true;
    } catch (e) {
      console.error('[ProjectManager] Load error:', e);
      return false;
    }
  }

  /**
   * Delete a project from localStorage
   * @param {string} id
   */
  deleteFromStorage(id) {
    localStorage.removeItem(this._STORAGE_PREFIX + id);
    const index = this._loadIndex().filter(p => p.id !== id);
    localStorage.setItem(this._STORAGE_INDEX_KEY, JSON.stringify(index));

    if (this.currentProjectId === id) {
      this.currentProjectId = null;
    }

    eventBus.emit('project:deleted', { id });
  }

  /**
   * Rename a project in localStorage
   * @param {string} id
   * @param {string} newName
   */
  renameInStorage(id, newName) {
    const index = this._loadIndex();
    const entry = index.find(p => p.id === id);
    if (entry) {
      entry.name = newName;
      entry.updatedAt = new Date().toISOString();
      localStorage.setItem(this._STORAGE_INDEX_KEY, JSON.stringify(index));

      // Also update the stored snapshot
      try {
        const raw = localStorage.getItem(this._STORAGE_PREFIX + id);
        if (raw) {
          const data = JSON.parse(raw);
          data.name = newName;
          data.updatedAt = entry.updatedAt;
          localStorage.setItem(this._STORAGE_PREFIX + id, JSON.stringify(data));
        }
      } catch (e) {
        // Index already updated, snapshot name is cosmetic
      }

      if (this.currentProjectId === id) {
        this.currentProjectName = newName;
      }

      eventBus.emit('project:renamed', { id, name: newName });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  FILE EXPORT / IMPORT
  // ═══════════════════════════════════════════════════════════

  /**
   * Export current project as .fp file download
   * @param {string} [name] - Project name for filename
   */
  exportToFile(name) {
    const projectName = name || this.currentProjectName || 'projekt';
    const snapshot = this.createSnapshot(projectName);
    const json = this.toJSON(snapshot);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = this._sanitizeFilename(projectName) + '.fp';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    eventBus.emit('project:exported', { name: projectName });
  }

  /**
   * Import project from .fp file (opens file picker)
   * @returns {Promise<boolean>} Success
   */
  importFromFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.fp,.json';

      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) { resolve(false); return; }

        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = this.fromJSON(reader.result);
            this.loadSnapshot(data);
            this.currentProjectId = null; // imported file is not in localStorage
            eventBus.emit('project:imported', { name: data.name });
            resolve(true);
          } catch (e) {
            eventBus.emit('project:error', { message: e.message });
            resolve(false);
          }
        };
        reader.onerror = () => {
          eventBus.emit('project:error', { message: 'Nie udało się odczytać pliku' });
          resolve(false);
        };
        reader.readAsText(file);
      });

      input.click();
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  AUTOSAVE
  // ═══════════════════════════════════════════════════════════

  /**
   * Start autosave interval
   * @param {number} [intervalMs=30000] - Interval in ms
   */
  startAutosave(intervalMs) {
    this.stopAutosave();
    const interval = intervalMs || 30000;

    this._autosaveTimer = setInterval(() => {
      if (this.isDirty) {
        try {
          const snapshot = this.createSnapshot(this.currentProjectName);
          localStorage.setItem(this._AUTOSAVE_KEY, JSON.stringify(snapshot));
        } catch (e) {
          // Silently fail autosave — user can manually save
        }
      }
    }, interval);
  }

  /** Stop autosave interval */
  stopAutosave() {
    if (this._autosaveTimer) {
      clearInterval(this._autosaveTimer);
      this._autosaveTimer = null;
    }
  }

  /**
   * Check if there's an autosave available
   * @returns {Object|null} Autosave snapshot or null
   */
  getAutosave() {
    try {
      const raw = localStorage.getItem(this._AUTOSAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /** Clear autosave data */
  clearAutosave() {
    localStorage.removeItem(this._AUTOSAVE_KEY);
  }

  // ═══════════════════════════════════════════════════════════
  //  NEW PROJECT
  // ═══════════════════════════════════════════════════════════

  /**
   * Create a new empty project
   */
  newProject() {
    this.graph.deserialize({ nodes: [], walls: [], doors: [] });
    this.currentProjectId = null;
    this.currentProjectName = 'Nowy projekt';
    this.isDirty = false;

    // Reset settings to defaults
    appState.batch({
      'material.presetId': 'lam-1380x193',
      'material.length': 1380,
      'material.width': 193,
      'laying.expansionGap': 10,
      'laying.minCutWidth': 50,
      'laying.minCutLength': 300,
      'laying.direction': 0,
      'laying.stagger': 'third',
      'wallDefaults.thickness': 150,
      'wallDefaults.type': 'interior',
      'doorDefaults.width': 800,
      'doorDefaults.hingeSide': 'left',
      'doorDefaults.openDirection': 'A',
      'layout': null,
    });

    eventBus.emit('graph:change');
    eventBus.emit('project:new');
  }

  // ═══════════════════════════════════════════════════════════
  //  INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════

  /** @private Load project index from localStorage */
  _loadIndex() {
    try {
      const raw = localStorage.getItem(this._STORAGE_INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * @private Sanitize string for use as filename
   * @param {string} name
   * @returns {string}
   */
  _sanitizeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'projekt';
  }

  /**
   * @private Clear all project data from localStorage (for testing)
   */
  _clearAllStorage() {
    const index = this._loadIndex();
    for (const p of index) {
      localStorage.removeItem(this._STORAGE_PREFIX + p.id);
    }
    localStorage.removeItem(this._STORAGE_INDEX_KEY);
    localStorage.removeItem(this._AUTOSAVE_KEY);
  }
}
