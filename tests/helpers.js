/**
 * Test Helpers — VM Sandbox for loading vanilla JS globals
 * 
 * Creates a Node.js vm context that simulates enough of the browser
 * environment for our source files to load. Source files are loaded
 * in the same dependency order as in index.html.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Source files in dependency order (matching index.html script tags)
// Only include files that are testable (pure logic, no DOM needed)
const SOURCE_FILES = [
  'js/event-bus.js',
  'js/state.js',
  'js/command-manager.js',
  'js/data/presets.js',
  'js/engine/geometry.js',
  'js/engine/polygon-clip.js',
  'js/data/wall-graph.js',
  'js/data/project-manager.js',
  'js/tools/snap-system.js',
  'js/tools/dimension-input.js',
  'js/tools/wall-tool.js',
  'js/tools/door-tool.js',
  'js/commands/wall-commands.js',
  'js/engine/grid-generator.js',
  'js/engine/herringbone-generator.js',
  'js/engine/waste-calculator.js',
  'js/engine/layout-engine.js',
  'js/engine/layout-scorer.js',
  'js/engine/optimizer.js',
  'js/engine/room-decomposer.js',
];

/**
 * Create a VM sandbox with browser stubs and loaded source files
 * @returns {vm.Context} sandbox with all globals available
 */
function createSandbox() {
  const projectRoot = path.join(__dirname, '..');

  // Minimal browser stubs — enough for our source files to load
  const browserStubs = {
    // window/document stubs
    window: {},
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: () => {},
        removeChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
        getContext: () => null,
        remove: () => {},
      }),
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      body: {
        appendChild: () => {},
        removeChild: () => {},
        style: {},
      },
    },
    localStorage: (function() {
      let store = {};
      return {
        getItem: (key) => store.hasOwnProperty(key) ? store[key] : null,
        setItem: (key, val) => { store[key] = String(val); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        get length() { return Object.keys(store).length; },
        key: (i) => Object.keys(store)[i] || null,
      };
    })(),
    navigator: { userAgent: 'node-test' },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    Math,
    JSON,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Error,
    TypeError,
    RangeError,
    Infinity,
    NaN,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    undefined,
  };

  // Self-reference for `window.X = ...` patterns
  browserStubs.window = browserStubs;

  const sandbox = vm.createContext(browserStubs);

  // Load source files into sandbox
  for (const relPath of SOURCE_FILES) {
    const absPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(absPath)) {
      console.warn(`  ⚠ Source file not found: ${relPath} — skipping`);
      continue;
    }
    const code = fs.readFileSync(absPath, 'utf-8');
    try {
      vm.runInContext(code, sandbox, { filename: relPath });
    } catch (err) {
      console.error(`  ✗ Error loading ${relPath}: ${err.message}`);
      throw err;
    }
  }

  return sandbox;
}

module.exports = { createSandbox, SOURCE_FILES };
