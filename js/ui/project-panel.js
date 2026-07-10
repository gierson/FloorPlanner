/**
 * ProjectPanel — UI for project management modal
 * @description Handles project list, save/load/export/import actions,
 *              dirty indicator, and toast notifications.
 */
class ProjectPanel {
  /**
   * @param {ProjectManager} pm - The project manager instance
   */
  constructor(pm) {
    this.pm = pm;
    this._setupModal();
    this._setupToolbarButton();
    this._setupActions();
    this._setupDirtyIndicator();
    this._setupToast();
  }

  // ═══════════════════════════════════════════════════════════
  //  MODAL — Open / Close / Render
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _setupModal() {
    const modal = document.getElementById('project-modal');
    const closeBtn = document.getElementById('project-modal-close');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.close();
      });
    }
  }

  /** Open the project modal */
  open() {
    const modal = document.getElementById('project-modal');
    if (modal) {
      this._renderList();
      modal.classList.add('visible');
    }
  }

  /** Close the project modal */
  close() {
    const modal = document.getElementById('project-modal');
    if (modal) modal.classList.remove('visible');
  }

  /** @private */
  _setupToolbarButton() {
    const btn = document.getElementById('btn-project');
    if (btn) {
      btn.addEventListener('click', () => this.open());
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  ACTIONS — New, Save, SaveAs, Import, Export
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _setupActions() {
    // New project
    const newBtn = document.getElementById('btn-project-new');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        if (this.pm.isDirty) {
          if (!confirm('Masz niezapisane zmiany. Czy na pewno chcesz utworzyć nowy projekt?')) return;
        }
        this.pm.newProject();
        this._updateProjectName();
        this._renderList();
        this._toast('Utworzono nowy projekt', 'success');
      });
    }

    // Save
    const saveBtn = document.getElementById('btn-project-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._save());
    }

    // Save As
    const saveAsBtn = document.getElementById('btn-project-save-as');
    if (saveAsBtn) {
      saveAsBtn.addEventListener('click', () => this._saveAs());
    }

    // Import
    const importBtn = document.getElementById('btn-project-import');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        this.pm.importFromFile().then((ok) => {
          if (ok) {
            this._updateProjectName();
            this._renderList();
            this.close();
            this._toast('Projekt zaimportowany', 'success');
          }
        });
      });
    }

    // Export
    const exportBtn = document.getElementById('btn-project-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.pm.exportToFile();
        this._toast('Projekt wyeksportowany jako .fp', 'success');
      });
    }

    // Listen for project errors
    eventBus.on('project:error', (data) => {
      this._toast(data.message, 'error');
    });
  }

  /** @private */
  _save() {
    if (this.pm.currentProjectId) {
      // Update existing
      this.pm.saveToStorage();
      this._updateProjectName();
      this._renderList();
      this._toast('Zapisano', 'success');
    } else {
      // First save — prompt for name
      this._saveAs();
    }
  }

  /** @private */
  _saveAs() {
    const name = prompt('Nazwa projektu:', this.pm.currentProjectName || 'Nowy projekt');
    if (!name) return;
    this.pm.currentProjectId = null; // Force new entry
    const id = this.pm.saveToStorage(name);
    if (id) {
      this._updateProjectName();
      this._renderList();
      this._toast(`Zapisano jako "${name}"`, 'success');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PROJECT LIST — Render cards with load/rename/delete
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _renderList() {
    const listEl = document.getElementById('project-list');
    const emptyEl = document.getElementById('project-list-empty');
    if (!listEl) return;

    const projects = this.pm.listFromStorage();

    // Clear existing cards
    listEl.querySelectorAll('.project-card').forEach(el => el.remove());

    if (projects.length === 0) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    // Sort by updatedAt descending
    projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    for (const proj of projects) {
      const card = document.createElement('div');
      card.className = 'project-card';
      if (proj.id === this.pm.currentProjectId) {
        card.classList.add('active');
      }
      card.dataset.projectId = proj.id;

      const date = proj.updatedAt
        ? new Date(proj.updatedAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

      card.innerHTML = `
        <div class="project-card__info">
          <div class="project-card__name">${this._escapeHtml(proj.name)}</div>
          <div class="project-card__date">${date}</div>
        </div>
        <div class="project-card__actions">
          <button class="project-card__btn" data-action="rename" title="Zmień nazwę">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="project-card__btn project-card__btn--delete" data-action="delete" title="Usuń">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
              <path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
              <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      `;

      // Click card to load
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return; // skip action buttons
        if (this.pm.isDirty) {
          if (!confirm('Masz niezapisane zmiany. Czy chcesz wczytać inny projekt?')) return;
        }
        this.pm.loadFromStorage(proj.id);
        this._updateProjectName();
        this._renderList();
        this.close();
        this._toast(`Wczytano "${proj.name}"`, 'success');
      });

      // Rename
      card.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt('Nowa nazwa:', proj.name);
        if (newName && newName !== proj.name) {
          this.pm.renameInStorage(proj.id, newName);
          this._updateProjectName();
          this._renderList();
        }
      });

      // Delete
      card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Usunąć projekt "${proj.name}"?`)) {
          this.pm.deleteFromStorage(proj.id);
          this._renderList();
          this._toast(`Usunięto "${proj.name}"`, 'success');
        }
      });

      listEl.appendChild(card);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  DIRTY INDICATOR
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _setupDirtyIndicator() {
    const indicator = document.getElementById('dirty-indicator');

    eventBus.on('project:dirty', (isDirty) => {
      if (indicator) indicator.style.display = isDirty ? '' : 'none';
    });

    // Mark dirty on graph changes
    eventBus.on('command:execute', () => {
      this.pm.markDirty();
    });

    // Also mark dirty on command undo/redo
    eventBus.on('command:undo', () => {
      this.pm.markDirty();
    });
    eventBus.on('command:redo', () => {
      this.pm.markDirty();
    });

    // Update project name display on project events
    eventBus.on('project:loaded', () => this._updateProjectName());
    eventBus.on('project:saved', () => this._updateProjectName());
    eventBus.on('project:new', () => this._updateProjectName());
  }

  /** @private Update toolbar project name display */
  _updateProjectName() {
    const nameEl = document.getElementById('project-name');
    const indicator = document.getElementById('dirty-indicator');
    if (nameEl) nameEl.textContent = this.pm.currentProjectName || 'Nowy projekt';
    if (indicator) indicator.style.display = this.pm.isDirty ? '' : 'none';
  }

  // ═══════════════════════════════════════════════════════════
  //  TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _setupToast() {
    this._toastEl = null;
    this._toastTimer = null;
  }

  /**
   * Show a temporary toast notification
   * @param {string} message
   * @param {'success'|'error'} [type='success']
   */
  _toast(message, type) {
    type = type || 'success';

    // Remove existing toast
    if (this._toastEl) {
      this._toastEl.remove();
      clearTimeout(this._toastTimer);
    }

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    this._toastEl = el;

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('visible');
      });
    });

    // Auto-hide after 3s
    this._toastTimer = setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
      this._toastEl = null;
    }, 3000);
  }

  // ═══════════════════════════════════════════════════════════
  //  KEYBOARD SHORTCUTS (Ctrl+S, Ctrl+O)
  // ═══════════════════════════════════════════════════════════

  /**
   * Handle keyboard shortcut
   * @param {KeyboardEvent} e
   * @returns {boolean} Whether the key was handled
   */
  handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this._save();
        return true;
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        this.open();
        return true;
      }
    }
    return false;
  }

  /** @private */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
