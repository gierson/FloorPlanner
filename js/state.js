/**
 * AppState — Centralized state management with change notification
 * @description Single source of truth for application state. 
 *              Changes emit events via EventBus.
 */
class AppState {
  constructor() {
    this._state = {
      // Detected rooms (derived from wall graph)
      detectedRooms: [],
      selectedRoomId: null,

      // Legacy compat — still used by some UI
      rooms: [],
      nextRoomId: 1,

      // Active tool
      tool: 'wall', // 'wall' | 'rect' | 'select' | 'delete' | 'door'

      // Wall defaults
      wallDefaults: {
        thickness: 150,     // mm
        type: 'interior',   // 'exterior' | 'interior' | 'partition'
        reference: 'axis',  // 'axis' — rysowanie po osi | 'inner' — po krawędzi podłogi
      },

      // Door defaults
      doorDefaults: {
        width: 800,            // mm
        hingeSide: 'left',     // 'left' | 'right'
        openDirection: 'A',    // 'A' | 'B'
      },

      // Selection
      selectedWallId: null,
      selectedNodeId: null,
      selectedDoorId: null,

      // Material configuration
      material: {
        presetId: 'lam-1380x193',
        length: 1380,     // mm
        width: 193,       // mm
      },

      // Laying settings
      laying: {
        expansionGap: 10, // mm
        minCutWidth: 50,   // mm
        minCutLength: 300, // mm
        direction: 0,      // 0 = horizontal, 90 = vertical
        stagger: 'third',  // 'third' | 'half' | 'random' | 'none'
        pattern: 'straight', // 'straight' | 'herringbone'
        manualOffsetX: null, // mm — manual floor offset (null = use optimizer)
        manualOffsetY: null, // mm — manual floor offset (null = use optimizer)
      },

      // Viewport
      viewport: {
        offsetX: 0,       // px — pan offset
        offsetY: 0,       // px
        zoom: 1,          // 1 = default (1cm = 2px)
      },

      // Layout optimization result
      layout: null,

      // UI state
      ui: {
        snapToGrid: true,
        gridSize: 100,      // mm (10cm)
        showDimensions: true,
        showLayout: true,
        summaryOpen: false,
      },
    };

    /** @type {Map<string, Set<Function>>} path → callbacks */
    this._watchers = new Map();
  }

  /**
   * Get a value from state by dot-path
   * @param {string} [path] - Dot-separated path (e.g., 'material.length'). Omit for full state.
   * @returns {*}
   */
  get(path) {
    if (!path) return this._state;

    const keys = path.split('.');
    let value = this._state;
    for (const key of keys) {
      if (value == null) return undefined;
      value = value[key];
    }
    return value;
  }

  /**
   * Set a value in state and notify watchers
   * @param {string} path - Dot-separated path
   * @param {*} value - New value
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this._state;

    for (const key of keys) {
      if (target[key] == null || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    const oldValue = target[lastKey];
    if (oldValue === value) return; // No change

    target[lastKey] = value;

    // Notify watchers for this path and parent paths
    const fullPath = [...keys, lastKey].join('.');
    this._notifyWatchers(fullPath, value, oldValue);

    // Global state change event
    eventBus.emit('state:change', { path: fullPath, value, oldValue });
  }

  /**
   * Update multiple paths at once (batched)
   * @param {Object} updates - { 'path.to.prop': newValue, ... }
   */
  batch(updates) {
    for (const [path, value] of Object.entries(updates)) {
      this.set(path, value);
    }
  }

  /**
   * Watch a specific path for changes
   * @param {string} path
   * @param {Function} callback - (newValue, oldValue) => void
   * @returns {Function} Unwatch function
   */
  watch(path, callback) {
    if (!this._watchers.has(path)) {
      this._watchers.set(path, new Set());
    }
    this._watchers.get(path).add(callback);

    return () => {
      const watchers = this._watchers.get(path);
      if (watchers) {
        watchers.delete(callback);
        if (watchers.size === 0) this._watchers.delete(path);
      }
    };
  }

  /**
   * Notify watchers for a path and all parent paths
   * @private
   */
  _notifyWatchers(path, value, oldValue) {
    // Exact path watchers
    const watchers = this._watchers.get(path);
    if (watchers) {
      for (const cb of watchers) {
        try {
          cb(value, oldValue);
        } catch (err) {
          console.error(`[AppState] Watcher error for "${path}":`, err);
        }
      }
    }

    // Parent path watchers (e.g., 'material' watches 'material.length')
    const parts = path.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      const parentWatchers = this._watchers.get(parentPath);
      if (parentWatchers) {
        const parentValue = this.get(parentPath);
        for (const cb of parentWatchers) {
          try {
            cb(parentValue, undefined);
          } catch (err) {
            console.error(`[AppState] Parent watcher error for "${parentPath}":`, err);
          }
        }
      }
    }
  }

  // ── Convenience methods for rooms ──

  /**
   * Add a room to state
   * @param {Object} room - { vertices: [{x,y}], name?: string }
   * @returns {Object} The created room with id
   */
  addRoom(room) {
    const id = this._state.nextRoomId++;
    const newRoom = {
      id,
      name: room.name || `Pokój ${id}`,
      vertices: [...room.vertices],
      color: ROOM_COLORS[(id - 1) % ROOM_COLORS.length],
    };

    const rooms = [...this._state.rooms, newRoom];
    this.set('rooms', rooms);
    this.set('selectedRoomId', id);

    eventBus.emit('room:add', newRoom);
    return newRoom;
  }

  /**
   * Remove a room by id
   * @param {number} id
   */
  removeRoom(id) {
    const rooms = this._state.rooms.filter(r => r.id !== id);
    this.set('rooms', rooms);

    if (this._state.selectedRoomId === id) {
      this.set('selectedRoomId', rooms.length > 0 ? rooms[rooms.length - 1].id : null);
    }

    eventBus.emit('room:remove', { id });
  }

  /**
   * Update a room's vertices
   * @param {number} id
   * @param {Array} vertices
   */
  updateRoomVertices(id, vertices) {
    const rooms = this._state.rooms.map(r =>
      r.id === id ? { ...r, vertices: [...vertices] } : r
    );
    this.set('rooms', rooms);
    eventBus.emit('room:update', { id, vertices });
  }

  /**
   * Get a room by id
   * @param {number} id
   * @returns {Object|undefined}
   */
  getRoom(id) {
    return this._state.rooms.find(r => r.id === id);
  }
}

/** Room color palette — warm industrial tones */
const ROOM_COLORS = [
  { fill: 'rgba(232, 168, 73, 0.08)',  stroke: '#E8A849', name: 'Złoty' },
  { fill: 'rgba(52, 211, 153, 0.08)',  stroke: '#34D399', name: 'Zielony' },
  { fill: 'rgba(96, 165, 250, 0.08)',  stroke: '#60A5FA', name: 'Niebieski' },
  { fill: 'rgba(248, 113, 113, 0.08)', stroke: '#F87171', name: 'Czerwony' },
  { fill: 'rgba(167, 139, 250, 0.08)', stroke: '#A78BFA', name: 'Fioletowy' },
  { fill: 'rgba(251, 191, 36, 0.08)',  stroke: '#FBBF24', name: 'Żółty' },
  { fill: 'rgba(244, 114, 182, 0.08)', stroke: '#F472B6', name: 'Różowy' },
  { fill: 'rgba(45, 212, 191, 0.08)',  stroke: '#2DD4BF', name: 'Turkusowy' },
];

// Singleton instance
const appState = new AppState();
