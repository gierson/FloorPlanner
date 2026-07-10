/**
 * Material Presets — built-in and user-saved presets
 */
const MATERIAL_PRESETS = [
  // Panele laminowane
  { id: 'lam-1380x193', name: 'Panel 1380 × 193 mm', category: 'Panele laminowane', length: 1380, width: 193, defaultGap: 10, defaultStagger: 'third' },
  { id: 'lam-1380x191', name: 'Panel 1380 × 191 mm', category: 'Panele laminowane', length: 1380, width: 191, defaultGap: 10, defaultStagger: 'third' },
  { id: 'lam-1285x192', name: 'Panel 1285 × 192 mm', category: 'Panele laminowane', length: 1285, width: 192, defaultGap: 10, defaultStagger: 'third' },
  { id: 'lam-1200x190', name: 'Panel 1200 × 190 mm', category: 'Panele laminowane', length: 1200, width: 190, defaultGap: 10, defaultStagger: 'third' },

  // Deski drewniane
  { id: 'drw-2200x148', name: 'Deska 2200 × 148 mm', category: 'Deski drewniane', length: 2200, width: 148, defaultGap: 12, defaultStagger: 'third' },
  { id: 'drw-1820x145', name: 'Deska 1820 × 145 mm', category: 'Deski drewniane', length: 1820, width: 145, defaultGap: 12, defaultStagger: 'third' },

  // Płytki ceramiczne
  { id: 'plt-600x600', name: 'Płytka 600 × 600 mm', category: 'Płytki ceramiczne', length: 600, width: 600, defaultGap: 8, defaultStagger: 'none' },
  { id: 'plt-600x300', name: 'Płytka 600 × 300 mm', category: 'Płytki ceramiczne', length: 600, width: 300, defaultGap: 8, defaultStagger: 'half' },
  { id: 'plt-300x300', name: 'Płytka 300 × 300 mm', category: 'Płytki ceramiczne', length: 300, width: 300, defaultGap: 8, defaultStagger: 'none' },

  // Płytki wielkoformatowe
  { id: 'plt-1200x600', name: 'Płytka 1200 × 600 mm', category: 'Płytki wielkoformatowe', length: 1200, width: 600, defaultGap: 8, defaultStagger: 'half' },
  { id: 'plt-1200x1200', name: 'Płytka 1200 × 1200 mm', category: 'Płytki wielkoformatowe', length: 1200, width: 1200, defaultGap: 8, defaultStagger: 'none' },
];

/**
 * Presets suited for the herringbone pattern.
 * Short boards with length/width ratio ≥ 3 — typical proportions
 * for jodełka; standard long panels (e.g. 1380×193) look overly
 * stretched in a 45° herringbone.
 */
const HERRINGBONE_PRESETS = [
  { id: 'hb-625x125', name: 'Jodełka 625 × 125 mm', category: 'Jodełka', length: 625, width: 125, defaultGap: 10, defaultStagger: 'none' },
  { id: 'hb-720x120', name: 'Jodełka 720 × 120 mm', category: 'Jodełka', length: 720, width: 120, defaultGap: 10, defaultStagger: 'none' },
  { id: 'hb-600x150', name: 'Jodełka 600 × 150 mm', category: 'Jodełka', length: 600, width: 150, defaultGap: 10, defaultStagger: 'none' },
  { id: 'hb-490x70', name: 'Parkiet jodełka 490 × 70 mm', category: 'Jodełka', length: 490, width: 70, defaultGap: 12, defaultStagger: 'none' },
];

/**
 * Get all presets (built-in + herringbone + user-saved)
 * @returns {Array}
 */
function getAllPresets() {
  const userPresets = loadUserPresets();
  return [...MATERIAL_PRESETS, ...HERRINGBONE_PRESETS, ...userPresets];
}

/**
 * Get presets suitable for a laying pattern.
 * User presets are always included — custom sizes are the user's call.
 * @param {string} pattern - 'straight' | 'herringbone'
 * @returns {Array}
 */
function getPresetsForPattern(pattern) {
  const builtIn = pattern === 'herringbone' ? HERRINGBONE_PRESETS : MATERIAL_PRESETS;
  return [...builtIn, ...loadUserPresets()];
}

/**
 * Find a preset by id
 * @param {string} id
 * @returns {Object|undefined}
 */
function findPreset(id) {
  return getAllPresets().find(p => p.id === id);
}

/**
 * Save a user preset to localStorage
 * @param {Object} preset - { name, length, width }
 * @returns {Object} The saved preset with id
 */
function saveUserPreset(preset) {
  const userPresets = loadUserPresets();
  const id = `user-${Date.now()}`;
  const newPreset = {
    id,
    name: preset.name,
    category: 'Własne',
    length: preset.length,
    width: preset.width,
    defaultGap: preset.defaultGap || 10,
    defaultStagger: preset.defaultStagger || 'third',
    isCustom: true,
  };
  userPresets.push(newPreset);

  try {
    localStorage.setItem('floorplanner_presets', JSON.stringify(userPresets));
  } catch (e) {
    console.warn('[Presets] Could not save to localStorage:', e);
  }

  return newPreset;
}

/**
 * Load user presets from localStorage
 * @returns {Array}
 */
function loadUserPresets() {
  try {
    const data = localStorage.getItem('floorplanner_presets');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Delete a user preset
 * @param {string} id
 */
function deleteUserPreset(id) {
  const userPresets = loadUserPresets().filter(p => p.id !== id);
  try {
    localStorage.setItem('floorplanner_presets', JSON.stringify(userPresets));
  } catch (e) {
    console.warn('[Presets] Could not save to localStorage:', e);
  }
}
