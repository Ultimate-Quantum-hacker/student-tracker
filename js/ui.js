/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — ui.js
   Handles all DOM manipulation and UI logic.
   ═══════════════════════════════════════════════ */

import app from './state.js';
import { auth } from './firebase.js';
import { normalizeUserRole, isDeveloperAccountEmail } from './auth.js';

// DOM Node References
app.dom = {};
const domIds = {
  backupBtn: 'backup-btn',
  restoreBtn: 'restore-btn',
  restoreInput: 'restore-input',
  createSnapshotBtn: 'create-snapshot-btn',
  snapshotManagerBtn: 'snapshot-manager-btn',
  snapshotModal: 'snapshot-modal',
  snapshotList: 'snapshot-list',
  snapshotCloseBtn: 'snapshot-close-btn',
  themeToggle: 'themeToggle',
  resetBtn: 'reset-btn',
  resetModal: 'reset-modal',
  resetConfirmBtn: 'reset-confirm-btn',
  resetCancelBtn: 'reset-cancel-btn',
  backupStatus: 'backupStatus',
  systemToolsBackupStatus: 'system-tools-backup-status',
  systemToolsBackupStatusText: 'system-tools-backup-status-text',
  systemCreateRestorePointBtn: 'system-create-restore-point-btn',
  systemRestorePointsBtn: 'system-restore-points-btn',
  systemExportDataBtn: 'system-export-data-btn',
  systemImportDataBtn: 'system-import-data-btn',
  systemThemeToggleBtn: 'system-theme-toggle-btn',
  systemResetBtn: 'system-reset-btn',
  adminDashboardBtn: 'admin-dashboard-btn',
  form: 'add-student-form',
  classDropdown: 'class-dropdown',
  classDropdownToggle: 'class-dropdown-toggle',
  classDropdownMenu: 'class-dropdown-menu',
  classDropdownValue: 'class-dropdown-value',
  classPrevBtn: 'class-prev-btn',
  classNextBtn: 'class-next-btn',
  createClassBtn: 'create-class-btn',
  deleteClassBtn: 'delete-class-btn',
  classNameDisplay: 'class-name-display',
  nameInput: 'student-name-input',
  studentRosterSearchInput: 'student-roster-search-input',
  studentCount: 'student-count',
  trashList: 'trash-list',
  trashRestoreAllBtn: 'trash-restore-all-btn',
  trashEmptyBtn: 'trash-empty-btn',
  trashRetentionHint: 'trash-retention-hint',
  searchInput: 'search-input',
  scoreStudentSelect: 'score-student-select',
  scoreMockSelect: 'scoreMockSelect',
  chartStudentSelect: 'chart-student-select',
  bulkMockSelect: 'bulkMockSelect',
  studentList: 'student-list',
  resultsBody: 'results-body',
  resultsHeadRow1: 'results-head-row-1',
  resultsHeadRow2: 'results-head-row-2',
  emptyMsg: 'empty-msg',
  classSummaryCards: 'class-summary-cards',
  classInsightBox: 'class-insight-box',
  toast: 'toast',
  mockList: 'mockList',
  addMockForm: 'addMockForm',
  mockNameInput: 'mockNameInput',
  subjectList: 'subjectList',
  addSubjectForm: 'addSubjectForm',
  subjectNameInput: 'subjectNameInput',
  statTotalStudents: 'stat-total-students',
  statClassAvg: 'stat-class-avg',
  statPassRate: 'stat-pass-rate',
  statFailRate: 'stat-fail-rate',
  statStrongCount: 'stat-strong-count',
  statGoodCount: 'stat-good-count',
  statAverageCount: 'stat-average-count',
  statBorderlineCount: 'stat-borderline-count',
  statAtRiskCount: 'stat-at-risk-count',
  statAtRiskCountSummary: 'stat-at-risk-count-summary',
  dashboardPerformanceSummary: 'dashboard-performance-summary',
  dashboardPerformanceChart: 'dashboard-performance-chart',
  classChart: 'class-chart',
  classChartPlaceholder: 'class-chart-placeholder',
  adminReadonlyBanner: 'admin-readonly-banner',
  adminReadonlyLabel: 'admin-readonly-label',
  canvas: 'progress-chart',
  chartPlaceholder: 'chart-placeholder',
  heatmapHead: 'heatmapHead',
  heatmapBody: 'heatmapBody',
  editModal: 'edit-modal',
  editInput: 'edit-name-input',
  editSaveBtn: 'edit-save-btn',
  editCancelBtn: 'edit-cancel-btn',
  deleteModal: 'delete-modal',
  deleteConfirmMsg: 'delete-confirm-msg',
  deleteConfirmBtn: 'delete-confirm-btn',
  deleteCancelBtn: 'delete-cancel-btn',
  bulkImportBtn: 'bulk-import-btn',
  bulkImportModal: 'bulk-import-modal',
  bulkImportTextarea: 'bulk-import-textarea',
  bulkImportConfirmBtn: 'bulk-import-confirm-btn',
  bulkImportCancelBtn: 'bulk-import-cancel-btn',
  notesModal: 'notes-modal',
  notesModalTitle: 'notes-modal-title',
  notesTextarea: 'notes-textarea',
  notesSaveBtn: 'notes-save-btn',
  notesCancelBtn: 'notes-cancel-btn',
  bulkScoreBtn: 'bulk-score-btn',
  bulkScoreModal: 'bulk-score-modal',
  bulkScoreBody: 'bulkScoreBody',
  bulkScoreSaveBtn: 'bulk-score-save-btn',
  bulkScoreCancelBtn: 'bulk-score-cancel-btn',
  reportModal: 'report-modal',
  reportContainer: 'report-card-container',
  reportPrintBtn: 'report-print-btn',
  reportExportPdfBtn: 'report-export-pdf-btn',
  reportExportAllPdfBtn: 'report-export-all-pdf-btn',
  reportExportStatus: 'report-export-status',
  reportCloseBtn: 'report-close-btn',
  exportCsvBtn: 'export-csv-btn',
  exportExcelBtn: 'export-excel-btn',
  printBtn: 'print-btn',
  saveScoresBtn: 'save-scores-btn',
  dynamicSubjectFields: 'dynamicSubjectFields',
  bulkScoreHead: 'bulkScoreHead',
  performanceCategorySelect: 'performance-category-select',
  performanceCategoryCounts: 'performance-category-counts',
  performanceFilteredList: 'performance-filtered-list',
  performanceInterventionNeededList: 'performance-intervention-needed-list',
  authRoleBadge: 'auth-role-badge'
};

const FEATURE_ACCESS_RULES = {
  developerTools: ['developer'],
  exportData: ['developer'],
  importData: ['developer'],
  bulkImport: ['teacher', 'admin', 'developer'],
  restorePoints: ['developer'],
  resetSystem: ['developer'],
  adminPanel: ['admin', 'developer']
};

const FEATURE_ACCESS_MESSAGES = {
  developerTools: 'Access restricted: Developer only',
  exportData: 'Access restricted: Developer only',
  importData: 'Access restricted: Developer only',
  bulkImport: 'Access restricted: Teacher, Admin, or Developer only',
  restorePoints: 'Access restricted: Developer only',
  resetSystem: 'Access restricted: Developer only',
  adminPanel: 'Access restricted: Admin or Developer only'
};

const ui = {
    isReportExporting: false,
    hasPromptedForMissingClass: false,
    hasBoundClassDropdownEvents: false,
    hasBoundAccessGuardEvents: false,
    toastTimer: null,
    readOnlyToastTimer: null,
    trashRetentionDays: 3,

    init: function () {
      console.log('UI init running');
      this.initDOM();
      if (app.applyTheme) {
        app.applyTheme();
      }
    },
    
    initDOM: function () {
      console.log("Initializing DOM references...");
      Object.keys(domIds).forEach(k => {
        const el = document.getElementById(domIds[k]);
        if (!el) {
          console.warn(`DOM element not found: ${domIds[k]} (key: ${k})`);
        }
        app.dom[k] = el;
      });
    },

    getCurrentRole: function () {
      return normalizeUserRole(app.state.currentUserRole);
    },

    formatRoleLabel: function (role) {
      const normalizedRole = normalizeUserRole(role);
      if (normalizedRole === 'developer') return 'Developer';
      if (normalizedRole === 'admin') return 'Admin';
      return 'Teacher';
    },

    canAccess: function (feature) {
      const requiredRoles = FEATURE_ACCESS_RULES[feature];
      if (!requiredRoles) {
        return true;
      }

      const activeEmail = String(app.state.authUser?.email || auth?.currentUser?.email || '').trim();
      if (isDeveloperAccountEmail(activeEmail)) {
        return true;
      }

      if (!app.state.isRoleResolved) {
        return false;
      }

      return requiredRoles.includes(this.getCurrentRole());
    },

    getAccessDeniedMessage: function (feature) {
      if (!app.state.isRoleResolved) {
        return 'Permissions are still loading';
      }

      return FEATURE_ACCESS_MESSAGES[feature] || 'You do not have permission for this action';
    },

    requireAccess: function (feature) {
      if (this.canAccess(feature)) {
        return true;
      }

      const reason = this.getAccessDeniedMessage(feature);
      this.showToast(`Access denied: ${reason}`);
      return false;
    },

    isReadOnlyRoleContext: function () {
      return typeof app.isReadOnlyRoleContext === 'function' && app.isReadOnlyRoleContext();
    },

    canCurrentRoleWrite: function () {
      if (typeof app.canCurrentRoleWrite === 'function') {
        return app.canCurrentRoleWrite();
      }

      return !this.isReadOnlyRoleContext();
    },

    getReadOnlyModeLabel: function () {
      const ownerName = typeof app.getCurrentClassOwnerName === 'function'
        ? String(app.getCurrentClassOwnerName() || '').trim()
        : '';
      const className = String(app.state.currentClassName || '').trim();
      const contextLabel = [className, ownerName].filter(Boolean).join(' - ');
      if (contextLabel) {
        return `Admin cannot modify data (Read-only mode): ${contextLabel}.`;
      }
      return 'Admin cannot modify data (Read-only mode).';
    },

    ensureWritableAction: function (actionLabel = 'modify data') {
      if (this.canCurrentRoleWrite()) {
        return true;
      }

      this.showReadOnlyRoleToast(actionLabel);
      return false;
    },

    resolveClassContextErrorMessage: function (error, fallbackMessage = 'Please select a class and try again.') {
      const code = String(error?.code || '').trim().toLowerCase();
      const message = String(error?.message || '').trim();
      if (code === 'app/missing-class-context' || code === 'app/missing-class-id') {
        return 'Select a class before continuing.';
      }
      if (code === 'app/missing-class-owner-context' || code === 'app/missing-owner-id') {
        return 'Class owner context is missing. Re-select the class and try again.';
      }
      if (code === 'app/class-not-found') {
        return 'Selected class no longer exists. Refresh classes and try again.';
      }
      if (code === 'app/invalid-owner') {
        return 'Selected class owner is invalid. Re-select the class and try again.';
      }
      if (message) {
        return message;
      }
      return fallbackMessage;
    },

    ensureWritableClassAction: function (actionLabel = 'modify data', operationLabel = 'modify data') {
      if (!this.ensureWritableAction(actionLabel)) {
        return false;
      }

      if (typeof app.ensureWritableClassContext !== 'function') {
        return true;
      }

      try {
        app.ensureWritableClassContext(operationLabel);
        return true;
      } catch (error) {
        const message = this.resolveClassContextErrorMessage(error, `Unable to ${String(operationLabel || 'continue').trim()}.`);
        this.showToast(message);
        return false;
      }
    },

    setReadOnlyControlState: function (elements = [], isReadOnly = false) {
      const lockMessage = this.getReadOnlyModeLabel();
      Array.from(elements || []).filter(Boolean).forEach((element) => {
        if (!element) return;

        if (isReadOnly) {
          if (element.dataset.readonlyLocked !== 'true') {
            element.dataset.readonlyPrevDisabled = element.disabled ? 'true' : 'false';
            element.dataset.readonlyOriginalTitle = element.getAttribute('title') || '';
          }

          if ('disabled' in element) {
            element.disabled = true;
          }
          element.classList.add('readonly-locked-control');
          element.dataset.readonlyLocked = 'true';
          element.setAttribute('aria-disabled', 'true');
          element.setAttribute('title', lockMessage);
          return;
        }

        if (element.dataset.readonlyLocked === 'true') {
          const previousDisabled = element.dataset.readonlyPrevDisabled === 'true';
          if ('disabled' in element) {
            element.disabled = previousDisabled;
          }
          element.classList.remove('readonly-locked-control');
          element.removeAttribute('aria-disabled');

          const originalTitle = element.dataset.readonlyOriginalTitle || '';
          if (originalTitle) {
            element.setAttribute('title', originalTitle);
          } else {
            element.removeAttribute('title');
          }

          delete element.dataset.readonlyLocked;
          delete element.dataset.readonlyPrevDisabled;
          delete element.dataset.readonlyOriginalTitle;
        }
      });
    },

    applyReadOnlyRoleState: function () {
      const isReadOnly = this.isReadOnlyRoleContext();
      const banner = app.dom.adminReadonlyBanner || document.getElementById('admin-readonly-banner');
      const bannerLabel = app.dom.adminReadonlyLabel || document.getElementById('admin-readonly-label');
      const readOnlyLabel = this.getReadOnlyModeLabel();

      if (banner) {
        banner.hidden = !isReadOnly;
      }
      if (bannerLabel) {
        bannerLabel.textContent = readOnlyLabel;
      }

      const directControls = [
        app.dom.nameInput,
        app.dom.bulkImportBtn,
        app.dom.bulkImportConfirmBtn,
        app.dom.bulkImportTextarea,
        app.dom.createClassBtn,
        app.dom.deleteClassBtn,
        app.dom.mockNameInput,
        app.dom.subjectNameInput,
        app.dom.saveScoresBtn,
        app.dom.bulkScoreBtn,
        app.dom.bulkScoreSaveBtn,
        app.dom.notesSaveBtn,
        app.dom.trashRestoreAllBtn,
        app.dom.trashEmptyBtn,
        app.dom.editSaveBtn,
        app.dom.deleteConfirmBtn
      ];

      const dynamicControls = document.querySelectorAll([
        '#add-student-form button[type="submit"]',
        '#addMockForm button[type="submit"]',
        '#addSubjectForm button[type="submit"]',
        '.student-chip-action',
        '.mock-item input',
        '.mock-item button',
        '.trash-item-actions button',
        '#dynamicSubjectFields input',
        '.bulk-score-input',
        '.bulk-row-reset-btn',
        '.notes-cell'
      ].join(','));

      this.setReadOnlyControlState(directControls, isReadOnly);
      this.setReadOnlyControlState(dynamicControls, isReadOnly);

      if (app.dom.notesTextarea) {
        app.dom.notesTextarea.readOnly = isReadOnly;
      }

      document.body.classList.toggle('readonly-lock', isReadOnly);
    },

    canUseDeveloperTools: function () {
      return this.canAccess('developerTools');
    },

    requireDeveloperAccess: function () {
      return this.requireAccess('developerTools');
    },

    isRoleRestrictedElement: function (element) {
      if (!element) return false;
      if (element.classList && element.classList.contains('role-restricted')) return true;
      return String(element.dataset?.roleRestricted || '') === 'true';
    },

    getElementAccessMessage: function (element) {
      return String(element?.dataset?.accessMessage || '').trim() || 'You do not have permission for this action';
    },

    removeElementsFromDom: function (elements = []) {
      Array.from(elements || [])
        .filter(Boolean)
        .forEach((element) => {
          if (!element?.parentNode) return;
          element.parentNode.removeChild(element);
        });
    },

    applyFeatureAccessState: function (feature, elements = []) {
      if (!app.state.isRoleResolved) {
        return;
      }

      const canAccessFeature = this.canAccess(feature);
      const normalizedElements = Array.from(elements || []).filter(Boolean);

      if (!canAccessFeature) {
        this.removeElementsFromDom(normalizedElements);
        return;
      }

      normalizedElements.forEach((element) => {
        if (!element) return;
        element.classList.add('role-gated');

        element.classList.remove('role-restricted');
        element.removeAttribute('aria-disabled');
        if (!element.dataset.originalTitle) {
          element.removeAttribute('title');
        } else {
          element.title = element.dataset.originalTitle;
        }
        delete element.dataset.roleRestricted;
        delete element.dataset.accessFeature;
        delete element.dataset.accessMessage;
      });
    },

    updateRoleBadge: function () {
      const roleBadge = app.dom.authRoleBadge || document.getElementById('auth-role-badge');
      if (!roleBadge) return;

      const roleResolved = Boolean(app.state.isRoleResolved && app.state.authUser?.uid);
      if (!roleResolved) {
        roleBadge.textContent = 'Role: Loading...';
        roleBadge.dataset.role = 'pending';
        roleBadge.classList.add('role-pending');
        roleBadge.title = 'Resolving access permissions';
        return;
      }

      const currentRole = this.getCurrentRole();
      const roleLabel = this.formatRoleLabel(currentRole);
      roleBadge.textContent = roleLabel;
      roleBadge.dataset.role = currentRole;
      roleBadge.classList.remove('role-pending');
      roleBadge.title = `Current role: ${roleLabel}`;
    },

    updateRoleBasedUIAccess: function () {
      const roleResolved = Boolean(app.state.isRoleResolved);
      const currentRole = this.getCurrentRole();
      const canManageClasses = this.canCurrentRoleWrite();

      if (document.body) {
        document.body.dataset.userRole = currentRole;
        document.body.classList.toggle('role-loading', !roleResolved);
      }

      this.updateRoleBadge();

      if (!roleResolved) {
        return;
      }

      if (app.dom.createClassBtn) {
        app.dom.createClassBtn.hidden = false;
      }
      if (app.dom.deleteClassBtn) {
        app.dom.deleteClassBtn.hidden = false;
      }

      const classSwitcher = document.querySelector('.global-class-switcher');
      if (classSwitcher) {
        classSwitcher.hidden = false;
        classSwitcher.style.display = '';
      }

      this.applyFeatureAccessState('developerTools', [
        app.dom.systemToolsBackupStatus,
        app.dom.backupStatus,
        app.dom.backupBtn,
        app.dom.restoreBtn,
        app.dom.restoreInput,
        app.dom.createSnapshotBtn,
        app.dom.snapshotManagerBtn,
        app.dom.resetBtn,
        app.dom.systemCreateRestorePointBtn,
        app.dom.systemRestorePointsBtn,
        app.dom.systemExportDataBtn,
        app.dom.systemImportDataBtn,
        app.dom.systemResetBtn,
        app.dom.exportCsvBtn,
        app.dom.exportExcelBtn,
        app.dom.reportExportPdfBtn,
        app.dom.reportExportAllPdfBtn
      ]);

      this.applyFeatureAccessState('importData', [
        app.dom.restoreBtn,
        app.dom.restoreInput,
        app.dom.systemImportDataBtn
      ]);

      this.applyFeatureAccessState('bulkImport', [
        app.dom.bulkImportBtn,
        app.dom.bulkImportConfirmBtn
      ]);

      this.applyFeatureAccessState('restorePoints', [
        app.dom.createSnapshotBtn,
        app.dom.snapshotManagerBtn,
        app.dom.systemCreateRestorePointBtn,
        app.dom.systemRestorePointsBtn
      ]);

      this.applyFeatureAccessState('resetSystem', [
        app.dom.resetBtn,
        app.dom.systemResetBtn
      ]);

      this.applyFeatureAccessState('exportData', [
        app.dom.backupBtn,
        app.dom.systemExportDataBtn,
        app.dom.exportCsvBtn,
        app.dom.exportExcelBtn,
        app.dom.reportExportPdfBtn,
        app.dom.reportExportAllPdfBtn
      ]);

      this.applyFeatureAccessState('adminPanel', [
        ...document.querySelectorAll('[data-section="admin-dashboard"]'),
        app.dom.adminDashboardBtn || document.getElementById('admin-dashboard-btn')
      ]);
    },

    hideToast: function () {
      if (!app.dom.toast) return;
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      app.dom.toast.classList.remove('show');
    },

    showToast: function (message, options = {}) {
      if (!app.dom.toast) return;

      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }

      const toast = app.dom.toast;
      toast.innerHTML = '';

      const textNode = document.createElement('span');
      textNode.className = 'toast-message';
      textNode.textContent = String(message || '');
      toast.appendChild(textNode);

      const hasAction = typeof options?.onAction === 'function' && String(options?.actionLabel || '').trim();
      if (hasAction) {
        const actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'toast-action';
        actionButton.textContent = String(options.actionLabel || '').trim();
        actionButton.addEventListener('click', async () => {
          actionButton.disabled = true;
          try {
            await options.onAction();
          } catch (error) {
            console.error('Toast action failed:', error);
          }
        });
        toast.appendChild(actionButton);
      }

      toast.classList.add('show');
      const duration = Number(options?.duration);
      const timeoutMs = Number.isFinite(duration) && duration > 0 ? duration : 2200;
      this.toastTimer = setTimeout(() => {
        this.hideToast();
      }, timeoutMs);
    },

    showUndoDeleteToast: function (itemId, itemName = 'Item', itemType = 'student') {
      const normalizedId = String(itemId || '').trim();
      const normalizedType = String(itemType || 'student').trim().toLowerCase();
      const typeLabel = normalizedType === 'class'
        ? 'Class'
        : normalizedType === 'exam'
        ? 'Exam'
        : normalizedType === 'subject'
          ? 'Subject'
          : 'Student';

      if (!normalizedId) {
        this.showToast(`${typeLabel} moved to Trash`);
        return;
      }

      this.showToast(`${itemName} moved to Trash`, {
        actionLabel: 'Undo',
        duration: 5000,
        onAction: async () => {
          try {
            if (normalizedType === 'class') {
              await app.restoreClass(normalizedId);
            } else if (normalizedType === 'exam') {
              await app.restoreExam(normalizedId);
            } else if (normalizedType === 'subject') {
              await app.restoreSubject(normalizedId);
            } else {
              await app.restoreStudent(normalizedId);
            }
            this.refreshUI();
            this.showToast(`${typeLabel} restored`);
          } catch (error) {
            console.error('Failed to undo delete:', error);
            this.showToast(`Failed to restore ${typeLabel.toLowerCase()}`);
          }
        }
      });
    },

    formatDeletedAt: function (value) {
      const parsed = new Date(value || '');
      if (Number.isNaN(parsed.getTime())) {
        return 'Recently';
      }
      return parsed.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    },

    getTrashRetentionCountdown: function (value) {
      const parsed = new Date(value || '');
      if (Number.isNaN(parsed.getTime())) {
        return `Will be permanently deleted after ${this.trashRetentionDays} days`;
      }

      const retentionMs = this.trashRetentionDays * 24 * 60 * 60 * 1000;
      const remainingMs = (parsed.getTime() + retentionMs) - Date.now();
      if (remainingMs <= 0) {
        return 'Eligible for permanent deletion';
      }

      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      const days = Math.floor(remainingHours / 24);
      const hours = remainingHours % 24;
      if (days <= 0) {
        return `${hours}h left before auto-delete window`;
      }
      return `${days}d ${hours}h left before auto-delete window`;
    },

    renderTrashList: function () {
      if (!app.dom.trashList) return;

      const trashItems = [
        ...(Array.isArray(app.state.studentTrash) ? app.state.studentTrash.map(item => ({ ...item, type: 'student' })) : []),
        ...(Array.isArray(app.state.classTrash) ? app.state.classTrash.map(item => ({ ...item, type: 'class' })) : []),
        ...(Array.isArray(app.state.subjectTrash) ? app.state.subjectTrash.map(item => ({ ...item, type: 'subject' })) : []),
        ...(Array.isArray(app.state.examTrash) ? app.state.examTrash.map(item => ({ ...item, type: 'exam' })) : [])
      ]
        .sort((a, b) => {
          const aTime = new Date(a?.deletedAt || 0).getTime() || 0;
          const bTime = new Date(b?.deletedAt || 0).getTime() || 0;
          return bTime - aTime;
        });

      if (app.dom.trashRestoreAllBtn) {
        app.dom.trashRestoreAllBtn.disabled = !trashItems.length;
      }
      if (app.dom.trashEmptyBtn) {
        app.dom.trashEmptyBtn.disabled = !trashItems.length;
      }
      if (app.dom.trashRetentionHint) {
        app.dom.trashRetentionHint.textContent = `Will be permanently deleted after ${this.trashRetentionDays} days.`;
      }

      if (!trashItems.length) {
        app.dom.trashList.innerHTML = '<p class="trash-empty">Trash is empty</p>';
        return;
      }

      app.dom.trashList.innerHTML = trashItems.map((item) => {
        const id = String(item?.id || '').trim();
        const type = String(item?.type || 'student').trim().toLowerCase();
        const typeLabel = type === 'class' ? 'Class' : type === 'exam' ? 'Exam' : type === 'subject' ? 'Subject' : 'Student';
        const name = String(item?.name || typeLabel).trim() || typeLabel;
        const deletedAtLabel = this.formatDeletedAt(item?.deletedAt);
        const retentionCountdownLabel = this.getTrashRetentionCountdown(item?.deletedAt);

        return `
          <div class="trash-item" data-trash-id="${app.utils.esc(id)}" data-trash-type="${app.utils.esc(type)}">
            <div class="trash-item-meta">
              <p class="trash-item-name">${app.utils.esc(name)}</p>
              <p class="trash-item-date">${app.utils.esc(typeLabel)} · Deleted ${app.utils.esc(deletedAtLabel)}</p>
              <p class="trash-item-retention">${app.utils.esc(retentionCountdownLabel)}</p>
            </div>
            <div class="trash-item-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-trash-action="restore" data-trash-id="${app.utils.esc(id)}" data-trash-type="${app.utils.esc(type)}">Restore</button>
              <button type="button" class="btn btn-danger btn-sm" data-trash-action="permanent-delete" data-trash-id="${app.utils.esc(id)}" data-trash-type="${app.utils.esc(type)}">Delete Forever</button>
            </div>
          </div>
        `;
      }).join('');
    },

    formatImprovement: function (current, previous) {
      const previousValue = Number(previous);
      const currentValue = Number(current);
      if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) {
        return { text: 'N/A', className: 'improv-neutral' };
      }
      const diff = currentValue - previousValue;
      if (!Number.isFinite(diff)) return { text: 'N/A', className: 'improv-neutral' };
      if (diff > 0) return { text: '+' + diff.toFixed(1), className: 'improv-up' };
      if (diff < 0) return { text: diff.toFixed(1), className: 'improv-down' };
      return { text: '0', className: 'improv-neutral' };
    },

    toFiniteNumber: function (value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    },

    formatFixedOrFallback: function (value, decimals = 1, fallback = '—') {
      const numeric = this.toFiniteNumber(value);
      if (numeric === null) {
        return fallback;
      }
      return String(numeric.toFixed(decimals))
        .replace(/\.0+$/g, '')
        .replace(/(\.\d*[1-9])0+$/g, '$1');
    },

    formatStatusLabel: function (statusType) {
      if (statusType === 'strong') return 'Strong';
      if (statusType === 'good') return 'Good';
      if (statusType === 'average') return 'Average';
      if (statusType === 'borderline') return 'Borderline';
      if (statusType === 'at-risk') return 'At Risk';
      if (statusType === 'incomplete') return 'N/A';
      if (statusType === 'no-data') return 'No Data';
      if (statusType === 'safe') return 'Safe';
      return 'No Data';
    },

    formatClassOwnerLabel: function (entry) {
      const ownerName = String(entry?.ownerName || '').trim();
      return ownerName ? `Teacher: ${ownerName}` : '';
    },

    formatClassDisplayLabel: function (entry) {
      const className = String(entry?.name || 'My Class').trim() || 'My Class';
      const ownerName = String(entry?.ownerName || '').trim();
      if (!ownerName) return className;
      return `${className} (Teacher: ${ownerName})`;
    },

    getStatusToneClass: function (statusType) {
      if (statusType === 'strong') return 'total-tone-strong';
      if (statusType === 'good') return 'total-tone-good';
      if (statusType === 'average') return 'total-tone-average';
      if (statusType === 'borderline') return 'total-tone-borderline';
      if (statusType === 'at-risk') return 'total-tone-at-risk';
      return 'total-tone-neutral';
    },

    closeClassDropdown: function () {
      if (app.dom.classDropdown) {
        app.dom.classDropdown.classList.remove('open');
      }
      if (app.dom.classDropdownToggle) {
        app.dom.classDropdownToggle.setAttribute('aria-expanded', 'false');
      }
    },

    toggleClassDropdown: function () {
      const classes = Array.isArray(app.state.classes) ? app.state.classes : [];
      if (!classes.length || !app.dom.classDropdown || !app.dom.classDropdownToggle) {
        return;
      }

      const shouldOpen = !app.dom.classDropdown.classList.contains('open');
      app.dom.classDropdown.classList.toggle('open', shouldOpen);
      app.dom.classDropdownToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    },

    setClassControlsBusy: function (isBusy) {
      const shouldDisable = Boolean(isBusy);
      if (app.dom.classDropdownToggle) app.dom.classDropdownToggle.disabled = shouldDisable;
      if (app.dom.classPrevBtn) app.dom.classPrevBtn.disabled = shouldDisable;
      if (app.dom.classNextBtn) app.dom.classNextBtn.disabled = shouldDisable;
      if (app.dom.createClassBtn) app.dom.createClassBtn.disabled = shouldDisable;
      if (app.dom.deleteClassBtn) app.dom.deleteClassBtn.disabled = shouldDisable;
      if (app.dom.classDropdownMenu) {
        app.dom.classDropdownMenu.querySelectorAll('.class-dropdown-item').forEach((entry) => {
          entry.disabled = shouldDisable || entry.disabled;
        });
      }
    },

    switchToClass: async function (classId, ownerId = '') {
      const nextClassId = String(classId || '').trim();
      const nextOwnerId = String(ownerId || '').trim();
      if (!nextClassId) return;

      try {
        this.closeClassDropdown();
        this.setClassControlsBusy(true);
        await app.switchClass(nextClassId, nextOwnerId);
        this.refreshUI();
        this.showToast('Class switched');
      } catch (error) {
        console.error('Failed to switch class:', error);
        this.showToast('Failed to switch class');
      } finally {
        this.renderClassControls();
        this.applyReadOnlyRoleState();
      }
    },

    cycleClass: async function (step = 1) {
      const classes = Array.isArray(app.state.classes) ? app.state.classes : [];
      if (classes.length <= 1) {
        return;
      }

      const currentClassId = String(app.state.currentClassId || '').trim();
      const currentOwnerId = String(app.state.currentClassOwnerId || '').trim();
      const currentIndex = classes.findIndex((entry) => {
        const entryClassId = String(entry?.id || '').trim();
        const entryOwnerId = String(entry?.ownerId || '').trim();
        if (entryClassId !== currentClassId) {
          return false;
        }
        if (!currentOwnerId) {
          return true;
        }
        return entryOwnerId === currentOwnerId;
      });
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const delta = Number(step) < 0 ? -1 : 1;
      const nextIndex = (startIndex + delta + classes.length) % classes.length;
      const nextClass = classes[nextIndex] || null;
      const nextClassId = String(nextClass?.id || '').trim();
      const nextOwnerId = String(nextClass?.ownerId || '').trim();
      if (!nextClassId) {
        return;
      }

      await this.switchToClass(nextClassId, nextOwnerId);
    },

    renderClassControls: function () {
      const classes = Array.isArray(app.state.classes) ? app.state.classes : [];
      const currentClassId = String(app.state.currentClassId || '').trim();
      const currentOwnerId = String(app.state.currentClassOwnerId || '').trim();
      const activeClass = classes.find((entry) => {
        const entryClassId = String(entry?.id || '').trim();
        const entryOwnerId = String(entry?.ownerId || '').trim();
        if (entryClassId !== currentClassId) {
          return false;
        }
        if (!currentOwnerId) {
          return true;
        }
        return entryOwnerId === currentOwnerId;
      }) || classes.find(entry => String(entry?.id || '').trim() === currentClassId) || classes[0] || null;
      const resolvedClassId = String(activeClass?.id || currentClassId || '').trim();
      const resolvedOwnerId = String(activeClass?.ownerId || app.state.currentClassOwnerId || '').trim();
      const activeClassName = activeClass?.name || app.state.currentClassName || 'My Class';
      const activeClassDisplayLabel = classes.length
        ? this.formatClassDisplayLabel(activeClass)
        : 'No classes available';

      app.state.currentClassId = resolvedClassId;
      app.state.currentClassName = activeClassName;
      app.state.currentClassOwnerId = resolvedOwnerId;

      if (app.dom.classNameDisplay) {
        app.dom.classNameDisplay.textContent = `Class: ${activeClassDisplayLabel}`;
      }

      if (app.dom.classDropdownValue) {
        app.dom.classDropdownValue.textContent = classes.length ? activeClassDisplayLabel : 'No classes available';
      }

      if (app.dom.classDropdownToggle) {
        app.dom.classDropdownToggle.disabled = !classes.length;
      }

      if (app.dom.classDropdownMenu) {
        if (!classes.length) {
          app.dom.classDropdownMenu.innerHTML = '<button type="button" class="class-dropdown-item is-empty" disabled><span class="class-item-name">No classes available</span></button>';
        } else {
          app.dom.classDropdownMenu.innerHTML = classes.map((entry) => {
            const classId = String(entry?.id || '').trim();
            const className = String(entry?.name || 'My Class').trim() || 'My Class';
            const ownerLabel = this.formatClassOwnerLabel(entry);
            const ownerId = String(entry?.ownerId || '').trim();
            const isActive = classId === resolvedClassId && (!resolvedOwnerId || ownerId === resolvedOwnerId);
            return `
              <button type="button" class="class-dropdown-item${isActive ? ' active' : ''}" data-class-id="${app.utils.esc(classId)}" data-owner-id="${app.utils.esc(ownerId)}" role="option" aria-selected="${isActive ? 'true' : 'false'}">
                <span class="class-item-icon" aria-hidden="true">🏫</span>
                <span class="class-item-name">${app.utils.esc(className)}</span>
                ${ownerLabel ? `<span class="class-item-owner">${app.utils.esc(ownerLabel)}</span>` : ''}
                ${isActive ? '<span class="class-item-badge">Active</span>' : ''}
              </button>`;
          }).join('');
        }
      }

      const canManageClasses = this.canCurrentRoleWrite();
      if (app.dom.createClassBtn) {
        app.dom.createClassBtn.disabled = !canManageClasses;
      }
      if (app.dom.deleteClassBtn) {
        app.dom.deleteClassBtn.disabled = !canManageClasses || classes.length <= 1 || !resolvedClassId;
      }

      const disableArrows = classes.length <= 1 || !resolvedClassId;
      if (app.dom.classPrevBtn) {
        app.dom.classPrevBtn.disabled = disableArrows;
      }
      if (app.dom.classNextBtn) {
        app.dom.classNextBtn.disabled = disableArrows;
      }

      if (!classes.length) {
        this.closeClassDropdown();
      }

      if (app.dom.form) {
        const hasWritableClassContext = classes.length > 0 && Boolean(resolvedClassId) && Boolean(resolvedOwnerId);
        app.dom.form.querySelectorAll('input, button').forEach((entry) => {
          entry.disabled = !hasWritableClassContext;
        });
        if (app.dom.addMockForm) {
          app.dom.addMockForm.querySelectorAll('input, button').forEach((entry) => {
            entry.disabled = !hasWritableClassContext;
          });
        }
        if (app.dom.addSubjectForm) {
          app.dom.addSubjectForm.querySelectorAll('input, button').forEach((entry) => {
            entry.disabled = !hasWritableClassContext;
          });
        }
      }

      if (!canManageClasses && app.dom.classDropdownValue && !classes.length) {
        app.dom.classDropdownValue.textContent = 'No classes available';
      }

      if (!classes.length && canManageClasses && !app.state.isLoading && !this.hasPromptedForMissingClass) {
        this.hasPromptedForMissingClass = true;
        setTimeout(async () => {
          if (!this.ensureWritableAction('Class creation')) {
            return;
          }

          const className = prompt('No class found. Enter a class name to get started:', 'My Class');
          const normalizedName = String(className || '').trim();
          if (!normalizedName) {
            this.showToast('Create a class to continue');
            return;
          }

          try {
            await app.createClass(normalizedName);
            this.refreshUI();
            this.showToast('Class created');
          } catch (error) {
            console.error('Failed to create class:', error);
            this.showToast('Failed to create class');
          }
        }, 0);
      } else if (classes.length) {
        this.hasPromptedForMissingClass = false;
      }
    },

    clearAllData: async function () {
      if (!this.requireAccess('resetSystem')) {
        return;
      }
      if (!this.ensureWritableAction('Data reset')) {
        return;
      }
      try {
        if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
          app.snapshots.saveSnapshot('Auto Backup Before Reset');
        }
        await app.importData({ students: [], subjects: [], exams: [] });
        app.state.selectedBulkExamId = '';
        app.state.selectedPerformanceCategory = 'strong';
        this.refreshUI();
        this.showToast('All data cleared');
      } catch (error) {
        console.error('Failed to clear data:', error);
        this.showToast('Failed to clear data');
      }
    },

    createSnapshot: function (name = 'Manual Restore Point', refreshList = false) {
      if (!this.requireAccess('restorePoints')) {
        return null;
      }
      if (!app.snapshots || typeof app.snapshots.saveSnapshot !== 'function') {
        this.showToast('Snapshot system unavailable');
        return null;
      }

      const snapshot = app.snapshots.saveSnapshot(name);
      if (snapshot && refreshList) {
        this.renderSnapshotList();
      }
      return snapshot;
    },

    formatSnapshotDate: function (value) {
      if (!value) return 'Unknown date';
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) return app.utils.esc(String(value));
      return parsed.toLocaleString();
    },

    renderSnapshotList: function () {
      if (!app.dom.snapshotList) return;

      const snapshots = app.snapshots && typeof app.snapshots.getSnapshots === 'function'
        ? app.snapshots.getSnapshots()
        : [];

      if (!snapshots.length) {
        app.dom.snapshotList.innerHTML = '<p class="snapshot-empty">No restore points available yet.</p>';
        return;
      }

      app.dom.snapshotList.innerHTML = snapshots.map(snapshot => `
        <div class="snapshot-item">
          <div class="snapshot-item-main">
            <div class="snapshot-name">${app.utils.esc(snapshot.name || 'Restore Point')}</div>
            <div class="snapshot-date">${app.utils.esc(this.formatSnapshotDate(snapshot.date))}</div>
          </div>
          <div class="snapshot-item-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-snapshot-action="restore" data-snapshot-id="${app.utils.esc(snapshot.id)}">Restore</button>
            <button class="btn btn-danger btn-sm" type="button" data-snapshot-action="delete" data-snapshot-id="${app.utils.esc(snapshot.id)}">Delete</button>
          </div>
        </div>
      `).join('');
    },

    openSnapshotModal: function () {
      this.renderSnapshotList();
      if (app.dom.snapshotModal) {
        app.dom.snapshotModal.classList.add('active');
      }
    },

    closeSnapshotModal: function () {
      if (app.dom.snapshotModal) {
        app.dom.snapshotModal.classList.remove('active');
      }
    },

    updateBackupStatus: function () {
      const applyStatus = (text, statusClass) => {
        if (app.dom.backupStatus) {
          app.dom.backupStatus.textContent = text;
          app.dom.backupStatus.classList.remove('status-recent', 'status-outdated', 'status-never');
          app.dom.backupStatus.classList.add(statusClass);
        }
        if (app.dom.systemToolsBackupStatusText) {
          app.dom.systemToolsBackupStatusText.textContent = text;
        }
        if (app.dom.systemToolsBackupStatus) {
          app.dom.systemToolsBackupStatus.classList.remove('status-recent', 'status-outdated', 'status-never');
          app.dom.systemToolsBackupStatus.classList.add(statusClass);
        }
      };

      if (!app.state.lastBackup) {
        applyStatus('Last Backup: Never', 'status-never');
        return;
      }

      const last = new Date(app.state.lastBackup);
      const diffDays = Math.floor((new Date() - last) / (1000 * 60 * 60 * 24));
      const label = `Last Backup: ${diffDays === 0 ? 'Today' : diffDays + ' days ago'}`;

      if (diffDays <= 1) {
        applyStatus(label, 'status-recent');
      } else {
        applyStatus(label, 'status-outdated');
      }
    },

    parseDashboardStatValue: function (raw) {
      const parsed = Number(String(raw ?? '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    },

    formatDashboardStatValue: function (value, format) {
      const numeric = this.toFiniteNumber(value);
      const safeValue = numeric === null ? 0 : numeric;
      if (format === 'percent') return `${Math.round(safeValue)}%`;
      if (format === 'decimal') return `${safeValue.toFixed(1)}%`;
      return Math.round(safeValue).toLocaleString();
    },

    animateDashboardStatValue: function (node, targetValue, format = 'int') {
      if (!node) return;

      const target = Number(targetValue);
      const safeTarget = Number.isFinite(target) ? target : 0;
      const currentTarget = Number(node.dataset.targetValue || NaN);
      if (Number.isFinite(currentTarget) && Math.abs(currentTarget - safeTarget) < 0.001) {
        node.textContent = this.formatDashboardStatValue(safeTarget, format);
        return;
      }

      const isFirstRun = !node.dataset.hasAnimated;
      const startValue = isFirstRun ? 0 : this.parseDashboardStatValue(node.textContent);
      const duration = isFirstRun ? 880 : 620;
      const startTime = performance.now();

      if (node._dashboardStatFrame) {
        cancelAnimationFrame(node._dashboardStatFrame);
      }

      const easeOut = t => 1 - Math.pow(1 - t, 3);
      const animate = (time) => {
        const progress = Math.min((time - startTime) / duration, 1);
        const eased = easeOut(progress);
        const value = startValue + (safeTarget - startValue) * eased;
        node.textContent = this.formatDashboardStatValue(value, format);

        if (progress < 1) {
          node._dashboardStatFrame = requestAnimationFrame(animate);
          return;
        }

        node.textContent = this.formatDashboardStatValue(safeTarget, format);
        node.dataset.targetValue = String(safeTarget);
        node.dataset.hasAnimated = '1';
      };

      node._dashboardStatFrame = requestAnimationFrame(animate);
    },

    updateDashboardStats: function () {
      const fallbackTotal = app.state.students.length;
      const hasScopedTotal = Number.isFinite(Number(app.state.dashboardStudentCount));
      const shouldShowLoading = app.state.isLoading && !hasScopedTotal && fallbackTotal <= 0;

      if (shouldShowLoading && app.dom.statTotalStudents) {
        app.dom.statTotalStudents.textContent = 'Loading...';
      }

      const total = hasScopedTotal
        ? Number(app.state.dashboardStudentCount)
        : fallbackTotal;
      if (!shouldShowLoading) {
        this.animateDashboardStatValue(app.dom.statTotalStudents, total, 'int');
      }

      const latestExam = app.analytics.getLatestExam();
      const { groups: statusGroups } = app.analytics.groupStudentsByStatus(latestExam);
      const categories = app.analytics.getPerformanceCategories();
      const measured = (app.state.students || [])
        .map(student => app.analytics.getStudentAverageForExam(student, latestExam))
        .map(avg => Number(avg))
        .filter(avg => Number.isFinite(avg));

      const sum = measured.reduce((acc, value) => acc + value, 0);
      const count = measured.length;
      const pass = measured.filter(avg => avg >= 50).length;
      const atRisk = (statusGroups['at-risk'] || []).length;
      const countTargets = {
        strong: 'statStrongCount',
        good: 'statGoodCount',
        average: 'statAverageCount',
        borderline: 'statBorderlineCount',
        'at-risk': 'statAtRiskCountSummary'
      };

      const classAverage = count ? (sum / count) : 0;
      const passRate = count ? Math.round((pass / count) * 100) : 0;

      this.animateDashboardStatValue(app.dom.statClassAvg, classAverage, 'decimal');
      this.animateDashboardStatValue(app.dom.statPassRate, passRate, 'percent');
      if (app.dom.statFailRate) app.dom.statFailRate.textContent = count ? Math.round(((count - pass) / count) * 100) + '%' : '0%';
      this.animateDashboardStatValue(app.dom.statAtRiskCount, atRisk, 'int');

      categories.forEach(category => {
        const domKey = countTargets[category.key];
        if (domKey && app.dom[domKey]) {
          app.dom[domKey].textContent = (statusGroups[category.key] || []).length;
        }
      });

      this.renderDashboardPerformanceChart(statusGroups, categories);
    },

    renderDashboardPerformanceChart: function (statusGroups, categories) {
      if (!app.dom.dashboardPerformanceChart) return;

      const categoryCounts = (categories || []).map(category => ({
        ...category,
        count: (statusGroups?.[category.key] || []).length
      }));
      const maxCount = categoryCounts.reduce((max, item) => Math.max(max, item.count), 0);
      const step = Math.max(1, Math.ceil(Math.max(maxCount, 4) / 4));
      const scaleTop = step * 4;
      const yTicks = [4, 3, 2, 1, 0].map(multiplier => multiplier * step);

      const yAxisHtml = yTicks
        .map(tick => `<span class="dashboard-chart-tick">${tick}</span>`)
        .join('');

      const barsHtml = categoryCounts.map(item => {
        const barHeight = item.count > 0
          ? Math.max((item.count / scaleTop) * 100, 6)
          : 0;
        const tooltip = `${item.label} - ${item.count} student${item.count === 1 ? '' : 's'}`;

        return `
          <div class="dashboard-chart-col">
            <div class="dashboard-chart-col-inner">
              <div class="dashboard-chart-value">${item.count}</div>
              <div class="dashboard-chart-bar risk-${item.key}" style="height:${barHeight}%" title="${app.utils.esc(tooltip)}" aria-label="${app.utils.esc(tooltip)}"></div>
            </div>
            <div class="dashboard-chart-label">${item.label}</div>
          </div>
        `;
      }).join('');

      app.dom.dashboardPerformanceChart.innerHTML = `
        <div class="dashboard-chart-inner">
          <div class="dashboard-chart-y-axis" aria-label="Student count axis">
            ${yAxisHtml}
          </div>
          <div class="dashboard-chart-plot" aria-label="Category distribution bars">
            ${barsHtml}
          </div>
        </div>
      `;
    },

    getStudentInitials: function (name) {
      const words = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return 'ST';
      const first = words[0].charAt(0) || '';
      const second = words.length > 1 ? words[words.length - 1].charAt(0) : (words[0].charAt(1) || '');
      return `${first}${second}`.toUpperCase() || 'ST';
    },

    getStudentAvatarTone: function (studentId) {
      const tones = ['tone-a', 'tone-b', 'tone-c', 'tone-d', 'tone-e', 'tone-f'];
      const key = String(studentId || 'student');
      let hash = 0;
      for (let i = 0; i < key.length; i += 1) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash |= 0;
      }
      return tones[Math.abs(hash) % tones.length];
    },

    renderStudentChips: function () {
      if (!app.dom.studentList) return;

      const isReadOnly = this.isReadOnlyRoleContext();
      const readOnlyTitle = this.getReadOnlyModeLabel();

      const rosterSearchTerm = String(app.state.studentRosterSearchTerm || '').trim().toLowerCase();
      const students = Array.isArray(app.state.students) ? app.state.students : [];
      const filteredStudents = rosterSearchTerm
        ? students.filter(student => String(student?.name || '').toLowerCase().includes(rosterSearchTerm))
        : students;

      if (app.dom.studentCount) {
        const totalCount = students.length;
        if (rosterSearchTerm) {
          app.dom.studentCount.textContent = `${filteredStudents.length} of ${totalCount} Student${totalCount === 1 ? '' : 's'}`;
        } else {
          app.dom.studentCount.textContent = `${totalCount} Student${totalCount === 1 ? '' : 's'}`;
        }
      }

      if (!filteredStudents.length) {
        const emptyLabel = students.length ? 'No students match your search' : 'No students added yet';
        app.dom.studentList.innerHTML = `
          <div class="student-roster-empty">
            <span class="student-roster-empty-icon" aria-hidden="true">👥</span>
            <p>${emptyLabel}</p>
          </div>
        `;
        return;
      }

      app.dom.studentList.innerHTML = filteredStudents.map((student) => {
        const id = String(student?.id || '').trim();
        const name = String(student?.name || '').trim();
        const initials = this.getStudentInitials(name);
        const avatarToneClass = this.getStudentAvatarTone(id);
        const hasNotesClass = student?.notes ? 'chip-has-notes' : '';

        return `
          <div class="student-chip ${hasNotesClass}" data-student-id="${app.utils.esc(id)}">
            <div class="student-chip-main">
              <span class="student-chip-avatar ${avatarToneClass}" aria-hidden="true">${app.utils.esc(initials)}</span>
              <span class="student-chip-name">${app.utils.esc(name)}</span>
            </div>
            <div class="student-chip-actions">
              <button
                type="button"
                class="student-chip-action"
                data-student-action="edit"
                data-student-id="${app.utils.esc(id)}"
                title="${isReadOnly ? app.utils.esc(readOnlyTitle) : 'Edit student'}"
                aria-label="Edit ${app.utils.esc(name)}"
                ${isReadOnly ? 'disabled' : ''}
              >✏️</button>
              <button
                type="button"
                class="student-chip-action danger"
                data-student-action="delete"
                data-student-id="${app.utils.esc(id)}"
                title="${isReadOnly ? app.utils.esc(readOnlyTitle) : 'Delete student'}"
                aria-label="Delete ${app.utils.esc(name)}"
                ${isReadOnly ? 'disabled' : ''}
              >🗑</button>
            </div>
          </div>
        `;
      }).join('');
    },

    populateSelects: function () {
      const selectedScoreExamId = app.dom.scoreMockSelect?.value || '';
      const selectedBulkExamId = app.dom.bulkMockSelect?.value || app.state.selectedBulkExamId || '';
      const selectedScoreStudentId = app.dom.scoreStudentSelect?.value || '';
      const selectedChartStudentId = app.dom.chartStudentSelect?.value || '';

      const mOps = app.state.exams.map(m => `<option value="${m.id}">${app.utils.esc(m.title || m.name)}</option>`).join('');
      if (app.dom.scoreMockSelect) {
        app.dom.scoreMockSelect.innerHTML = mOps;
        app.dom.scoreMockSelect.value = app.state.exams.some(m => m.id === selectedScoreExamId)
          ? selectedScoreExamId
          : (app.state.exams[0]?.id || '');
      }
      if (app.dom.bulkMockSelect) {
        app.dom.bulkMockSelect.innerHTML = mOps;
        app.dom.bulkMockSelect.value = app.state.exams.some(m => m.id === selectedBulkExamId)
          ? selectedBulkExamId
          : (app.state.exams[0]?.id || '');
        app.state.selectedBulkExamId = app.dom.bulkMockSelect.value || '';
      }
      
      const sOps = '<option value="">— Select Student —</option>' + app.state.students.map(s => `<option value="${s.id}">${app.utils.esc(s.name)}</option>`).join('');
      if (app.dom.scoreStudentSelect) {
        app.dom.scoreStudentSelect.innerHTML = sOps;
        app.dom.scoreStudentSelect.value = app.state.students.some(s => s.id === selectedScoreStudentId) ? selectedScoreStudentId : '';
      }
      if (app.dom.chartStudentSelect) {
        app.dom.chartStudentSelect.innerHTML = sOps;
        app.dom.chartStudentSelect.value = app.state.students.some(s => s.id === selectedChartStudentId) ? selectedChartStudentId : '';
      }
    },

    getStudentExamTotal: function(studentId, examId) {
      const student = app.state.students.find(s => s.id === studentId);
      const exam = app.state.exams.find(e => e.id === examId);
      if (!student || !exam) return null;
      return app.analytics.getTotal(student, exam);
    },

    renderResultsTable: function () {
      if (!app.dom.resultsHeadRow1 || !app.dom.resultsHeadRow2 || !app.dom.resultsBody) return;

      const isReadOnly = this.isReadOnlyRoleContext();
      const notesTooltip = isReadOnly ? this.getReadOnlyModeLabel() : 'Open notes';

      const { previousExam, latestExam } = app.analytics.getLastTwoExams();
      const canComputeImprovement = !!previousExam && !!latestExam;

      const ranked = app.state.students.map(s => ({
        ...s,
        _overallAvg: app.analytics.getStudentOverallAverage(s)
      }))
        .filter(s => s.name.toLowerCase().includes(app.state.searchTerm.toLowerCase()))
        .sort((a, b) => (b._overallAvg ?? -1) - (a._overallAvg ?? -1));
      
      const subHeaders = app.state.exams.map((_, examIdx) => {
        const examGroupClass = examIdx % 2 === 1 ? ' exam-group-alt' : '';
        return app.state.subjects.map(sub => `<th class="exam-sub-col${examGroupClass}">${app.utils.esc(sub.name.slice(0, 3))}</th>`).join('') + `<th class="exam-total-col exam-group-end${examGroupClass}">Total</th>`;
      }).join('');
      app.dom.resultsHeadRow2.innerHTML = subHeaders;
      app.dom.resultsHeadRow1.innerHTML = `
        <th rowspan="2">Rank</th><th rowspan="2" class="sticky-col">Name</th>
        ${app.state.exams.map((m, idx) => {
          const label = m.title && m.title.toLowerCase().startsWith('mock ')
            ? 'M' + (idx + 1)
            : app.utils.esc(m.title || m.name);
          const examGroupClass = idx % 2 === 1 ? ' exam-group-alt' : '';
          return `<th colspan="${app.state.subjects.length + 1}" class="exam-header exam-group-end${examGroupClass}">${label}</th>`;
        }).join('')}
        <th rowspan="2">Avg</th><th rowspan="2">Previous</th><th rowspan="2">Improvement</th><th rowspan="2">Status</th><th rowspan="2">Notes</th><th rowspan="2">Report</th>`;

      app.dom.resultsBody.innerHTML = ranked.map((s, i) => {
        const currentTotal = latestExam ? this.getStudentExamTotal(s.id, latestExam.id) : null;
        const previousTotal = previousExam ? this.getStudentExamTotal(s.id, previousExam.id) : null;
        const improvData = canComputeImprovement
          ? this.formatImprovement(currentTotal, previousTotal)
          : { text: '', className: 'improv-neutral' };
        const status = app.analytics.getStudentStatus(s, latestExam);
        const statusClass = `risk-${status}`;
        const totalToneClass = this.getStatusToneClass(status);
        let examCells = app.state.exams.map((m, examIdx) => {
          const examGroupClass = examIdx % 2 === 1 ? ' exam-group-alt' : '';
          let subCells = app.state.subjects.map(sub => {
            const score = app.analytics.getScore(s, sub, m);
            const scoreDisplay = this.formatFixedOrFallback(score, 1, '—');
            return `<td class="exam-cell${examGroupClass}">${app.utils.esc(scoreDisplay)}</td>`;
          }).join('');
          const total = this.getStudentExamTotal(s.id, m.id);
          const totalDisplay = app.utils.esc(this.formatFixedOrFallback(total, 1, '—'));
          return subCells + `
            <td class="exam-total-col exam-group-end${examGroupClass}">
              <div class="total-score-badge ${totalToneClass}">
                <span class="total-score-label">TOTAL</span>
                <strong class="total-score-value">${totalDisplay}</strong>
              </div>
            </td>`;
        }).join('');
        const avgVal = s._overallAvg;
        const avgCls = avgVal !== null ? (avgVal >= 70 ? 'avg-green' : (avgVal >= 50 ? 'avg-yellow' : 'avg-red')) : '';
        const avgDisplay = app.utils.esc(this.formatFixedOrFallback(avgVal, 1, '—'));
        const previousDisplay = canComputeImprovement
          ? app.utils.esc(this.formatFixedOrFallback(previousTotal, 1, 'N/A'))
          : '—';
        return `<tr>
          <td><strong class="rank-num rank-highlight">${i + 1}</strong></td><td class="sticky-col">${app.utils.esc(s.name)}</td>
          ${examCells}
          <td><strong class="${avgCls} avg-emphasis">${avgDisplay}</strong></td>
          <td>${previousDisplay}</td>
          <td class="${improvData.className}">${improvData.text}</td>
          <td><span class="risk-pill status-pill ${statusClass}">${this.formatStatusLabel(status)}</span></td>
          <td class="notes-cell${isReadOnly ? ' readonly-locked-control' : ''}" title="${app.utils.esc(notesTooltip)}" onclick="window.TrackerApp.ui.openNotes('${s.id}')">${s.notes ? '&#128221; View' : '+ Add'}</td>
          <td class="report-cell" data-report-id="${s.id}">&#128196; Report</td>
        </tr>`;
      }).join('');
    },

    renderInterventionList: function () {
      if (!app.dom.interventionItems) return;
      const studentLookup = new Map((app.state.students || []).map(student => [student.id, student]));
      const flagged = (app.analytics.groupStudentsByStatus().groups['at-risk'] || [])
        .map(item => ({ student: studentLookup.get(item.id), avg: item.average }))
        .filter(item => item.student)
        .sort((a, b) => (a.avg || 0) - (b.avg || 0));

      if (!flagged.length) {
        app.dom.interventionItems.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">No students currently need intervention.</p>';
        return;
      }

      app.dom.interventionItems.innerHTML = flagged.map(x => {
        const s = x.student;
        const avg = x.avg;
        const status = app.analytics.getStudentStatus(s);
        const statusClass = `risk-${status}`;
        const weakest = app.analytics.getWeakestSubject(s);
        return `
        <div class="intervention-card">
          <div class="intervention-header">
            <span class="intervention-name">${app.utils.esc(s.name)}</span>
            <span class="risk-pill status-pill ${statusClass}">${this.formatStatusLabel(status)}</span>
          </div>
          <div class="intervention-meta">
            <span class="intervention-avg">Avg: ${avg !== null && avg !== undefined ? avg.toFixed(1) : 'N/A'}%</span>
            <span class="intervention-weakest">Weakest: ${app.utils.esc(weakest)}</span>
          </div>
        </div>`;
      }).join('');
    },

    openPerformanceCategory: function (categoryKey) {
      const categories = app.analytics.getPerformanceCategories();
      const fallbackCategory = categories[0]?.key || 'strong';
      const selectedCategory = categories.some(category => category.key === categoryKey)
        ? categoryKey
        : fallbackCategory;

      app.state.selectedPerformanceCategory = selectedCategory;
      if (app.dom.performanceCategorySelect) {
        app.dom.performanceCategorySelect.value = selectedCategory;
      }

      if (app.sidebar && typeof app.sidebar.showSection === 'function') {
        app.sidebar.showSection('performance-analysis');
      } else {
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        const performanceSection = document.getElementById('performance-analysis');
        if (performanceSection) performanceSection.classList.add('active');
      }

      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === 'performance-analysis');
      });

      this.renderPerformanceAnalysisPanel();
    },

    renderPerformanceAnalysisPanel: function () {
      if (!app.dom.performanceCategorySelect || !app.dom.performanceCategoryCounts || !app.dom.performanceFilteredList || !app.dom.performanceInterventionNeededList) return;

      const categories = app.analytics.getPerformanceCategories();
      const fallbackCategory = categories[0]?.key || 'strong';

      if (!app.dom.performanceCategorySelect.options.length) {
        app.dom.performanceCategorySelect.innerHTML = categories
          .map(option => `<option value="${option.key}">${option.label}</option>`)
          .join('');
      }

      if (!categories.some(option => option.key === app.state.selectedPerformanceCategory)) {
        app.state.selectedPerformanceCategory = fallbackCategory;
      }
      app.dom.performanceCategorySelect.value = app.state.selectedPerformanceCategory;

      const { groups, latestExam } = app.analytics.groupStudentsByStatus();
      app.dom.performanceCategoryCounts.innerHTML = categories.map(option => {
        const count = (groups[option.key] || []).length;
        return `<div class="performance-count-chip risk-${option.key}"><span>${option.label}</span><strong>${count}</strong></div>`;
      }).join('');

      const selectedList = groups[app.state.selectedPerformanceCategory] || [];
      const selectedLabel = categories.find(option => option.key === app.state.selectedPerformanceCategory)?.label || 'Category';
      const selectedRows = selectedList.map(item => `
        <div class="performance-analysis-item">
          <div>
            <div class="performance-analysis-name">${app.utils.esc(item.name)}</div>
            <div class="performance-analysis-meta">${latestExam ? `Latest exam: ${app.utils.esc(latestExam)}` : 'No exam data yet'}</div>
          </div>
          <div class="performance-analysis-side">
            <span class="risk-pill status-pill risk-${app.state.selectedPerformanceCategory}">${selectedLabel}</span>
            <span class="performance-analysis-avg">${item.average !== null && item.average !== undefined ? item.average.toFixed(1) + '%' : 'N/A'}</span>
          </div>
        </div>
      `).join('');

      app.dom.performanceFilteredList.innerHTML = selectedRows || `<p class="performance-analysis-empty">No students in ${selectedLabel} category.</p>`;

      const interventionRows = (groups['at-risk'] || []).map(item => `
        <div class="performance-analysis-item intervention">
          <div>
            <div class="performance-analysis-name">${app.utils.esc(item.name)}</div>
            <div class="performance-analysis-meta">Immediate support recommended</div>
          </div>
          <div class="performance-analysis-side">
            <span class="risk-pill status-pill risk-at-risk">Intervention Needed</span>
            <span class="performance-analysis-avg">${item.average !== null && item.average !== undefined ? item.average.toFixed(1) + '%' : 'N/A'}</span>
          </div>
        </div>
      `).join('');
      app.dom.performanceInterventionNeededList.innerHTML = interventionRows || '<p class="performance-analysis-empty">No students currently in At Risk category.</p>';
    },

    renderClassSummary: function () {
      if (!app.dom.classChart) return; 
      const avgs = app.analytics.calcClassAverages();
      const hasData = avgs.some(v => v.overall !== null);
      
      // Update Chart
      if (app.charts) app.charts.renderClassChart(avgs, hasData, app);

      if (!hasData) {
        if (app.dom.classSummaryCards) app.dom.classSummaryCards.innerHTML = '<p>No data available</p>';
        return;
      }

      // Generate Summary Cards
      if (app.dom.classSummaryCards) {
        let cardsHtml = '';

        avgs.forEach((exam, idx) => {
          let badge = '';
          const hasCurrent = exam.overall !== null && exam.overall !== undefined && !isNaN(exam.overall);

          if (idx > 0) {
            const previousExam = avgs[idx - 1];
            const hasPrevious = previousExam && previousExam.overall !== null && previousExam.overall !== undefined && !isNaN(previousExam.overall);

            if (hasCurrent && hasPrevious) {
              const diff = Number(exam.overall) - Number(previousExam.overall);
              if (diff > 0) badge = '<span class="trend-badge badge-improved">Improved</span>';
              else if (diff < 0) badge = '<span class="trend-badge badge-declined">Declined</span>';
              else badge = '<span class="trend-badge badge-no-change">No Change</span>';
            }
          }

          const avgDisplay = hasCurrent ? `${this.formatFixedOrFallback(exam.overall, 1, '—')}%` : '—';

          cardsHtml += `
            <div class="trend-card">
              <div class="trend-card-header">
                <span class="trend-card-title">${app.utils.esc(exam.name)}</span>
                ${badge}
              </div>
              <div class="trend-card-value">${avgDisplay}</div>
            </div>
          `;
        });
        app.dom.classSummaryCards.innerHTML = cardsHtml;
      }

      // Generate Insight Box
      if (app.dom.classInsightBox && avgs.length >= 2) {
        const current = avgs[avgs.length - 1];
        const previous = avgs[avgs.length - 2];
        const currentOverall = this.toFiniteNumber(current?.overall);
        const previousOverall = this.toFiniteNumber(previous?.overall);
        
        if (currentOverall !== null && previousOverall !== null) {
          const diff = currentOverall - previousOverall;
          const trendClass = diff >= 0 ? 'trend-up' : 'trend-down';
          const icon = diff >= 0 ? '↑' : '↓';
          const statusText = diff >= 0 ? 'improved overall' : 'declined slightly';
          const trendMessage = diff >= 0 
            ? 'Performance trend is upward' 
            : 'Performance trend is downward';

          app.dom.classInsightBox.innerHTML = `
            <div class="insight-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              Performance Insight
            </div>
            <div class="insight-text">
              Class performance <span class="trend-indicator ${trendClass}">${icon} ${statusText}</span> by <strong>${Math.abs(diff).toFixed(1)}%</strong> from ${app.utils.esc(previous.name)} to ${app.utils.esc(current.name)}.
              <br><span style="font-weight:600; color:var(--text); margin-top:0.35rem; display:inline-block;">${trendMessage}.</span>
            </div>
          `;
        }
      } else if (app.dom.classInsightBox) {
        app.dom.classInsightBox.innerHTML = '<div class="insight-text">Add scores for another exam to see performance trends and insights.</div>';
      }
    },

    openNotes: function (uid) {
      const s = app.state.students.find(x => x.id === uid); if (!s) return;
      app.state.notesId = uid;
      if (app.dom.notesModalTitle) app.dom.notesModalTitle.textContent = s.name;
      if (app.dom.notesTextarea) app.dom.notesTextarea.value = s.notes || '';
      if (app.dom.notesTextarea) app.dom.notesTextarea.readOnly = this.isReadOnlyRoleContext();
      if (app.dom.notesSaveBtn) {
        app.dom.notesSaveBtn.disabled = this.isReadOnlyRoleContext();
        app.dom.notesSaveBtn.title = this.isReadOnlyRoleContext() ? this.getReadOnlyModeLabel() : 'Save Notes';
      }
      if (app.dom.notesModal) app.dom.notesModal.classList.add('active');
    },

    saveNotes: async function () {
      if (!this.ensureWritableAction('Notes saving')) {
        return;
      }

      try {
        const s = app.state.students.find(x => x.id === app.state.notesId);
        if (s) {
          await app.updateStudent(s.id, { notes: app.dom.notesTextarea.value });
          this.refreshUI();
        }
      } catch (error) {
        console.error('Failed to save notes:', error);
        this.showToast('Failed to save notes');
      }
      if (app.dom.notesModal) app.dom.notesModal.classList.remove('active');
    },

    getExportDateStamp: function () {
      return new Date().toISOString().split('T')[0];
    },

    getTeacherNameForExport: function () {
      const authName = String(auth?.currentUser?.displayName || '').trim();
      const globalTeacherName = typeof window !== 'undefined'
        ? String(window.__TEACHER_NAME__ || window.teacherName || '').trim()
        : '';
      return globalTeacherName || authName || 'N/A';
    },

    buildReportExportMeta: function () {
      const dateGenerated = new Date().toLocaleString();
      const teacherName = app.utils.esc(this.getTeacherNameForExport());
      return `
        <div class="rc-export-meta">
          <h2 class="rc-export-meta-title">Student Performance Report</h2>
          <div class="rc-export-meta-row">
            <span>Date Generated: ${app.utils.esc(dateGenerated)}</span>
            <span>Teacher: ${teacherName}</span>
          </div>
        </div>
      `;
    },

    normalizeMissingValuesForExport: function (container) {
      if (!container) return;
      container.querySelectorAll('td, th, strong, span, div').forEach((node) => {
        const value = String(node.textContent || '').trim();
        if (value === '—' || value === '--' || value === '––') {
          node.textContent = 'N/A';
        }
      });
    },

    buildReportExportPage: function (reportCard, addPageBreak = false) {
      const page = document.createElement('section');
      page.className = 'rc-export-page';
      if (addPageBreak) {
        page.classList.add('rc-export-page-break');
      }

      page.innerHTML = this.buildReportExportMeta();
      const reportClone = reportCard.cloneNode(true);
      this.normalizeMissingValuesForExport(reportClone);
      page.appendChild(reportClone);
      return page;
    },

    setReportExportState: function (isLoading, message = '') {
      this.isReportExporting = !!isLoading;
      const statusText = isLoading ? (message || 'Generating report...') : (message || '');
      if (app.dom.reportExportStatus) {
        app.dom.reportExportStatus.textContent = statusText;
      }

      [app.dom.reportExportPdfBtn, app.dom.reportExportAllPdfBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = !!isLoading;
      });
    },

    buildPdfOptions: function (fileName) {
      return {
        margin: [10, 10, 10, 10],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: {
          mode: ['css', 'legacy'],
          avoid: ['.report-card', '.rc-table tr'],
          before: '.rc-export-page-break'
        }
      };
    },

    exportCurrentReportPdf: async function () {
      if (this.isReportExporting) {
        return;
      }
      if (typeof window.html2pdf !== 'function') {
        this.showToast('PDF export library unavailable');
        return;
      }
      if (!(app.state.students || []).length) {
        this.showToast('No students to export');
        return;
      }
      if (!app.dom.reportContainer) {
        this.showToast('Open a student report first');
        return;
      }

      const reportCard = app.dom.reportContainer.querySelector('.report-card');
      if (!reportCard) {
        this.showToast('Open a student report first');
        return;
      }

      const studentName = reportCard.querySelector('.rc-title')?.textContent || 'Student';
      const dateStamp = this.getExportDateStamp();
      const fileName = `student-report-${dateStamp}.pdf`;

      this.setReportExportState(true, 'Generating report...');
      try {
        const exportRoot = document.createElement('div');
        exportRoot.className = 'rc-export-batch';
        exportRoot.setAttribute('aria-label', `Student report for ${studentName}`);
        exportRoot.appendChild(this.buildReportExportPage(reportCard));
        await window.html2pdf().set(this.buildPdfOptions(fileName)).from(exportRoot).save();
        this.setReportExportState(false, 'Export complete');
        this.showToast('Export complete');
        setTimeout(() => this.setReportExportState(false, ''), 1800);
      } catch (error) {
        console.error('Failed to export student report PDF:', error);
        this.setReportExportState(false, 'Export failed');
        this.showToast('Failed to export PDF');
      }
    },

    exportAllReportsPdf: async function () {
      if (this.isReportExporting) {
        return;
      }
      if (typeof window.html2pdf !== 'function') {
        this.showToast('PDF export library unavailable');
        return;
      }
      if (!app.dom.reportContainer || !app.dom.reportModal) {
        this.showToast('Report UI unavailable');
        return;
      }

      const students = app.state.students || [];
      if (!students.length) {
        this.showToast('No students to export');
        return;
      }

      const wasOpen = app.dom.reportModal.classList.contains('active');
      const originalMarkup = app.dom.reportContainer.innerHTML;
      const dateStamp = this.getExportDateStamp();

      this.setReportExportState(true, `Generating report... (${students.length} students)`);

      try {
        const exportRoot = document.createElement('div');
        exportRoot.className = 'rc-export-batch';

        students.forEach((student, idx) => {
          this.openReport(student.id);
          const reportCard = app.dom.reportContainer.querySelector('.report-card');
          if (!reportCard) return;

          exportRoot.appendChild(this.buildReportExportPage(reportCard, idx > 0));
        });

        if (!exportRoot.childElementCount) {
          throw new Error('No report content available for export');
        }

        app.dom.reportContainer.innerHTML = originalMarkup;
        if (wasOpen) {
          app.dom.reportModal.classList.add('active');
        } else {
          app.dom.reportModal.classList.remove('active');
        }

        await window.html2pdf().set(this.buildPdfOptions(`student-report-${dateStamp}-all.pdf`)).from(exportRoot).save();

        this.setReportExportState(false, 'Export complete');
        this.showToast('Export complete');
        setTimeout(() => this.setReportExportState(false, ''), 1800);
      } catch (error) {
        app.dom.reportContainer.innerHTML = originalMarkup;
        if (wasOpen) {
          app.dom.reportModal.classList.add('active');
        } else {
          app.dom.reportModal.classList.remove('active');
        }

        console.error('Failed to export all reports PDF:', error);
        this.setReportExportState(false, 'Export failed');
        this.showToast('Failed to export all reports');
      }
    },

    openReport: function (uid) {
      const s = app.state.students.find(x => x.id === uid);
      if (!s || !app.dom.reportContainer || !app.dom.reportModal) return;

      const exams = app.state.exams || [];
      const subjects = app.state.subjects || [];
      const avgs = app.analytics.calcAverages(s);
      const avgValue = app.analytics.getStudentOverallAverage(s);
      const { previousExam, latestExam } = app.analytics.getLastTwoExams();
      const status = app.analytics.getStudentStatus(s, latestExam);
      const statusClass = `risk-${status}`;

      const examCount = exams.length;
      const currentScore = latestExam ? app.analytics.getTotal(s, latestExam) : null;
      const previousScore = previousExam ? app.analytics.getTotal(s, previousExam) : null;
      const improvement = this.formatImprovement(currentScore, previousScore);

      const ranked = (app.state.students || [])
        .map(student => ({ id: student.id, avg: app.analytics.getStudentOverallAverage(student) }))
        .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
      const rankPos = Math.max(1, ranked.findIndex(item => item.id === s.id) + 1);
      const totalStudents = app.state.students.length || 1;

      const formatOrdinal = (num) => {
        const n = Number(num);
        if (!Number.isFinite(n)) return String(num);
        const mod100 = n % 100;
        if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
        const mod10 = n % 10;
        if (mod10 === 1) return `${n}st`;
        if (mod10 === 2) return `${n}nd`;
        if (mod10 === 3) return `${n}rd`;
        return `${n}th`;
      };

      const getPerformanceTone = (value) => {
        const v = Number(value);
        if (!Number.isFinite(v)) return 'neutral';
        if (v >= 70) return 'good';
        if (v >= 50) return 'avg';
        return 'risk';
      };

      const getRankMedal = (value) => {
        if (value === 1) return '🥇';
        if (value === 2) return '🥈';
        if (value === 3) return '🥉';
        return '🏅';
      };

      const rankDisplay = `${getRankMedal(rankPos)} ${formatOrdinal(rankPos)} out of ${totalStudents} students`;
      const statusLabel = this.formatStatusLabel(status);
      const overallTone = getPerformanceTone(avgValue);
      const overallClass = overallTone === 'good' ? 'rc-tone-good' : (overallTone === 'avg' ? 'rc-tone-avg' : (overallTone === 'risk' ? 'rc-tone-risk' : 'rc-tone-neutral'));

      let strongest = 'N/A';
      let weakest = 'N/A';
      let strongestScore = -Infinity;
      let weakestScore = Infinity;
      subjects.forEach(subject => {
        const value = avgs[subject.name];
        if (value === null || value === undefined || isNaN(value)) return;
        if (value > strongestScore) {
          strongestScore = value;
          strongest = subject.name;
        }
        if (value < weakestScore) {
          weakestScore = value;
          weakest = subject.name;
        }
      });

      const examHeaders = exams.length
        ? exams.map(exam => `<th>${app.utils.esc(exam.title || exam.name)}</th>`).join('')
        : '<th>No Exams</th>';

      const subjectRows = subjects.length
        ? subjects.map(subject => {
          const subjectAverage = avgs[subject.name];

          const numericScores = exams.length
            ? exams.map(exam => {
              const v = app.analytics.getScore(s, subject, exam);
              const n = Number(v);
              return (v === '' || v === null || v === undefined || isNaN(n)) ? null : n;
            })
            : [];
          const rowMax = numericScores.length ? numericScores.reduce((acc, v) => (v === null ? acc : Math.max(acc, v)), -Infinity) : -Infinity;

          const examCellsHtml = exams.length
            ? exams.map((exam) => {
              const score = app.analytics.getScore(s, subject, exam);
              const n = Number(score);
              const isBest = Number.isFinite(n) && n === rowMax;
              const bestClass = isBest ? ' rc-best' : '';
              return `<td class="rc-score-cell${bestClass}">${score === '' ? '&#8212;' : app.utils.esc(score)}</td>`;
            }).join('')
            : '<td class="rc-score-cell">&#8212;</td>';

          const subjectTone = getPerformanceTone(subjectAverage);
          const subjectAvgClass = subjectTone === 'good' ? 'rc-tone-good' : (subjectTone === 'avg' ? 'rc-tone-avg' : (subjectTone === 'risk' ? 'rc-tone-risk' : 'rc-tone-neutral'));

          return `<tr>
            <td class="rc-subject">${app.utils.esc(subject.name)}</td>
            ${examCellsHtml}
            <td class="rc-avg-cell ${subjectAvgClass}">${app.utils.esc(this.formatFixedOrFallback(subjectAverage, 1, '—'))}</td>
          </tr>`;
        }).join('')
        : `<tr><td colspan="${Math.max(3, exams.length + 2)}">No subjects added yet.</td></tr>`;

      const notesText = s.notes ? app.utils.esc(s.notes) : 'Teacher feedback will appear here.';
      const overallAverageDisplay = (() => {
        const numericAverage = this.toFiniteNumber(avgValue);
        if (numericAverage === null) return 'N/A';
        return `${this.formatFixedOrFallback(numericAverage, 1, 'N/A')}%`;
      })();

      let autoSummary = '';
      if (!s.notes) {
        const firstName = app.utils.esc(String(s.name || 'Student').split(' ')[0]);
        if (Number.isFinite(Number(avgValue)) && Number(avgValue) >= 70) {
          autoSummary = `${firstName} is performing strongly overall, with excellent results in ${app.utils.esc(strongest)}.`;
        } else if (Number.isFinite(Number(avgValue)) && Number(avgValue) >= 50) {
          autoSummary = `${firstName} is maintaining an average performance. More focus on ${app.utils.esc(weakest)} can improve balance.`;
        } else if (Number.isFinite(Number(avgValue))) {
          autoSummary = `${firstName} is currently at risk and needs targeted support, especially in ${app.utils.esc(weakest)}.`;
        }
      } else {
        const summaryParts = [];
        if (s.name) {
          const perfWord = overallTone === 'good' ? 'strongly' : (overallTone === 'avg' ? 'on average' : 'below expectations');
          summaryParts.push(`${app.utils.esc(s.name)} is performing ${perfWord} overall`);
        }
        if (strongest && strongest !== 'N/A') summaryParts.push(`with excellent results in ${app.utils.esc(strongest)}`);
        if (weakest && weakest !== 'N/A') summaryParts.push(`improvement is needed in ${app.utils.esc(weakest)}`);
        autoSummary = summaryParts.length ? `${summaryParts.join(', ')}.` : '';
      }

      const reportMarkup = `
        <div class="report-card">
          <div class="rc-header">
            <div class="rc-school">Student Performance Report</div>
            <div class="rc-title">${app.utils.esc(s.name)}</div>
            <div class="rc-generated">Generated: ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="rc-info">
            <div><span>Student</span><strong>${app.utils.esc(s.name)}</strong></div>
            <div class="rc-rank"><span>Rank</span><strong class="rc-rank-value">${app.utils.esc(rankDisplay)}</strong></div>
            <div><span>Status</span><strong class="${statusClass} rc-status">${statusLabel}</strong></div>
            <div class="rc-overall"><span>Overall Average</span><strong class="rc-overall-value ${overallClass}">${app.utils.esc(overallAverageDisplay)}</strong></div>
          </div>

          <div class="rc-summary">
            <div class="rc-summary-item"><span>Latest Total</span><strong>${app.utils.esc(this.formatFixedOrFallback(currentScore, 1, 'N/A'))}</strong></div>
            <div class="rc-summary-item"><span>Previous Total</span><strong>${app.utils.esc(this.formatFixedOrFallback(previousScore, 1, 'N/A'))}</strong></div>
            <div class="rc-summary-item"><span>Improvement</span><strong class="${app.utils.esc(improvement.className || 'improv-neutral')}">${app.utils.esc(improvement.text || 'N/A')}</strong></div>
            <div class="rc-summary-item"><span>Exams Taken</span><strong>${examCount}</strong></div>
          </div>

          <div class="rc-section">
            <h4>Subject Performance</h4>
            <table class="rc-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  ${examHeaders}
                  <th class="rc-avg-col">AVG</th>
                </tr>
              </thead>
              <tbody>
                ${subjectRows}
              </tbody>
            </table>
          </div>
          <div class="rc-analysis">
            <div class="rc-analysis-card"><span>🏆 Strongest Subject</span><strong>${app.utils.esc(strongest)}</strong></div>
            <div class="rc-analysis-card"><span>📉 Weakest Subject</span><strong>${app.utils.esc(weakest)}</strong></div>
            <div class="rc-analysis-card"><span>📊 Performance Level</span><strong class="${statusClass}">${statusLabel}</strong></div>
          </div>

          <div class="rc-section">
            <h4>Teacher Notes</h4>
            <div class="rc-notes">
              <div class="rc-notes-body">${notesText}</div>
              ${autoSummary ? `<div class="rc-notes-summary"><span>Summary</span><strong>${autoSummary}</strong></div>` : ''}
            </div>
          </div>

          <div class="rc-footer">
            <div class="rc-sig"><div class="rc-sig-line"></div><span>Class Teacher</span><div class="rc-sig-date">Date: __________</div></div>
            <div class="rc-sig"><div class="rc-sig-line"></div><span>Head Teacher</span><div class="rc-sig-date">Date: __________</div></div>
          </div>
        </div>
      `;

      app.dom.reportContainer.innerHTML = reportMarkup;
      app.dom.reportModal.classList.add('active');
    },

    printReportOnly: function () {
      if (!app.dom.reportContainer || !app.dom.reportModal) return;
      const hasReportContent = app.dom.reportContainer.innerHTML.trim().length > 0;
      if (!hasReportContent) {
        this.showToast('Open a student report first');
        return;
      }

      const wasOpen = app.dom.reportModal.classList.contains('active');
      if (!wasOpen) {
        app.dom.reportModal.classList.add('active');
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.body.classList.remove('printing-report');
        window.removeEventListener('afterprint', cleanup);
        if (!wasOpen && app.dom.reportModal) {
          app.dom.reportModal.classList.remove('active');
        }
      };

      document.body.classList.add('printing-report');
      window.addEventListener('afterprint', cleanup);
      window.print();
      setTimeout(cleanup, 1200);
    },

    loadScoreFields: function () {
      const sid = app.dom.scoreStudentSelect.value, mid = app.dom.scoreMockSelect.value;
      const s = app.state.students.find(x => x.id === sid);
      const exam = app.state.exams.find(x => x.id === mid);
      if (s) {
        app.dom.dynamicSubjectFields.innerHTML = app.state.subjects.map(sb => {
          const value = exam ? app.analytics.getScore(s, sb, exam) : '';
          return `<div class="form-group"><label>${app.utils.esc(sb.name)}</label><input type="number" data-subject="${sb.name}" value="${value}"></div>`;
        }).join('');
      } else {
        app.dom.dynamicSubjectFields.innerHTML = '';
      }
    },

    renderBulkTable: function () {
      if (!app.dom.bulkScoreHead || !app.dom.bulkScoreBody) return;
      
      const headHtml = '<th>Student</th>' + app.state.subjects.map(s => `<th>${app.utils.esc(s.name)}</th>`).join('');
      app.dom.bulkScoreHead.innerHTML = `<tr>${headHtml}</tr>`;
      
      const examId = app.dom.bulkMockSelect?.value || app.state.selectedBulkExamId || '';
      app.state.selectedBulkExamId = examId;
      const exam = app.state.exams.find(e => e.id === examId);
      const bodyHtml = app.state.students.map(s => {
        const row = app.state.subjects.map(sub => {
          const val = exam ? app.analytics.getScore(s, sub, exam) : '';
          return `<td><input type="number" class="bulk-score-input" data-sid="${s.id}" data-sub="${sub.name}" value="${val === '' ? '' : val}" min="0" max="100"></td>`;
        }).join('');
        const studentName = app.utils.esc(s.name);
        return `<tr><td class="sticky-col"><div class="bulk-student-cell"><span class="bulk-student-name">${studentName}</span><button type="button" class="bulk-row-reset-btn" data-reset-student-id="${s.id}" title="Clear all marks for ${studentName}" aria-label="Clear all marks for ${studentName}">&#8635;</button></div></td>${row}</tr>`;
      }).join('');
      
      app.dom.bulkScoreBody.innerHTML = bodyHtml;
    },

    refreshUI: function () {
      console.log("Refreshing UI...");
      try {
        this.updateRoleBasedUIAccess();
        this.applyReadOnlyRoleState();

        if (app.state.isLoading) {
          if (app.dom.emptyMsg) {
            app.dom.emptyMsg.style.display = 'block';
          }
          this.updateDashboardStats();
          return;
        }

        if (app.dom.emptyMsg) app.dom.emptyMsg.style.display = app.state.students.length ? 'none' : 'block';
        this.renderClassControls();
        this.renderManagement();
        this.populateSelects();
        this.loadScoreFields();
        this.updateDashboardStats();
        this.renderPerformanceAnalysisPanel();
        this.renderClassSummary();
        this.renderStudentChips();
        this.renderTrashList();
        this.renderResultsTable();
        this.renderBulkTable();
        this.updateBackupStatus();
        this.applyReadOnlyRoleState();
        
        // Render heatmap
        app.heatmap.renderHeatmap(app);
      } catch (e) {
        console.error("RefreshUI Error:", e);
      }
    },

    renderAll: function () { this.refreshUI(); },

    renderManagement: function () {
      if (!app.dom.mockList || !app.dom.subjectList) return;
      app.dom.mockList.innerHTML = app.state.exams.map(m => `
        <div class="mock-item">
          <input type="text" value="${app.utils.esc(m.title || m.name)}" onchange="window.TrackerApp.ui.renameExam('${m.id}', this.value)">
          <button onclick="window.TrackerApp.ui.deleteExam('${m.id}')">×</button>
        </div>`).join('');
      app.dom.subjectList.innerHTML = app.state.subjects.map(s => `
        <div class="mock-item">
          <input type="text" value="${app.utils.esc(s.name)}" onchange="window.TrackerApp.ui.renameSubject('${s.id}', this.value)">
          <button onclick="window.TrackerApp.ui.deleteSubject('${s.id}')">×</button>
        </div>`).join('');
    },

    renameExam: async function (id, name) { 
      if (!this.ensureWritableAction('Exam updates')) {
        return;
      }

      try {
        await app.updateExam(id, { title: name.trim() });
        this.refreshUI(); 
      } catch (error) {
        console.error('Failed to rename exam:', error);
        app.ui.showToast('Failed to rename exam');
      }
    },
    deleteExam: async function (id) { 
      if (!this.ensureWritableAction('Exam deletion')) {
        return;
      }

      if (confirm("Delete exam?")) { 
        try {
          const examName = app.state.exams.find(item => item.id === id)?.title
            || app.state.exams.find(item => item.id === id)?.name
            || 'Exam';
          const deletedEntry = await app.deleteExam(id);
          this.refreshUI(); 
          this.showUndoDeleteToast(deletedEntry?.id || id, deletedEntry?.name || examName, 'exam');
        } catch (error) {
          console.error('Failed to delete exam:', error);
          app.ui.showToast('Failed to delete exam');
        }
      } 
    },
    renameSubject: async function (id, n) {
      if (!this.ensureWritableAction('Subject updates')) {
        return;
      }

      try {
        await app.updateSubject(id, { name: n.trim() });
        this.refreshUI();
      } catch (error) {
        console.error('Failed to rename subject:', error);
        app.ui.showToast('Failed to rename subject');
      }
    },
    deleteSubject: async function (id) {
      if (!this.ensureWritableAction('Subject deletion')) {
        return;
      }

      if (confirm("Delete subject?")) {
        try {
          const subjectName = app.state.subjects.find(item => item.id === id)?.name || 'Subject';
          const deletedEntry = await app.deleteSubject(id);
          this.refreshUI();
          this.showUndoDeleteToast(deletedEntry?.id || id, deletedEntry?.name || subjectName, 'subject');
        } catch (error) {
          console.error('Failed to delete subject:', error);
          app.ui.showToast('Failed to delete subject');
        }
      }
    },

    bindEvents: function () {
      console.log('Binding events...');
      try {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
          tab.addEventListener('click', (event) => {
            if (this.isRoleRestrictedElement(tab)) {
              event.preventDefault();
              this.showToast(`Access denied: ${this.getElementAccessMessage(tab)}`);
              return;
            }

            console.log('Tab clicked:', tab);

            const target = tab.dataset.section;
            if (!target) return;

            document.querySelectorAll('.section, .content-section').forEach(section => {
              section.style.display = 'none';
              section.classList.remove('active');
            });

            const activeSection = document.getElementById(target);
            if (activeSection) {
              activeSection.style.display = 'block';
              activeSection.classList.add('active');
            }

            tabs.forEach(tabItem => tabItem.classList.remove('active'));
            tab.classList.add('active');
          });
        });

        if (!this.hasBoundAccessGuardEvents) {
          document.addEventListener('click', (event) => {
            const restrictedTarget = event.target.closest('[data-role-restricted="true"]');
            if (!restrictedTarget) return;

            event.preventDefault();
            event.stopPropagation();
            this.showToast(`Access denied: ${this.getElementAccessMessage(restrictedTarget)}`);
          }, true);

          document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const restrictedTarget = event.target.closest('[data-role-restricted="true"]');
            if (!restrictedTarget) return;

            event.preventDefault();
            event.stopPropagation();
            this.showToast(`Access denied: ${this.getElementAccessMessage(restrictedTarget)}`);
          }, true);

          this.hasBoundAccessGuardEvents = true;
        }

        // Initialize sidebar
        if (app.sidebar && app.sidebar.init) {
          app.sidebar.init();
        }
        
        if (app.dom.form) {
          app.dom.form.onsubmit = async (e) => {
            e.preventDefault();
            if (!this.ensureWritableClassAction('Student creation', 'add student')) return;
            const didAddStudent = await app.students.addStudent(app.dom.nameInput.value, app, this);
            if (didAddStudent && app.dom.nameInput) {
              app.dom.nameInput.value = '';
              app.dom.nameInput.focus();
            }
          };
        }
        if (app.dom.classDropdownToggle) {
          app.dom.classDropdownToggle.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleClassDropdown();
          };
        }
        if (app.dom.classDropdownMenu) {
          app.dom.classDropdownMenu.onclick = async (e) => {
            const target = e.target.closest('.class-dropdown-item[data-class-id]');
            if (!target || target.disabled) return;
            const nextClassId = String(target.dataset.classId || '').trim();
            const nextOwnerId = String(target.dataset.ownerId || '').trim();
            if (!nextClassId) return;
            await this.switchToClass(nextClassId, nextOwnerId);
          };
        }
        if (!this.hasBoundClassDropdownEvents) {
          document.addEventListener('click', (e) => {
            if (!app.dom.classDropdown) return;
            if (app.dom.classDropdown.contains(e.target)) return;
            this.closeClassDropdown();
          });
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              this.closeClassDropdown();
            }
          });
          this.hasBoundClassDropdownEvents = true;
        }
        if (app.dom.classPrevBtn) {
          app.dom.classPrevBtn.onclick = async () => {
            await this.cycleClass(-1);
          };
        }
        if (app.dom.classNextBtn) {
          app.dom.classNextBtn.onclick = async () => {
            await this.cycleClass(1);
          };
        }
        if (app.dom.createClassBtn) {
          app.dom.createClassBtn.onclick = async () => {
            if (!this.ensureWritableAction('Class creation')) return;

            const className = prompt('Enter class name', 'My Class');
            const normalizedName = String(className || '').trim();
            if (!normalizedName) return;

            try {
              await app.createClass(normalizedName);
              this.refreshUI();
              this.showToast('Class created');
            } catch (error) {
              console.error('Failed to create class:', error);
              this.showToast(error?.message || 'Failed to create class');
            }
          };
        }
        if (app.dom.deleteClassBtn) {
          app.dom.deleteClassBtn.onclick = async () => {
            if (!this.ensureWritableAction('Class deletion')) return;

            const activeClassName = app.state.currentClassName || 'this class';
            const shouldDelete = confirm(`Move ${activeClassName} to Trash? You can restore it later from Trash.`);
            if (!shouldDelete) return;

            try {
              const deletedEntry = await app.deleteClass(app.state.currentClassId);
              this.refreshUI();
              this.showUndoDeleteToast(deletedEntry?.id || app.state.currentClassId, deletedEntry?.name || activeClassName, 'class');
            } catch (error) {
              console.error('Failed to delete class:', error);
              this.showToast(error?.message || 'Failed to delete class');
            }
          };
        }
        if (app.dom.createSnapshotBtn) app.dom.createSnapshotBtn.onclick = () => {
          if (!this.requireAccess('restorePoints')) return;
          this.createSnapshot('Manual Restore Point');
        };
        if (app.dom.snapshotManagerBtn) app.dom.snapshotManagerBtn.onclick = () => {
          if (!this.requireAccess('restorePoints')) return;
          this.openSnapshotModal();
        };
        if (app.dom.backupBtn) app.dom.backupBtn.onclick = () => {
          if (!this.requireAccess('exportData')) return;
          app.export.exportBackup(app);
        };
        if (app.dom.restoreBtn) app.dom.restoreBtn.onclick = () => {
          if (!this.requireAccess('importData')) return;
          app.dom.restoreInput.click();
        };
        if (app.dom.restoreInput) app.dom.restoreInput.onchange = (e) => {
          if (!this.requireAccess('importData')) {
            if (app.dom.restoreInput) app.dom.restoreInput.value = '';
            return;
          }
          app.export.importBackup(e.target.files[0], app);
        };
        if (app.dom.systemCreateRestorePointBtn) app.dom.systemCreateRestorePointBtn.onclick = () => {
          if (!this.requireAccess('restorePoints')) return;
          app.dom.createSnapshotBtn?.click();
        };
        if (app.dom.systemRestorePointsBtn) app.dom.systemRestorePointsBtn.onclick = () => {
          if (!this.requireAccess('restorePoints')) return;
          app.dom.snapshotManagerBtn?.click();
        };
        if (app.dom.systemExportDataBtn) app.dom.systemExportDataBtn.onclick = () => {
          if (!this.requireAccess('exportData')) return;
          app.dom.backupBtn?.click();
        };
        if (app.dom.systemImportDataBtn) app.dom.systemImportDataBtn.onclick = () => {
          if (!this.requireAccess('importData')) return;
          app.dom.restoreBtn?.click();
        };
        if (app.dom.systemThemeToggleBtn) app.dom.systemThemeToggleBtn.onclick = () => app.dom.themeToggle?.click();
        if (app.dom.adminDashboardBtn) {
          app.dom.adminDashboardBtn.onclick = (event) => {
            event.preventDefault();
            if (!this.requireAccess('adminPanel')) return;
            window.location.assign('/admin.html');
          };
        }
        if (app.dom.systemResetBtn) {
          app.dom.systemResetBtn.onclick = () => {
            if (!this.requireAccess('resetSystem')) return;
            const confirmed = confirm('Are you sure you want to reset the system? This action cannot be undone.');
            if (!confirmed) return;
            app.dom.resetBtn?.click();
          };
        }
        if (app.dom.snapshotCloseBtn) app.dom.snapshotCloseBtn.onclick = () => this.closeSnapshotModal();
        if (app.dom.themeToggle) app.dom.themeToggle.onclick = () => { app.state.theme = app.state.theme === 'light' ? 'dark' : 'light'; app.applyTheme(); };
        if (app.dom.resetBtn) app.dom.resetBtn.onclick = () => {
          if (!this.requireAccess('resetSystem')) return;
          app.dom.resetModal.classList.add('active');
        };
        if (app.dom.resetConfirmBtn) app.dom.resetConfirmBtn.onclick = async () => {
          if (!this.requireAccess('resetSystem')) return;
          await this.clearAllData();
          app.dom.resetModal.classList.remove('active');
        };
        if (app.dom.resetCancelBtn) app.dom.resetCancelBtn.onclick = () => app.dom.resetModal.classList.remove('active');
        if (app.dom.bulkImportBtn) app.dom.bulkImportBtn.onclick = () => {
          if (!this.requireAccess('bulkImport')) return;
          app.dom.bulkImportModal.classList.add('active');
        };
        if (app.dom.bulkImportConfirmBtn) app.dom.bulkImportConfirmBtn.onclick = () => {
          if (!this.requireAccess('bulkImport')) return;
          if (!this.ensureWritableAction('Bulk add')) return;
          if (!confirm('Import all listed students into the active class?')) return;
          app.students.bulkImport(app.dom.bulkImportTextarea.value, app, this);
          app.dom.bulkImportModal.classList.remove('active');
        };
        if (app.dom.bulkImportCancelBtn) app.dom.bulkImportCancelBtn.onclick = () => app.dom.bulkImportModal.classList.remove('active');
        if (app.dom.editSaveBtn) app.dom.editSaveBtn.onclick = () => {
          if (!this.ensureWritableAction('Student updates')) return;
          app.students.saveEdit(app, this);
        };
        if (app.dom.editCancelBtn) {
          app.dom.editCancelBtn.onclick = () => {
            app.state.editingId = null;
            app.dom.editModal.classList.remove('active');
          };
        }
        if (app.dom.deleteConfirmBtn) app.dom.deleteConfirmBtn.onclick = () => {
          if (!this.ensureWritableAction('Student deletion')) return;
          app.students.confirmDelete(app, this);
        };
        if (app.dom.deleteCancelBtn) {
          app.dom.deleteCancelBtn.onclick = () => {
            app.state.deletingId = null;
            app.dom.deleteModal.classList.remove('active');
          };
        }
        if (app.dom.editInput) {
          app.dom.editInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              app.students.saveEdit(app, this);
            }
          };
        }
        if (app.dom.notesSaveBtn) app.dom.notesSaveBtn.onclick = () => this.saveNotes();
        if (app.dom.notesCancelBtn) app.dom.notesCancelBtn.onclick = () => app.dom.notesModal.classList.remove('active');
        if (app.dom.bulkScoreBtn) app.dom.bulkScoreBtn.onclick = () => { app.dom.bulkScoreModal.classList.add('active'); this.renderBulkTable(); };
        if (app.dom.bulkScoreCancelBtn) app.dom.bulkScoreCancelBtn.onclick = () => app.dom.bulkScoreModal.classList.remove('active');
        if (app.dom.bulkScoreSaveBtn) app.dom.bulkScoreSaveBtn.onclick = () => {
          if (!this.ensureWritableAction('Bulk score save')) return;
          if (!confirm('Save all entered scores for this exam?')) return;
          app.students.saveBulkScores(app.dom.bulkMockSelect.value, app.dom.bulkScoreBody.querySelectorAll('.bulk-score-input'), app, this);
        };
        if (app.dom.addMockForm) app.dom.addMockForm.onsubmit = async (e) => { 
          e.preventDefault(); 
          if (!this.ensureWritableClassAction('Exam creation', 'add exam')) return;
          if (app.dom.mockNameInput.value.trim()) { 
            try {
              await app.addExam({ title: app.dom.mockNameInput.value.trim(), date: new Date().toISOString() });
              this.refreshUI(); 
              app.ui.showToast('Exam added');
            } catch (error) {
              console.error('Failed to add exam:', error);
              app.ui.showToast(this.resolveClassContextErrorMessage(error, 'Failed to add exam'));
            }
          } 
          app.dom.mockNameInput.value = ''; 
        };
        if (app.dom.addSubjectForm) app.dom.addSubjectForm.onsubmit = async (e) => { 
          e.preventDefault(); 
          if (!this.ensureWritableClassAction('Subject creation', 'add subject')) return;
          if (app.dom.subjectNameInput.value.trim()) { 
            try {
              await app.addSubject({ name: app.dom.subjectNameInput.value.trim() });
              this.refreshUI(); 
            } catch (error) {
              console.error('Failed to add subject:', error);
              app.ui.showToast(this.resolveClassContextErrorMessage(error, 'Failed to add subject'));
            }
          } 
          app.dom.subjectNameInput.value = ''; 
        };
        if (app.dom.saveScoresBtn) app.dom.saveScoresBtn.onclick = () => {
          if (!this.ensureWritableAction('Score save')) return;
          const sid = app.dom.scoreStudentSelect.value, mid = app.dom.scoreMockSelect.value;
          const scores = {};
          app.dom.dynamicSubjectFields.querySelectorAll('input').forEach(f => {
            const subjectName = f.dataset.subject;
            if (subjectName) {
              scores[subjectName] = app.normalizeScore(f.value);
            }
          });
          app.students.saveScores(sid, mid, scores, app, this);
        };
        if (app.dom.scoreStudentSelect) app.dom.scoreStudentSelect.onchange = () => this.loadScoreFields();
        if (app.dom.scoreMockSelect) app.dom.scoreMockSelect.onchange = () => { this.loadScoreFields(); this.refreshUI(); };
        if (app.dom.bulkMockSelect) app.dom.bulkMockSelect.onchange = () => {
          app.state.selectedBulkExamId = app.dom.bulkMockSelect.value || '';
          this.renderBulkTable();
        };
        if (app.dom.chartStudentSelect) app.dom.chartStudentSelect.onchange = () => app.charts.renderStudentChart(app.dom.chartStudentSelect.value, app);
        if (app.dom.studentRosterSearchInput) {
          app.dom.studentRosterSearchInput.oninput = (e) => {
            app.state.studentRosterSearchTerm = e.target.value || '';
            this.renderStudentChips();
          };
        }
        if (app.dom.searchInput) app.dom.searchInput.oninput = (e) => { app.state.searchTerm = e.target.value; this.renderResultsTable(); };
        if (app.dom.studentList) {
          app.dom.studentList.addEventListener('click', (e) => {
            const actionButton = e.target.closest('[data-student-action]');
            if (!actionButton) return;

            const studentId = String(actionButton.dataset.studentId || '').trim();
            if (!studentId) return;

            const action = actionButton.dataset.studentAction;
            if (action === 'edit') {
              if (!this.ensureWritableAction('Student updates')) return;
              app.students.startEdit(studentId, app, this);
              return;
            }

            if (action === 'delete') {
              if (!this.ensureWritableAction('Student deletion')) return;
              app.students.deleteStudent(studentId, app, this);
            }
          });
        }
        if (app.dom.trashList) {
          app.dom.trashList.addEventListener('click', async (e) => {
            const trigger = e.target.closest('[data-trash-action]');
            if (!trigger) return;

            const action = String(trigger.dataset.trashAction || '').trim();
            const itemId = String(trigger.dataset.trashId || '').trim();
            const itemType = String(trigger.dataset.trashType || 'student').trim().toLowerCase();
            const typeLabel = itemType === 'class' ? 'class' : itemType === 'exam' ? 'exam' : itemType === 'subject' ? 'subject' : 'student';
            if (!action || !itemId) return;

            trigger.disabled = true;

            try {
              if (action === 'restore') {
                if (!this.ensureWritableAction('Trash restore')) return;
                if (itemType === 'class') {
                  await app.restoreClass(itemId);
                } else if (itemType === 'exam') {
                  await app.restoreExam(itemId);
                } else if (itemType === 'subject') {
                  await app.restoreSubject(itemId);
                } else {
                  await app.restoreStudent(itemId);
                }
                this.refreshUI();
                this.showToast(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} restored`);
                return;
              }

              if (action === 'permanent-delete') {
                if (!this.ensureWritableAction('Permanent delete')) return;
                if (!confirm(`Permanently delete this ${typeLabel} from Trash? This cannot be undone.`)) {
                  return;
                }

                if (itemType === 'class') {
                  await app.permanentlyDeleteClass(itemId);
                } else if (itemType === 'exam') {
                  await app.permanentlyDeleteExam(itemId);
                } else if (itemType === 'subject') {
                  await app.permanentlyDeleteSubject(itemId);
                } else {
                  await app.permanentlyDeleteStudent(itemId);
                }
                this.refreshUI();
                this.showToast(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} permanently deleted`);
              }
            } catch (error) {
              console.error('Trash action failed:', error);
              this.showToast('Action failed');
            } finally {
              trigger.disabled = false;
            }
          });
        }
        if (app.dom.trashRestoreAllBtn) {
          app.dom.trashRestoreAllBtn.addEventListener('click', async () => {
            if (!this.ensureWritableAction('Trash restore')) return;
            if (!confirm('Restore all items from Trash?')) return;
            try {
              app.dom.trashRestoreAllBtn.disabled = true;
              const restoredCount = await app.restoreAllStudentsFromTrash();
              this.refreshUI();
              if (restoredCount > 0) {
                this.showToast(`${restoredCount} item${restoredCount === 1 ? '' : 's'} restored`);
              }
            } catch (error) {
              console.error('Failed to restore all trash items:', error);
              this.showToast('Failed to restore trash items');
            }
          });
        }
        if (app.dom.trashEmptyBtn) {
          app.dom.trashEmptyBtn.addEventListener('click', async () => {
            if (!this.ensureWritableAction('Trash empty')) return;
            if (!confirm('Empty Trash and permanently delete all entries? This cannot be undone.')) {
              return;
            }

            try {
              app.dom.trashEmptyBtn.disabled = true;
              const deletedCount = await app.emptyStudentTrash();
              this.refreshUI();
              if (deletedCount > 0) {
                this.showToast(`${deletedCount} item${deletedCount === 1 ? '' : 's'} permanently deleted`);
              }
            } catch (error) {
              console.error('Failed to empty trash:', error);
              this.showToast('Failed to empty trash');
            }
          });
        }
        if (app.dom.reportCloseBtn) app.dom.reportCloseBtn.onclick = () => app.dom.reportModal.classList.remove('active');
        if (app.dom.reportPrintBtn) app.dom.reportPrintBtn.onclick = () => this.printReportOnly();
        if (app.dom.reportExportPdfBtn) app.dom.reportExportPdfBtn.onclick = () => {
          if (!this.requireAccess('exportData')) return;
          this.exportCurrentReportPdf();
        };
        if (app.dom.reportExportAllPdfBtn) app.dom.reportExportAllPdfBtn.onclick = () => {
          if (!this.requireAccess('exportData')) return;
          this.exportAllReportsPdf();
        };
        if (app.dom.exportCsvBtn) app.dom.exportCsvBtn.onclick = () => {
          if (!this.requireAccess('exportData')) return;
          app.export.exportCSV(app);
        };
        if (app.dom.exportExcelBtn) app.dom.exportExcelBtn.onclick = () => {
          if (!this.requireAccess('exportData')) return;
          app.export.exportExcel(app);
        };
        if (app.dom.printBtn) app.dom.printBtn.onclick = () => this.printReportOnly();
        if (app.dom.resultsBody) app.dom.resultsBody.addEventListener('click', (e) => {
          const reportCell = e.target.closest('.report-cell');
          if (reportCell && reportCell.dataset.reportId) {
            console.log('Report clicked for', reportCell.dataset.reportId);
            this.openReport(reportCell.dataset.reportId);
          }
        });

        if (app.dom.performanceCategorySelect) {
          app.dom.performanceCategorySelect.onchange = (e) => {
            const fallbackCategory = app.analytics.getPerformanceCategories()[0]?.key || 'strong';
            app.state.selectedPerformanceCategory = e.target.value || fallbackCategory;
            this.renderPerformanceAnalysisPanel();
          };
        }

        if (app.dom.dashboardPerformanceSummary) {
          app.dom.dashboardPerformanceSummary.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-performance-category]');
            if (!trigger) return;
            this.openPerformanceCategory(trigger.dataset.performanceCategory);
          });
        }

        if (app.dom.snapshotModal) {
          app.dom.snapshotModal.addEventListener('click', (e) => {
            if (e.target === app.dom.snapshotModal) {
              this.closeSnapshotModal();
            }
          });
        }

        if (app.dom.snapshotList) {
          app.dom.snapshotList.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-snapshot-action]');
            if (!trigger) return;

            const action = trigger.dataset.snapshotAction;
            const snapshotId = trigger.dataset.snapshotId;
            if (!snapshotId || !app.snapshots) return;

            if (action === 'restore' && typeof app.snapshots.restoreSnapshot === 'function') {
              app.snapshots.restoreSnapshot(snapshotId);
              return;
            }

            if (action === 'delete' && typeof app.snapshots.deleteSnapshot === 'function') {
              if (!confirm('Delete this restore point?')) return;
              app.snapshots.deleteSnapshot(snapshotId);
              this.renderSnapshotList();
            }
          });
        }

        if (app.dom.dynamicSubjectFields) {
          app.dom.dynamicSubjectFields.addEventListener('input', (e) => {
            if (e.target && e.target.matches('input[type="number"]')) {
              e.target.value = app.normalizeScore(e.target.value);
            }
          });
        }

        if (app.dom.bulkScoreBody) {
          app.dom.bulkScoreBody.addEventListener('click', (e) => {
            const resetBtn = e.target.closest('.bulk-row-reset-btn');
            if (!resetBtn) return;

            const row = resetBtn.closest('tr');
            if (!row) return;

            if (!confirm('Clear all marks for this student?')) return;

            row.querySelectorAll('.bulk-score-input').forEach(input => {
              input.value = '';
            });

            this.showToast('Student marks cleared');
          });

          app.dom.bulkScoreBody.addEventListener('input', (e) => {
            if (e.target && e.target.matches('input[type="number"]')) {
              e.target.value = app.normalizeScore(e.target.value);
            }
          });
        }

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); });
        console.log("Events Bound Successfully.");
      } catch (e) {
        console.error("BindEvents Error:", e);
      }
    }
  };

// Export UI module and assign to global app
app.ui = ui;
export default ui;
