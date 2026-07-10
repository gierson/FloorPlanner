/**
 * DimensionInput — Parse and format dimension values with mm precision
 *
 * Supported input formats:
 *   "4500"     → 4500 mm
 *   "4500mm"   → 4500 mm
 *   "450cm"    → 4500 mm
 *   "4.5m"     → 4500 mm
 *   "4m50cm"   → 4500 mm
 *   "4m 50"    → 4500 mm (assumes trailing number is cm)
 */
const DimensionInput = {

  /**
   * Parse a dimension string to millimeters
   * @param {string} input - user input string
   * @returns {number|null} value in mm, or null if unparseable
   */
  parse(input) {
    if (typeof input === 'number') return Math.round(input);

    const str = input.trim().toLowerCase().replace(/,/g, '.');
    if (!str) return null;

    // Try patterns from most specific to least

    // Pattern: "4m50cm" or "4m 50cm"
    const mCmMatch = str.match(/^(\d+(?:\.\d+)?)\s*m\s*(\d+(?:\.\d+)?)\s*(?:cm)?$/);
    if (mCmMatch) {
      const m = parseFloat(mCmMatch[1]);
      const cm = parseFloat(mCmMatch[2]);
      return Math.round(m * 1000 + cm * 10);
    }

    // Pattern: "450cm"
    const cmMatch = str.match(/^(\d+(?:\.\d+)?)\s*cm$/);
    if (cmMatch) {
      return Math.round(parseFloat(cmMatch[1]) * 10);
    }

    // Pattern: "4.5m"
    const mMatch = str.match(/^(\d+(?:\.\d+)?)\s*m$/);
    if (mMatch) {
      return Math.round(parseFloat(mMatch[1]) * 1000);
    }

    // Pattern: "4500mm"
    const mmMatch = str.match(/^(\d+(?:\.\d+)?)\s*mm$/);
    if (mmMatch) {
      return Math.round(parseFloat(mmMatch[1]));
    }

    // Pattern: bare number → assume mm
    const bareMatch = str.match(/^(\d+(?:\.\d+)?)$/);
    if (bareMatch) {
      return Math.round(parseFloat(bareMatch[1]));
    }

    return null;
  },

  /**
   * Format mm to a human-readable dimension string
   * @param {number} mm - value in mm
   * @param {string} [mode='auto'] - 'mm' | 'cm' | 'm' | 'auto'
   * @returns {string}
   */
  format(mm, mode = 'auto') {
    if (mode === 'mm' || (mode === 'auto' && mm < 100)) {
      return `${Math.round(mm)} mm`;
    }
    if (mode === 'cm' || (mode === 'auto' && mm < 10000)) {
      const cm = mm / 10;
      return cm % 1 === 0 ? `${cm} cm` : `${cm.toFixed(1)} cm`;
    }
    // meters
    const m = mm / 1000;
    if (m % 1 === 0) return `${m} m`;
    const wholeMm = Math.round(mm) % 1000;
    if (wholeMm === 0) return `${Math.floor(m)} m`;
    const wholeCm = Math.round(wholeMm / 10);
    return `${Math.floor(m)} m ${wholeCm} cm`;
  },

  /**
   * Validate a dimension value
   * @param {number} mm
   * @param {number} [min=1]
   * @param {number} [max=100000]
   * @returns {{valid: boolean, error?: string}}
   */
  validate(mm, min = 1, max = 100000) {
    if (mm === null || isNaN(mm)) {
      return { valid: false, error: 'Nieprawidłowa wartość' };
    }
    if (mm < min) {
      return { valid: false, error: `Minimum ${min} mm` };
    }
    if (mm > max) {
      return { valid: false, error: `Maksimum ${this.format(max)}` };
    }
    return { valid: true };
  },

  /**
   * Create an inline dimension input overlay on the canvas
   *
   * @param {{x:number, y:number}} screenPos - position on screen
   * @param {number} currentValue - current value in mm
   * @param {Function} onConfirm - callback(newValueMm)
   * @param {Function} [onCancel] - callback()
   * @returns {HTMLElement} the input element (for cleanup)
   */
  createOverlayInput(screenPos, currentValue, onConfirm, onCancel) {
    const container = document.getElementById('canvas-container');
    if (!container) return null;

    // Create input element
    const wrapper = document.createElement('div');
    wrapper.className = 'dimension-input-overlay';
    wrapper.style.cssText = `
      position: absolute;
      left: ${screenPos.x - 40}px;
      top: ${screenPos.y - 14}px;
      z-index: 1000;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dimension-input-field';
    input.value = Math.round(currentValue);
    input.placeholder = 'mm';
    input.style.cssText = `
      width: 80px;
      padding: 2px 6px;
      background: rgba(20, 23, 30, 0.95);
      border: 1px solid #E8A849;
      border-radius: 3px;
      color: #E8A849;
      font: 500 11px 'JetBrains Mono', monospace;
      text-align: center;
      outline: none;
    `;

    wrapper.appendChild(input);
    container.appendChild(wrapper);

    // Select all text
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    const cleanup = () => {
      if (wrapper.parentElement) wrapper.remove();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const parsed = this.parse(input.value);
        const validation = this.validate(parsed);
        if (validation.valid) {
          cleanup();
          onConfirm(parsed);
        } else {
          input.style.borderColor = '#F87171';
          input.title = validation.error;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        if (onCancel) onCancel();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const parsed = this.parse(input.value);
        const validation = this.validate(parsed);
        if (validation.valid) {
          cleanup();
          onConfirm(parsed, 'tab'); // 'tab' signals "move to next dimension"
        }
      }
    });

    // Close on click outside
    const outsideHandler = (e) => {
      if (!wrapper.contains(e.target)) {
        document.removeEventListener('mousedown', outsideHandler);
        const parsed = this.parse(input.value);
        const validation = this.validate(parsed);
        if (validation.valid) {
          cleanup();
          onConfirm(parsed);
        } else {
          cleanup();
          if (onCancel) onCancel();
        }
      }
    };
    setTimeout(() => document.addEventListener('mousedown', outsideHandler), 100);

    return wrapper;
  },
};
