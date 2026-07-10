/**
 * FloorPlanner Test Runner
 * 
 * Minimal test runner for vanilla JS globals (no ES modules).
 * Uses Node.js vm module to load source files into a shared sandbox
 * and executes test files with describe/it/assert API.
 * 
 * Usage:
 *   node tests/run.js            — run all tests once
 *   node tests/run.js --watch    — watch for changes and re-run
 */

const fs = require('fs');
const path = require('path');

// ─── Colors ──────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// ─── Test Collection ─────────────────────────────────────────────────
let suites = [];
let currentSuite = null;

function describe(name, fn) {
  const suite = { name, tests: [], beforeEachFn: null };
  currentSuite = suite;
  suites.push(suite);
  fn();
  currentSuite = null;
}

function it(name, fn) {
  if (!currentSuite) throw new Error('it() must be called inside describe()');
  currentSuite.tests.push({ name, fn });
}

function beforeEach(fn) {
  if (!currentSuite) throw new Error('beforeEach() must be called inside describe()');
  currentSuite.beforeEachFn = fn;
}

// ─── Assertions ──────────────────────────────────────────────────────
const assert = {
  equal(actual, expected, msg) {
    if (actual !== expected) {
      throw new AssertionError(
        msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  },

  notEqual(actual, expected, msg) {
    if (actual === expected) {
      throw new AssertionError(
        msg || `Expected value to NOT equal ${JSON.stringify(expected)}`
      );
    }
  },

  closeTo(actual, expected, epsilon = 0.5, msg) {
    if (Math.abs(actual - expected) > epsilon) {
      throw new AssertionError(
        msg || `Expected ${actual} to be close to ${expected} (±${epsilon})`
      );
    }
  },

  deepEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new AssertionError(
        msg || `Deep equal failed.\n  Actual:   ${a}\n  Expected: ${e}`
      );
    }
  },

  ok(value, msg) {
    if (!value) {
      throw new AssertionError(msg || `Expected truthy value, got ${JSON.stringify(value)}`);
    }
  },

  notOk(value, msg) {
    if (value) {
      throw new AssertionError(msg || `Expected falsy value, got ${JSON.stringify(value)}`);
    }
  },

  throws(fn, msg) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) {
      throw new AssertionError(msg || 'Expected function to throw');
    }
  },

  greaterThan(actual, expected, msg) {
    if (actual <= expected) {
      throw new AssertionError(
        msg || `Expected ${actual} to be greater than ${expected}`
      );
    }
  },

  lessThan(actual, expected, msg) {
    if (actual >= expected) {
      throw new AssertionError(
        msg || `Expected ${actual} to be less than ${expected}`
      );
    }
  },

  arrayLength(arr, expected, msg) {
    if (!Array.isArray(arr) || arr.length !== expected) {
      throw new AssertionError(
        msg || `Expected array of length ${expected}, got ${Array.isArray(arr) ? arr.length : 'not an array'}`
      );
    }
  },
};

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

// ─── Test Discovery ──────────────────────────────────────────────────
function findTestFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(full));
    } else if (entry.name.endsWith('.test.js')) {
      files.push(full);
    }
  }
  return files.sort();
}

// ─── Runner ──────────────────────────────────────────────────────────
function runTests() {
  const testsDir = path.join(__dirname);
  const testFiles = findTestFiles(testsDir);

  if (testFiles.length === 0) {
    console.log(`${c.yellow}No test files found.${c.reset}`);
    return true;
  }

  // Load source code into sandbox
  const { createSandbox } = require('./helpers');
  const sandbox = createSandbox();

  // Inject test API into sandbox
  sandbox.describe = describe;
  sandbox.it = it;
  sandbox.beforeEach = beforeEach;
  sandbox.assert = assert;

  // Reset suites
  suites = [];

  // Load and execute test files
  const vm = require('vm');
  for (const file of testFiles) {
    const code = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(path.join(__dirname, '..'), file);
    try {
      vm.runInContext(code, sandbox, { filename: relPath });
    } catch (err) {
      console.log(`\n${c.red}✗ Error loading ${relPath}:${c.reset}`);
      console.log(`  ${c.dim}${err.message}${c.reset}`);
      return false;
    }
  }

  // Execute collected suites
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const failures = [];
  const startTime = Date.now();

  for (const suite of suites) {
    console.log(`\n${c.cyan}${c.bold}  ${suite.name}${c.reset}`);

    for (const test of suite.tests) {
      try {
        if (suite.beforeEachFn) suite.beforeEachFn();
        test.fn();
        totalPassed++;
        console.log(`  ${c.green}  ✓${c.reset} ${c.dim}${test.name}${c.reset}`);
      } catch (err) {
        totalFailed++;
        console.log(`  ${c.red}  ✗ ${test.name}${c.reset}`);
        console.log(`    ${c.dim}${err.message}${c.reset}`);
        failures.push({ suite: suite.name, test: test.name, error: err.message });
      }
    }
  }

  const elapsed = Date.now() - startTime;

  // Summary
  console.log(`\n${c.bold}  ─────────────────────────────────${c.reset}`);
  if (totalFailed === 0) {
    console.log(`  ${c.green}${c.bold}✓ ${totalPassed} passed${c.reset} ${c.dim}(${elapsed}ms)${c.reset}`);
  } else {
    console.log(`  ${c.green}${totalPassed} passed${c.reset}  ${c.red}${c.bold}${totalFailed} failed${c.reset} ${c.dim}(${elapsed}ms)${c.reset}`);
    console.log();
    for (const f of failures) {
      console.log(`  ${c.red}✗ ${f.suite} › ${f.test}${c.reset}`);
      console.log(`    ${c.dim}${f.error}${c.reset}`);
    }
  }
  console.log();

  return totalFailed === 0;
}

// ─── Watch Mode ──────────────────────────────────────────────────────
function watchMode() {
  const watchDirs = [
    path.join(__dirname, '..', 'js'),
    path.join(__dirname),
  ];

  console.log(`${c.cyan}${c.bold}  Watching for changes...${c.reset}`);
  console.log(`${c.dim}  Dirs: ${watchDirs.map(d => path.relative(path.join(__dirname, '..'), d)).join(', ')}${c.reset}\n`);

  let debounce = null;
  const rerun = () => {
    console.clear();
    console.log(`${c.cyan}${c.bold}  ▶ Re-running tests...${c.reset}`);
    
    // Clear require cache for helpers (so source files are re-read)
    delete require.cache[require.resolve('./helpers')];
    
    runTests();
    console.log(`${c.dim}  Watching for changes...${c.reset}`);
  };

  for (const dir of watchDirs) {
    if (fs.existsSync(dir)) {
      fs.watch(dir, { recursive: true }, (event, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        clearTimeout(debounce);
        debounce = setTimeout(rerun, 200);
      });
    }
  }

  // Initial run
  runTests();
}

// ─── Main ────────────────────────────────────────────────────────────
if (process.argv.includes('--watch')) {
  watchMode();
} else {
  const success = runTests();
  process.exit(success ? 0 : 1);
}
