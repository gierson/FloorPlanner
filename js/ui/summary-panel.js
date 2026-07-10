/**
 * SummaryPanel — Displays optimization results and warnings
 */
class SummaryPanel {
  constructor() {
    this._setupToggle();
    this._setupListeners();
  }

  /** Toggle open/close */
  _setupToggle() {
    const toggle = document.getElementById('summary-toggle');
    const panel = document.getElementById('summary-panel');
    if (toggle && panel) {
      toggle.addEventListener('click', () => {
        const isOpen = panel.classList.contains('open');
        panel.classList.toggle('open', !isOpen);
        panel.classList.toggle('closed', isOpen);
        appState.set('ui.summaryOpen', !isOpen);
      });
    }
  }

  /** Listen for optimization results */
  _setupListeners() {
    eventBus.on('optimize:done', (data) => {
      this.update(data);
      // Auto-open panel
      const panel = document.getElementById('summary-panel');
      if (panel) {
        panel.classList.add('open');
        panel.classList.remove('closed');
      }
    });

    eventBus.on('layout:clear', () => {
      this.clear();
    });
  }

  /**
   * Update summary display with optimization results
   * @param {Object} data - { aggregateStats, warnings }
   */
  update(data) {
    const stats = data.aggregateStats;

    this._animateValue('summary-area', `${stats.totalArea.toFixed(2)} m²`);

    // Boards to buy — herringbone reports A/B (mirror-image) boards
    const panelsText = stats.panelsNeededA != null
      ? `${stats.panelsNeeded} (A: ${stats.panelsNeededA} + B: ${stats.panelsNeededB})`
      : `${stats.panelsNeeded}`;
    this._animateValue('summary-panels', panelsText);
    this._animateValue('summary-cuts', `${stats.totalCuts}`);

    const wasteEl = document.getElementById('summary-waste');
    if (wasteEl) {
      wasteEl.textContent = `${stats.totalWaste.toFixed(2)} m² (${stats.wastePercent.toFixed(1)}%)`;
      wasteEl.className = 'summary-value';
      if (stats.wastePercent > 15) {
        wasteEl.classList.add('warning');
      } else {
        wasteEl.classList.add('success');
      }
    }

    // Warnings
    const warningsEl = document.getElementById('summary-warnings');
    if (warningsEl) {
      warningsEl.innerHTML = '';

      if (data.warnings.length === 0) {
        const badge = document.createElement('span');
        badge.className = 'warning-badge success';
        badge.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Brak problemów — wszystkie docinki spełniają wymagania
        `;
        warningsEl.appendChild(badge);
      } else {
        data.warnings.forEach(w => {
          const badge = document.createElement('span');
          badge.className = 'warning-badge error';
          badge.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            ${w.roomName ? w.roomName + ': ' : ''}${w.message}
          `;
          warningsEl.appendChild(badge);
        });
      }
    }
  }

  /** Clear summary display */
  clear() {
    ['summary-area', 'summary-panels', 'summary-cuts'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    const wasteEl = document.getElementById('summary-waste');
    if (wasteEl) {
      wasteEl.textContent = '— m²';
      wasteEl.className = 'summary-value';
    }
    const warningsEl = document.getElementById('summary-warnings');
    if (warningsEl) warningsEl.innerHTML = '';
  }

  /**
   * Animate value update
   * @private
   */
  _animateValue(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.style.opacity = '0';
    el.style.transform = 'translateY(4px)';

    requestAnimationFrame(() => {
      el.textContent = newValue;
      el.style.transition = 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }
}
