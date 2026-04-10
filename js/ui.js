/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — ui.js
   Handles all DOM manipulation and UI logic.
   ═══════════════════════════════════════════════ */

import app from './state.js';
import { auth } from './firebase.js';
import {
  fetchConversationDirectory,
  fetchCurrentUserConversations,
  finalizeCurrentUserAccountDeletion,
  markConversationAsRead,
  requestCurrentUserAccountDeletion,
  sendConversationMessage,
  subscribeConversationMessages,
  subscribeCurrentUserConversations,
  syncCurrentUserClassOwnerName
} from '../services/db.js';
import {
  canReceiveMessages,
  canReplyToMessages,
  canStartConversations
} from './access-control.js';
import {
  ACCOUNT_DELETION_STATUS_APPROVED,
  ACCOUNT_DELETION_STATUS_NONE,
  ACCOUNT_DELETION_STATUS_PENDING,
  ACCOUNT_DELETION_STATUS_REJECTED,
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DELETED,
  deleteCurrentAuthenticatedUser,
  logoutUser,
  normalizeAccountDeletionStatus,
  normalizeAccountStatus,
  normalizeUserRole,
  requestPasswordReset,
  updateCurrentUserProfile
} from './auth.js';
import { storeAuthPageNotice } from './auth-notices.js';
import dashboardUi from './ui-dashboard.js';
import {
  MESSAGE_BODY_MAX_LENGTH,
  formatCharacterCounter
} from './message-constraints.js';
import {
  buildSubmissionFeedback,
  formatSubmissionError,
  isPermissionDeniedSubmissionError,
  resolveClassContextSubmissionError,
  resolveMissingClassBlockedReason,
  resolveReadOnlyBlockedReason
} from './submission-feedback.js';

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
  systemToolsSection: 'system-tools-section',
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
  globalLoader: 'global-loader',
  globalLoaderText: 'global-loader-text',
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
  bulkClassDeleteModal: 'bulk-class-delete-modal',
  bulkClassDeleteList: 'bulk-class-delete-list',
  bulkClassDeleteSummary: 'bulk-class-delete-summary',
  bulkClassDeleteHint: 'bulk-class-delete-hint',
  bulkClassDeleteConfirmBtn: 'bulk-class-delete-confirm-btn',
  bulkClassDeleteCancelBtn: 'bulk-class-delete-cancel-btn',
  bulkClassDeleteSelectAllBtn: 'bulk-class-delete-select-all-btn',
  bulkClassDeleteClearBtn: 'bulk-class-delete-clear-btn',
  bulkImportBtn: 'bulk-import-btn',
  bulkImportModal: 'bulk-import-modal',
  bulkImportFileInput: 'bulk-import-file-input',
  bulkImportTextarea: 'bulk-import-textarea',
  bulkImportSummary: 'bulk-import-summary',
  bulkImportConfirmBtn: 'bulk-import-confirm-btn',
  bulkImportCancelBtn: 'bulk-import-cancel-btn',
  confirmModal: 'confirm-modal',
  confirmTitle: 'confirm-modal-title',
  confirmMessage: 'confirm-modal-message',
  confirmDetails: 'confirm-modal-details',
  confirmCancelBtn: 'confirm-cancel-btn',
  confirmOkBtn: 'confirm-ok-btn',
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
  accountSettingsForm: 'account-settings-form',
  accountSettingsNameInput: 'account-settings-name-input',
  accountSettingsEmailInput: 'account-settings-email-input',
  accountSettingsRoleInput: 'account-settings-role-input',
  accountSettingsUpdatedAtInput: 'account-settings-updated-at-input',
  accountSettingsCreatedAtValue: 'account-settings-created-at-value',
  accountSettingsClassValue: 'account-settings-class-value',
  accountSettingsEmailStatusValue: 'account-settings-email-status-value',
  accountSettingsSessionStatus: 'account-settings-session-status',
  accountSettingsDeletionStatusValue: 'account-settings-deletion-status-value',
  accountSettingsDeletionHelp: 'account-settings-deletion-help',
  accountSettingsFeedback: 'account-settings-feedback',
  accountSettingsSaveBtn: 'account-settings-save-btn',
  accountSettingsResetBtn: 'account-settings-reset-btn',
  accountSettingsPasswordResetBtn: 'account-settings-password-reset-btn',
  accountSettingsDeleteBtn: 'account-settings-delete-btn',
  headerMessageAlert: 'header-message-alert',
  headerMessageAlertText: 'header-message-alert-text',
  messagesSidebarItem: 'messages-sidebar-item',
  messagesSidebarBadge: 'messages-sidebar-badge',
  messagesSectionStatus: 'messages-section-status',
  messagesUnreadBadge: 'messages-unread-badge',
  messagesSearchInput: 'messages-search-input',
  messagesRefreshBtn: 'messages-refresh-btn',
  messagesComposeBtn: 'messages-compose-btn',
  messagesFilterAll: 'messages-filter-all',
  messagesFilterInbox: 'messages-filter-inbox',
  messagesFilterInboxBadge: 'messages-filter-inbox-badge',
  messagesFilterSent: 'messages-filter-sent',
  messagesTypeFilter: 'messages-type-filter',
  messagesRoleFilter: 'messages-role-filter',
  messagesDateFilter: 'messages-date-filter',
  messagesListStatus: 'messages-list-status',
  messagesList: 'messages-list',
  messagesDetailEmpty: 'messages-detail-empty',
  messagesDetail: 'messages-detail',
  messagesDetailMailbox: 'messages-detail-mailbox',
  messageMarkToggleBtn: 'message-mark-toggle-btn',
  messagesDetailSubject: 'messages-detail-subject',
  messagesDetailMeta: 'messages-detail-meta',
  messagesDetailBody: 'messages-detail-body',
  messageThreadForm: 'message-thread-form',
  messageThreadFeedback: 'message-thread-feedback',
  messageThreadInput: 'message-thread-input',
  messageThreadMeta: 'message-thread-meta',
  messageThreadSubmitBtn: 'message-thread-submit-btn',
  messageComposeModal: 'message-compose-modal',
  messageComposeForm: 'message-compose-form',
  messageComposeTitle: 'message-compose-title',
  messageComposeSubtitle: 'message-compose-subtitle',
  messageComposeFeedback: 'message-compose-feedback',
  messageComposeRecipientGroup: 'message-compose-recipient-group',
  messageComposeRecipientSelect: 'message-compose-recipient-select',
  messageComposeBody: 'message-compose-body',
  messageComposeMeta: 'message-compose-meta',
  messageComposeCancelBtn: 'message-compose-cancel-btn',
  messageComposeSubmitBtn: 'message-compose-submit-btn',
  authRoleBadge: 'auth-role-badge'
};

const FEATURE_ACCESS_RULES = {
  developerTools: ['developer'],
  systemToolsPanel: ['admin', 'developer'],
  backupData: ['admin', 'developer'],
  exportData: ['teacher', 'admin', 'developer'],
  importData: ['developer'],
  bulkImport: ['teacher', 'developer'],
  restorePoints: ['developer'],
  resetSystem: ['developer'],
  adminPanel: ['admin', 'developer']
};

const FEATURE_ACCESS_MESSAGES = {
  developerTools: 'Access restricted: Developer only',
  systemToolsPanel: 'Access restricted: Admin or Developer only',
  backupData: 'Access restricted: Admin or Developer only',
  exportData: 'Access restricted: Signed-in users only',
  importData: 'Access restricted: Developer only',
  bulkImport: 'Access restricted: Teacher or Developer only',
  restorePoints: 'Access restricted: Developer only',
  resetSystem: 'Access restricted: Developer only',
  adminPanel: 'Access restricted: Admin or Developer only'
};

const ui = {
  isReportExporting: false,
  hasPromptedForMissingClass: false,
  hasBoundClassDropdownEvents: false,
  hasBoundAccessGuardEvents: false,
  hasBoundGlobalModalEvents: false,
  messageDataLoaded: false,
  messageDirectoryLoaded: false,
  isLoadingMessages: false,
  isLoadingMessageDirectory: false,
  isLoadingMessageThread: false,
  isSubmittingMessage: false,
  isSubmittingThreadMessage: false,
  messageRealtimeLimited: false,
  hasShownMessagePermissionFallbackToast: false,
  messagesRequest: null,
  messageDirectoryRequest: null,
  messageThreadRequest: null,
  messageThreadRequestConversationId: '',
  messageThreadLoadedConversationId: '',
  messageThreadSubscriptionConversationId: '',
  messageListSubscription: null,
  messageThreadSubscription: null,
  messageNewIds: new Set(),
  messageDetailAnimationFrame: null,
  lastMessagesListMarkup: '',
  messageListScrollTop: 0,
  messageComposeState: {
    mode: 'compose',
    replyToMessageId: '',
    recipientUserId: ''
  },
  bulkClassDeleteSelection: [],
  isSavingAccountSettings: false,
  accountSettingsBusyAction: '',
  pendingConfirmationResolver: null,
  pendingConfirmationFocusElement: null,
  toastTimer: null,
  loaderHideTimer: null,
  loaderRequestCount: 0,
  readOnlyToastTimer: null,
  trashRetentionDays: 3,
  toastTimer: null,
  loaderHideTimer: null,
  loaderRequestCount: 0,
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

    getGlobalLoaderElements: function () {
      const overlay = app.dom.globalLoader || document.getElementById('global-loader');
      const text = app.dom.globalLoaderText || document.getElementById('global-loader-text');
      if (!app.dom.globalLoader && overlay) {
        app.dom.globalLoader = overlay;
      }
      if (!app.dom.globalLoaderText && text) {
        app.dom.globalLoaderText = text;
      }
      return { overlay, text };
    },

    showLoader: function (message = 'Processing...') {
      const { overlay, text } = this.getGlobalLoaderElements();
      if (!overlay) {
        return;
      }
      if (this.loaderHideTimer) {
        clearTimeout(this.loaderHideTimer);
        this.loaderHideTimer = null;
      }
      if (text) {
        text.textContent = String(message || 'Processing...');
      }
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('loader-active');
    },

    hideLoader: function (delay = 300) {
      const { overlay } = this.getGlobalLoaderElements();
      if (!overlay) {
        return;
      }
      if (this.loaderHideTimer) {
        clearTimeout(this.loaderHideTimer);
      }
      const timeoutMs = Number.isFinite(Number(delay)) && Number(delay) >= 0 ? Number(delay) : 0;
      this.loaderHideTimer = window.setTimeout(() => {
        if (this.loaderRequestCount > 0) {
          return;
        }
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('loader-active');
        this.loaderHideTimer = null;
      }, timeoutMs);
    },

    withLoader: async function (task, { message = 'Processing...', delay = 300 } = {}) {
      if (typeof task !== 'function') {
        return null;
      }
      this.loaderRequestCount += 1;
      this.showLoader(message);
      try {
        return await task();
      } finally {
        this.loaderRequestCount = Math.max(this.loaderRequestCount - 1, 0);
        if (this.loaderRequestCount === 0) {
          this.hideLoader(delay);
        }
      }
    },

    getCurrentRole: function () {
      return normalizeUserRole(app.state.currentUserRole);
    },

    formatRoleLabel: function (role) {
      const normalizedRole = normalizeUserRole(role);
      if (normalizedRole === 'developer') return 'Developer';
      if (normalizedRole === 'admin') return 'Admin';
      if (normalizedRole === 'head_teacher') return 'Head Teacher';
      return 'Teacher';
    },

    canAccess: function (feature) {
      const requiredRoles = FEATURE_ACCESS_RULES[feature];
      if (!requiredRoles) {
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

    normalizeStudentNameInputValue: function (value) {
      return String(value || '');
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
      return resolveReadOnlyBlockedReason({ app });
    },

    getMissingClassContextLabel: function () {
      return resolveMissingClassBlockedReason();
    },

    showReadOnlyRoleToast: function () {
      const feedback = buildSubmissionFeedback({
        error: { code: 'app/read-only-admin' },
        app
      });
      this.showToast(feedback.message, { duration: 3200 });
    },

    resolveSubmissionErrorMessage: function (error, fallbackMessage = 'Request failed. Please try again.', { auth = false } = {}) {
      return formatSubmissionError(error, {
        app,
        fallbackMessage,
        auth
      });
    },

    ensureWritableAction: function (actionLabel = 'modify data') {
      if (this.canCurrentRoleWrite()) {
        return true;
      }

      this.showReadOnlyRoleToast(actionLabel);
      return false;
    },

    resolveClassContextErrorMessage: function (error, fallbackMessage = 'Please select a class and try again.') {
      return resolveClassContextSubmissionError(error, fallbackMessage);
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

    setDisabledReasonState: function (elements = [], reason = '') {
      const normalizedReason = String(reason || '').trim();
      Array.from(elements || []).filter(Boolean).forEach((element) => {
        if (!element) return;

        if (normalizedReason) {
          if (element.dataset.disabledReasonLocked !== 'true') {
            element.dataset.disabledReasonOriginalTitle = element.getAttribute('title') || '';
          }
          element.dataset.disabledReasonLocked = 'true';
          element.setAttribute('title', normalizedReason);
          element.setAttribute('aria-disabled', 'true');
          return;
        }

        if (element.dataset.disabledReasonLocked === 'true') {
          const originalTitle = element.dataset.disabledReasonOriginalTitle || '';
          if (originalTitle) {
            element.setAttribute('title', originalTitle);
          } else {
            element.removeAttribute('title');
          }
          if (element.dataset.readonlyLocked !== 'true' && element.dataset.roleRestricted !== 'true') {
            element.removeAttribute('aria-disabled');
          }
          delete element.dataset.disabledReasonLocked;
          delete element.dataset.disabledReasonOriginalTitle;
        }
      });
    },

    setClassContextControlState: function (elements = [], isBlocked = false, reason = '') {
      const normalizedReason = String(reason || '').trim();
      Array.from(elements || []).filter(Boolean).forEach((element) => {
        if (!element) return;

        if (isBlocked) {
          if (element.dataset.classContextLocked !== 'true') {
            element.dataset.classContextPrevDisabled = element.disabled ? 'true' : 'false';
            element.dataset.classContextOriginalTitle = element.getAttribute('title') || '';
          }
          if ('disabled' in element) {
            element.disabled = true;
          }
          element.dataset.classContextLocked = 'true';
          if (normalizedReason) {
            element.setAttribute('title', normalizedReason);
          }
          element.setAttribute('aria-disabled', 'true');
          return;
        }

        if (element.dataset.classContextLocked === 'true') {
          const previousDisabled = element.dataset.classContextPrevDisabled === 'true';
          if ('disabled' in element) {
            element.disabled = previousDisabled;
          }
          const originalTitle = element.dataset.classContextOriginalTitle || '';
          if (originalTitle) {
            element.setAttribute('title', originalTitle);
          } else {
            element.removeAttribute('title');
          }
          if (element.dataset.readonlyLocked !== 'true' && element.dataset.roleRestricted !== 'true') {
            element.removeAttribute('aria-disabled');
          }
          delete element.dataset.classContextLocked;
          delete element.dataset.classContextPrevDisabled;
          delete element.dataset.classContextOriginalTitle;
        }
      });
    },

    applyClassContextDisabledState: function ({ hasWritableClassContext = false, skipElements = [] } = {}) {
      const disabledReason = hasWritableClassContext ? '' : this.getMissingClassContextLabel();
      const skipSet = new Set((Array.isArray(skipElements) ? skipElements : []).filter(Boolean));
      const directElements = [
        app.dom.nameInput,
        app.dom.bulkImportBtn,
        app.dom.bulkImportConfirmBtn,
        app.dom.bulkImportTextarea,
        app.dom.mockNameInput,
        app.dom.subjectNameInput,
        app.dom.saveScoresBtn,
        app.dom.bulkScoreBtn,
        app.dom.bulkScoreSaveBtn
      ].filter((element) => element && !skipSet.has(element));

      this.setClassContextControlState(directElements, !hasWritableClassContext, disabledReason);

      const groupedForms = [
        app.dom.form,
        app.dom.addMockForm,
        app.dom.addSubjectForm
      ].filter(Boolean);

      groupedForms.forEach((form) => {
        const formControls = form.querySelectorAll('input, button');
        this.setDisabledReasonState(Array.from(formControls).filter((element) => !skipSet.has(element)), disabledReason);
      });

      const dynamicControls = document.querySelectorAll([
        '#dynamicSubjectFields input',
        '.bulk-score-input',
        '.bulk-row-reset-btn'
      ].join(','));
      this.setDisabledReasonState(Array.from(dynamicControls).filter((element) => !skipSet.has(element)), disabledReason);
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

      this.applyFeatureAccessState('importData', [
        app.dom.restoreBtn,
        app.dom.restoreInput,
        app.dom.systemImportDataBtn
      ]);

      this.applyFeatureAccessState('systemToolsPanel', [
        app.dom.systemToolsSection
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

      this.applyFeatureAccessState('backupData', [
        app.dom.systemToolsBackupStatus,
        app.dom.backupStatus,
        app.dom.backupBtn,
        app.dom.systemExportDataBtn
      ]);

      this.applyFeatureAccessState('exportData', [
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

    isConfirmationModalOpen: function () {
      return Boolean(app.dom.confirmModal?.classList.contains('active'));
    },

    toggleConfirmationModal: function (isOpen = false) {
      if (!app.dom.confirmModal) {
        return;
      }
      app.dom.confirmModal.classList.toggle('active', !!isOpen);
      app.dom.confirmModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    },

    getConfirmationFocusableElements: function () {
      if (!app.dom.confirmModal) {
        return [];
      }
      return Array.from(app.dom.confirmModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    },

    trapConfirmationModalFocus: function (event) {
      if (!this.isConfirmationModalOpen() || event.key !== 'Tab') {
        return;
      }
      const focusable = this.getConfirmationFocusableElements();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },

    resolvePendingConfirmation: function (didConfirm = false) {
      const resolver = this.pendingConfirmationResolver;
      this.pendingConfirmationResolver = null;
      this.toggleConfirmationModal(false);
      if (this.pendingConfirmationFocusElement && typeof this.pendingConfirmationFocusElement.focus === 'function') {
        this.pendingConfirmationFocusElement.focus();
      }
      this.pendingConfirmationFocusElement = null;
      if (typeof resolver === 'function') {
        resolver(Boolean(didConfirm));
      }
    },

    requestConfirmation: function ({
      title = 'Confirm Action',
      message = 'Are you sure?',
      details = [],
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      dangerous = false
    } = {}) {
      if (!app.dom.confirmModal || !app.dom.confirmOkBtn || !app.dom.confirmMessage) {
        const fallbackDetails = Array.isArray(details) && details.length
          ? `\n\n${details.map((detail) => `- ${String(detail || '').trim()}`).join('\n')}`
          : '';
        return Promise.resolve(window.confirm(`${String(message || '').trim()}${fallbackDetails}`));
      }

      if (this.pendingConfirmationResolver) {
        this.resolvePendingConfirmation(false);
      }

      if (app.dom.confirmTitle) {
        app.dom.confirmTitle.textContent = String(title || 'Confirm Action').trim() || 'Confirm Action';
      }
      app.dom.confirmMessage.textContent = String(message || '').trim() || 'Are you sure?';

      if (app.dom.confirmDetails) {
        const normalizedDetails = (Array.isArray(details) ? details : [])
          .map((detail) => String(detail || '').trim())
          .filter(Boolean);
        app.dom.confirmDetails.innerHTML = normalizedDetails.map((detail) => `<li>${app.utils.esc(detail)}</li>`).join('');
        app.dom.confirmDetails.hidden = normalizedDetails.length === 0;
      }

      if (app.dom.confirmCancelBtn) {
        app.dom.confirmCancelBtn.textContent = String(cancelLabel || 'Cancel').trim() || 'Cancel';
      }
      app.dom.confirmOkBtn.textContent = String(confirmLabel || 'Confirm').trim() || 'Confirm';
      app.dom.confirmOkBtn.classList.toggle('btn-danger', dangerous);
      app.dom.confirmOkBtn.classList.toggle('btn-primary', !dangerous);

      this.pendingConfirmationFocusElement = document.activeElement;
      this.toggleConfirmationModal(true);

      return new Promise((resolve) => {
        this.pendingConfirmationResolver = resolve;
        const focusTarget = app.dom.confirmCancelBtn || app.dom.confirmOkBtn;
        focusTarget?.focus();
      });
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
      toast.className = 'toast';

      const tone = String(options?.tone || options?.type || '').trim().toLowerCase();
      if (tone) {
        toast.classList.add(tone);
      }

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
            await this.withLoader(() => options.onAction(), {
              message: String(options?.loaderMessage || 'Processing...')
            });
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
        loaderMessage: `Restoring ${typeLabel.toLowerCase()}...`,
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

    getClassInitials: function (name = '') {
      const words = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return 'MC';
      const first = words[0].charAt(0) || '';
      const second = words.length > 1 ? words[1].charAt(0) : (words[0].charAt(1) || '');
      return `${first}${second}`.toUpperCase() || 'MC';
    },

    getActiveClassEntry: function () {
      const classes = Array.isArray(app.state.classes) ? app.state.classes : [];
      const activeClassId = String(app.state.currentClassId || '').trim();
      const activeOwnerId = String(app.state.currentClassOwnerId || '').trim();
      return classes.find((entry) => {
        const entryClassId = String(entry?.id || '').trim();
        const entryOwnerId = String(entry?.ownerId || '').trim();
        if (entryClassId !== activeClassId) {
          return false;
        }
        if (!activeOwnerId) {
          return true;
        }
        return entryOwnerId === activeOwnerId;
      }) || classes.find(entry => String(entry?.id || '').trim() === activeClassId) || null;
    },

    getCurrentClassDisplayLabel: function () {
      const activeClass = this.getActiveClassEntry();
      if (activeClass) {
        return this.formatClassDisplayLabel(activeClass);
      }

      const fallbackClassId = String(app.state.currentClassId || '').trim();
      const fallbackClassName = String(app.state.currentClassName || '').trim();
      const fallbackOwnerName = String(app.state.currentClassOwnerName || '').trim();
      if (!fallbackClassId || !fallbackClassName) {
        return 'No class selected';
      }

      return this.formatClassDisplayLabel({
        name: fallbackClassName,
        ownerName: fallbackOwnerName
      });
    },

    formatAccountTimestamp: function (value, fallback = 'Not available') {
      const resolvedValue = typeof value?.toDate === 'function'
        ? value.toDate()
        : value;
      const parsed = resolvedValue instanceof Date
        ? resolvedValue
        : new Date(resolvedValue || '');
      if (Number.isNaN(parsed.getTime())) {
        return fallback;
      }

      return parsed.toLocaleString();
    },

    getMessageRoleContext: function () {
      if (typeof app.getCurrentUserRole === 'function') {
        return normalizeUserRole(app.getCurrentUserRole());
      }
      return normalizeUserRole(app.state.currentUserRole || app.state.authUser?.role || 'teacher');
    },

    getMessagePermissionsContext: function () {
      if (typeof app.getCurrentUserPermissions === 'function') {
        const permissions = app.getCurrentUserPermissions();
        if (Array.isArray(permissions)) {
          return permissions;
        }
      }
      return Array.isArray(app.state.currentUserPermissions) ? app.state.currentUserPermissions : [];
    },

    getMessages: function () {
      return Array.isArray(app.state.messages) ? app.state.messages : [];
    },

    getMessageThread: function () {
      return Array.isArray(app.state.messageThread) ? app.state.messageThread : [];
    },

    getSelectedConversationId: function () {
      return String(app.state.selectedMessageId || '').trim();
    },

    getSelectedConversationRecord: function () {
      const selectedConversationId = this.getSelectedConversationId();
      if (!selectedConversationId) {
        return null;
      }
      return this.getMessages().find((conversation) => {
        return String(conversation?.id || '').trim() === selectedConversationId;
      }) || null;
    },

    getMessageDirectory: function () {
      const directory = app.state.messageDirectory || {};
      return {
        users: Array.isArray(directory?.users) ? directory.users : [],
        roles: Array.isArray(directory?.roles) ? directory.roles : [],
        classes: Array.isArray(directory?.classes) ? directory.classes : [],
        capabilities: directory?.capabilities && typeof directory.capabilities === 'object'
          ? directory.capabilities
          : {}
      };
    },

    getMessagingCapabilities: function () {
      const role = this.getMessageRoleContext();
      const permissions = this.getMessagePermissionsContext();
      const directoryCapabilities = this.getMessageDirectory().capabilities;
      const canStartConversation = directoryCapabilities.canStart ?? directoryCapabilities.canSend ?? canStartConversations(role, permissions);
      return {
        canReceive: canReceiveMessages(role, permissions),
        canSend: canStartConversation,
        canReply: directoryCapabilities.canReply ?? canReplyToMessages(role, permissions),
        canMessageIndividuals: canStartConversation,
        canMessageRoles: false,
        canMessageClasses: false,
        canMessageAll: false
      };
    },

    stopMessageListSubscription: function () {
      if (typeof this.messageListSubscription === 'function') {
        this.messageListSubscription();
      }
      this.messageListSubscription = null;
    },

    stopMessageThreadSubscription: function () {
      if (typeof this.messageThreadSubscription === 'function') {
        this.messageThreadSubscription();
      }
      this.messageThreadSubscription = null;
      this.messageThreadSubscriptionConversationId = '';
    },

    clearSelectedMessageThread: function () {
      app.state.messageThread = [];
      this.messageThreadLoadedConversationId = '';
      this.messageThreadRequestConversationId = '';
      this.messageThreadRequest = null;
      if (app.dom.messageThreadInput) {
        app.dom.messageThreadInput.value = '';
      }
      if (app.dom.messageThreadFeedback) {
        app.dom.messageThreadFeedback.hidden = true;
        app.dom.messageThreadFeedback.textContent = '';
        delete app.dom.messageThreadFeedback.dataset.tone;
      }
    },

    resetMessagingState: function () {
      this.stopMessageListSubscription();
      this.stopMessageThreadSubscription();
      this.messageDataLoaded = false;
      this.messageDirectoryLoaded = false;
      this.isLoadingMessages = false;
      this.isLoadingMessageDirectory = false;
      this.isLoadingMessageThread = false;
      this.isSubmittingMessage = false;
      this.isSubmittingThreadMessage = false;
      this.messageRealtimeLimited = false;
      this.hasShownMessagePermissionFallbackToast = false;
      this.messagesRequest = null;
      this.messageDirectoryRequest = null;
      this.messageThreadRequest = null;
      this.messageThreadRequestConversationId = '';
      this.messageThreadLoadedConversationId = '';
      this.messageNewIds = new Set();
      this.lastMessagesListMarkup = '';
      this.messageListScrollTop = 0;
      if (this.messageDetailAnimationFrame) {
        window.cancelAnimationFrame(this.messageDetailAnimationFrame);
        this.messageDetailAnimationFrame = null;
      }
      this.messageComposeState = {
        mode: 'compose',
        replyToMessageId: '',
        recipientUserId: ''
      };
      app.state.messages = [];
      app.state.messageThread = [];
      app.state.selectedMessageId = '';
      app.state.messageSearchTerm = '';
      app.state.messageRoleFilter = 'all';
      app.state.messageDateFilter = 'all';
      app.state.messageTypeFilter = 'all';
      if (app.dom.messageComposeModal) {
        app.dom.messageComposeModal.classList.remove('active');
      }
      if (app.dom.messageThreadForm) {
        app.dom.messageThreadForm.reset();
      }
    },

    syncSectionShellState: function (sectionId = '') {
      const normalizedSectionId = String(sectionId || '').trim().toLowerCase();
      const isMessagesSection = normalizedSectionId === 'messages';
      document.body.classList.toggle('messages-section-active', isMessagesSection);
      const appMain = document.getElementById('app-main');
      if (appMain) {
        appMain.classList.toggle('messages-section-active', isMessagesSection);
      }
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.classList.toggle('messages-section-active', isMessagesSection);
        if (isMessagesSection) {
          mainContent.scrollTop = 0;
        }
      }
      if (isMessagesSection) {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        if (appMain) {
          appMain.scrollTop = 0;
        }
        window.scrollTo(0, 0);
      }
    },

    captureMessageListScrollPosition: function () {
      if (app.dom.messagesList) {
        this.messageListScrollTop = Math.max(0, Number(app.dom.messagesList.scrollTop) || 0);
      }
      return this.messageListScrollTop;
    },

    restoreMessageListScrollPosition: function (scrollTop = this.messageListScrollTop) {
      if (!app.dom.messagesList) {
        return;
      }
      const nextScrollTop = Number.isFinite(Number(scrollTop))
        ? Math.max(0, Number(scrollTop))
        : Math.max(0, Number(this.messageListScrollTop) || 0);
      app.dom.messagesList.scrollTop = nextScrollTop;
      this.messageListScrollTop = Math.max(0, Number(app.dom.messagesList.scrollTop) || 0);
    },

    updateMessageBadges: function () {
      const unreadCount = Number.isFinite(Number(app.state.unreadMessageCount))
        ? Math.max(0, Math.floor(Number(app.state.unreadMessageCount)))
        : 0;
      const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
      const unreadSummary = unreadCount === 1 ? '1 unread message' : `${unreadCount} unread messages`;
      const shouldShowUnreadState = unreadCount > 0 && Boolean(app.state.authUser?.uid);
      if (app.dom.messagesSidebarBadge) {
        app.dom.messagesSidebarBadge.textContent = badgeLabel;
        app.dom.messagesSidebarBadge.hidden = !shouldShowUnreadState;
      }
      if (app.dom.messagesUnreadBadge) {
        app.dom.messagesUnreadBadge.textContent = unreadCount === 1 ? '1 unread' : `${unreadCount} unread`;
        app.dom.messagesUnreadBadge.hidden = !shouldShowUnreadState;
        app.dom.messagesUnreadBadge.dataset.unreadState = shouldShowUnreadState ? 'active' : 'idle';
      }
      if (app.dom.messagesFilterInboxBadge) {
        app.dom.messagesFilterInboxBadge.textContent = badgeLabel;
        app.dom.messagesFilterInboxBadge.hidden = !shouldShowUnreadState;
      }
      if (app.dom.messagesSidebarItem) {
        app.dom.messagesSidebarItem.classList.toggle('has-unread', shouldShowUnreadState);
      }
      if (app.dom.headerMessageAlert) {
        app.dom.headerMessageAlert.hidden = !shouldShowUnreadState;
        app.dom.headerMessageAlert.classList.toggle('has-unread', shouldShowUnreadState);
        app.dom.headerMessageAlert.setAttribute('aria-label', shouldShowUnreadState ? unreadSummary : 'No unread messages');
      }
      if (app.dom.headerMessageAlertText) {
        app.dom.headerMessageAlertText.textContent = unreadSummary;
      }
    },

    isMessageUnread: function (message = null) {
      return Math.max(0, Math.floor(Number(message?.unreadCount || 0))) > 0;
    },

    isNewMessage: function (message = null) {
      const messageId = String(message?.id || '').trim();
      return Boolean(messageId && this.isMessageUnread(message) && this.messageNewIds.has(messageId));
    },

    getMessageStatusLabel: function (message = null) {
      if (!message) {
        return 'Conversation';
      }
      if (this.isNewMessage(message)) {
        return 'New';
      }
      if (this.isMessageUnread(message)) {
        const unreadCount = Math.max(0, Math.floor(Number(message?.unreadCount || 0)));
        return unreadCount > 1 ? `${unreadCount} unread` : 'Unread';
      }
      return message?.isLegacy ? 'Legacy' : 'Read';
    },

    getMessageRoleValue: function (role = '') {
      const normalizedRole = String(role || '').trim();
      return normalizedRole ? normalizeUserRole(normalizedRole) : '';
    },

    getMessageCounterpartRole: function (message = null) {
      return this.getMessageRoleValue(message?.counterpartRole || message?.lastMessageSenderRole || '');
    },

    getMessageCounterpartLabel: function (message = null) {
      if (!message) {
        return 'Conversation';
      }
      return String(message?.title || message?.counterpartName || message?.lastMessageSenderName || 'Conversation').trim() || 'Conversation';
    },

    syncLocalMessageMetadata: function ({ unreadCount = 0, lastMessageAt = null } = {}) {
      const normalizedUnreadCount = Number.isFinite(Number(unreadCount))
        ? Math.max(0, Math.floor(Number(unreadCount)))
        : 0;
      app.state.unreadMessageCount = normalizedUnreadCount;
      app.state.messageLastMessageAt = lastMessageAt || null;
      if (app.state.authUser?.uid) {
        app.state.authUser = {
          ...(app.state.authUser || {}),
          messageUnreadCount: normalizedUnreadCount,
          lastMessageAt: lastMessageAt || null
        };
      }
      this.updateMessageBadges();
    },

    applyMessagesPayload: function (payload = {}, { preserveSelection = true } = {}) {
      const previousMessages = this.getMessages();
      const nextMessages = Array.isArray(payload?.conversations)
        ? payload.conversations
        : (Array.isArray(payload?.messages) ? payload.messages : []);
      this.messageRealtimeLimited = Boolean(payload?.limitedByPermissions);
      const previousMessageIds = new Set(previousMessages.map((message) => {
        return String(message?.id || '').trim();
      }).filter(Boolean));
      const nextUnreadIds = new Set(nextMessages.filter((message) => {
        return this.isMessageUnread(message);
      }).map((message) => {
        return String(message?.id || '').trim();
      }).filter(Boolean));
      const retainedNewIds = new Set(Array.from(this.messageNewIds).filter((messageId) => {
        return nextUnreadIds.has(messageId);
      }));
      if (previousMessageIds.size) {
        nextUnreadIds.forEach((messageId) => {
          if (!previousMessageIds.has(messageId)) {
            retainedNewIds.add(messageId);
          }
        });
      }
      this.messageNewIds = retainedNewIds;
      app.state.messages = nextMessages;
      this.syncLocalMessageMetadata({
        unreadCount: payload?.unreadCount ?? app.state.unreadMessageCount,
        lastMessageAt: payload?.lastMessageAt ?? nextMessages[0]?.lastMessageAt ?? nextMessages[0]?.updatedAt ?? nextMessages[0]?.createdAt ?? null
      });
      const currentSelection = String(app.state.selectedMessageId || '').trim();
      const hasSelection = preserveSelection && nextMessages.some((message) => {
        return String(message?.id || '').trim() === currentSelection;
      });
      app.state.selectedMessageId = hasSelection ? currentSelection : String(nextMessages[0]?.id || '').trim();
    },

    ensureMessageListSubscription: async function () {
      const authUid = String(app.state.authUser?.uid || '').trim();
      const capabilities = this.getMessagingCapabilities();
      const hasAccess = capabilities.canReceive || capabilities.canSend || capabilities.canReply;
      if (!authUid || !hasAccess) {
        this.stopMessageListSubscription();
        return null;
      }
      if (this.messageRealtimeLimited) {
        this.stopMessageListSubscription();
        return null;
      }
      if (this.messageListSubscription) {
        return this.messageListSubscription;
      }
      try {
        const unsubscribe = await subscribeCurrentUserConversations({
          onChange: (payload) => {
            this.messageDataLoaded = true;
            this.applyMessagesPayload(payload, { preserveSelection: true });
            this.renderMessagesSection();
            void this.syncSelectedConversationThread();
          },
          onError: (error) => {
            console.error('Conversation subscription failed:', error);
          }
        });
        this.messageListSubscription = typeof unsubscribe === 'function' ? unsubscribe : null;
      } catch (error) {
        console.error('Failed to start conversation subscription:', error);
      }
      return this.messageListSubscription;
    },

    ensureSelectedConversationThreadSubscription: async function (conversationId = '') {
      const normalizedConversationId = String(conversationId || this.getSelectedConversationId() || '').trim();
      if (!normalizedConversationId || normalizedConversationId !== this.getSelectedConversationId()) {
        return null;
      }
      if (this.messageThreadSubscriptionConversationId === normalizedConversationId && this.messageThreadSubscription) {
        return this.messageThreadSubscription;
      }
      this.stopMessageThreadSubscription();
      this.isLoadingMessageThread = true;
      this.messageThreadRequestConversationId = normalizedConversationId;
      this.renderSelectedMessageDetail(this.getSelectedConversationRecord());
      try {
        this.messageThreadSubscriptionConversationId = normalizedConversationId;
        const unsubscribe = await subscribeConversationMessages(normalizedConversationId, {
          onChange: (payload) => {
            if (String(this.getSelectedConversationId() || '').trim() !== normalizedConversationId) {
              return;
            }
            const conversationRecord = payload?.conversation || this.getSelectedConversationRecord() || null;
            if (conversationRecord?.id) {
              const currentConversationId = String(conversationRecord.id || '').trim();
              const otherConversations = this.getMessages().filter((entry) => {
                return String(entry?.id || '').trim() !== currentConversationId;
              });
              app.state.messages = [conversationRecord, ...otherConversations].sort((left, right) => {
                const leftTime = new Date(left?.sortAt || left?.lastMessageAt || left?.updatedAt || 0).getTime() || 0;
                const rightTime = new Date(right?.sortAt || right?.lastMessageAt || right?.updatedAt || 0).getTime() || 0;
                return rightTime - leftTime;
              });
            }
            app.state.messageThread = Array.isArray(payload?.messages) ? payload.messages : [];
            this.messageThreadLoadedConversationId = normalizedConversationId;
            this.messageThreadRequestConversationId = '';
            this.isLoadingMessageThread = false;
            this.renderMessagesSection();
          },
          onError: (error) => {
            if (String(this.getSelectedConversationId() || '').trim() !== normalizedConversationId) {
              return;
            }
            console.error('Failed to load conversation thread:', error);
            this.isLoadingMessageThread = false;
            this.messageThreadRequestConversationId = '';
            this.renderMessagesSection();
          }
        });
        this.messageThreadSubscription = typeof unsubscribe === 'function' ? unsubscribe : null;
      } catch (error) {
        console.error('Failed to subscribe to conversation thread:', error);
        this.isLoadingMessageThread = false;
        this.messageThreadRequestConversationId = '';
      }
      return this.messageThreadSubscription;
    },

    syncSelectedConversationThread: async function () {
      const selectedConversationId = this.getSelectedConversationId();
      if (!selectedConversationId) {
        this.stopMessageThreadSubscription();
        this.clearSelectedMessageThread();
        return;
      }
      if (this.messageThreadSubscriptionConversationId === selectedConversationId
        && (this.isLoadingMessageThread || this.messageThreadLoadedConversationId === selectedConversationId)) {
        return;
      }
      this.clearSelectedMessageThread();
      this.renderMessagesSection();
      await this.ensureSelectedConversationThreadSubscription(selectedConversationId);
    },

    ensureMessagesLoaded: async function (force = false) {
      const authUid = String(app.state.authUser?.uid || '').trim();
      const capabilities = this.getMessagingCapabilities();
      const hasAccess = capabilities.canReceive || capabilities.canSend || capabilities.canReply;
      if (!authUid || !hasAccess) {
        return [];
      }
      if (this.messagesRequest) {
        return this.messagesRequest;
      }
      if (!force && this.messageDataLoaded) {
        return this.getMessages();
      }
      this.isLoadingMessages = true;
      this.renderMessagesSection();
      this.messagesRequest = fetchCurrentUserConversations()
        .then((payload) => {
          this.messageDataLoaded = true;
          this.applyMessagesPayload(payload, { preserveSelection: !force });
          if (payload?.limitedByPermissions && !this.hasShownMessagePermissionFallbackToast) {
            this.hasShownMessagePermissionFallbackToast = true;
            this.showToast('Live chat history is limited by Firestore permissions. Showing accessible messages only.', {
              tone: 'info'
            });
          }
          void this.syncSelectedConversationThread();
          void this.ensureMessageListSubscription();
          return payload;
        })
        .catch((error) => {
          console.error('Failed to load conversations:', error);
          const feedback = buildSubmissionFeedback({
            error,
            fallbackMessage: 'Failed to load conversations',
            app
          });
          this.showToast(feedback.message, {
            tone: feedback.tone
          });
          throw error;
        })
        .finally(() => {
          this.isLoadingMessages = false;
          this.messagesRequest = null;
          this.renderMessagesSection();
        });
      return this.messagesRequest;
    },

    ensureMessageDirectoryLoaded: async function (force = false) {
      const authUid = String(app.state.authUser?.uid || '').trim();
      const capabilities = this.getMessagingCapabilities();
      if (!authUid || (!capabilities.canSend && !capabilities.canReply)) {
        return this.getMessageDirectory();
      }
      if (this.messageDirectoryRequest) {
        return this.messageDirectoryRequest;
      }
      if (!force && this.messageDirectoryLoaded) {
        return this.getMessageDirectory();
      }
      this.isLoadingMessageDirectory = true;
      this.renderMessageComposeControls();
      this.messageDirectoryRequest = fetchConversationDirectory()
        .then((directory) => {
          app.state.messageDirectory = {
            users: Array.isArray(directory?.users) ? directory.users : [],
            roles: Array.isArray(directory?.roles) ? directory.roles : [],
            classes: Array.isArray(directory?.classes) ? directory.classes : [],
            capabilities: directory?.capabilities && typeof directory.capabilities === 'object'
              ? directory.capabilities
              : {}
          };
          this.messageDirectoryLoaded = true;
          return app.state.messageDirectory;
        })
        .catch((error) => {
          console.error('Failed to load chat recipients:', error);
          const feedback = buildSubmissionFeedback({
            error,
            fallbackMessage: 'Failed to load chat recipients',
            app
          });
          this.showToast(feedback.message, {
            tone: feedback.tone
          });
          throw error;
        })
        .finally(() => {
          this.isLoadingMessageDirectory = false;
          this.messageDirectoryRequest = null;
          this.renderMessagesSection();
          this.renderMessageComposeControls();
        });
      return this.messageDirectoryRequest;
    },

    refreshMessagesData: async function (force = false) {
      try {
        await this.ensureMessagesLoaded(force);
        if (this.getMessagingCapabilities().canSend && (force || this.messageDirectoryLoaded)) {
          await this.ensureMessageDirectoryLoaded(force);
        }
        await this.syncSelectedConversationThread();
      } catch (error) {
        console.error('Failed to refresh messages:', error);
      }
    },

    getMessageInitials: function (value = '') {
      const normalizedValue = String(value || '').trim();
      if (!normalizedValue) {
        return 'MS';
      }
      const tokens = normalizedValue
        .replace(/[^a-zA-Z0-9@.\s_-]/g, ' ')
        .split(/[\s@._-]+/)
        .map(part => String(part || '').trim())
        .filter(Boolean);
      if (!tokens.length) {
        return normalizedValue.slice(0, 2).toUpperCase();
      }
      return tokens.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
    },

    doesMessageMatchTypeFilter: function (message = null, filter = 'all') {
      const normalizedFilter = String(filter || 'all').trim().toLowerCase();
      if (!message || normalizedFilter === 'all') {
        return true;
      }
      if (normalizedFilter === 'legacy') {
        return Boolean(message?.isLegacy);
      }
      return String(message?.type || '').trim().toLowerCase() === normalizedFilter;
    },

    doesMessageMatchRoleFilter: function (message = null, filter = 'all') {
      const normalizedFilter = String(filter || 'all').trim().toLowerCase();
      if (!message || normalizedFilter === 'all') {
        return true;
      }
      return this.getMessageCounterpartRole(message) === normalizedFilter;
    },

    doesMessageMatchDateFilter: function (message = null, filter = 'all') {
      const normalizedFilter = String(filter || 'all').trim().toLowerCase();
      if (!message || normalizedFilter === 'all') {
        return true;
      }
      const timestamp = Date.parse(String(message?.lastMessageAt || message?.updatedAt || message?.createdAt || '').trim());
      if (!Number.isFinite(timestamp)) {
        return false;
      }
      const now = Date.now();
      const today = new Date();
      const sentDate = new Date(timestamp);
      if (normalizedFilter === 'today') {
        return sentDate.toDateString() === today.toDateString();
      }
      if (normalizedFilter === 'week') {
        return now - timestamp <= 7 * 24 * 60 * 60 * 1000;
      }
      if (normalizedFilter === 'month') {
        return now - timestamp <= 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    },

    doesMessageMatchSearch: function (message = null, term = '') {
      const normalizedTerm = String(term || '').trim().toLowerCase();
      if (!message || !normalizedTerm) {
        return true;
      }
      const searchableFields = [
        this.getMessageCounterpartLabel(message),
        message?.counterpartEmail,
        message?.lastMessageSenderName,
        message?.lastMessagePreview,
        message?.lastMessageText,
        message?.title
      ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
      return searchableFields.some(value => value.includes(normalizedTerm));
    },

    getAvailableMessageRoles: function (messages = []) {
      const seenRoles = new Set();
      return (Array.isArray(messages) ? messages : []).reduce((roles, message) => {
        const role = this.getMessageCounterpartRole(message);
        if (!role || seenRoles.has(role)) {
          return roles;
        }
        seenRoles.add(role);
        roles.push({
          value: role,
          label: this.formatRoleLabel(role)
        });
        return roles;
      }, []).sort((left, right) => {
        return String(left?.label || '').localeCompare(String(right?.label || ''));
      });
    },

    syncMessageFilterControls: function (messages = [], { hasAccess = true } = {}) {
      const normalizedMessages = Array.isArray(messages) ? messages : [];
      const searchTerm = String(app.state.messageSearchTerm || '');
      const typeFilter = String(app.state.messageTypeFilter || 'all').trim().toLowerCase();
      const roleFilter = String(app.state.messageRoleFilter || 'all').trim().toLowerCase();
      const dateFilter = String(app.state.messageDateFilter || 'all').trim().toLowerCase();
      if (app.dom.messagesSearchInput) {
        if (app.dom.messagesSearchInput.value !== searchTerm) {
          app.dom.messagesSearchInput.value = searchTerm;
        }
        app.dom.messagesSearchInput.disabled = !hasAccess;
      }
      if (app.dom.messagesTypeFilter) {
        app.dom.messagesTypeFilter.value = typeFilter;
        app.dom.messagesTypeFilter.disabled = !hasAccess;
      }
      if (app.dom.messagesDateFilter) {
        app.dom.messagesDateFilter.value = dateFilter;
        app.dom.messagesDateFilter.disabled = !hasAccess;
      }
      if (!app.dom.messagesRoleFilter) {
        app.state.messageRoleFilter = 'all';
      }
      if (app.dom.messagesRoleFilter) {
        const roleOptions = this.getAvailableMessageRoles(normalizedMessages);
        const optionMarkup = ['<option value="all">All roles</option>'].concat(roleOptions.map((option) => {
          return `<option value="${app.utils.esc(option.value)}">${app.utils.esc(option.label)}</option>`;
        })).join('');
        if (app.dom.messagesRoleFilter.innerHTML !== optionMarkup) {
          app.dom.messagesRoleFilter.innerHTML = optionMarkup;
        }
        const nextRoleFilter = roleOptions.some((option) => option.value === roleFilter) ? roleFilter : 'all';
        app.state.messageRoleFilter = nextRoleFilter;
        app.dom.messagesRoleFilter.value = nextRoleFilter;
        app.dom.messagesRoleFilter.disabled = !hasAccess || roleOptions.length === 0;
      }
    },

    getFilteredMessages: function () {
      const messages = this.getMessages();
      const mailboxFilter = String(app.state.messageMailboxFilter || 'all').trim().toLowerCase();
      const typeFilter = String(app.state.messageTypeFilter || 'all').trim().toLowerCase();
      const dateFilter = String(app.state.messageDateFilter || 'all').trim().toLowerCase();
      const searchTerm = String(app.state.messageSearchTerm || '');
      return messages.filter((message) => {
        if (mailboxFilter === 'unread' && !this.isMessageUnread(message)) {
          return false;
        }
        if (mailboxFilter === 'legacy' && !Boolean(message?.isLegacy)) {
          return false;
        }
        if (!this.doesMessageMatchTypeFilter(message, typeFilter)) {
          return false;
        }
        if (!this.doesMessageMatchDateFilter(message, dateFilter)) {
          return false;
        }
        return this.doesMessageMatchSearch(message, searchTerm);
      });
    },

    syncMessageSelectionToFilter: function () {
      const filteredMessages = this.getFilteredMessages();
      const selectedMessageId = String(app.state.selectedMessageId || '').trim();
      if (selectedMessageId && filteredMessages.some((message) => {
        return String(message?.id || '').trim() === selectedMessageId;
      })) {
        return selectedMessageId;
      }
      app.state.selectedMessageId = String(filteredMessages[0]?.id || '').trim();
      return app.state.selectedMessageId;
    },

    getSelectedMessageRecord: function () {
      const selectedMessageId = this.syncMessageSelectionToFilter();
      return this.getFilteredMessages().find((message) => {
        return String(message?.id || '').trim() === selectedMessageId;
      }) || null;
    },

    formatMessageBodyHtml: function (value = '') {
      const normalizedValue = String(value || '').trim();
      if (!normalizedValue) {
        return '<span class="messages-detail-empty-copy">No message body provided.</span>';
      }
      return app.utils.esc(normalizedValue).replace(/\n/g, '<br>');
    },

    animateMessageDetail: function () {
      if (!app.dom.messagesDetail) {
        return;
      }
      app.dom.messagesDetail.classList.remove('is-visible');
      if (this.messageDetailAnimationFrame) {
        window.cancelAnimationFrame(this.messageDetailAnimationFrame);
      }
      this.messageDetailAnimationFrame = window.requestAnimationFrame(() => {
        app.dom.messagesDetail.classList.add('is-visible');
        this.messageDetailAnimationFrame = null;
      });
    },

    renderConversationThreadMarkup: function (messages = []) {
      const threadMessages = Array.isArray(messages) ? messages : [];
      if (!threadMessages.length) {
        return '<div class="messages-thread-empty"><strong>No messages yet</strong><p>Send a message to start this chat.</p></div>';
      }
      const currentUserId = String(app.state.authUser?.uid || '').trim();
      const threadMarkup = threadMessages.map((message) => {
        const isOwnMessage = Boolean(message?.isOwnMessage);
        const senderLabel = isOwnMessage
          ? 'You'
          : (String(message?.senderName || message?.senderEmail || 'Participant').trim() || 'Participant');
        const messageStatus = !isOwnMessage && Boolean(message?.isLegacy) && Boolean(message?.isUnreadLegacy)
          ? '<span class="messages-thread-message-status">Unread</span>'
          : '';
        const readState = isOwnMessage && currentUserId && Array.isArray(message?.readByUserIds)
          ? message.readByUserIds.some((participantId) => String(participantId || '').trim() && String(participantId || '').trim() !== currentUserId)
          : false;
        const readLabel = isOwnMessage
          ? (readState ? '<span class="messages-thread-message-status is-read">Seen</span>' : '')
          : '';
        return `
          <article class="messages-thread-message${isOwnMessage ? ' is-own' : ''}" data-message-id="${app.utils.esc(String(message?.id || '').trim())}">
            <div class="messages-thread-message-meta">
              <span class="messages-thread-message-author">${app.utils.esc(senderLabel)}</span>
              <span class="messages-thread-message-time">${app.utils.esc(this.formatAccountTimestamp(message?.sentAt || message?.createdAt || message?.updatedAt, 'Recently'))}</span>
            </div>
            <div class="messages-thread-message-bubble">${this.formatMessageBodyHtml(message?.body || message?.text || '')}</div>
            <div class="messages-thread-message-flags">${messageStatus}${readLabel}</div>
          </article>`;
      }).join('');
      return `<div class="messages-thread-list">${threadMarkup}</div>`;
    },

    updateMessageThreadComposerState: function (conversation = null, { canSend = null } = {}) {
      const resolvedConversation = conversation || this.getSelectedConversationRecord();
      const conversationId = String(resolvedConversation?.id || '').trim();
      const threadBodyValue = String(app.dom.messageThreadInput?.value || '');
      const bodyLength = threadBodyValue.length;
      const capabilities = this.getMessagingCapabilities();
      const canSendInline = typeof canSend === 'boolean'
        ? canSend
        : Boolean(resolvedConversation?.counterpartUserId
          && (String(resolvedConversation?.source || '').trim().toLowerCase() === 'conversation'
            ? (capabilities.canReply || capabilities.canSend)
            : capabilities.canSend));
      if (app.dom.messageThreadForm) {
        app.dom.messageThreadForm.hidden = !conversationId;
      }
      if (app.dom.messageThreadInput) {
        app.dom.messageThreadInput.disabled = !conversationId || !canSendInline || this.isSubmittingThreadMessage;
        app.dom.messageThreadInput.maxLength = MESSAGE_BODY_MAX_LENGTH;
        app.dom.messageThreadInput.placeholder = !conversationId
          ? 'Select a conversation'
          : (canSendInline ? 'Write a message' : 'Replies are unavailable for this conversation');
      }
      if (app.dom.messageThreadSubmitBtn) {
        app.dom.messageThreadSubmitBtn.disabled = !conversationId || !canSendInline || !bodyLength || this.isSubmittingThreadMessage;
        app.dom.messageThreadSubmitBtn.textContent = this.isSubmittingThreadMessage ? 'Sending...' : 'Send';
        app.dom.messageThreadSubmitBtn.title = !conversationId
          ? 'Select a conversation to continue.'
          : !canSendInline
            ? 'Replies are unavailable for this conversation.'
            : !bodyLength
              ? 'Enter a message to continue.'
              : 'Send message';
      }
      if (app.dom.messageThreadMeta) {
        const segments = [];
        if (!conversationId) {
          segments.push('Select a conversation');
        } else if (this.isLoadingMessageThread) {
          segments.push('Loading thread');
        } else if (!canSendInline) {
          segments.push('Replies unavailable');
        } else {
          segments.push('Reply in chat');
        }
        segments.push(formatCharacterCounter(threadBodyValue, MESSAGE_BODY_MAX_LENGTH));
        app.dom.messageThreadMeta.textContent = segments.join(' - ');
        return;
        app.dom.messageThreadMeta.textContent = segments.join(' · ');
      }
    },

    renderSelectedMessageDetail: function (message = null) {
      if (!app.dom.messagesDetail || !app.dom.messagesDetailEmpty) {
        return;
      }
      const capabilities = this.getMessagingCapabilities();
      const selectedConversationId = this.getSelectedConversationId();
      const conversationId = String(message?.id || '').trim();
      const unreadCount = Math.max(0, Math.floor(Number(message?.unreadCount || 0)));
      const canSendInline = Boolean(message?.counterpartUserId
        && (String(message?.source || '').trim().toLowerCase() === 'conversation'
          ? (capabilities.canReply || capabilities.canSend)
          : capabilities.canSend));
      if (!message) {
        app.dom.messagesDetail.hidden = true;
        app.dom.messagesDetailEmpty.hidden = false;
        app.dom.messagesDetail.classList.remove('is-visible');
        if (app.dom.messagesDetailMailbox) {
          app.dom.messagesDetailMailbox.hidden = true;
          app.dom.messagesDetailMailbox.dataset.mailbox = '';
          if (app.dom.messagesDetailMailbox.parentElement) {
            app.dom.messagesDetailMailbox.parentElement.hidden = true;
          }
        }
        if (app.dom.messageMarkToggleBtn) {
          app.dom.messageMarkToggleBtn.hidden = true;
          app.dom.messageMarkToggleBtn.disabled = true;
          app.dom.messageMarkToggleBtn.dataset.messageId = '';
        }
        this.updateMessageThreadComposerState(null, { canSend: false });
        return;
      }

      if (!conversationId || conversationId !== selectedConversationId) {
        return;
      }

      app.dom.messagesDetail.hidden = false;
      app.dom.messagesDetailEmpty.hidden = true;

      if (app.dom.messagesDetailMailbox) {
        const hasMailboxPill = unreadCount > 0 || Boolean(message?.isLegacy);
        app.dom.messagesDetailMailbox.hidden = !hasMailboxPill;
        app.dom.messagesDetailMailbox.textContent = unreadCount > 0
          ? (unreadCount > 1 ? `${unreadCount} unread` : 'Unread')
          : 'Legacy';
        app.dom.messagesDetailMailbox.dataset.mailbox = unreadCount > 0 ? 'unread' : 'legacy';
        if (app.dom.messagesDetailMailbox.parentElement) {
          app.dom.messagesDetailMailbox.parentElement.hidden = !hasMailboxPill;
        }
      }
      if (app.dom.messagesDetailSubject) {
        app.dom.messagesDetailSubject.textContent = this.getMessageCounterpartLabel(message);
      }
      if (app.dom.messagesDetailMeta) {
        const counterpartRole = this.getMessageCounterpartRole(message);
        const detailSegments = [message?.isLegacy ? 'Legacy thread' : 'Direct chat'];
        if (counterpartRole) {
          detailSegments.push(this.formatRoleLabel(counterpartRole));
        }
        if (message?.lastMessageAt) {
          detailSegments.push(`Updated ${this.formatAccountTimestamp(message.lastMessageAt, 'Recently')}`);
        }
        app.dom.messagesDetailMeta.textContent = detailSegments.join(' · ');
      }
      if (app.dom.messagesDetailBody) {
        const threadMessages = this.getMessageThread();
        if (this.isLoadingMessageThread && !threadMessages.length) {
          app.dom.messagesDetailBody.innerHTML = '<div class="messages-thread-empty"><strong>Loading conversation…</strong><p>Fetching the latest messages.</p></div>';
        } else {
          app.dom.messagesDetailBody.innerHTML = this.renderConversationThreadMarkup(threadMessages);
          window.requestAnimationFrame(() => {
            if (app.dom.messagesDetailBody) {
              app.dom.messagesDetailBody.scrollTop = app.dom.messagesDetailBody.scrollHeight;
            }
          });
        }
      }
      if (app.dom.messageMarkToggleBtn) {
        app.dom.messageMarkToggleBtn.hidden = unreadCount <= 0;
        app.dom.messageMarkToggleBtn.disabled = unreadCount <= 0;
        app.dom.messageMarkToggleBtn.dataset.messageId = conversationId;
        app.dom.messageMarkToggleBtn.textContent = 'Mark as read';
      }
      this.updateMessageThreadComposerState(message, { canSend: canSendInline });
      this.animateMessageDetail();
    },

    renderMessagesSection: function ({ preserveListScroll = true } = {}) {
      const hasSession = Boolean(app.state.authUser?.uid);
      const capabilities = this.getMessagingCapabilities();
      const hasAccess = capabilities.canReceive || capabilities.canSend || capabilities.canReply;
      const allMessages = this.getMessages();
      const unreadCount = Number.isFinite(Number(app.state.unreadMessageCount))
        ? Math.max(0, Math.floor(Number(app.state.unreadMessageCount)))
        : 0;
      const preservedMessageListScrollTop = preserveListScroll ? this.captureMessageListScrollPosition() : 0;

      this.updateMessageBadges();
      this.syncMessageFilterControls(allMessages, { hasAccess });
      const mailboxFilter = String(app.state.messageMailboxFilter || 'all').trim().toLowerCase();
      const hasActiveFilters = mailboxFilter !== 'all'
        || String(app.state.messageTypeFilter || 'all').trim().toLowerCase() !== 'all'
        || String(app.state.messageDateFilter || 'all').trim().toLowerCase() !== 'all'
        || Boolean(String(app.state.messageSearchTerm || '').trim());
      const filteredMessages = this.getFilteredMessages();
      const selectedMessage = hasSession && hasAccess ? this.getSelectedMessageRecord() : null;

      document.querySelectorAll('[data-message-filter]').forEach((button) => {
        const filter = String(button.dataset.messageFilter || '').trim().toLowerCase();
        const isActive = filter === String(app.state.messageMailboxFilter || 'all').trim().toLowerCase();
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.disabled = !hasAccess;
      });

      if (app.dom.messagesComposeBtn) {
        app.dom.messagesComposeBtn.disabled = !capabilities.canSend || this.isSubmittingMessage;
        app.dom.messagesComposeBtn.title = capabilities.canSend
          ? 'Start a new chat'
          : 'You do not have permission to start new chats';
      }
      if (app.dom.messagesRefreshBtn) {
        app.dom.messagesRefreshBtn.disabled = !hasAccess || this.isLoadingMessages;
        app.dom.messagesRefreshBtn.textContent = this.isLoadingMessages ? 'Refreshing...' : 'Refresh';
      }
      if (app.dom.messagesSectionStatus) {
        if (!hasSession) {
          app.dom.messagesSectionStatus.textContent = 'Sign in to access conversations.';
        } else if (!hasAccess) {
          app.dom.messagesSectionStatus.textContent = 'Chat is unavailable for this account.';
        } else if (this.isLoadingMessages) {
          app.dom.messagesSectionStatus.textContent = 'Loading your conversations...';
        } else if (this.messageRealtimeLimited) {
          app.dom.messagesSectionStatus.textContent = 'Showing accessible messages only. Live conversation sync is limited by current permissions.';
        } else if (app.state.messageLastMessageAt) {
          app.dom.messagesSectionStatus.textContent = `Last updated ${this.formatAccountTimestamp(app.state.messageLastMessageAt, 'Recently')}`;
        } else {
          app.dom.messagesSectionStatus.textContent = 'Catch up on direct conversations and live replies.';
        }
      }
      if (app.dom.messagesListStatus) {
        if (!hasSession) {
          app.dom.messagesListStatus.textContent = 'Sign in to load your conversations.';
        } else if (!hasAccess) {
          app.dom.messagesListStatus.textContent = 'Chat is unavailable.';
        } else if (this.isLoadingMessages) {
          app.dom.messagesListStatus.textContent = 'Loading conversations...';
        } else if (!filteredMessages.length) {
          app.dom.messagesListStatus.textContent = allMessages.length
            ? 'No conversations match the current search or filters.'
            : (this.messageRealtimeLimited ? 'No accessible conversations yet.' : 'No conversations yet.');
        } else {
          const count = filteredMessages.length;
          const filterLabel = mailboxFilter === 'all' ? 'conversation' : `${mailboxFilter} conversation`;
          if (hasActiveFilters) {
            app.dom.messagesListStatus.textContent = `Showing ${count} of ${allMessages.length} ${filterLabel}${allMessages.length === 1 ? '' : 's'}${unreadCount ? ` · ${unreadCount} unread` : ''}`;
          } else {
            app.dom.messagesListStatus.textContent = `${count} ${filterLabel}${count === 1 ? '' : 's'}${unreadCount ? ` · ${unreadCount} unread` : ''}`;
          }
        }
      }

      if (app.dom.messagesList) {
        let nextMessagesListMarkup = '';
        if (!hasSession || !hasAccess) {
          nextMessagesListMarkup = '<div class="messages-empty-state"><strong>Chat unavailable</strong><p>Sign in with a role that can access conversations to use this feature.</p></div>';
        } else if (!filteredMessages.length) {
          const emptyTitle = allMessages.length ? 'No conversations in this view' : 'No conversations yet';
          const emptyCopy = allMessages.length
            ? 'Try another search term, filter, or refresh your conversations.'
            : (capabilities.canSend ? 'Use New Chat to start a conversation.' : 'Chats sent to you will appear here.');
          nextMessagesListMarkup = `<div class="messages-empty-state"><strong>${app.utils.esc(emptyTitle)}</strong><p>${app.utils.esc(emptyCopy)}</p></div>`;
        } else {
          nextMessagesListMarkup = filteredMessages.map((message) => {
            const messageId = String(message?.id || '').trim();
            const isActive = messageId && messageId === String(app.state.selectedMessageId || '').trim();
            const isUnread = this.isMessageUnread(message);
            const isNew = this.isNewMessage(message);
            const counterpartLabel = this.getMessageCounterpartLabel(message);
            const counterpartRole = this.getMessageCounterpartRole(message) || 'teacher';
            const preview = String(message?.lastMessagePreview || message?.lastMessageText || 'No messages yet').replace(/\s+/g, ' ').trim() || 'No messages yet';
            const previewText = preview.length > 72 ? `${preview.slice(0, 71).trimEnd()}…` : preview;
            const statusChips = [];
            if (isUnread) {
              statusChips.push(`<span class="message-list-item-flag">${app.utils.esc(this.getMessageStatusLabel(message))}</span>`);
            }
            if (message?.isLegacy) {
              statusChips.push('<span class="message-list-item-flag is-legacy">Legacy</span>');
            }
            return `
              <button type="button" class="message-list-item${isActive ? ' is-active' : ''}${isUnread ? ' is-unread' : ''}${isNew ? ' is-new' : ''}" data-message-id="${app.utils.esc(messageId)}">
                <div class="message-list-item-main">
                  <span class="message-list-avatar" data-role="${app.utils.esc(counterpartRole)}">${app.utils.esc(this.getMessageInitials(counterpartLabel))}</span>
                  <div class="message-list-item-content">
                    <div class="message-list-item-topline">
                      <span class="message-list-item-counterpart">${app.utils.esc(counterpartLabel)}</span>
                      <span class="message-list-item-time">${app.utils.esc(this.formatAccountTimestamp(message?.lastMessageAt || message?.updatedAt || message?.createdAt, 'Recently'))}</span>
                    </div>
                    <div class="message-list-item-subject-row">
                      <span class="message-list-item-subject">${app.utils.esc(previewText)}</span>
                      ${statusChips.join('')}
                    </div>
                  </div>
                </div>
              </button>`;
          }).join('');
        }
        if (this.lastMessagesListMarkup !== nextMessagesListMarkup) {
          app.dom.messagesList.innerHTML = nextMessagesListMarkup;
          this.lastMessagesListMarkup = nextMessagesListMarkup;
        }
        if (preserveListScroll) {
          this.restoreMessageListScrollPosition(preservedMessageListScrollTop);
        } else {
          app.dom.messagesList.scrollTop = 0;
          this.messageListScrollTop = 0;
        }
      }

      this.renderSelectedMessageDetail(selectedMessage);
    },

    selectMessage: async function (messageId = '') {
      const normalizedMessageId = String(messageId || '').trim();
      if (!normalizedMessageId) {
        return;
      }
      const message = this.getMessages().find((entry) => {
        return String(entry?.id || '').trim() === normalizedMessageId;
      });
      if (!message) {
        return;
      }
      this.messageNewIds.delete(normalizedMessageId);
      app.state.selectedMessageId = normalizedMessageId;
      this.setMessageThreadFeedback('');
      this.renderMessagesSection();
      await this.syncSelectedConversationThread();
      if (this.isMessageUnread(message)) {
        void this.markMessageAsReadIfNeeded(normalizedMessageId);
      }
    },

    setMessageReadState: async function (messageId = '', isRead = true) {
      const normalizedMessageId = String(messageId || '').trim();
      const message = this.getMessages().find((entry) => {
        return String(entry?.id || '').trim() === normalizedMessageId;
      });
      const nextReadState = Boolean(isRead);
      const clearedUnreadCount = Number.isFinite(Number(message?.unreadCount))
        ? Math.max(0, Math.floor(Number(message.unreadCount)))
        : 0;
      if (!message || !nextReadState || clearedUnreadCount <= 0) {
        return false;
      }
      try {
        const didUpdate = await markConversationAsRead(normalizedMessageId);
        if (!didUpdate) {
          return false;
        }
        const actorUserId = String(app.state.authUser?.uid || '').trim();
        const unreadCount = Number.isFinite(Number(app.state.unreadMessageCount))
          ? Math.max(0, Math.floor(Number(app.state.unreadMessageCount)))
          : 0;
        this.messageNewIds.delete(normalizedMessageId);
        app.state.messages = this.getMessages().map((entry) => {
          if (String(entry?.id || '').trim() !== normalizedMessageId) {
            return entry;
          }
          return {
            ...(entry || {}),
            unreadCount: 0,
            unreadCountByUser: actorUserId
              ? {
                  ...((entry?.unreadCountByUser && typeof entry.unreadCountByUser === 'object') ? entry.unreadCountByUser : {}),
                  [actorUserId]: 0
                }
              : entry?.unreadCountByUser
          };
        });
        if (String(this.getSelectedConversationId() || '').trim() === normalizedMessageId) {
          app.state.messageThread = this.getMessageThread().map((threadMessage) => {
            if (!actorUserId || Boolean(threadMessage?.isOwnMessage)) {
              return threadMessage;
            }
            const readByUserIds = Array.isArray(threadMessage?.readByUserIds) ? threadMessage.readByUserIds : [];
            return {
              ...(threadMessage || {}),
              readByUserIds: readByUserIds.includes(actorUserId) ? readByUserIds : readByUserIds.concat(actorUserId),
              isReadByCurrentUser: true,
              isUnreadLegacy: false
            };
          });
        }
        this.syncLocalMessageMetadata({
          unreadCount: Math.max(0, unreadCount - clearedUnreadCount),
          lastMessageAt: app.state.messageLastMessageAt
        });
        this.renderMessagesSection();
        return true;
      } catch (error) {
        console.error('Failed to mark conversation as read:', error);
        return false;
      }
    },

    markMessageAsReadIfNeeded: async function (messageId = '') {
      return this.setMessageReadState(messageId, true);
    },

    toggleSelectedMessageReadState: async function (messageId = '') {
      const normalizedMessageId = String(messageId || app.state.selectedMessageId || '').trim();
      if (!normalizedMessageId) {
        return false;
      }
      return this.setMessageReadState(normalizedMessageId, true);
    },

    setMessageMailboxFilter: function (filter = 'all') {
      const normalizedFilter = ['all', 'unread', 'legacy'].includes(String(filter || '').trim().toLowerCase())
        ? String(filter || '').trim().toLowerCase()
        : 'all';
      app.state.messageMailboxFilter = normalizedFilter;
      this.renderMessagesSection({ preserveListScroll: false });
    },

    setMessageSearchTerm: function (searchTerm = '') {
      app.state.messageSearchTerm = String(searchTerm || '').trimStart();
      this.renderMessagesSection({ preserveListScroll: false });
    },

    setMessageTypeFilter: function (filter = 'all') {
      const normalizedFilter = ['all', 'direct', 'legacy'].includes(String(filter || '').trim().toLowerCase())
        ? String(filter || '').trim().toLowerCase()
        : 'all';
      app.state.messageTypeFilter = normalizedFilter;
      this.renderMessagesSection({ preserveListScroll: false });
    },

    setMessageRoleFilter: function (filter = 'all') {
      app.state.messageRoleFilter = String(filter || 'all').trim().toLowerCase() || 'all';
      this.renderMessagesSection({ preserveListScroll: false });
    },

    setMessageDateFilter: function (filter = 'all') {
      const normalizedFilter = ['all', 'today', 'week', 'month'].includes(String(filter || '').trim().toLowerCase())
        ? String(filter || '').trim().toLowerCase()
        : 'all';
      app.state.messageDateFilter = normalizedFilter;
      this.renderMessagesSection({ preserveListScroll: false });
    },

    setMessageThreadFeedback: function (message = '', tone = '') {
      if (!app.dom.messageThreadFeedback) {
        return;
      }
      const normalizedMessage = String(message || '').trim();
      app.dom.messageThreadFeedback.textContent = normalizedMessage;
      app.dom.messageThreadFeedback.hidden = !normalizedMessage;
      if (tone) {
        app.dom.messageThreadFeedback.dataset.tone = tone;
      } else {
        delete app.dom.messageThreadFeedback.dataset.tone;
      }
    },

    populateMessageSelect: function (selectElement, options = [], { selectedValue = '', placeholder = 'Select an option', includePlaceholder = true } = {}) {
      if (!selectElement) {
        return;
      }
      const normalizedOptions = Array.isArray(options) ? options : [];
      const optionMarkup = normalizedOptions.map((option) => {
        const value = String(option?.value ?? option?.uid ?? option?.id ?? option?.role ?? '').trim();
        const label = String(option?.label || option?.name || option?.displayLabel || option?.email || value).trim() || value;
        return `<option value="${app.utils.esc(value)}">${app.utils.esc(label)}</option>`;
      });
      if (includePlaceholder) {
        optionMarkup.unshift(`<option value="">${app.utils.esc(placeholder)}</option>`);
      }
      selectElement.innerHTML = optionMarkup.join('');
      const normalizedSelectedValue = String(selectedValue || '').trim();
      const hasSelectedValue = normalizedOptions.some((option) => {
        const optionValue = String(option?.value ?? option?.uid ?? option?.id ?? option?.role ?? '').trim();
        return optionValue === normalizedSelectedValue;
      });
      if (hasSelectedValue) {
        selectElement.value = normalizedSelectedValue;
      } else if (!includePlaceholder && normalizedOptions[0]) {
        selectElement.value = String(normalizedOptions[0]?.value ?? normalizedOptions[0]?.uid ?? normalizedOptions[0]?.id ?? normalizedOptions[0]?.role ?? '').trim();
      } else {
        selectElement.value = '';
      }
      selectElement.disabled = !normalizedOptions.length;
    },

    setMessageComposeFeedback: function (message = '', tone = '') {
      if (!app.dom.messageComposeFeedback) {
        return;
      }
      const normalizedMessage = String(message || '').trim();
      app.dom.messageComposeFeedback.textContent = normalizedMessage;
      app.dom.messageComposeFeedback.hidden = !normalizedMessage;
      if (tone) {
        app.dom.messageComposeFeedback.dataset.tone = tone;
      } else {
        delete app.dom.messageComposeFeedback.dataset.tone;
      }
    },

    updateMessageComposeMeta: function () {
      if (!app.dom.messageComposeMeta) {
        return;
      }
      const directory = this.getMessageDirectory();
      const composerState = this.messageComposeState || {};
      const selectedRecipientUserId = String(app.dom.messageComposeRecipientSelect?.value || composerState.recipientUserId || '').trim();
      const composeBodyValue = String(app.dom.messageComposeBody?.value || '');
      const selectedUser = directory.users.find((option) => {
        return String(option?.uid ?? option?.value ?? '').trim() === selectedRecipientUserId;
      });
      const recipientSummary = selectedUser
        ? `Chat with ${selectedUser.label || selectedUser.displayLabel || selectedUser.name || selectedUser.email || 'recipient'}`
        : (this.isLoadingMessageDirectory ? 'Loading recipients...' : 'Select a recipient');
      app.dom.messageComposeMeta.textContent = `${recipientSummary} - ${formatCharacterCounter(composeBodyValue, MESSAGE_BODY_MAX_LENGTH)}`;
      return;
      app.dom.messageComposeMeta.textContent = `${recipientSummary} · ${formatCharacterCounter(composeBodyValue, MESSAGE_BODY_MAX_LENGTH)}`;
      return;
      app.dom.messageComposeMeta.textContent = `${recipientSummary} · ${bodyLength} / 5000 characters`;
    },

    renderMessageComposeControls: function () {
      if (!app.dom.messageComposeModal) {
        return;
      }
      const composerState = this.messageComposeState || {};
      const directory = this.getMessageDirectory();
      const recipientOptions = Array.isArray(directory.users) ? directory.users : [];
      const selectedRecipientUserId = String(app.dom.messageComposeRecipientSelect?.value || composerState.recipientUserId || '').trim();
      this.populateMessageSelect(app.dom.messageComposeRecipientSelect, recipientOptions, {
        selectedValue: selectedRecipientUserId,
        placeholder: 'Select recipient',
        includePlaceholder: true
      });

      if (app.dom.messageComposeTitle) {
        app.dom.messageComposeTitle.textContent = 'Start New Chat';
      }
      if (app.dom.messageComposeSubtitle) {
        if (this.isLoadingMessageDirectory) {
          app.dom.messageComposeSubtitle.textContent = 'Loading recipient options...';
        } else if (!recipientOptions.length) {
          app.dom.messageComposeSubtitle.textContent = 'No eligible recipients are available for your account.';
        } else {
          app.dom.messageComposeSubtitle.textContent = 'Choose who to chat with and send your first message.';
        }
      }
      if (app.dom.messageComposeRecipientGroup) {
        app.dom.messageComposeRecipientGroup.hidden = false;
      }
      if (app.dom.messageComposeRecipientSelect) {
        app.dom.messageComposeRecipientSelect.disabled = this.isSubmittingMessage || this.isLoadingMessageDirectory || !recipientOptions.length;
        app.dom.messageComposeRecipientSelect.title = this.isLoadingMessageDirectory
          ? 'Recipient options are still loading.'
          : !recipientOptions.length
            ? 'No eligible recipients are available for your account.'
            : 'Select a recipient';
      }
      if (app.dom.messageComposeBody) {
        app.dom.messageComposeBody.maxLength = MESSAGE_BODY_MAX_LENGTH;
      }
      if (app.dom.messageComposeSubmitBtn) {
        const bodyLength = String(app.dom.messageComposeBody?.value || '').trim().length;
        const hasRecipient = Boolean(app.dom.messageComposeRecipientSelect?.value || selectedRecipientUserId);
        app.dom.messageComposeSubmitBtn.disabled = this.isSubmittingMessage || this.isLoadingMessageDirectory || !hasRecipient || !bodyLength;
        app.dom.messageComposeSubmitBtn.textContent = this.isSubmittingMessage
          ? 'Starting...'
          : 'Start Chat';
        app.dom.messageComposeSubmitBtn.title = this.isLoadingMessageDirectory
          ? 'Recipient options are still loading.'
          : !recipientOptions.length
            ? 'No eligible recipients are available for your account.'
            : !hasRecipient
              ? 'Select a recipient to continue.'
              : !bodyLength
                ? 'Enter a message to continue.'
                : 'Start chat';
      }

      this.updateMessageComposeMeta();
    },

    openMessageComposeModal: async function ({ recipientUserId = '' } = {}) {
      const capabilities = this.getMessagingCapabilities();
      if (!capabilities.canSend) {
        this.showToast('You do not have permission to start new chats');
        return;
      }
      try {
        await this.ensureMessageDirectoryLoaded();
      } catch (error) {
        return;
      }

      const directory = this.getMessageDirectory();
      const selectedConversation = this.getSelectedConversationRecord();
      const preferredRecipientUserId = String(recipientUserId || selectedConversation?.counterpartUserId || '').trim();
      const hasPreferredRecipient = directory.users.some((option) => {
        return String(option?.uid ?? option?.value ?? '').trim() === preferredRecipientUserId;
      });
      if (!directory.users.length) {
        this.showToast('No chat recipients are available for your account');
        return;
      }

      this.messageComposeState = {
        mode: 'compose',
        replyToMessageId: '',
        recipientUserId: hasPreferredRecipient ? preferredRecipientUserId : ''
      };

      if (app.dom.messageComposeForm) {
        app.dom.messageComposeForm.reset();
      }
      if (app.dom.messageComposeBody) {
        app.dom.messageComposeBody.value = '';
      }

      this.setMessageComposeFeedback('');
      this.renderMessageComposeControls();
      if (app.dom.messageComposeModal) {
        app.dom.messageComposeModal.classList.add('active');
      }
      const focusTarget = hasPreferredRecipient ? app.dom.messageComposeBody : app.dom.messageComposeRecipientSelect;
      if (focusTarget) {
        focusTarget.focus();
      }
    },

    closeMessageComposeModal: function () {
      if (app.dom.messageComposeModal) {
        app.dom.messageComposeModal.classList.remove('active');
      }
      this.messageComposeState = {
        mode: 'compose',
        replyToMessageId: '',
        recipientUserId: ''
      };
      if (app.dom.messageComposeForm) {
        app.dom.messageComposeForm.reset();
      }
      this.setMessageComposeFeedback('');
      this.renderMessageComposeControls();
    },

    applySentMessageResult: function (result = {}, toastMessage = 'Message sent') {
      const conversation = result?.conversation || result?.sentMessage || null;
      const sentMessage = result?.message || null;
      const conversationId = String(conversation?.id || sentMessage?.conversationId || '').trim();
      if (conversation?.id) {
        const currentMessages = this.getMessages().filter((message) => {
          return String(message?.id || '').trim() !== String(conversation?.id || '').trim();
        });
        app.state.messages = [conversation, ...currentMessages].sort((left, right) => {
          const leftTime = new Date(left?.sortAt || left?.lastMessageAt || left?.updatedAt || 0).getTime() || 0;
          const rightTime = new Date(right?.sortAt || right?.lastMessageAt || right?.updatedAt || 0).getTime() || 0;
          return rightTime - leftTime;
        });
      }
      if (conversationId) {
        app.state.selectedMessageId = conversationId;
      }
      if (sentMessage?.id && conversationId) {
        const existingThread = String(this.messageThreadLoadedConversationId || '').trim() === conversationId
          ? this.getMessageThread().filter((message) => String(message?.id || '').trim() !== String(sentMessage.id || '').trim())
          : [];
        app.state.messageThread = existingThread.concat(sentMessage).sort((left, right) => {
          const leftTime = new Date(left?.sortAt || left?.sentAt || left?.createdAt || left?.updatedAt || 0).getTime() || 0;
          const rightTime = new Date(right?.sortAt || right?.sentAt || right?.createdAt || right?.updatedAt || 0).getTime() || 0;
          return leftTime - rightTime;
        });
        this.messageThreadLoadedConversationId = conversationId;
        this.messageThreadRequestConversationId = '';
      }
      app.state.messageMailboxFilter = 'all';
      this.syncLocalMessageMetadata({
        unreadCount: app.state.unreadMessageCount,
        lastMessageAt: conversation?.lastMessageAt || sentMessage?.sentAt || sentMessage?.createdAt || app.state.messageLastMessageAt || new Date().toISOString()
      });
      this.showContentSection('messages');
      this.renderMessagesSection();
      void this.ensureMessageListSubscription();
      if (conversationId) {
        void this.ensureSelectedConversationThreadSubscription(conversationId);
      }
      const feedback = buildSubmissionFeedback({ successMessage: toastMessage });
      this.showToast(feedback.message, { tone: feedback.tone });
    },

    handleMessageComposeSubmit: async function () {
      if (this.isSubmittingMessage) {
        return;
      }
      const composerState = this.messageComposeState || {};
      const recipientUserId = String(app.dom.messageComposeRecipientSelect?.value || composerState.recipientUserId || '').trim();
      const body = String(app.dom.messageComposeBody?.value || '').trim();

      if (!recipientUserId) {
        this.setMessageComposeFeedback('Select a recipient to continue.', 'error');
        return;
      }
      if (!body) {
        this.setMessageComposeFeedback('Enter a message to continue.', 'error');
        return;
      }

      this.isSubmittingMessage = true;
      this.setMessageComposeFeedback('');
      this.renderMessageComposeControls();

      try {
        const result = await sendConversationMessage({ recipientUserId, body });
        this.applySentMessageResult(result, 'Chat started');
        this.closeMessageComposeModal();
      } catch (error) {
        if (!isPermissionDeniedSubmissionError(error)) {
          console.error('Failed to start chat:', error);
        }
        const feedback = buildSubmissionFeedback({
          error,
          fallbackMessage: 'Failed to start chat'
        });
        this.setMessageComposeFeedback(feedback.message, feedback.tone);
      } finally {
        this.isSubmittingMessage = false;
        this.renderMessageComposeControls();
      }
    },

    handleMessageThreadSubmit: async function () {
      if (this.isSubmittingThreadMessage) {
        return;
      }
      const selectedConversation = this.getSelectedConversationRecord();
      const conversationId = String(selectedConversation?.id || '').trim();
      const body = String(app.dom.messageThreadInput?.value || '').trim();
      const capabilities = this.getMessagingCapabilities();
      const canSendInline = Boolean(selectedConversation?.counterpartUserId
        && (String(selectedConversation?.source || '').trim().toLowerCase() === 'conversation'
          ? (capabilities.canReply || capabilities.canSend)
          : capabilities.canSend));

      if (!conversationId) {
        this.setMessageThreadFeedback('Select a conversation to reply.', 'error');
        return;
      }
      if (!canSendInline) {
        this.setMessageThreadFeedback('Replies are unavailable for this conversation.', 'error');
        return;
      }
      if (!body) {
        this.setMessageThreadFeedback('Enter a message to continue.', 'error');
        return;
      }

      this.isSubmittingThreadMessage = true;
      this.setMessageThreadFeedback('');
      this.updateMessageThreadComposerState(selectedConversation, { canSend: canSendInline });

      try {
        const result = await sendConversationMessage({ conversationId, body });
        if (app.dom.messageThreadInput) {
          app.dom.messageThreadInput.value = '';
        }
        this.applySentMessageResult(result, 'Message sent');
      } catch (error) {
        if (!isPermissionDeniedSubmissionError(error)) {
          console.error('Failed to send conversation message:', error);
        }
        const feedback = buildSubmissionFeedback({
          error,
          fallbackMessage: 'Failed to send message'
        });
        this.setMessageThreadFeedback(feedback.message, feedback.tone);
      } finally {
        this.isSubmittingThreadMessage = false;
        this.updateMessageThreadComposerState(this.getSelectedConversationRecord());
      }
    },

    openMessagesSection: async function ({ force = false, messageId = '' } = {}) {
      if (messageId) {
        app.state.selectedMessageId = String(messageId || '').trim();
      }
      this.syncSectionShellState('messages');
      this.renderMessagesSection();
      try {
        await this.ensureMessagesLoaded(force);
        await this.syncSelectedConversationThread();
      } catch (error) {
        console.error('Failed to open messages section:', error);
      }
    },

    getCurrentAccountLifecycle: function (profile = app.state.authUser || {}) {
      return {
        status: normalizeAccountStatus(profile?.status ?? ACCOUNT_STATUS_ACTIVE),
        accountDeletionStatus: normalizeAccountDeletionStatus(
          profile?.accountDeletionStatus ?? ACCOUNT_DELETION_STATUS_NONE
        ),
        accountDeletionRequestedAt: profile?.accountDeletionRequestedAt ?? null,
        accountDeletionReviewedAt: profile?.accountDeletionReviewedAt ?? null,
        deletedAt: profile?.deletedAt ?? null
      };
    },

    getAccountDeletionUiState: function (profile = app.state.authUser || {}) {
      const lifecycle = this.getCurrentAccountLifecycle(profile);
      const requestedAtLabel = this.formatAccountTimestamp(lifecycle.accountDeletionRequestedAt, '');
      const reviewedAtLabel = this.formatAccountTimestamp(lifecycle.accountDeletionReviewedAt, '');

      if (lifecycle.status === ACCOUNT_STATUS_DELETED) {
        return {
          label: lifecycle.deletedAt
            ? `Deleted on ${this.formatAccountTimestamp(lifecycle.deletedAt, 'Not available')}`
            : 'Account deleted',
          tone: 'deleted',
          help: 'This account has already been deleted.',
          buttonLabel: 'Account Deleted',
          disableDeleteButton: true,
          canRequest: false,
          canFinalize: false
        };
      }

      if (lifecycle.accountDeletionStatus === ACCOUNT_DELETION_STATUS_APPROVED) {
        return {
          label: reviewedAtLabel ? `Approved on ${reviewedAtLabel}` : 'Approved - final confirmation required',
          tone: 'approved',
          help: 'Your request was approved. Select delete account to permanently remove your account and owned data.',
          buttonLabel: 'Confirm Delete Account',
          disableDeleteButton: false,
          canRequest: false,
          canFinalize: true
        };
      }

      if (lifecycle.accountDeletionStatus === ACCOUNT_DELETION_STATUS_PENDING) {
        return {
          label: requestedAtLabel ? `Pending since ${requestedAtLabel}` : 'Pending admin review',
          tone: 'pending',
          help: 'Your deletion request is pending review. Once approved, return here to finalize deletion.',
          buttonLabel: 'Deletion Request Pending',
          disableDeleteButton: true,
          canRequest: false,
          canFinalize: false
        };
      }

      if (lifecycle.accountDeletionStatus === ACCOUNT_DELETION_STATUS_REJECTED) {
        return {
          label: reviewedAtLabel ? `Rejected on ${reviewedAtLabel}` : 'Rejected - you can submit a new request',
          tone: 'rejected',
          help: 'Your last deletion request was rejected. You can submit a new request if you still want the account removed.',
          buttonLabel: 'Request Account Deletion',
          disableDeleteButton: false,
          canRequest: true,
          canFinalize: false
        };
      }

      return {
        label: 'No request submitted',
        tone: 'inactive',
        help: 'Deletion requests stay pending until an admin reviews them.',
        buttonLabel: 'Request Account Deletion',
        disableDeleteButton: false,
        canRequest: true,
        canFinalize: false
      };
    },

    setAccountSettingsFeedback: function (message = '', tone = 'neutral') {
      if (!app.dom.accountSettingsFeedback) {
        return;
      }

      const normalizedMessage = String(message || '').trim();
      app.dom.accountSettingsFeedback.textContent = normalizedMessage;
      if (!normalizedMessage) {
        app.dom.accountSettingsFeedback.hidden = true;
        app.dom.accountSettingsFeedback.removeAttribute('data-tone');
        return;
      }

      app.dom.accountSettingsFeedback.hidden = false;
      app.dom.accountSettingsFeedback.dataset.tone = tone;
    },

    applyAccountSettingsSubmissionFeedback: function ({
      error = null,
      successMessage = '',
      fallbackMessage = 'Request failed. Please try again.',
      toastMessage = '',
      auth = true
    } = {}) {
      const feedback = buildSubmissionFeedback({
        error,
        successMessage,
        fallbackMessage,
        app,
        auth
      });
      this.setAccountSettingsFeedback(feedback.message, feedback.tone);
      this.showToast(String(toastMessage || feedback.message).trim() || feedback.message, {
        tone: feedback.tone
      });
      return feedback;
    },

    hasPendingAccountSettingsChanges: function () {
      if (!app.dom.accountSettingsNameInput || !app.state.authUser?.uid) {
        return false;
      }

      const currentValue = String(app.dom.accountSettingsNameInput.value || '').trim();
      const initialValue = String(
        app.dom.accountSettingsNameInput.dataset.initialValue
        || app.state.authUser?.name
        || app.state.authUser?.email
        || ''
      ).trim();

      return Boolean(currentValue) && currentValue !== initialValue;
    },

    setAccountSettingsBusy: function (isBusy, action = '') {
      const nextBusy = Boolean(isBusy);
      const normalizedAction = String(action || this.accountSettingsBusyAction || 'save').trim().toLowerCase();
      this.accountSettingsBusyAction = nextBusy ? normalizedAction : '';
      this.isSavingAccountSettings = nextBusy && normalizedAction === 'save';
      const hasSession = Boolean(app.state.authUser?.uid);
      const shouldDisableControls = nextBusy || !hasSession;
      const hasPendingChanges = this.hasPendingAccountSettingsChanges();
      const deletionState = hasSession
        ? this.getAccountDeletionUiState(app.state.authUser)
        : {
          buttonLabel: 'Request Account Deletion',
          disableDeleteButton: true,
          canFinalize: false
        };

      if (app.dom.accountSettingsNameInput) {
        app.dom.accountSettingsNameInput.disabled = shouldDisableControls;
      }
      if (app.dom.accountSettingsSaveBtn) {
        app.dom.accountSettingsSaveBtn.disabled = shouldDisableControls || !hasPendingChanges;
        app.dom.accountSettingsSaveBtn.textContent = this.accountSettingsBusyAction === 'save' ? 'Saving...' : 'Save Changes';
      }
      if (app.dom.accountSettingsResetBtn) {
        app.dom.accountSettingsResetBtn.disabled = shouldDisableControls || !hasPendingChanges;
      }
      if (app.dom.accountSettingsPasswordResetBtn) {
        app.dom.accountSettingsPasswordResetBtn.disabled = shouldDisableControls;
        app.dom.accountSettingsPasswordResetBtn.textContent = this.accountSettingsBusyAction === 'password-reset'
          ? 'Sending...'
          : 'Send Password Reset';
      }
      if (app.dom.accountSettingsDeleteBtn) {
        app.dom.accountSettingsDeleteBtn.disabled = shouldDisableControls || deletionState.disableDeleteButton;
        app.dom.accountSettingsDeleteBtn.textContent = this.accountSettingsBusyAction === 'delete'
          ? (deletionState.canFinalize ? 'Deleting...' : 'Requesting...')
          : deletionState.buttonLabel;
      }
    },

    syncLocalAccountIdentity: function (profile = {}) {
      const authUid = String(profile?.uid || app.state.authUser?.uid || '').trim();
      if (!authUid) {
        return;
      }

      const normalizedName = String(profile?.name || app.state.authUser?.name || app.state.authUser?.email || '').trim();
      const normalizedEmail = String(profile?.email || app.state.authUser?.email || '').trim();
      const normalizedRole = normalizeUserRole(profile?.role || app.state.authUser?.role || app.state.currentUserRole);
      const normalizedEmailVerified = Boolean(profile?.emailVerified ?? app.state.authUser?.emailVerified);
      const createdAt = profile?.createdAt ?? app.state.authUser?.createdAt ?? null;
      const updatedAt = profile?.updatedAt ?? app.state.authUser?.updatedAt ?? null;
      const status = normalizeAccountStatus(profile?.status ?? app.state.authUser?.status ?? ACCOUNT_STATUS_ACTIVE);
      const accountDeletionStatus = normalizeAccountDeletionStatus(
        profile?.accountDeletionStatus ?? app.state.authUser?.accountDeletionStatus ?? ACCOUNT_DELETION_STATUS_NONE
      );
      const accountDeletionRequestedAt = profile?.accountDeletionRequestedAt ?? app.state.authUser?.accountDeletionRequestedAt ?? null;
      const accountDeletionRequestedBy = profile?.accountDeletionRequestedBy ?? app.state.authUser?.accountDeletionRequestedBy ?? '';
      const accountDeletionReviewedAt = profile?.accountDeletionReviewedAt ?? app.state.authUser?.accountDeletionReviewedAt ?? null;
      const accountDeletionReviewedBy = profile?.accountDeletionReviewedBy ?? app.state.authUser?.accountDeletionReviewedBy ?? '';
      const deletedAt = profile?.deletedAt ?? app.state.authUser?.deletedAt ?? null;

      app.state.authUser = {
        ...(app.state.authUser || {}),
        uid: authUid,
        name: normalizedName,
        email: normalizedEmail,
        role: normalizedRole,
        emailVerified: normalizedEmailVerified,
        createdAt,
        updatedAt,
        status,
        accountDeletionStatus,
        accountDeletionRequestedAt,
        accountDeletionRequestedBy,
        accountDeletionReviewedAt,
        accountDeletionReviewedBy,
        deletedAt
      };

      if (typeof window !== 'undefined') {
        window.__TEACHER_NAME__ = normalizedName;
        window.teacherName = normalizedName;
      }

      app.state.classes = (Array.isArray(app.state.classes) ? app.state.classes : []).map((entry) => {
        const entryOwnerId = String(entry?.ownerId || '').trim();
        if (entryOwnerId !== authUid) {
          return entry;
        }

        return {
          ...(entry || {}),
          ownerName: normalizedName || String(entry?.ownerName || '').trim() || 'Teacher'
        };
      });

      if (String(app.state.currentClassOwnerId || '').trim() === authUid) {
        app.state.currentClassOwnerName = normalizedName || app.state.currentClassOwnerName || 'Teacher';
      }

      if (typeof app.syncDataContext === 'function') {
        app.syncDataContext();
      }
      if (typeof app.syncAuthSessionUi === 'function') {
        app.syncAuthSessionUi();
      }
    },

    resetAccountSettingsForm: function () {
      const defaultName = String(app.state.authUser?.name || app.state.authUser?.email || '').trim();
      if (app.dom.accountSettingsNameInput) {
        app.dom.accountSettingsNameInput.value = defaultName;
      }
      this.setAccountSettingsFeedback('');
      this.setAccountSettingsBusy(false);
    },

    renderAccountSettings: function ({ preserveFeedback = true } = {}) {
      const hasSession = Boolean(app.state.authUser?.uid);
      const displayName = String(app.state.authUser?.name || app.state.authUser?.email || '').trim();
      const email = String(app.state.authUser?.email || '').trim();
      const normalizedRole = normalizeUserRole(app.state.authUser?.role || app.state.currentUserRole);
      const roleLabel = hasSession
        ? this.formatRoleLabel(app.state.authUser?.role || app.state.currentUserRole)
        : 'Not signed in';
      const createdAtLabel = hasSession
        ? this.formatAccountTimestamp(app.state.authUser?.createdAt, 'Not available')
        : 'Not available';
      const updatedAtLabel = hasSession
        ? this.formatAccountTimestamp(app.state.authUser?.updatedAt, 'Not yet saved')
        : 'Not available';
      const classLabel = hasSession ? this.getCurrentClassDisplayLabel() : 'No class selected';
      const emailStatus = !hasSession
        ? { label: 'Not available', tone: 'inactive' }
        : app.state.authUser?.emailVerified
          ? { label: 'Verified', tone: 'verified' }
          : normalizedRole === 'admin' || normalizedRole === 'developer'
            ? { label: 'Manual review for this role', tone: 'managed' }
            : { label: 'Pending verification', tone: 'attention' };
      const deletionState = hasSession
        ? this.getAccountDeletionUiState(app.state.authUser)
        : {
          label: 'Not available',
          tone: 'inactive',
          help: 'Sign in to manage password reset and deletion options.'
        };
      const shouldPreserveDraft = document.activeElement === app.dom.accountSettingsNameInput && !this.isSavingAccountSettings;
      const currentDraftValue = shouldPreserveDraft ? String(app.dom.accountSettingsNameInput?.value || '') : '';

      if (app.dom.accountSettingsNameInput) {
        app.dom.accountSettingsNameInput.value = shouldPreserveDraft ? currentDraftValue : displayName;
        app.dom.accountSettingsNameInput.dataset.initialValue = displayName;
      }
      if (app.dom.accountSettingsEmailInput) {
        app.dom.accountSettingsEmailInput.value = email;
      }
      if (app.dom.accountSettingsRoleInput) {
        app.dom.accountSettingsRoleInput.value = roleLabel;
      }
      if (app.dom.accountSettingsUpdatedAtInput) {
        app.dom.accountSettingsUpdatedAtInput.value = updatedAtLabel;
      }
      if (app.dom.accountSettingsCreatedAtValue) {
        app.dom.accountSettingsCreatedAtValue.textContent = createdAtLabel;
      }
      if (app.dom.accountSettingsClassValue) {
        app.dom.accountSettingsClassValue.textContent = classLabel;
      }
      if (app.dom.accountSettingsEmailStatusValue) {
        app.dom.accountSettingsEmailStatusValue.textContent = emailStatus.label;
        app.dom.accountSettingsEmailStatusValue.dataset.tone = emailStatus.tone;
      }
      if (app.dom.accountSettingsDeletionStatusValue) {
        app.dom.accountSettingsDeletionStatusValue.textContent = deletionState.label;
        app.dom.accountSettingsDeletionStatusValue.dataset.tone = deletionState.tone;
      }
      if (app.dom.accountSettingsDeletionHelp) {
        app.dom.accountSettingsDeletionHelp.textContent = deletionState.help;
      }
      if (app.dom.accountSettingsSessionStatus) {
        app.dom.accountSettingsSessionStatus.textContent = hasSession
          ? `Signed in as ${displayName || email || 'User'}`
          : 'No active session';
        app.dom.accountSettingsSessionStatus.dataset.tone = hasSession ? 'active' : 'inactive';
      }

      if (!preserveFeedback) {
        this.setAccountSettingsFeedback('');
      }
      this.setAccountSettingsBusy(Boolean(this.accountSettingsBusyAction), this.accountSettingsBusyAction);
    },

    saveAccountSettings: async function () {
      const authUid = String(app.state.authUser?.uid || '').trim();
      if (!authUid) {
        this.setAccountSettingsFeedback('You must be signed in to update your profile.', 'error');
        return;
      }

      const requestedName = String(app.dom.accountSettingsNameInput?.value || '').trim();
      this.setAccountSettingsFeedback('');

      await this.withLoader(async () => {
        this.setAccountSettingsBusy(true, 'save');
        try {
          const profile = await updateCurrentUserProfile({ name: requestedName });
          await syncCurrentUserClassOwnerName(profile?.name || requestedName);
          this.syncLocalAccountIdentity({
            ...profile,
            uid: profile?.uid || authUid,
            updatedAt: profile?.updatedAt || new Date().toISOString()
          });
          this.renderClassControls();
          this.renderAccountSettings({ preserveFeedback: true });
          this.applyAccountSettingsSubmissionFeedback({
            successMessage: 'Account settings saved.',
            toastMessage: 'Account settings saved'
          });
        } catch (error) {
          console.error('Failed to save account settings:', error);
          this.applyAccountSettingsSubmissionFeedback({
            error,
            fallbackMessage: 'Failed to save account settings.'
          });
        } finally {
          this.setAccountSettingsBusy(false);
        }
      }, {
        message: 'Saving account settings...'
      });
    },

    sendAccountSettingsPasswordReset: async function () {
      const authUid = String(app.state.authUser?.uid || '').trim();
      const email = String(app.state.authUser?.email || '').trim();
      if (!authUid || !email) {
        this.setAccountSettingsFeedback('You must be signed in with a valid email to reset your password.', 'error');
        return;
      }

      this.setAccountSettingsFeedback('');

      await this.withLoader(async () => {
        this.setAccountSettingsBusy(true, 'password-reset');
        try {
          await requestPasswordReset(email);
          this.applyAccountSettingsSubmissionFeedback({
            successMessage: `Password reset instructions were sent to ${email}.`,
            toastMessage: 'Password reset email sent'
          });
        } catch (error) {
          console.error('Failed to send password reset email:', error);
          this.applyAccountSettingsSubmissionFeedback({
            error,
            fallbackMessage: 'Failed to send password reset email.'
          });
        } finally {
          this.setAccountSettingsBusy(false);
        }
      }, {
        message: 'Sending password reset email...'
      });
    },

    handleAccountSettingsDeletionAction: async function () {
      const authUid = String(app.state.authUser?.uid || '').trim();
      if (!authUid) {
        this.setAccountSettingsFeedback('You must be signed in to manage account deletion.', 'error');
        return;
      }

      const deletionState = this.getAccountDeletionUiState(app.state.authUser);
      if (!deletionState.canRequest && !deletionState.canFinalize) {
        this.setAccountSettingsFeedback(deletionState.help, 'error');
        return;
      }

      const shouldContinue = await this.requestConfirmation({
        title: deletionState.canFinalize ? 'Confirm Account Deletion' : 'Confirm Deletion Request',
        message: deletionState.canFinalize
          ? 'Delete this account permanently? This removes your account data, signs you out, and cannot be undone.'
          : 'Submit an account deletion request? An admin must review and approve it before you can permanently delete your account.',
        details: deletionState.canFinalize
          ? ['This permanently removes your account and owned data.', 'You will be signed out immediately after deletion.']
          : ['Your account stays active until an admin reviews the request.', 'Return here after approval to permanently delete the account.'],
        confirmLabel: deletionState.canFinalize ? 'Delete Account' : 'Submit Request',
        dangerous: deletionState.canFinalize
      });
      if (!shouldContinue) {
        return;
      }

      await this.withLoader(async () => {
        this.setAccountSettingsBusy(true, 'delete');
        try {
          if (deletionState.canFinalize) {
            const deletedProfile = await finalizeCurrentUserAccountDeletion();
            this.syncLocalAccountIdentity({
              ...deletedProfile,
              uid: deletedProfile?.uid || authUid
            });

            storeAuthPageNotice('Your account has been removed. Sign in with another account to continue.', 'success');

            try {
              await deleteCurrentAuthenticatedUser();
            } catch (authError) {
              console.error('Failed to remove authenticated account after finalization:', authError);
              try {
                await logoutUser();
              } catch (logoutError) {
                console.error('Failed to sign out after account finalization:', logoutError);
              }
            }

            window.location.replace('/login.html');
            return;
          }

          const updatedProfile = await requestCurrentUserAccountDeletion();
          this.syncLocalAccountIdentity({
            ...updatedProfile,
            uid: updatedProfile?.uid || authUid
          });
          this.renderAccountSettings({ preserveFeedback: true });
          this.applyAccountSettingsSubmissionFeedback({
            successMessage: 'Your account deletion request was submitted for review.',
            toastMessage: 'Deletion request submitted'
          });
        } catch (error) {
          console.error('Failed to process account deletion action:', error);
          this.applyAccountSettingsSubmissionFeedback({
            error,
            fallbackMessage: deletionState.canFinalize
              ? 'Failed to delete account.'
              : 'Failed to submit account deletion request.'
          });
        } finally {
          this.setAccountSettingsBusy(false);
        }
      }, {
        message: deletionState.canFinalize ? 'Deleting account...' : 'Submitting deletion request...'
      });
    },

    getBulkClassDeleteSelection: function () {
      return [...new Set((Array.isArray(this.bulkClassDeleteSelection) ? this.bulkClassDeleteSelection : [])
        .map(classId => String(classId || '').trim())
        .filter(Boolean))];
    },

    getBulkClassDeleteSelectionState: function (classes = [], selectedIds = []) {
      const normalizedClasses = Array.isArray(classes) ? classes : [];
      const normalizedSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];
      const totalCount = normalizedClasses.length;
      const selectedCount = normalizedSelectedIds.length;
      const currentClassId = String(app.state.currentClassId || '').trim();
      const allSelected = totalCount > 0 && selectedCount === totalCount;
      const includesCurrentClass = Boolean(currentClassId) && normalizedSelectedIds.includes(currentClassId);
      const preventsDeletingAll = allSelected && !app.state.allowEmptyClassCatalog;
      const summaryMessage = selectedCount
        ? `${selectedCount} of ${totalCount} class${totalCount === 1 ? '' : 'es'} selected${allSelected ? ' (all)' : ''}`
        : `${totalCount} class${totalCount === 1 ? '' : 'es'} available`;

      let hintMessage = selectedCount
        ? 'Selected classes will move to Trash and can be restored later.'
        : 'Select classes to review what will be moved to Trash.';

      if (preventsDeletingAll) {
        hintMessage = 'Keep at least one class active. Clear one selection before deleting.';
      } else if (includesCurrentClass && selectedCount) {
        hintMessage = selectedCount === 1
          ? 'The current class is selected. Another class will become active after deletion.'
          : 'The current class is selected. The app will switch to another remaining class after deletion.';
      }

      return {
        totalCount,
        selectedCount,
        allSelected,
        includesCurrentClass,
        preventsDeletingAll,
        summaryMessage,
        hintMessage
      };
    },

    renderBulkClassDeleteModal: function () {
      if (!app.dom.bulkClassDeleteList || !app.dom.bulkClassDeleteSummary || !app.dom.bulkClassDeleteConfirmBtn) {
        return;
      }

      const classes = Array.isArray(app.state.classes)
        ? app.state.classes.filter((entry) => String(entry?.id || '').trim())
        : [];
      const availableIds = new Set(classes.map(entry => String(entry?.id || '').trim()));
      const selectedIds = this.getBulkClassDeleteSelection().filter(classId => availableIds.has(classId));
      this.bulkClassDeleteSelection = selectedIds;

      if (!classes.length) {
        app.dom.bulkClassDeleteList.innerHTML = '<div class="bulk-class-delete-empty"><strong>No classes available</strong><p>Create a class first to use this menu.</p></div>';
        app.dom.bulkClassDeleteSummary.textContent = 'No classes available';
        if (app.dom.bulkClassDeleteHint) {
          app.dom.bulkClassDeleteHint.textContent = 'Create a class first to use this menu.';
        }
        app.dom.bulkClassDeleteConfirmBtn.disabled = true;
        if (app.dom.bulkClassDeleteSelectAllBtn) app.dom.bulkClassDeleteSelectAllBtn.disabled = true;
        if (app.dom.bulkClassDeleteClearBtn) app.dom.bulkClassDeleteClearBtn.disabled = true;
        return;
      }

      const currentClassId = String(app.state.currentClassId || '').trim();
      app.dom.bulkClassDeleteList.innerHTML = classes.map((entry) => {
        const classId = String(entry?.id || '').trim();
        const className = String(entry?.name || 'My Class').trim() || 'My Class';
        const ownerLabel = this.formatClassOwnerLabel(entry);
        const isSelected = selectedIds.includes(classId);
        const isCurrentClass = classId === currentClassId;
        const classInitials = this.getClassInitials(className);
        const itemMeta = isCurrentClass
          ? 'Currently active class'
          : 'Moves to Trash and can be restored later';
        return `
          <label class="bulk-class-delete-item${isSelected ? ' is-selected' : ''}${isCurrentClass ? ' is-current' : ''}">
            <input type="checkbox" class="bulk-class-delete-checkbox" value="${app.utils.esc(classId)}" ${isSelected ? 'checked' : ''}>
            <span class="bulk-class-delete-item-selector" aria-hidden="true"><span class="bulk-class-delete-item-selector-icon">✓</span></span>
            <span class="bulk-class-delete-item-avatar" aria-hidden="true">${app.utils.esc(classInitials)}</span>
            <span class="bulk-class-delete-item-copy">
              <span class="bulk-class-delete-item-topline">
                <span class="bulk-class-delete-item-name">${app.utils.esc(className)}</span>
                <span class="bulk-class-delete-item-badges">${isCurrentClass ? '<span class="bulk-class-delete-badge bulk-class-delete-badge-current">Current</span>' : ''}${isSelected ? '<span class="bulk-class-delete-badge bulk-class-delete-badge-selected">Selected</span>' : ''}</span>
              </span>
              <span class="bulk-class-delete-item-owner">${app.utils.esc(ownerLabel || 'Teacher: —')}</span>
              <span class="bulk-class-delete-item-meta">${app.utils.esc(itemMeta)}</span>
            </span>
          </label>`;
      }).join('');

      const selectionState = this.getBulkClassDeleteSelectionState(classes, selectedIds);
      app.dom.bulkClassDeleteSummary.textContent = selectionState.summaryMessage;
      if (app.dom.bulkClassDeleteHint) {
        app.dom.bulkClassDeleteHint.textContent = selectionState.hintMessage;
      }
      app.dom.bulkClassDeleteConfirmBtn.disabled = selectionState.selectedCount === 0 || selectionState.preventsDeletingAll;
      if (app.dom.bulkClassDeleteSelectAllBtn) app.dom.bulkClassDeleteSelectAllBtn.disabled = selectionState.allSelected;
      if (app.dom.bulkClassDeleteClearBtn) app.dom.bulkClassDeleteClearBtn.disabled = selectionState.selectedCount === 0;
    },

    openBulkClassDeleteModal: function () {
      const classes = Array.isArray(app.state.classes) ? app.state.classes : [];
      if (!classes.length || !app.dom.bulkClassDeleteModal) {
        return;
      }

      const currentClassId = String(app.state.currentClassId || '').trim();
      const hasCurrentClass = classes.some((entry) => String(entry?.id || '').trim() === currentClassId);
      this.bulkClassDeleteSelection = hasCurrentClass ? [currentClassId] : [];
      this.renderBulkClassDeleteModal();
      app.dom.bulkClassDeleteModal.classList.add('active');
    },

    closeBulkClassDeleteModal: function () {
      this.bulkClassDeleteSelection = [];
      if (app.dom.bulkClassDeleteModal) {
        app.dom.bulkClassDeleteModal.classList.remove('active');
      }
    },

    renderBulkImportSummary: function () {
      if (!app.dom.bulkImportSummary) {
        return;
      }

      const preview = typeof app.students?.getBulkImportPreview === 'function'
        ? app.students.getBulkImportPreview(app.dom.bulkImportTextarea?.value || '', app)
        : null;
      const pluralize = (count, singular, plural = `${singular}s`) => (count === 1 ? singular : plural);
      const classContextLocked = app.dom.bulkImportConfirmBtn?.dataset.classContextLocked === 'true';

      if (!preview?.hasContent) {
        app.dom.bulkImportSummary.textContent = 'Enter names to preview the import summary.';
        if (app.dom.bulkImportConfirmBtn) {
          app.dom.bulkImportConfirmBtn.disabled = true;
        }
        return;
      }

      const parts = [];
      if (preview.importableCount) {
        parts.push(`${preview.importableCount} ${pluralize(preview.importableCount, 'student')} ready to import`);
      } else {
        parts.push('No importable students found');
      }
      if (preview.duplicateRowCount) {
        parts.push(`${preview.duplicateRowCount} duplicate ${pluralize(preview.duplicateRowCount, 'row')} will be skipped`);
      }
      if (preview.invalidRowCount) {
        parts.push(`${preview.invalidRowCount} invalid ${pluralize(preview.invalidRowCount, 'row')} will be skipped`);
      }
      if (preview.existingNameMatchCount) {
        parts.push(`${preview.existingNameMatchCount} existing-name ${pluralize(preview.existingNameMatchCount, 'match', 'matches')} will still be added`);
      }

      app.dom.bulkImportSummary.textContent = `${parts.join('. ')}.`;
      if (app.dom.bulkImportConfirmBtn) {
        app.dom.bulkImportConfirmBtn.disabled = classContextLocked || preview.importableCount === 0;
      }
    },

    loadBulkImportFile: async function () {
      const fileInput = app.dom.bulkImportFileInput;
      const selectedFile = fileInput?.files?.[0] || null;
      if (!selectedFile) {
        this.renderBulkImportSummary();
        return;
      }

      try {
        const fileContents = await selectedFile.text();
        if (app.dom.bulkImportTextarea) {
          app.dom.bulkImportTextarea.value = fileContents;
        }
        this.renderBulkImportSummary();
        this.showToast(`Loaded ${selectedFile.name}`);
      } catch (error) {
        console.error('Failed to read bulk import file:', error);
        this.showToast('Failed to read import file');
      } finally {
        if (fileInput) {
          fileInput.value = '';
        }
      }
    },

    updateBulkClassDeleteSelection: function (classId, isSelected) {
      const normalizedClassId = String(classId || '').trim();
      if (!normalizedClassId) {
        return;
      }

      const selectedIds = new Set(this.getBulkClassDeleteSelection());
      if (isSelected) {
        selectedIds.add(normalizedClassId);
      } else {
        selectedIds.delete(normalizedClassId);
      }
      this.bulkClassDeleteSelection = Array.from(selectedIds);
      this.renderBulkClassDeleteModal();
    },

    confirmBulkClassDelete: async function () {
      if (!this.ensureWritableAction('Class deletion')) return;

      const selectedIds = this.getBulkClassDeleteSelection();
      if (!selectedIds.length) {
        this.showToast('Select at least one class');
        return;
      }

      const classes = Array.isArray(app.state.classes)
        ? app.state.classes.filter((entry) => String(entry?.id || '').trim())
        : [];
      const selectionState = this.getBulkClassDeleteSelectionState(classes, selectedIds);
      if (selectionState.preventsDeletingAll) {
        this.renderBulkClassDeleteModal();
        this.showToast('Keep at least one class active');
        return;
      }

      await this.withLoader(async () => {
        try {
          if (app.dom.bulkClassDeleteConfirmBtn) {
            app.dom.bulkClassDeleteConfirmBtn.disabled = true;
          }
          this.setClassControlsBusy(true);
          const deletedEntries = await app.deleteClasses(selectedIds);
          this.closeBulkClassDeleteModal();
          this.refreshUI();

          if (deletedEntries.length === 1) {
            const deletedEntry = deletedEntries[0] || {};
            this.showUndoDeleteToast(deletedEntry.id || selectedIds[0], deletedEntry.name || 'Class', 'class');
          } else {
            this.showToast(`${deletedEntries.length} classes moved to Trash`);
          }
        } catch (error) {
          console.error('Failed to delete classes:', error);
          this.showToast(error?.message || 'Failed to delete classes');
        } finally {
          if (app.dom.bulkClassDeleteModal?.classList.contains('active')) {
            this.renderBulkClassDeleteModal();
          }
          this.renderClassControls();
          this.applyReadOnlyRoleState();
        }
      }, {
        message: selectedIds.length === 1 ? 'Deleting class...' : 'Deleting classes...'
      });
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

      await this.withLoader(async () => {
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
      }, {
        message: 'Switching class...'
      });
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
      const hasWritableClassContext = classes.length > 0 && Boolean(resolvedClassId) && Boolean(resolvedOwnerId);
      if (app.dom.createClassBtn) {
        app.dom.createClassBtn.disabled = !canManageClasses;
      }
      if (app.dom.deleteClassBtn) {
        app.dom.deleteClassBtn.disabled = !canManageClasses || !classes.length;
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

      this.applyClassContextDisabledState({
        hasWritableClassContext: canManageClasses ? hasWritableClassContext : true,
        skipElements: [
          app.dom.createClassBtn,
          app.dom.deleteClassBtn
        ]
      });

      if (!canManageClasses && app.dom.classDropdownValue && !classes.length) {
        app.dom.classDropdownValue.textContent = 'No classes available';
      }

      if (!classes.length && canManageClasses && !app.state.allowEmptyClassCatalog && !app.state.isLoading && !this.hasPromptedForMissingClass) {
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
            await this.withLoader(() => app.createClass(normalizedName), {
              message: 'Creating class...'
            });
            this.refreshUI();
            this.showToast('Class created');
          } catch (error) {
            console.error('Failed to create class:', error);
            this.showToast('Failed to create class');
          }
        }, 0);
      } else if (classes.length || app.state.allowEmptyClassCatalog) {
        this.hasPromptedForMissingClass = false;
      }
    },

    clearAllData: async function () {
      if (!this.requireAccess('resetSystem')) {
        return;
      }
      if (!this.ensureWritableAction('Start a new class')) {
        return;
      }
      await this.withLoader(async () => {
        try {
          if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
            app.snapshots.saveSnapshot('Auto Backup Before New Class');
          }
          await app.importData({ students: [], subjects: [], exams: [] });
          app.state.selectedBulkExamId = '';
          app.state.selectedPerformanceCategory = 'strong';
          this.refreshUI();
          this.showToast('New class started');
        } catch (error) {
          console.error('Failed to clear data:', error);
          this.showToast('Failed to start new class');
        }
      }, {
        message: 'Starting new class...'
      });
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

    ...dashboardUi,

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
        const emptyState = students.length
          ? {
              title: 'No students match your search.',
              message: 'Try a different name or clear the roster search to see every student.'
            }
          : isReadOnly
            ? {
                title: 'No students available in this class.',
                message: readOnlyTitle
              }
            : {
                title: 'No students added yet.',
                message: 'Use Add Student or Bulk Import to build this class roster.'
              };
        app.dom.studentList.innerHTML = `
          <div class="student-roster-empty">
            <span class="student-roster-empty-icon" aria-hidden="true">👥</span>
            <strong>${app.utils.esc(emptyState.title)}</strong>
            <p>${app.utils.esc(emptyState.message)}</p>
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

    showContentSection: function (sectionId) {
      const targetSectionId = String(sectionId || '').trim();
      if (!targetSectionId) {
        return;
      }

      this.syncSectionShellState(targetSectionId);

      if (app.sidebar && typeof app.sidebar.showSection === 'function') {
        app.sidebar.showSection(targetSectionId);
      } else {
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(targetSectionId);
        if (targetSection) targetSection.classList.add('active');
      }

      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === targetSectionId);
      });

      if ((!app.sidebar || typeof app.sidebar.showSection !== 'function') && targetSectionId === 'messages') {
        void this.openMessagesSection();
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

    handlePerformanceAnalysisAction: function (action, studentId) {
      const normalizedAction = String(action || '').trim().toLowerCase();
      const normalizedStudentId = String(studentId || '').trim();
      if (!normalizedAction || !normalizedStudentId) {
        return;
      }

      if (normalizedAction === 'notes') {
        this.openNotes(normalizedStudentId);
        return;
      }

      if (normalizedAction === 'report') {
        this.openReport(normalizedStudentId);
      }
    },

    saveNotes: async function () {
      if (!this.ensureWritableAction('Notes saving')) {
        return;
      }

      await this.withLoader(async () => {
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
      }, {
        message: 'Saving notes...'
      });
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
          <h2 class="rc-export-meta-title">STUDENT PERFORMANCE REPORT</h2>
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

      const studentName = reportCard.querySelector('.rc-student-name, .rc-title')?.textContent || 'Student';
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

      const schoolName = String(document.querySelector('.logo-title')?.textContent || 'Student Performance Tracker').trim() || 'Student Performance Tracker';
      const schoolMotto = String(document.querySelector('.logo-motto')?.textContent || 'Tracking Progress. Unlocking Potential.').trim() || 'Tracking Progress. Unlocking Potential.';
      const reportDate = new Date().toLocaleDateString();
      const classDisplay = this.getCurrentClassDisplayLabel();
      const termDisplay = String(latestExam?.title || latestExam?.name || 'Current Term').trim() || 'Current Term';
      const positionDisplay = `${formatOrdinal(rankPos)} of ${totalStudents}`;
      const latestTotalDisplay = app.utils.esc(this.formatFixedOrFallback(currentScore, 1, 'N/A'));
      const previousTotalDisplay = app.utils.esc(this.formatFixedOrFallback(previousScore, 1, 'N/A'));
      const improvementDisplay = app.utils.esc(improvement.text || 'N/A');
      const hasClassTeacherRemark = Boolean(String(s.notes || '').trim());
      const summaryText = autoSummary || app.utils.esc('Performance summary will appear here once assessment notes are available.');
      const buildRemarkContent = (value = '', fallbackLabel = 'No remarks recorded.') => {
        const normalizedValue = String(value || '').trim();
        if (normalizedValue) {
          return `<p class="rc-remark-text">${app.utils.esc(normalizedValue)}</p>`;
        }
        return `
          <div class="rc-remark-placeholder" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p class="rc-remark-empty">${app.utils.esc(fallbackLabel)}</p>
        `;
      };

      const formalReportMarkup = `
        <div class="report-card report-card--formal" data-watermark="${app.utils.esc(schoolName)}">
          <header class="rc-report-header rc-print-section">
            <div class="rc-brand-name">${app.utils.esc(schoolName)}</div>
            <div class="rc-brand-motto">${app.utils.esc(schoolMotto)}</div>
            <div class="rc-section-divider" aria-hidden="true"></div>
            <div class="rc-title">STUDENT PERFORMANCE REPORT</div>
            <div class="rc-student-name">${app.utils.esc(s.name)}</div>
            <div class="rc-issued-date">Date Issued: ${app.utils.esc(reportDate)}</div>
          </header>

          <section class="rc-section-block rc-print-section">
            <div class="rc-info-grid">
              <div class="rc-info-item">
                <span class="rc-info-label">Name</span>
                <strong class="rc-info-value">${app.utils.esc(s.name)}</strong>
              </div>
              <div class="rc-info-item">
                <span class="rc-info-label">Class</span>
                <strong class="rc-info-value">${app.utils.esc(classDisplay)}</strong>
              </div>
              <div class="rc-info-item">
                <span class="rc-info-label">Term</span>
                <strong class="rc-info-value">${app.utils.esc(termDisplay)}</strong>
              </div>
              <div class="rc-info-item">
                <span class="rc-info-label">Position</span>
                <strong class="rc-info-value">${app.utils.esc(positionDisplay)}</strong>
              </div>
              <div class="rc-info-item rc-info-item--wide">
                <span class="rc-info-label">Average</span>
                <strong class="rc-info-value rc-info-value--headline">${app.utils.esc(overallAverageDisplay)}</strong>
              </div>
            </div>
          </section>

          <section class="rc-section-block rc-print-section">
            <div class="rc-section-heading">
              <h4>Assessment Snapshot</h4>
            </div>
            <div class="rc-snapshot-grid">
              <div class="rc-snapshot-item">
                <span class="rc-snapshot-label">Latest Total</span>
                <strong class="rc-snapshot-value">${latestTotalDisplay}</strong>
              </div>
              <div class="rc-snapshot-item">
                <span class="rc-snapshot-label">Previous Total</span>
                <strong class="rc-snapshot-value">${previousTotalDisplay}</strong>
              </div>
              <div class="rc-snapshot-item">
                <span class="rc-snapshot-label">Improvement</span>
                <strong class="rc-snapshot-value">${improvementDisplay}</strong>
              </div>
              <div class="rc-snapshot-item">
                <span class="rc-snapshot-label">Exams Taken</span>
                <strong class="rc-snapshot-value">${examCount}</strong>
              </div>
            </div>
          </section>

          <section class="rc-section-block rc-print-section">
            <div class="rc-section-heading">
              <h4>Academic Performance</h4>
            </div>
            <div class="rc-grade-table-wrap">
              <table class="rc-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    ${examHeaders}
                    <th>Average</th>
                  </tr>
                </thead>
                <tbody>
                  ${subjectRows}
                </tbody>
              </table>
            </div>
          </section>

          <section class="rc-section-block rc-print-section">
            <div class="rc-section-heading">
              <h4>Performance Highlights</h4>
            </div>
            <div class="rc-highlights-row">
              <div class="rc-highlight-item">
                <span class="rc-highlight-label">Best Subject</span>
                <strong class="rc-highlight-value">${app.utils.esc(strongest)}</strong>
              </div>
              <div class="rc-highlight-item">
                <span class="rc-highlight-label">Weakest Subject</span>
                <strong class="rc-highlight-value">${app.utils.esc(weakest)}</strong>
              </div>
              <div class="rc-highlight-item">
                <span class="rc-highlight-label">Performance Level</span>
                <strong class="rc-highlight-value">${app.utils.esc(statusLabel)}</strong>
              </div>
            </div>
          </section>

          <section class="rc-section-block rc-print-section">
            <div class="rc-section-heading">
              <h4>Academic Summary</h4>
            </div>
            <div class="rc-summary-box">${summaryText}</div>
          </section>

          <section class="rc-section-block rc-print-section">
            <div class="rc-section-heading">
              <h4>Teacher Remarks</h4>
            </div>
            <div class="rc-remarks-grid">
              <section class="rc-remark-card">
                <h5 class="rc-remark-title">Class Teacher's Remarks</h5>
                ${buildRemarkContent(hasClassTeacherRemark ? s.notes : '', 'Awaiting class teacher remarks.')}
              </section>
              <section class="rc-remark-card">
                <h5 class="rc-remark-title">Head Teacher's Remarks</h5>
                ${buildRemarkContent('', 'Awaiting head teacher remarks.')}
              </section>
            </div>
          </section>

          <section class="rc-section-block rc-print-section">
            <div class="rc-signature-grid">
              <div class="rc-signature-block">
                <div class="rc-signature-line"></div>
                <div class="rc-signature-label">Class Teacher</div>
              </div>
              <div class="rc-signature-block">
                <div class="rc-signature-line"></div>
                <div class="rc-signature-label">Head Teacher</div>
              </div>
            </div>
          </section>

          <section class="rc-section-block rc-section-block--footer rc-print-section">
            <div class="rc-section-heading">
              <h4>Grading System</h4>
            </div>
            <div class="rc-grading-scale" aria-label="Grading scale">
              <span class="rc-grading-item">A: 70-100</span>
              <span class="rc-grading-item">B: 60-69</span>
              <span class="rc-grading-item">C: 50-59</span>
              <span class="rc-grading-item">D: 45-49</span>
              <span class="rc-grading-item">E: 40-44</span>
              <span class="rc-grading-item">F: 0-39</span>
            </div>
          </section>
        </div>
      `;

      app.dom.reportContainer.innerHTML = formalReportMarkup;
      app.dom.reportModal.classList.add('active');
      return;

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
          return `<div class="form-group"><label>${app.utils.esc(sb.name)}</label><input type="number" data-subject-id="${sb.id}" value="${value}"></div>`;
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
          return `<td><input type="number" class="bulk-score-input" data-sid="${s.id}" data-sub="${sub.id}" value="${val === '' ? '' : val}" min="0" max="100"></td>`;
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
        this.renderAccountSettings({ preserveFeedback: true });
        this.renderMessagesSection();

        if (app.state.authUser?.uid && !this.messageDataLoaded && !this.isLoadingMessages) {
          void this.ensureMessagesLoaded();
        }

        if (app.state.isLoading) {
          if (app.dom.emptyMsg) {
            app.dom.emptyMsg.style.display = 'block';
          }
          this.updateDashboardStats();
          return;
        }

        if (app.dom.emptyMsg) app.dom.emptyMsg.style.display = app.state.students.length ? 'none' : 'block';
        this.renderClassControls();
        this.renderAccountSettings({ preserveFeedback: true });
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

      await this.withLoader(async () => {
        try {
          await app.updateExam(id, { title: name.trim() });
          this.refreshUI();
        } catch (error) {
          console.error('Failed to rename exam:', error);
          app.ui.showToast('Failed to rename exam');
        }
      }, {
        message: 'Saving exam...'
      });
    },
    deleteExam: async function (id) {
      if (!this.ensureWritableAction('Exam deletion')) {
        return;
      }

      if (confirm("Delete exam?")) {
        await this.withLoader(async () => {
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
        }, {
          message: 'Deleting exam...'
        });
      }
    },
    renameSubject: async function (id, n) {
      if (!this.ensureWritableAction('Subject updates')) {
        return;
      }

      await this.withLoader(async () => {
        try {
          await app.updateSubject(id, { name: n.trim() });
          this.refreshUI();
        } catch (error) {
          console.error('Failed to rename subject:', error);
          app.ui.showToast('Failed to rename subject');
        }
      }, {
        message: 'Saving subject...'
      });
    },
    deleteSubject: async function (id) {
      if (!this.ensureWritableAction('Subject deletion')) {
        return;
      }

      if (confirm("Delete subject?")) {
        await this.withLoader(async () => {
          try {
            const subjectName = app.state.subjects.find(item => item.id === id)?.name || 'Subject';
            const deletedEntry = await app.deleteSubject(id);
            this.refreshUI();
            this.showUndoDeleteToast(deletedEntry?.id || id, deletedEntry?.name || subjectName, 'subject');
          } catch (error) {
            console.error('Failed to delete subject:', error);
            app.ui.showToast('Failed to delete subject');
          }
        }, {
          message: 'Deleting subject...'
        });
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

        if (app.dom.accountSettingsForm) {
          app.dom.accountSettingsForm.onsubmit = async (e) => {
            e.preventDefault();
            await this.saveAccountSettings();
          };
        }
        if (app.dom.accountSettingsResetBtn) {
          app.dom.accountSettingsResetBtn.onclick = () => {
            this.resetAccountSettingsForm();
          };
        }
        if (app.dom.accountSettingsPasswordResetBtn) {
          app.dom.accountSettingsPasswordResetBtn.onclick = async () => {
            await this.sendAccountSettingsPasswordReset();
          };
        }
        if (app.dom.accountSettingsDeleteBtn) {
          app.dom.accountSettingsDeleteBtn.onclick = async () => {
            await this.handleAccountSettingsDeletionAction();
          };
        }
        if (app.dom.accountSettingsNameInput) {
          app.dom.accountSettingsNameInput.oninput = () => {
            if (app.dom.accountSettingsFeedback?.textContent) {
              this.setAccountSettingsFeedback('');
            }
            this.setAccountSettingsBusy(Boolean(this.accountSettingsBusyAction), this.accountSettingsBusyAction);
          };
        }
        if (app.dom.messagesRefreshBtn) {
          app.dom.messagesRefreshBtn.onclick = async () => {
            await this.refreshMessagesData(true);
          };
        }
        if (app.dom.headerMessageAlert) {
          app.dom.headerMessageAlert.onclick = () => {
            this.showContentSection('messages');
            this.setMessageMailboxFilter('inbox');
          };
        }
        if (app.dom.messagesComposeBtn) {
          app.dom.messagesComposeBtn.onclick = async () => {
            await this.openMessageComposeModal();
          };
        }
        if (app.dom.messagesSearchInput) {
          app.dom.messagesSearchInput.oninput = (event) => {
            this.setMessageSearchTerm(event.target.value);
          };
        }
        if (app.dom.messagesTypeFilter) {
          app.dom.messagesTypeFilter.onchange = (event) => {
            this.setMessageTypeFilter(event.target.value);
          };
        }
        if (app.dom.messagesRoleFilter) {
          app.dom.messagesRoleFilter.onchange = (event) => {
            this.setMessageRoleFilter(event.target.value);
          };
        }
        if (app.dom.messagesDateFilter) {
          app.dom.messagesDateFilter.onchange = (event) => {
            this.setMessageDateFilter(event.target.value);
          };
        }
        if (app.dom.messagesList) {
          app.dom.messagesList.addEventListener('scroll', () => {
            this.messageListScrollTop = Math.max(0, Number(app.dom.messagesList?.scrollTop) || 0);
          }, { passive: true });
          app.dom.messagesList.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-message-id]');
            if (!trigger) return;
            this.selectMessage(trigger.dataset.messageId);
          });
        }
        document.querySelectorAll('[data-message-filter]').forEach((button) => {
          button.addEventListener('click', () => {
            this.setMessageMailboxFilter(button.dataset.messageFilter);
          });
        });
        if (app.dom.messageMarkToggleBtn) {
          app.dom.messageMarkToggleBtn.onclick = async () => {
            const messageId = String(app.dom.messageMarkToggleBtn.dataset.messageId || app.state.selectedMessageId || '').trim();
            await this.toggleSelectedMessageReadState(messageId);
          };
        }
        if (app.dom.messageThreadForm) {
          app.dom.messageThreadForm.onsubmit = async (event) => {
            event.preventDefault();
            await this.handleMessageThreadSubmit();
          };
        }
        if (app.dom.messageThreadInput) {
          app.dom.messageThreadInput.oninput = () => {
            if (app.dom.messageThreadFeedback?.textContent) {
              this.setMessageThreadFeedback('');
            }
            this.updateMessageThreadComposerState(this.getSelectedConversationRecord());
          };
        }
        if (app.dom.messageComposeForm) {
          app.dom.messageComposeForm.onsubmit = async (event) => {
            event.preventDefault();
            await this.handleMessageComposeSubmit();
          };
        }
        if (app.dom.messageComposeCancelBtn) {
          app.dom.messageComposeCancelBtn.onclick = () => {
            this.closeMessageComposeModal();
          };
        }
        if (app.dom.messageComposeModal) {
          app.dom.messageComposeModal.addEventListener('click', (event) => {
            if (event.target === app.dom.messageComposeModal) {
              this.closeMessageComposeModal();
            }
          });
        }
        if (app.dom.messageComposeRecipientSelect) {
          app.dom.messageComposeRecipientSelect.onchange = (event) => {
            this.messageComposeState = {
              ...(this.messageComposeState || {}),
              recipientUserId: String(event.target.value || '').trim()
            };
            if (app.dom.messageComposeFeedback?.textContent) {
              this.setMessageComposeFeedback('');
            }
            this.renderMessageComposeControls();
          };
        }
        if (app.dom.messageComposeBody) {
          app.dom.messageComposeBody.oninput = () => {
            if (app.dom.messageComposeFeedback?.textContent) {
              this.setMessageComposeFeedback('');
            }
            this.renderMessageComposeControls();
          };
        }

        if (app.dom.form) {
          app.dom.form.onsubmit = async (e) => {
            e.preventDefault();
            if (!this.ensureWritableClassAction('Student creation', 'add student')) return;
            const didAddStudent = await this.withLoader(() => app.students.addStudent(app.dom.nameInput.value, app, this), {
              message: 'Adding student...'
            });
            if (didAddStudent && app.dom.nameInput) {
              app.dom.nameInput.value = '';
              app.dom.nameInput.focus();
            }
          };
        }
        if (app.dom.nameInput) {
          app.dom.nameInput.oninput = (event) => {
            const nextValue = this.normalizeStudentNameInputValue(event.target.value);
            if (event.target.value !== nextValue) {
              event.target.value = nextValue;
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
              await this.withLoader(() => app.createClass(normalizedName), {
                message: 'Creating class...'
              });
              this.refreshUI();
              this.showToast('Class created');
            } catch (error) {
              console.error('Failed to create class:', error);
              this.showToast(error?.message || 'Failed to create class');
            }
          };
        }
        if (app.dom.deleteClassBtn) {
          app.dom.deleteClassBtn.onclick = () => {
            if (!this.ensureWritableAction('Class deletion')) return;
            this.openBulkClassDeleteModal();
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
            const confirmed = confirm('Start a new class? A restore point will be created before current class data is replaced.');
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
        if (app.dom.bulkClassDeleteSelectAllBtn) {
          app.dom.bulkClassDeleteSelectAllBtn.onclick = () => {
            const allClassIds = (app.state.classes || []).map(entry => String(entry?.id || '').trim()).filter(Boolean);
            this.bulkClassDeleteSelection = [...new Set(allClassIds)];
            this.renderBulkClassDeleteModal();
          };
        }
        if (app.dom.bulkClassDeleteClearBtn) {
          app.dom.bulkClassDeleteClearBtn.onclick = () => {
            this.bulkClassDeleteSelection = [];
            this.renderBulkClassDeleteModal();
          };
        }
        if (app.dom.bulkClassDeleteList) {
          app.dom.bulkClassDeleteList.onchange = (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || !target.classList.contains('bulk-class-delete-checkbox')) {
              return;
            }
            this.updateBulkClassDeleteSelection(target.value, target.checked);
          };
        }
        if (app.dom.bulkClassDeleteConfirmBtn) app.dom.bulkClassDeleteConfirmBtn.onclick = async () => this.confirmBulkClassDelete();
        if (app.dom.bulkClassDeleteCancelBtn) app.dom.bulkClassDeleteCancelBtn.onclick = () => this.closeBulkClassDeleteModal();
        if (app.dom.bulkClassDeleteModal) {
          app.dom.bulkClassDeleteModal.onclick = (event) => {
            if (event.target === app.dom.bulkClassDeleteModal) {
              this.closeBulkClassDeleteModal();
            }
          };
        }
        if (app.dom.bulkImportBtn) app.dom.bulkImportBtn.onclick = () => {
          if (!this.requireAccess('bulkImport')) return;
          this.renderBulkImportSummary();
          app.dom.bulkImportModal.classList.add('active');
        };
        if (app.dom.bulkImportFileInput) app.dom.bulkImportFileInput.onchange = async () => {
          await this.loadBulkImportFile();
        };
        if (app.dom.bulkImportTextarea) app.dom.bulkImportTextarea.oninput = () => this.renderBulkImportSummary();
        if (app.dom.bulkImportConfirmBtn) app.dom.bulkImportConfirmBtn.onclick = async () => {
          if (!this.requireAccess('bulkImport')) return;
          if (!this.ensureWritableAction('Bulk add')) return;
          const importResult = await app.students.bulkImport(app.dom.bulkImportTextarea.value, app, this);
          if (importResult !== false) {
            if (app.dom.bulkImportTextarea) app.dom.bulkImportTextarea.value = '';
            if (app.dom.bulkImportFileInput) app.dom.bulkImportFileInput.value = '';
            this.renderBulkImportSummary();
            app.dom.bulkImportModal.classList.remove('active');
          }
        };
        if (app.dom.bulkImportCancelBtn) app.dom.bulkImportCancelBtn.onclick = () => {
          this.renderBulkImportSummary();
          app.dom.bulkImportModal.classList.remove('active');
        };
        if (app.dom.confirmCancelBtn) {
          app.dom.confirmCancelBtn.onclick = () => {
            this.resolvePendingConfirmation(false);
          };
        }
        if (app.dom.confirmOkBtn) {
          app.dom.confirmOkBtn.onclick = () => {
            this.resolvePendingConfirmation(true);
          };
        }
        if (app.dom.confirmModal) {
          app.dom.confirmModal.addEventListener('click', (event) => {
            if (event.target === app.dom.confirmModal) {
              this.resolvePendingConfirmation(false);
            }
          });
        }
        if (app.dom.editSaveBtn) app.dom.editSaveBtn.onclick = async () => {
          if (!this.ensureWritableAction('Student updates')) return;
          await this.withLoader(() => app.students.saveEdit(app, this), {
            message: 'Saving student...'
          });
        };
        if (app.dom.editInput) {
          app.dom.editInput.oninput = (event) => {
            const nextValue = this.normalizeStudentNameInputValue(event.target.value);
            if (event.target.value !== nextValue) {
              event.target.value = nextValue;
            }
          };
        }
        if (app.dom.editCancelBtn) {
          app.dom.editCancelBtn.onclick = () => {
            app.state.editingId = null;
            app.dom.editModal.classList.remove('active');
          };
        }
        if (app.dom.deleteConfirmBtn) app.dom.deleteConfirmBtn.onclick = async () => {
          if (!this.ensureWritableAction('Student deletion')) return;
          await this.withLoader(() => app.students.confirmDelete(app, this), {
            message: 'Deleting student...'
          });
        };
        if (app.dom.deleteCancelBtn) {
          app.dom.deleteCancelBtn.onclick = () => {
            app.state.deletingId = null;
            app.dom.deleteModal.classList.remove('active');
          };
        }
        if (app.dom.editInput) {
          app.dom.editInput.onkeydown = async (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              await this.withLoader(() => app.students.saveEdit(app, this), {
                message: 'Saving student...'
              });
            }
          };
        }
        if (app.dom.notesSaveBtn) app.dom.notesSaveBtn.onclick = () => this.saveNotes();
        if (app.dom.notesCancelBtn) app.dom.notesCancelBtn.onclick = () => app.dom.notesModal.classList.remove('active');
        if (app.dom.bulkScoreBtn) app.dom.bulkScoreBtn.onclick = () => { app.dom.bulkScoreModal.classList.add('active'); this.renderBulkTable(); };
        if (app.dom.bulkScoreCancelBtn) app.dom.bulkScoreCancelBtn.onclick = () => app.dom.bulkScoreModal.classList.remove('active');
        if (app.dom.bulkScoreSaveBtn) app.dom.bulkScoreSaveBtn.onclick = async () => {
          if (!this.ensureWritableAction('Bulk score save')) return;
          const shouldSave = await this.requestConfirmation({
            title: 'Confirm Bulk Score Save',
            message: 'Save all entered scores for this exam?',
            details: ['Scores will be saved for every populated student row in this exam.'],
            confirmLabel: 'Save Scores'
          });
          if (!shouldSave) return;
          await this.withLoader(() => app.students.saveBulkScores(app.dom.bulkMockSelect.value, app.dom.bulkScoreBody.querySelectorAll('.bulk-score-input'), app, this), {
            message: 'Saving class scores...'
          });
        };
        if (app.dom.addMockForm) app.dom.addMockForm.onsubmit = async (e) => {
          e.preventDefault();
          if (!this.ensureWritableClassAction('Exam creation', 'add exam')) return;
          if (app.dom.mockNameInput.value.trim()) {
            try {
              await this.withLoader(() => app.addExam({ title: app.dom.mockNameInput.value.trim(), date: new Date().toISOString() }), {
                message: 'Adding exam...'
              });
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
              await this.withLoader(() => app.addSubject({ name: app.dom.subjectNameInput.value.trim() }), {
                message: 'Adding subject...'
              });
              this.refreshUI();
            } catch (error) {
              console.error('Failed to add subject:', error);
              app.ui.showToast(this.resolveClassContextErrorMessage(error, 'Failed to add subject'));
            }
          }
          app.dom.subjectNameInput.value = '';
        };
        if (app.dom.saveScoresBtn) app.dom.saveScoresBtn.onclick = async () => {
          if (!this.ensureWritableAction('Score save')) return;
          const sid = app.dom.scoreStudentSelect.value, mid = app.dom.scoreMockSelect.value;
          const scores = {};
          app.dom.dynamicSubjectFields.querySelectorAll('input').forEach(f => {
            const subjectId = f.dataset.subjectId || f.dataset.subject;
            if (subjectId) {
              scores[subjectId] = app.normalizeScore(f.value);
            }
          });
          await this.withLoader(() => app.students.saveScores(sid, mid, scores, app, this), {
            message: 'Saving scores...'
          });
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
                await this.withLoader(async () => {
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
                }, {
                  message: `Restoring ${typeLabel}...`
                });
                return;
              }

              if (action === 'permanent-delete') {
                if (!this.ensureWritableAction('Permanent delete')) return;
                if (!confirm(`Permanently delete this ${typeLabel} from Trash? This cannot be undone.`)) {
                  return;
                }

                await this.withLoader(async () => {
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
                }, {
                  message: `Deleting ${typeLabel}...`
                });
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
            await this.withLoader(async () => {
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
            }, {
              message: 'Restoring items...'
            });
          });
        }
        if (app.dom.trashEmptyBtn) {
          app.dom.trashEmptyBtn.addEventListener('click', async () => {
            if (!this.ensureWritableAction('Trash empty')) return;
            if (!confirm('Empty Trash and permanently delete all entries? This cannot be undone.')) {
              return;
            }

            await this.withLoader(async () => {
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
            }, {
              message: 'Deleting items...'
            });
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

        if (app.dom.performanceFilteredList) {
          app.dom.performanceFilteredList.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-student-action]');
            if (!trigger) return;
            this.handlePerformanceAnalysisAction(trigger.dataset.studentAction, trigger.dataset.studentId);
          });
        }

        if (app.dom.performanceInterventionNeededList) {
          app.dom.performanceInterventionNeededList.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-student-action]');
            if (!trigger) return;
            this.handlePerformanceAnalysisAction(trigger.dataset.studentAction, trigger.dataset.studentId);
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

        if (!this.hasBoundGlobalModalEvents) {
          document.addEventListener('keydown', (e) => {
            if (this.isConfirmationModalOpen()) {
              if (e.key === 'Escape') {
                e.preventDefault();
                this.resolvePendingConfirmation(false);
                return;
              }
              this.trapConfirmationModalFocus(e);
              return;
            }

            if (e.key === 'Escape') {
              document.querySelectorAll('.modal-overlay.active').forEach((modal) => modal.classList.remove('active'));
            }
          });
          this.hasBoundGlobalModalEvents = true;
        }
        console.log("Events Bound Successfully.");
      } catch (e) {
        console.error("BindEvents Error:", e);
      }
    }
  };

// Export UI module and assign to global app
app.ui = ui;
export default ui;
