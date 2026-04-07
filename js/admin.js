import {
  isFirebaseConfigured,
} from './firebase.js';
import {
  ACCOUNT_DELETION_STATUS_APPROVED,
  ACCOUNT_DELETION_STATUS_PENDING,
  ACCOUNT_STATUS_DELETED,
  waitForInitialAuthState,
  normalizeAccountDeletionStatus,
  normalizeAccountStatus,
  resolveUserRole,
  normalizeUserRole,
  logoutUser,
  formatAuthError
} from './auth.js';

import {
  fetchAdminGlobalStats,
  fetchActivityLogs,
  fetchAdminUsers,
  fetchClassCatalog,
  deleteAdminRegistryStudent,
  clearActivityLogs,
  updateAdminUserRole,
  reviewAdminUserAccountDeletion,
  fetchGlobalStudentSearchIndex,
  setCurrentUserRoleContext
} from '../services/db.js';

import { createRuntimeCache } from './admin-runtime-cache.js';
import {
  escapeHtml,
  normalizeText,
  normalizeDisplayText,
  normalizeCount,
  formatLastUpdatedLabel,
  prefersReducedMotion,
  buildEmptyTableRowMarkup,
  buildIdentityMarkup,
  buildStackedTextMarkup,
  buildRoleBadgeMarkup,
  buildTableHelperTextMarkup,
  buildActivityGroupRowMarkup,
  buildActivityLogRowMarkup,
  buildGlobalSearchResultRowMarkup,
  formatRoleLabel,
  getRoleBadgeClass,
  formatCreatedAt,
  formatTimeOfDay,
  formatActionLabel
} from './admin-display-utils.js';
import {
  getActionTone,
  formatClassDisplayLabel,
  formatActivityTargetLabel,
  toDateValue,
  formatDateLabel,
  getActionIcon,
  getDateGroupKey,
  getDateGroupLabel,
  buildActivityLogsClearRequestState,
  buildActivityLogsClearFeedbackState,
  buildActivityLogsLoadRequestState,
  buildActivityLogsIdleFeedbackState,
  buildActivityLogsLoadFeedbackState,
  buildActivityLogsLoadErrorFeedbackState,
  buildActivityLogsClearErrorFeedbackState
} from './admin-activity-utils.js';

import {
  removeAdminRegistryStudentEntries,
  buildAdminRegistryClassKey,
  buildAdminStudentsRegistryRecords,
  getVisibleAdminStudentsClassMap,
  buildAdminStudentsFilterState,
  buildAdminStudentsFilterOptionsState,
  buildAdminStudentsPaginationViewState,
  buildAdminStudentsRegistryViewState,
  buildAdminRegistryStudentDeleteFeedbackState,
  buildAdminStudentsRegistryLoadRequestState,
  buildAdminStudentsRegistryLoadErrorFeedbackState,
  buildAdminRegistryStudentDeleteErrorFeedbackState,
  buildAdminRegistryStudentDeleteRequestState
} from './admin-student-registry-utils.js';

import {
  buildAdminStudentsSkeletonMarkup,
  buildAdminStudentsTableMarkup
} from './admin-student-registry-markup.js';
import {
  findAdminUserRecord,
  getVisibleAdminUsers,
  getFilteredAdminUsers,
  buildAdminUsersLoadRequestState,
  buildAdminUsersLoadFeedbackState,
  buildAdminUsersLoadErrorFeedbackState,
  buildAdminGlobalStatsLoadErrorFeedbackState,
  buildVisibleAdminGlobalSearchRows,
  getFilteredAdminGlobalSearchRows,
  buildAdminGlobalSearchFeedbackState,
  buildAdminGlobalSearchIndexRequestState,
  buildAdminGlobalSearchIndexFeedbackState,
  buildAdminGlobalSearchIndexErrorFeedbackState,
  buildAdminUserDeletionReviewState,
  buildAdminUserDeletionReviewFeedbackState,
  buildAdminUserDeletionReviewErrorFeedbackState,
  buildAdminUserRoleUpdatePrecheckState,
  buildAdminUserRoleUpdateState,
  buildAdminUserRoleUpdateFeedbackState,
  buildAdminUserRoleUpdateErrorFeedbackState,
  buildAdminLogoutRequestState,
  buildAdminLogoutErrorFeedbackState,
  buildAdminRefreshFeedbackState,
  buildAdminInitSuccessFeedbackState,
  buildAdminInitErrorFeedbackState,
  canManageAdminRoles,
  canDeleteAdminRegistryStudents,
  canClearAdminActivityLogs,
  getAdminPanelAccessSummary,
  canReviewAdminAccountDeletion,
  canRenderAdminRoleChangeControl,
  getAdminUserRolePolicyLabel,
  getAdminUserAccountSummary,
  getVisibleAdminActivityEntries,
  shouldIncludeAdminOwner
} from './admin-user-utils.js';
import {
  buildVisibleActivityClassFilterState,
  buildActivityUserFilterState,
  buildActivityLogsQueryState,
  filterAdminActivityEntries
} from './admin-activity-filter-utils.js';

const DASHBOARD_PATH = '/index.html';
const LOGIN_PATH = '/login.html';
const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const UPDATABLE_ROLES = [ROLE_TEACHER, ROLE_ADMIN];
const THEME_STORAGE_KEY = 'theme';
const ADMIN_STUDENTS_PAGE_SIZE = 50;
const ADMIN_STUDENTS_TABLE_COLUMN_COUNT = 4;
const ADMIN_ACTIVITY_LOG_FETCH_LIMIT = 250;
const ADMIN_RUNTIME_CACHE_TTL_MS = 30 * 1000;

const state = {
  authUser: null,
  currentRole: ROLE_TEACHER,
  users: [],
  usersLoaded: false,
  activityLogs: [],
  activityLogsLoaded: false,
  globalSearchIndex: [],
  globalSearchIndexLoaded: false,
  globalSearchResults: [],
  adminStudentsRegistry: [],
  adminStudentsRegistryLoaded: false,
  adminStudentsRegistryPage: 1,
  toastTimer: null,
  userSearchDebounceTimer: null,
  globalSearchDebounceTimer: null,
  activitySearchDebounceTimer: null,
  adminStudentsSearchDebounceTimer: null,
  pendingConfirmResolver: null,
  pendingConfirmAction: null,
  lastUpdatedAt: null,
  globalStats: {
    totalUsers: 0,
    totalStudents: 0,
    totalExams: 0
  }
};

const dom = {
  roleBadge: document.getElementById('panel-role-badge'),
  panelAccessSummary: document.getElementById('panel-access-summary'),
  status: document.getElementById('panel-status'),
  usersLoading: document.getElementById('users-loading'),
  tableBody: document.getElementById('users-table-body'),
  searchInput: document.getElementById('users-search-input'),
  refreshBtn: document.getElementById('refresh-users-btn'),
  dashboardBtn: document.getElementById('go-dashboard-btn'),
  logoutBtn: document.getElementById('panel-logout-btn'),
  themeBtn: document.getElementById('panel-theme-btn'),
  themeLabel: document.getElementById('panel-theme-label'),
  lastUpdated: document.getElementById('panel-last-updated'),
  toast: document.getElementById('admin-toast'),
  confirmModal: document.getElementById('admin-confirm-modal'),
  confirmMessage: document.getElementById('admin-confirm-message'),
  confirmCancelBtn: document.getElementById('admin-confirm-cancel-btn'),
  confirmOkBtn: document.getElementById('admin-confirm-ok-btn'),
  totalUsers: document.getElementById('admin-total-users'),
  totalStudentsCard: document.getElementById('admin-total-students-card'),
  totalStudents: document.getElementById('admin-total-students'),
  totalExams: document.getElementById('admin-total-exams'),
  adminMainView: document.querySelector('.admin-main-view'),
  adminStudentsView: document.querySelector('.admin-students-view'),
  adminStudentsSearchInput: document.getElementById('admin-students-search-input'),
  adminStudentsClassFilter: document.getElementById('admin-students-class-filter'),
  adminStudentsTeacherFilter: document.getElementById('admin-students-teacher-filter'),
  adminStudentsClearFiltersBtn: document.getElementById('admin-students-clear-filters-btn'),
  adminStudentsStatus: document.getElementById('admin-students-status'),
  adminStudentsLoading: document.getElementById('admin-students-loading'),
  adminStudentsTableBody: document.getElementById('admin-students-table-body'),
  adminStudentsBackBtn: document.getElementById('admin-students-back-btn'),
  adminStudentsPagination: document.getElementById('admin-students-pagination'),
  adminStudentsPaginationSummary: document.getElementById('admin-students-pagination-summary'),
  adminStudentsPageIndicator: document.getElementById('admin-students-page-indicator'),
  adminStudentsPrevPageBtn: document.getElementById('admin-students-page-prev-btn'),
  adminStudentsNextPageBtn: document.getElementById('admin-students-page-next-btn'),
  globalSearchInput: document.getElementById('global-student-search-input'),
  globalSearchClearBtn: document.getElementById('global-search-clear-btn'),
  globalSearchStatus: document.getElementById('global-search-status'),
  globalSearchLoading: document.getElementById('global-search-loading'),
  globalSearchResultsBody: document.getElementById('global-search-results-body'),
  activityStatus: document.getElementById('activity-status'),
  activityLoading: document.getElementById('activity-loading'),
  activityBody: document.getElementById('activity-table-body'),
  activitySearchInput: document.getElementById('activity-search-input'),
  activityUserFilter: document.getElementById('activity-user-filter'),
  activityClassFilter: document.getElementById('activity-class-filter'),
  activityActionFilter: document.getElementById('activity-action-filter'),
  activitySortFilter: document.getElementById('activity-sort-filter'),
  activityLimitFilter: document.getElementById('activity-limit-filter'),
  clearActivityFiltersBtn: document.getElementById('clear-activity-filters-btn'),
  refreshActivityBtn: document.getElementById('refresh-activity-btn'),
  clearActivityBtn: document.getElementById('clear-activity-btn'),
  overviewSection: document.getElementById('admin-section-overview'),
  usersSection: document.getElementById('admin-section-users'),
  searchSection: document.getElementById('admin-section-search'),
  activitySection: document.getElementById('admin-section-logs'),
  sidebarButtons: Array.from(document.querySelectorAll('.admin-sidebar-btn')),
  scrollSections: Array.from(document.querySelectorAll('.admin-scroll-section'))
};

const adminRuntimeCache = createRuntimeCache({
  cacheNames: ['users', 'globalStats', 'globalSearchIndex', 'activityLogs'],
  ttlMs: ADMIN_RUNTIME_CACHE_TTL_MS
});
const readAdminRuntimeCache = adminRuntimeCache.read;
const writeAdminRuntimeCache = adminRuntimeCache.write;
const invalidateAdminRuntimeCache = adminRuntimeCache.invalidate;

const redirectToDashboard = () => {
  if (window.location.pathname.endsWith(DASHBOARD_PATH)) return;
  window.location.replace(DASHBOARD_PATH);
};

const redirectToLogin = () => {
  if (window.location.pathname.endsWith(LOGIN_PATH)) return;
  window.location.replace(LOGIN_PATH);
};

const setElementVisibility = (element, shouldShow) => {
  if (!element) return;
  element.style.display = shouldShow ? '' : 'none';
};

const getStoredTheme = () => {
  if (typeof localStorage === 'undefined') return 'light';
  return normalizeText(localStorage.getItem(THEME_STORAGE_KEY)).toLowerCase() === 'dark' ? 'dark' : 'light';
};

const applyPanelTheme = (theme) => {
  const normalizedTheme = String(theme || 'light').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
  const isDarkMode = normalizedTheme === 'dark';

  document.body.classList.toggle('dark', isDarkMode);
  document.body.classList.toggle('dark-mode', isDarkMode);
  document.body.classList.toggle('light-mode', !isDarkMode);

  if (dom.themeLabel) {
    dom.themeLabel.textContent = isDarkMode ? 'Light Mode' : 'Dark Mode';
  }

  if (dom.themeBtn) {
    dom.themeBtn.setAttribute('aria-pressed', isDarkMode ? 'true' : 'false');
    dom.themeBtn.title = isDarkMode ? 'Light Mode' : 'Dark Mode';
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
  }
};

const togglePanelTheme = () => {
  const nextTheme = document.body.classList.contains('dark') || document.body.classList.contains('dark-mode')
    ? 'light'
    : 'dark';
  applyPanelTheme(nextTheme);
};

const setActiveSidebarTarget = (target = '') => {
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget || !dom.sidebarButtons.length) return;
  dom.sidebarButtons.forEach((button) => {
    const isActive = normalizeText(button.dataset.target) === normalizedTarget;
    button.classList.toggle('active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
  });
};

const scrollToSidebarSection = (target = '', { smooth = true } = {}) => {
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget || !dom.scrollSections.length) return;

  const section = dom.scrollSections.find((entry) => normalizeText(entry.dataset.section) === normalizedTarget);
  if (!section) return;

  section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  setActiveSidebarTarget(normalizedTarget);
};

const initSidebarNavigation = () => {
  if (!dom.sidebarButtons.length || !dom.scrollSections.length) return;

  dom.sidebarButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = normalizeText(button.dataset.target);
      scrollToSidebarSection(target, { smooth: true });
    });
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        let bestSection = null;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (!bestSection || entry.intersectionRatio > bestSection.intersectionRatio) {
            bestSection = entry;
          }
        });
        if (!bestSection?.target?.dataset?.section) return;
        setActiveSidebarTarget(bestSection.target.dataset.section);
      },
      {
        root: null,
        threshold: [0.25, 0.5, 0.75],
        rootMargin: '-20% 0px -55% 0px'
      }
    );

    dom.scrollSections.forEach((section) => observer.observe(section));
  }

  const defaultTarget = normalizeText(dom.sidebarButtons[0]?.dataset.target || 'overview');
  setActiveSidebarTarget(defaultTarget);
};

const animateCountValue = (element, nextValue) => {
  if (!element) return;

  const targetValue = normalizeCount(nextValue);
  const currentValue = normalizeCount(element.dataset.currentValue || element.textContent || 0);
  element.dataset.currentValue = String(targetValue);

  if (prefersReducedMotion() || currentValue === targetValue) {
    element.textContent = String(targetValue);
    return;
  }

  if (typeof element.__countFrame === 'number') {
    cancelAnimationFrame(element.__countFrame);
  }

  const startTime = performance.now();
  const duration = 700;
  const delta = targetValue - currentValue;

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(currentValue + (delta * eased)));
    if (progress < 1) {
      element.__countFrame = requestAnimationFrame(tick);
      return;
    }
    element.textContent = String(targetValue);
  };

  element.__countFrame = requestAnimationFrame(tick);
};

const isPermissionDeniedError = (error) => String(error?.code || '').toLowerCase().includes('permission-denied');

const updateLastUpdatedIndicator = () => {
  if (!dom.lastUpdated) return;
  dom.lastUpdated.textContent = formatLastUpdatedLabel(state.lastUpdatedAt);
};

const markUpdatedNow = () => {
  state.lastUpdatedAt = Date.now();
  updateLastUpdatedIndicator();
};

const setSectionLoadingState = (section, isLoading) => {
  if (!section) return;
  section.classList.toggle('is-loading', !!isLoading);
  section.setAttribute('aria-busy', isLoading ? 'true' : 'false');
};

const showToast = (message, type = 'info', duration = 2600) => {
  if (!dom.toast) return;
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }
  dom.toast.textContent = normalizeText(message) || 'Done';
  dom.toast.className = `admin-toast show ${type}`;
  state.toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, duration);
};

const setPanelStatus = (message, type = '') => {
  if (!dom.status) return;
  dom.status.textContent = String(message || '');
  dom.status.className = 'panel-status';
  if (type) dom.status.classList.add(type);
};

const setActivityStatus = (message, type = '') => {
  if (!dom.activityStatus) return;
  dom.activityStatus.textContent = String(message || '');
  dom.activityStatus.className = 'panel-status';
  if (type) dom.activityStatus.classList.add(type);
};

const setGlobalSearchStatus = (message, type = '') => {
  if (!dom.globalSearchStatus) return;
  dom.globalSearchStatus.textContent = String(message || '');
  dom.globalSearchStatus.className = 'panel-status';
  if (type) dom.globalSearchStatus.classList.add(type);
};

const setAdminStudentsStatus = (message, type = '') => {
  if (!dom.adminStudentsStatus) return;
  dom.adminStudentsStatus.textContent = String(message || '');
  dom.adminStudentsStatus.className = 'panel-status';
  if (type) dom.adminStudentsStatus.classList.add(type);
};

const setConfirmModalVisibility = (isOpen) => {
  if (!dom.confirmModal) return;
  dom.confirmModal.classList.toggle('active', !!isOpen);
  dom.confirmModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
};

const resolvePendingConfirmation = (didConfirm) => {
  if (typeof state.pendingConfirmResolver === 'function') {
    state.pendingConfirmResolver(Boolean(didConfirm));
  }
  state.pendingConfirmResolver = null;
  state.pendingConfirmAction = null;
  setConfirmModalVisibility(false);
};

const requestConfirmation = ({ message = 'Are you sure?', confirmLabel = 'Confirm', dangerous = false } = {}) => {
  if (!dom.confirmModal || !dom.confirmOkBtn || !dom.confirmMessage) {
    return Promise.resolve(window.confirm(message));
  }

  if (state.pendingConfirmResolver) {
    resolvePendingConfirmation(false);
  }

  dom.confirmMessage.textContent = message;
  dom.confirmOkBtn.textContent = confirmLabel;
  dom.confirmOkBtn.classList.toggle('btn-danger', dangerous);
  dom.confirmOkBtn.classList.toggle('btn-primary', !dangerous);

  setConfirmModalVisibility(true);

  return new Promise((resolve) => {
    state.pendingConfirmResolver = resolve;
  });
};

const findUserRecord = (uid = '') => {
  return findAdminUserRecord(state.users, uid);
};

const applyUserLifecycleRecordUpdate = (record, nextRecord = {}) => {
  if (!record || !nextRecord) {
    return;
  }

  record.name = nextRecord.name ?? record.name ?? '';
  record.email = nextRecord.email ?? record.email ?? '';
  record.role = nextRecord.role ?? record.role ?? ROLE_TEACHER;
  record.emailVerified = Boolean(nextRecord.emailVerified ?? record.emailVerified);
  record.createdAt = nextRecord.createdAt ?? record.createdAt ?? null;
  record.updatedAt = nextRecord.updatedAt ?? record.updatedAt ?? null;
  record.roleUpdatedAt = nextRecord.roleUpdatedAt ?? record.roleUpdatedAt ?? null;
  record.roleUpdatedBy = nextRecord.roleUpdatedBy ?? record.roleUpdatedBy ?? '';
  record.status = nextRecord.status ?? record.status ?? 'active';
  record.accountDeletionStatus = nextRecord.accountDeletionStatus ?? record.accountDeletionStatus ?? 'none';
  record.accountDeletionRequestedAt = nextRecord.accountDeletionRequestedAt ?? record.accountDeletionRequestedAt ?? null;
  record.accountDeletionRequestedBy = nextRecord.accountDeletionRequestedBy ?? record.accountDeletionRequestedBy ?? '';
  record.accountDeletionReviewedAt = nextRecord.accountDeletionReviewedAt ?? record.accountDeletionReviewedAt ?? null;
  record.accountDeletionReviewedBy = nextRecord.accountDeletionReviewedBy ?? record.accountDeletionReviewedBy ?? '';
  record.deletedAt = nextRecord.deletedAt ?? record.deletedAt ?? null;
};

const getVisibleUsers = () => {
  return getVisibleAdminUsers(state.users, {
    currentRole: state.currentRole
  });
};

const getFilteredUsers = () => {
  return getFilteredAdminUsers(state.users, {
    currentRole: state.currentRole,
    searchTerm: dom.searchInput?.value || ''
  });
};

const canRenderRoleChangeControl = (record) => {
  return canRenderAdminRoleChangeControl(record, {
    currentRole: state.currentRole
  });
};

const getRolePolicyLabel = (record) => {
  return getAdminUserRolePolicyLabel(record, {
    currentRole: state.currentRole
  });
};

const getDeletionReviewStatus = (record = {}) => {
  return normalizeAccountDeletionStatus(record?.accountDeletionStatus || 'none');
};

const isRoleActionLocked = (record = {}) => {
  const accountStatus = normalizeAccountStatus(record?.status || 'active');
  const deletionStatus = getDeletionReviewStatus(record);
  return accountStatus === ACCOUNT_STATUS_DELETED
    || deletionStatus === ACCOUNT_DELETION_STATUS_PENDING
    || deletionStatus === ACCOUNT_DELETION_STATUS_APPROVED;
};

const buildRoleSelect = (record) => {
  const normalizedRole = normalizeUserRole(record?.role);

  const select = document.createElement('select');
  select.className = 'role-select';
  select.dataset.userId = record.uid;
  select.setAttribute('aria-label', `Select role for ${record.email || 'teacher'}`);

  const options = normalizedRole === ROLE_DEVELOPER
    ? [ROLE_DEVELOPER]
    : normalizedRole === ROLE_TEACHER && !Boolean(record?.emailVerified)
      ? [ROLE_TEACHER]
      : UPDATABLE_ROLES;
  options.forEach((role) => {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = formatRoleLabel(role);
    option.selected = role === normalizedRole;
    select.appendChild(option);
  });

  if (!canRenderRoleChangeControl(record)) {
    select.disabled = true;
  }
  return select;
};

const updatePanelRoleBadge = () => {
  if (!dom.roleBadge) return;
  const roleLabel = formatRoleLabel(state.currentRole);
  dom.roleBadge.textContent = roleLabel;
  dom.roleBadge.classList.remove('role-teacher', 'role-admin', 'role-developer', 'role-student');
  dom.roleBadge.classList.add(getRoleBadgeClass(state.currentRole));
};

const updatePanelAccessSummary = () => {
  if (!dom.panelAccessSummary) return;
  dom.panelAccessSummary.textContent = getAdminPanelAccessSummary(state.currentRole);
};

const updateAdminActionBoundaryState = () => {
  if (dom.clearActivityBtn) {
    const canClearLogs = canClearAdminActivityLogs(state.currentRole);

    dom.clearActivityBtn.disabled = !canClearLogs;
    if (canClearLogs) {
      dom.clearActivityBtn.removeAttribute('aria-disabled');
      dom.clearActivityBtn.removeAttribute('title');
    } else {
      dom.clearActivityBtn.setAttribute('aria-disabled', 'true');
      dom.clearActivityBtn.title = 'Only developers can clear activity logs.';
    }
  }
};

const renderUsersTable = () => {
  if (!dom.tableBody) return;
  const filteredUsers = getFilteredUsers();
  if (!filteredUsers.length) {
    dom.tableBody.innerHTML = buildEmptyTableRowMarkup({
      columnCount: 5,
      icon: '👤',
      message: 'No matching users found.'
    });
    return;
  }

  dom.tableBody.innerHTML = '';
  filteredUsers.forEach((record) => {
    const row = document.createElement('tr');
    row.className = 'fade-in';
    if (record.uid === state.authUser?.uid) {
      row.classList.add('row-active');
    }

    const userLabel = normalizeDisplayText(record.name || record.email || '', 'Unknown user');
    const userEmail = normalizeDisplayText(record.email || '', 'No email on file');
    const normalizedUserRoleValue = normalizeUserRole(record.role);
    const accountSummary = getAdminUserAccountSummary(record);
    const rolePolicyLabel = getRolePolicyLabel(record);
    const deletionStatus = getDeletionReviewStatus(record);
    const roleActionLocked = isRoleActionLocked(record);
    const canReviewDeletionRequest = canReviewAdminAccountDeletion(state.currentRole);
    const hasPendingDeletionRequest = deletionStatus === ACCOUNT_DELETION_STATUS_PENDING;

    const nameCell = document.createElement('td');
    nameCell.innerHTML = buildIdentityMarkup({
      label: userLabel,
      secondary: accountSummary,
      role: record.role
    });

    const emailCell = document.createElement('td');
    emailCell.className = 'email-cell';
    emailCell.innerHTML = buildStackedTextMarkup({
      containerClass: 'email-stack',
      primary: userEmail,
      secondary: rolePolicyLabel
    });

    const roleCell = document.createElement('td');
    const roleWrap = document.createElement('div');
    roleWrap.className = 'role-cell-wrap';
    roleWrap.innerHTML = buildRoleBadgeMarkup(record.role);
    if (canManageAdminRoles(state.currentRole) && !roleActionLocked) {
      const roleSelectShell = document.createElement('div');
      roleSelectShell.className = 'input-shell role-select-shell search-container select-container';
      roleSelectShell.appendChild(buildRoleSelect(record));
      roleWrap.appendChild(roleSelectShell);
    }

    roleCell.appendChild(roleWrap);

    const createdCell = document.createElement('td');
    createdCell.innerHTML = buildStackedTextMarkup({
      containerClass: 'table-meta-stack',
      primary: formatCreatedAt(record.createdAt),
      secondary: 'Account created'
    });

    const actionCell = document.createElement('td');
    const actionWrap = document.createElement('div');
    actionWrap.className = 'table-actions-cell';
    const actionHelperMarkup = [];

    if (canManageAdminRoles(state.currentRole) && !roleActionLocked) {
      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.className = 'btn btn-primary';
      updateBtn.dataset.action = 'update-role';
      updateBtn.dataset.userId = record.uid;

      updateBtn.textContent = 'Update Role';
      if (!canRenderRoleChangeControl(record)) {
        updateBtn.disabled = true;
        updateBtn.title = normalizedUserRoleValue === ROLE_DEVELOPER
          ? 'Developer onboarding is manual outside the app'
          : normalizedUserRoleValue === ROLE_TEACHER && !Boolean(record?.emailVerified)
            ? 'Teacher email must be verified before admin promotion'
            : 'Role update is not allowed for this account';
      }
      actionWrap.appendChild(updateBtn);
    } else if (!hasPendingDeletionRequest) {
      const helperMessage = canManageAdminRoles(state.currentRole)
        ? rolePolicyLabel
        : roleActionLocked
          ? accountSummary
          : 'Developer-only role changes';
      actionHelperMarkup.push(buildTableHelperTextMarkup(helperMessage));
    }

    if (hasPendingDeletionRequest && canReviewDeletionRequest) {
      const approveBtn = document.createElement('button');
      approveBtn.type = 'button';
      approveBtn.className = 'btn btn-primary';
      approveBtn.dataset.action = 'review-deletion';
      approveBtn.dataset.userId = record.uid;
      approveBtn.dataset.decision = 'approve';
      approveBtn.textContent = 'Approve Request';
      actionWrap.appendChild(approveBtn);

      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'btn btn-secondary';
      rejectBtn.dataset.action = 'review-deletion';
      rejectBtn.dataset.userId = record.uid;
      rejectBtn.dataset.decision = 'reject';
      rejectBtn.textContent = 'Reject Request';
      actionWrap.appendChild(rejectBtn);
    }

    if (!actionWrap.childElementCount && actionHelperMarkup.length) {
      actionWrap.innerHTML = actionHelperMarkup.join('');
    }
    actionCell.appendChild(actionWrap);

    row.appendChild(nameCell);
    row.appendChild(emailCell);

    row.appendChild(roleCell);
    row.appendChild(createdCell);
    row.appendChild(actionCell);
    dom.tableBody.appendChild(row);
  });
};

const renderStats = () => {
  animateCountValue(dom.totalUsers, state.globalStats.totalUsers || 0);
  animateCountValue(dom.totalStudents, state.globalStats.totalStudents || 0);
  animateCountValue(dom.totalExams, state.globalStats.totalExams || 0);
};

const formatTargetLabel = (entry = {}) => {
  return formatActivityTargetLabel(entry, {
    globalSearchIndex: state.globalSearchIndex,
    adminStudentsRegistry: state.adminStudentsRegistry
  });
};

const getVisibleActivityEntries = (entries = []) => {
  return getVisibleAdminActivityEntries(entries, state.users, {
    currentRole: state.currentRole
  });
};

const populateActivityClassFilter = (entries = []) => {
  if (!dom.activityClassFilter) return;

  const { optionMarkup, selectedValue } = buildVisibleActivityClassFilterState(entries, state.users, {
    currentRole: state.currentRole,
    previousSelection: dom.activityClassFilter.value || ''
  });

  dom.activityClassFilter.innerHTML = optionMarkup;
  dom.activityClassFilter.value = selectedValue;
};

const renderActivityLogTable = (entries = [], {
  hasActiveFilters = false
} = {}) => {
  if (!dom.activityBody) return;
  const visibleEntries = getVisibleActivityEntries(entries);
  if (!visibleEntries.length) {
    dom.activityBody.innerHTML = buildEmptyTableRowMarkup({
      columnCount: 5,
      icon: '🧾',
      message: hasActiveFilters ? 'No activity logs match the current filters.' : 'No activity recorded.'
    });
    return;
  }

  let lastGroup = '';
  dom.activityBody.innerHTML = visibleEntries.map((entry) => {
    const actor = findUserRecord(entry.userId);
    const owner = findUserRecord(entry.dataOwnerUserId);
    const actorLabel = normalizeDisplayText(actor?.name || actor?.email || entry.userEmail || entry.userId || '', 'Unknown user');
    const ownerLabel = normalizeDisplayText(owner?.name || owner?.email || entry.ownerName || entry.dataOwnerUserId || '', 'Unknown owner');

    const actorRole = normalizeUserRole(actor?.role);
    const ownerRole = normalizeUserRole(owner?.role || entry.ownerRole || 'teacher');
    const actionTone = getActionTone(entry.action);
    const groupKey = getDateGroupKey(entry.timestamp);
    const shouldRenderGroup = groupKey !== lastGroup;
    lastGroup = groupKey;
    const actionLabel = formatActionLabel(entry.action);
    const timeLabel = formatTimeOfDay(entry.timestamp);
    const sentence = `${actionTone.verb} ${formatTargetLabel(entry)} at ${timeLabel}`;
    const classCellLabel = formatClassDisplayLabel(entry);
    const timestampTitle = toDateValue(entry.timestamp)?.toLocaleString() || 'Unknown time';

    return `
      ${shouldRenderGroup ? buildActivityGroupRowMarkup(getDateGroupLabel(groupKey)) : ''}
      ${buildActivityLogRowMarkup({
        rowClass: actionTone.className,
        timestampTitle,
        timeLabel,
        dateLabel: formatDateLabel(entry.timestamp),
        toneClass: actionTone.className,
        icon: getActionIcon(actionTone.className),
        actionLabel,
        actorLabel,
        sentence,
        actorRole,
        ownerLabel,
        ownerRole,
        classLabel: classCellLabel || '—',
        classId: entry.classId || ''
      })}
    `;
  }).join('');
};

const renderGlobalSearchResults = (entries = []) => {
  if (!dom.globalSearchResultsBody) return;
  if (!entries.length) {
    const { emptyMessage } = buildAdminGlobalSearchFeedbackState({
      searchTerm: dom.globalSearchInput?.value || '',
      resultCount: entries.length,
      isIndexLoaded: state.globalSearchIndexLoaded
    });
    dom.globalSearchResultsBody.innerHTML = buildEmptyTableRowMarkup({
      columnCount: 4,
      icon: '🔎',
      message: emptyMessage
    });
    return;
  }

  dom.globalSearchResultsBody.innerHTML = entries.map((entry) => {
    const owner = findUserRecord(entry.userId);
    const studentLabel = normalizeDisplayText(entry.name || '', 'Student');
    const ownerLabel = normalizeDisplayText(owner?.name || owner?.email || '', 'Unknown owner');
    const ownerRole = normalizeUserRole(owner?.role || entry.userRole || 'teacher');
    const classLabel = normalizeDisplayText(entry.className || entry.classId || '', '—');
    return buildGlobalSearchResultRowMarkup({
      studentLabel,
      ownerLabel,
      ownerRole,
      classLabel,
      classId: entry.classId || ''
    });
  }).join('');
};

const populateActivityUserFilter = () => {
  if (!dom.activityUserFilter) return;
  const visibleUsers = getVisibleUsers();
  const { optionMarkup, selectedValue } = buildActivityUserFilterState(visibleUsers, {
    previousSelection: dom.activityUserFilter.value || ''
  });

  dom.activityUserFilter.innerHTML = optionMarkup;
  dom.activityUserFilter.value = selectedValue;
};

const getActivityFilterState = () => {
  return buildActivityLogsQueryState({
    searchTerm: dom.activitySearchInput?.value || '',
    userId: dom.activityUserFilter?.value || '',
    classKey: dom.activityClassFilter?.value || '',
    action: dom.activityActionFilter?.value || '',
    sort: dom.activitySortFilter?.value || 'desc',
    maxEntries: dom.activityLimitFilter?.value || String(ADMIN_ACTIVITY_LOG_FETCH_LIMIT)
  });
};

const updateActivityFilterControls = () => {
  const { hasActiveFilters } = getActivityFilterState();
  if (dom.clearActivityFiltersBtn) {
    dom.clearActivityFiltersBtn.disabled = !hasActiveFilters;
  }
};

const fetchUsers = async () => {
  const usersLoadRequestState = buildAdminUsersLoadRequestState({
    isFirebaseConfigured
  });
  if (!usersLoadRequestState.canLoad) {
    setPanelStatus(usersLoadRequestState.statusMessage, usersLoadRequestState.statusType);
    setElementVisibility(dom.usersLoading, false);
    setSectionLoadingState(dom.usersSection, false);
    return;
  }

  setElementVisibility(dom.usersLoading, true);
  setSectionLoadingState(dom.usersSection, true);
  setPanelStatus(usersLoadRequestState.progressStatusMessage);

  try {
    const cachedRecords = readAdminRuntimeCache('users');
    if (Array.isArray(cachedRecords)) {
      state.users = cachedRecords;
      state.usersLoaded = true;
      const usersLoadFeedbackState = buildAdminUsersLoadFeedbackState({
        visibleCount: getVisibleUsers().length
      });
      renderUsersTable();
      populateActivityUserFilter();
      setPanelStatus(usersLoadFeedbackState.statusMessage, usersLoadFeedbackState.statusType);
      markUpdatedNow();
      return state.users;
    }

    const records = await fetchAdminUsers();
    state.users = Array.isArray(records) ? records : [];
    state.usersLoaded = true;
    const usersLoadFeedbackState = buildAdminUsersLoadFeedbackState({
      visibleCount: getVisibleUsers().length
    });
    writeAdminRuntimeCache('users', state.users);
    renderUsersTable();
    populateActivityUserFilter();
    setPanelStatus(usersLoadFeedbackState.statusMessage, usersLoadFeedbackState.statusType);
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to fetch users:', error);
    state.usersLoaded = false;
    invalidateAdminRuntimeCache('users');
    const usersLoadErrorFeedbackState = buildAdminUsersLoadErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error)
    });
    if (isPermissionDeniedError(error)) {
      setPanelStatus(usersLoadErrorFeedbackState.statusMessage, usersLoadErrorFeedbackState.statusType);
      showToast(usersLoadErrorFeedbackState.toastMessage, usersLoadErrorFeedbackState.toastType);
      return;
    }
    setPanelStatus(usersLoadErrorFeedbackState.statusMessage, usersLoadErrorFeedbackState.statusType);
    showToast(usersLoadErrorFeedbackState.toastMessage, usersLoadErrorFeedbackState.toastType);
  } finally {
    setElementVisibility(dom.usersLoading, false);
    setSectionLoadingState(dom.usersSection, false);
  }
};

const loadGlobalStats = async () => {
  setSectionLoadingState(dom.overviewSection, true);
  try {
    const cachedStats = readAdminRuntimeCache('globalStats');
    if (cachedStats && typeof cachedStats === 'object') {
      state.globalStats = {
        totalUsers: normalizeCount(cachedStats.totalUsers),
        totalStudents: normalizeCount(cachedStats.totalStudents),
        totalExams: normalizeCount(cachedStats.totalExams)
      };
      renderStats();
      return state.globalStats;
    }

    const stats = await fetchAdminGlobalStats();
    state.globalStats = {
      totalUsers: normalizeCount(stats?.totalUsers),
      totalStudents: normalizeCount(stats?.totalStudents),
      totalExams: normalizeCount(stats?.totalExams)
    };
    writeAdminRuntimeCache('globalStats', state.globalStats);
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    const globalStatsLoadErrorFeedbackState = buildAdminGlobalStatsLoadErrorFeedbackState({
      visibleUserCount: getVisibleUsers().length
    });
    state.globalStats = globalStatsLoadErrorFeedbackState.fallbackGlobalStats;
    invalidateAdminRuntimeCache('globalStats');
    showToast(globalStatsLoadErrorFeedbackState.toastMessage, globalStatsLoadErrorFeedbackState.toastType);
  } finally {
    renderStats();
    setSectionLoadingState(dom.overviewSection, false);
  }
};

const shouldIncludeGlobalSearchOwner = (userId = '') => {
  return shouldIncludeAdminOwner(userId, state.users, {
    currentRole: state.currentRole
  });
};

const buildGlobalSearchIndex = async () => {
  const globalSearchIndexRequestState = buildAdminGlobalSearchIndexRequestState({
    isFirebaseConfigured
  });
  if (!globalSearchIndexRequestState.canBuild) {
    state.globalSearchIndex = [];
    state.globalSearchIndexLoaded = false;
    renderGlobalSearchResults([]);
    setGlobalSearchStatus(globalSearchIndexRequestState.statusMessage, globalSearchIndexRequestState.statusType);
    setSectionLoadingState(dom.searchSection, false);
    return;
  }

  setElementVisibility(dom.globalSearchLoading, true);
  setSectionLoadingState(dom.searchSection, true);
  setGlobalSearchStatus(globalSearchIndexRequestState.progressStatusMessage);

  try {
    if (!state.usersLoaded) {
      await fetchUsers();
    }

    const cachedRows = readAdminRuntimeCache('globalSearchIndex');
    if (Array.isArray(cachedRows)) {
      state.globalSearchIndex = cachedRows;
      state.globalSearchIndexLoaded = true;
      const indexFeedbackState = buildAdminGlobalSearchIndexFeedbackState({
        indexedCount: cachedRows.length
      });
      state.globalStats = {
        ...state.globalStats,
        totalStudents: cachedRows.length
      };
      renderStats();
      setGlobalSearchStatus(indexFeedbackState.statusMessage, indexFeedbackState.statusType);
      renderGlobalSearchResults([]);
      markUpdatedNow();
      return state.globalSearchIndex;
    }

    let rows = await fetchGlobalStudentSearchIndex();
    rows = buildVisibleAdminGlobalSearchRows(rows, {
      shouldIncludeOwner: shouldIncludeGlobalSearchOwner
    });
    state.globalSearchIndex = rows;
    state.globalSearchIndexLoaded = true;
    const indexFeedbackState = buildAdminGlobalSearchIndexFeedbackState({
      indexedCount: rows.length
    });
    writeAdminRuntimeCache('globalSearchIndex', rows);
    state.globalStats = {
      ...state.globalStats,
      totalStudents: rows.length
    };
    renderStats();
    setGlobalSearchStatus(indexFeedbackState.statusMessage, indexFeedbackState.statusType);
    renderGlobalSearchResults([]);
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to build global search index:', error);
    state.globalSearchIndex = [];
    state.globalSearchIndexLoaded = false;
    invalidateAdminRuntimeCache('globalSearchIndex');
    renderGlobalSearchResults([]);
    const globalSearchIndexErrorFeedbackState = buildAdminGlobalSearchIndexErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error)
    });
    if (isPermissionDeniedError(error)) {
      setGlobalSearchStatus(globalSearchIndexErrorFeedbackState.statusMessage, globalSearchIndexErrorFeedbackState.statusType);
      showToast(globalSearchIndexErrorFeedbackState.toastMessage, globalSearchIndexErrorFeedbackState.toastType);
      return;
    }
    setGlobalSearchStatus(globalSearchIndexErrorFeedbackState.statusMessage, globalSearchIndexErrorFeedbackState.statusType);
    showToast(globalSearchIndexErrorFeedbackState.toastMessage, globalSearchIndexErrorFeedbackState.toastType);
  } finally {
    setElementVisibility(dom.globalSearchLoading, false);
    setSectionLoadingState(dom.searchSection, false);
  }
};

const ensureGlobalSearchIndexLoaded = async ({ force = false } = {}) => {
  if (!force && state.globalSearchIndexLoaded) {
    return state.globalSearchIndex;
  }
  return buildGlobalSearchIndex();
};

const scheduleGlobalSearch = () => {
  const term = normalizeText(dom.globalSearchInput?.value || '');
  if (!term) {
    const { statusMessage, statusType } = buildAdminGlobalSearchFeedbackState({
      searchTerm: term,
      resultCount: 0,
      isIndexLoaded: state.globalSearchIndexLoaded
    });
    state.globalSearchResults = [];
    renderGlobalSearchResults([]);
    setGlobalSearchStatus(statusMessage, statusType);
    return;
  }

  debounceAdminTask('globalSearchDebounceTimer', async () => {
    await ensureGlobalSearchIndexLoaded();
    runGlobalSearch();
  });
};

const runGlobalSearch = () => {
  const term = normalizeText(dom.globalSearchInput?.value || '').toLowerCase();
  if (!term) {
    const { statusMessage, statusType } = buildAdminGlobalSearchFeedbackState({
      searchTerm: term,
      resultCount: 0,
      isIndexLoaded: state.globalSearchIndexLoaded
    });
    state.globalSearchResults = [];
    renderGlobalSearchResults([]);
    setGlobalSearchStatus(statusMessage, statusType);
    return;
  }

  const results = getFilteredAdminGlobalSearchRows(state.globalSearchIndex, {
    searchTerm: term
  });
  const { statusMessage, statusType } = buildAdminGlobalSearchFeedbackState({
    searchTerm: term,
    resultCount: results.length
  });
  state.globalSearchResults = results;
  renderGlobalSearchResults(results);
  setGlobalSearchStatus(statusMessage, statusType);
};

const loadActivityLogs = async () => {
  const activityLogsLoadRequestState = buildActivityLogsLoadRequestState();
  const {
    selectedUserId,
    selectedClassKey,
    selectedAction,
    selectedSearchTerm,
    selectedSort,
    selectedLimit,
    activityLogsCacheKey
  } = getActivityFilterState();

  setElementVisibility(dom.activityLoading, true);
  setSectionLoadingState(dom.activitySection, true);
  setActivityStatus(activityLogsLoadRequestState.progressStatusMessage);

  try {
    if (!state.usersLoaded) {
      await fetchUsers();
    }

    let entries = readAdminRuntimeCache('activityLogs', activityLogsCacheKey);
    if (!Array.isArray(entries)) {
      entries = await fetchActivityLogs({
        userId: selectedUserId,
        sort: selectedSort,
        maxEntries: selectedLimit
      });
      writeAdminRuntimeCache('activityLogs', Array.isArray(entries) ? entries : [], activityLogsCacheKey);
    }

    const {
      entriesForClassFilter,
      filteredEntries
    } = filterAdminActivityEntries(entries, {
      searchTerm: selectedSearchTerm,
      selectedAction,
      selectedClassKey
    });

    populateActivityClassFilter(entriesForClassFilter);

    const resolvedSelectedClassKey = dom.activityClassFilter?.value || '';
    entries = resolvedSelectedClassKey === selectedClassKey
      ? filteredEntries
      : filterAdminActivityEntries(entries, {
          searchTerm: selectedSearchTerm,
          selectedAction,
          selectedClassKey: resolvedSelectedClassKey
        }).filteredEntries;
    const hasActiveFilters = Boolean(
      selectedUserId
      || resolvedSelectedClassKey
      || selectedAction
      || selectedSearchTerm
      || selectedSort !== 'desc'
      || selectedLimit !== ADMIN_ACTIVITY_LOG_FETCH_LIMIT
    );

    state.activityLogs = entries;
    state.activityLogsLoaded = true;
    renderActivityLogTable(entries, {
      hasActiveFilters
    });
    const visibleCount = getVisibleActivityEntries(entries).length;
    const loadFeedbackState = buildActivityLogsLoadFeedbackState({
      visibleCount,
      hasActiveFilters
    });
    setActivityStatus(loadFeedbackState.statusMessage, loadFeedbackState.statusType);
    updateActivityFilterControls();
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to load activity logs:', error);
    state.activityLogs = [];
    state.activityLogsLoaded = false;
    invalidateAdminRuntimeCache('activityLogs');
    renderActivityLogTable([]);
    const activityLogsLoadErrorFeedbackState = buildActivityLogsLoadErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error)
    });
    if (isPermissionDeniedError(error)) {
      setActivityStatus(activityLogsLoadErrorFeedbackState.statusMessage, activityLogsLoadErrorFeedbackState.statusType);
      showToast(activityLogsLoadErrorFeedbackState.toastMessage, activityLogsLoadErrorFeedbackState.toastType);
      return;
    }
    setActivityStatus(activityLogsLoadErrorFeedbackState.statusMessage, activityLogsLoadErrorFeedbackState.statusType);
    showToast(activityLogsLoadErrorFeedbackState.toastMessage, activityLogsLoadErrorFeedbackState.toastType);
  } finally {
    setElementVisibility(dom.activityLoading, false);
    setSectionLoadingState(dom.activitySection, false);
  }
};

const handleClearActivityLogs = async () => {
  if (!canClearAdminActivityLogs(state.currentRole)) {
    setActivityStatus('Only developers can clear activity logs.', 'warning');
    showToast('Activity log clearing unavailable', 'warning');
    return;
  }

  const clearRequestState = buildActivityLogsClearRequestState();
  const shouldContinue = await requestConfirmation({
    message: clearRequestState.confirmationMessage,
    confirmLabel: clearRequestState.confirmLabel,
    dangerous: clearRequestState.dangerous
  });

  if (!shouldContinue) {
    setActivityStatus(clearRequestState.canceledStatusMessage, clearRequestState.canceledStatusType);
    return;
  }

  setElementVisibility(dom.activityLoading, true);
  setSectionLoadingState(dom.activitySection, true);
  setActivityStatus(clearRequestState.progressStatusMessage);

  try {
    const clearedCount = await clearActivityLogs();
    state.activityLogs = [];
    state.activityLogsLoaded = false;
    invalidateAdminRuntimeCache('activityLogs');
    renderActivityLogTable([]);
    populateActivityClassFilter([]);
    updateActivityFilterControls();
    const clearFeedbackState = buildActivityLogsClearFeedbackState({
      clearedCount
    });
    setActivityStatus(clearFeedbackState.statusMessage, clearFeedbackState.statusType);
    showToast(clearFeedbackState.toastMessage, clearFeedbackState.toastType);
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to clear activity logs:', error);
    const clearErrorFeedbackState = buildActivityLogsClearErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error)
    });
    if (isPermissionDeniedError(error)) {
      setActivityStatus(clearErrorFeedbackState.statusMessage, clearErrorFeedbackState.statusType);
      showToast(clearErrorFeedbackState.toastMessage, clearErrorFeedbackState.toastType);
      return;
    }
    setActivityStatus(clearErrorFeedbackState.statusMessage, clearErrorFeedbackState.statusType);
    showToast(clearErrorFeedbackState.toastMessage, clearErrorFeedbackState.toastType);
  } finally {
    setElementVisibility(dom.activityLoading, false);
    setSectionLoadingState(dom.activitySection, false);
  }
};

const updateUserRole = async (uid, nextRole) => {
  const record = findUserRecord(uid);
  const roleUpdatePrecheckState = buildAdminUserRoleUpdatePrecheckState({
    hasRecord: Boolean(record),
    canManageRoles: canManageAdminRoles(state.currentRole)
  });
  if (!roleUpdatePrecheckState.canProceed) {
    setPanelStatus(roleUpdatePrecheckState.statusMessage, roleUpdatePrecheckState.statusType);
    return;
  }

  const roleUpdateState = buildAdminUserRoleUpdateState(record, {
    nextRole,
    updatableRoles: UPDATABLE_ROLES
  });

  if (!roleUpdateState.canUpdate) {
    setPanelStatus(roleUpdateState.statusMessage, roleUpdateState.statusType);
    return;
  }

  const shouldContinue = await requestConfirmation({
    message: roleUpdateState.confirmationMessage,
    confirmLabel: roleUpdateState.confirmLabel,
    dangerous: roleUpdateState.dangerous
  });

  if (!shouldContinue) {
    setPanelStatus(roleUpdateState.canceledStatusMessage, roleUpdateState.canceledStatusType);
    return;
  }

  try {
    setPanelStatus(roleUpdateState.progressStatusMessage);
    const updatedRecord = await updateAdminUserRole({
      uid,
      name: normalizeText(record.name || ''),
      email: normalizeText(record.email || '').toLowerCase(),
      role: roleUpdateState.normalizedNextRole
    });

    applyUserLifecycleRecordUpdate(record, updatedRecord);
    writeAdminRuntimeCache('users', state.users);
    renderUsersTable();
    populateActivityUserFilter();
    const roleUpdateFeedbackState = buildAdminUserRoleUpdateFeedbackState();
    setPanelStatus(roleUpdateFeedbackState.statusMessage, roleUpdateFeedbackState.statusType);
    showToast(roleUpdateFeedbackState.toastMessage, roleUpdateFeedbackState.toastType);
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to update role:', error);
    const roleUpdateErrorFeedbackState = buildAdminUserRoleUpdateErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error)
    });
    if (isPermissionDeniedError(error)) {
      setPanelStatus(roleUpdateErrorFeedbackState.statusMessage, roleUpdateErrorFeedbackState.statusType);
      showToast(roleUpdateErrorFeedbackState.toastMessage, roleUpdateErrorFeedbackState.toastType);
      return;
    }
    setPanelStatus(roleUpdateErrorFeedbackState.statusMessage, roleUpdateErrorFeedbackState.statusType);
    showToast(roleUpdateErrorFeedbackState.toastMessage, roleUpdateErrorFeedbackState.toastType);
  }
};

const reviewUserDeletionRequest = async (uid, decision) => {
  const record = findUserRecord(uid);
  if (!record) {
    setPanelStatus('Unable to find selected user.', 'error');
    return;
  }

  const reviewState = buildAdminUserDeletionReviewState(record, {
    currentRole: state.currentRole,
    decision
  });

  if (!reviewState.canReview) {
    setPanelStatus(reviewState.statusMessage, reviewState.statusType);
    return;
  }

  const shouldContinue = await requestConfirmation({
    message: reviewState.confirmationMessage,
    confirmLabel: reviewState.confirmLabel,
    dangerous: reviewState.dangerous
  });

  if (!shouldContinue) {
    setPanelStatus(reviewState.canceledStatusMessage, reviewState.canceledStatusType);
    return;
  }

  try {
    setPanelStatus(reviewState.progressStatusMessage);
    const updatedRecord = await reviewAdminUserAccountDeletion({
      uid,
      decision: reviewState.normalizedDecision
    });

    applyUserLifecycleRecordUpdate(record, updatedRecord);
    writeAdminRuntimeCache('users', state.users);
    renderUsersTable();
    populateActivityUserFilter();
    const reviewFeedbackState = buildAdminUserDeletionReviewFeedbackState({
      decision: reviewState.normalizedDecision
    });
    setPanelStatus(reviewFeedbackState.statusMessage, reviewFeedbackState.statusType);
    showToast(reviewFeedbackState.toastMessage, reviewFeedbackState.toastType);
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to review deletion request:', error);
    const reviewErrorFeedbackState = buildAdminUserDeletionReviewErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error),
      decision: reviewState.normalizedDecision
    });
    if (isPermissionDeniedError(error)) {
      setPanelStatus(reviewErrorFeedbackState.statusMessage, reviewErrorFeedbackState.statusType);
      showToast(reviewErrorFeedbackState.toastMessage, reviewErrorFeedbackState.toastType);
      return;
    }
    setPanelStatus(reviewErrorFeedbackState.statusMessage, reviewErrorFeedbackState.statusType);
    showToast(reviewErrorFeedbackState.toastMessage, reviewErrorFeedbackState.toastType);
  }
};

const ensurePanelAccess = async () => {
  const authUser = await waitForInitialAuthState();
  if (!authUser) {
    redirectToLogin();

    return false;
  }

  state.authUser = authUser;
  const resolvedRole = normalizeUserRole(await resolveUserRole(authUser));
  state.currentRole = resolvedRole;
  if (typeof setCurrentUserRoleContext === 'function') {
    setCurrentUserRoleContext(state.currentRole);
  }

  console.log('Logged in email:', normalizeText(authUser?.email || '(none)').toLowerCase());
  console.log('Final role:', state.currentRole);
  updatePanelRoleBadge();
  updatePanelAccessSummary();
  updateAdminActionBoundaryState();

  if (state.currentRole !== ROLE_ADMIN && state.currentRole !== ROLE_DEVELOPER) {
    redirectToDashboard();
    return false;
  }
  return true;
};

const debounceAdminTask = (timerKey, callback, waitMs = 300) => {
  if (typeof state[timerKey] === 'number') {
    window.clearTimeout(state[timerKey]);
  }

  state[timerKey] = window.setTimeout(() => {
    state[timerKey] = null;
    Promise.resolve(callback()).catch((error) => {
      console.error('Deferred admin task failed:', error);
    });
  }, waitMs);
};

const bindEvents = () => {
  dom.searchInput?.addEventListener('input', () => {
    debounceAdminTask('userSearchDebounceTimer', () => renderUsersTable());
  });
  dom.themeBtn?.addEventListener('click', () => togglePanelTheme());

  dom.refreshBtn?.addEventListener('click', async () => {
    invalidateAdminRuntimeCache('users', 'globalStats');
    const refreshTasks = [
      fetchUsers(),
      loadGlobalStats()
    ];

    if (state.globalSearchIndexLoaded) {
      invalidateAdminRuntimeCache('globalSearchIndex');
      refreshTasks.push(buildGlobalSearchIndex());
    }

    if (state.activityLogsLoaded) {
      invalidateAdminRuntimeCache('activityLogs');
      refreshTasks.push(loadActivityLogs());
    }

    await Promise.allSettled(refreshTasks);
    const refreshFeedbackState = buildAdminRefreshFeedbackState();
    showToast(refreshFeedbackState.toastMessage, refreshFeedbackState.toastType);
  });

  dom.refreshActivityBtn?.addEventListener('click', async () => {
    invalidateAdminRuntimeCache('activityLogs');
    await loadActivityLogs();
  });

  dom.clearActivityBtn?.addEventListener('click', async () => {
    await handleClearActivityLogs();
  });

  dom.clearActivityFiltersBtn?.addEventListener('click', async () => {
    if (dom.activitySearchInput) {
      dom.activitySearchInput.value = '';
    }
    if (dom.activityUserFilter) {
      dom.activityUserFilter.value = '';
    }
    if (dom.activityClassFilter) {
      dom.activityClassFilter.value = '';
    }
    if (dom.activityActionFilter) {
      dom.activityActionFilter.value = '';
    }
    if (dom.activitySortFilter) {
      dom.activitySortFilter.value = 'desc';
    }
    if (dom.activityLimitFilter) {
      dom.activityLimitFilter.value = String(ADMIN_ACTIVITY_LOG_FETCH_LIMIT);
    }
    updateActivityFilterControls();
    await loadActivityLogs();
    dom.activitySearchInput?.focus();
  });

  dom.activityUserFilter?.addEventListener('change', async () => {
    updateActivityFilterControls();
    await loadActivityLogs();
  });

  dom.activityClassFilter?.addEventListener('change', async () => {
    updateActivityFilterControls();
    await loadActivityLogs();
  });

  dom.activityActionFilter?.addEventListener('change', async () => {
    updateActivityFilterControls();
    await loadActivityLogs();
  });

  dom.activitySearchInput?.addEventListener('input', () => {
    updateActivityFilterControls();
    debounceAdminTask('activitySearchDebounceTimer', async () => {
      await loadActivityLogs();
    });
  });

  dom.activitySortFilter?.addEventListener('change', async () => {
    updateActivityFilterControls();
    await loadActivityLogs();
  });

  dom.activityLimitFilter?.addEventListener('change', async () => {
    updateActivityFilterControls();
    await loadActivityLogs();
  });

  dom.globalSearchInput?.addEventListener('input', () => {
    scheduleGlobalSearch();
  });

  dom.globalSearchClearBtn?.addEventListener('click', () => {
    if (dom.globalSearchInput) {
      dom.globalSearchInput.value = '';
      dom.globalSearchInput.focus();
    }
    scheduleGlobalSearch();
  });

  dom.sidebarButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = normalizeText(button.dataset.target);
      if (target === 'search' && !state.globalSearchIndexLoaded) {
        buildGlobalSearchIndex().catch((error) => {
          console.error('Failed to lazy load global search index:', error);
        });
        return;
      }
      if (target === 'logs' && !state.activityLogsLoaded) {
        loadActivityLogs().catch((error) => {
          console.error('Failed to lazy load activity logs:', error);
        });
      }
    });
  });

  dom.dashboardBtn?.addEventListener('click', () => {
    window.location.assign(DASHBOARD_PATH);
  });

  dom.logoutBtn?.addEventListener('click', async () => {
    const logoutRequestState = buildAdminLogoutRequestState();
    const previousLabel = dom.logoutBtn.textContent;
    dom.logoutBtn.disabled = true;
    dom.logoutBtn.textContent = logoutRequestState.progressLabel;
    try {
      await logoutUser();
      redirectToLogin();
    } catch (error) {
      const logoutErrorFeedbackState = buildAdminLogoutErrorFeedbackState({
        errorMessage: formatAuthError(error)
      });
      setPanelStatus(logoutErrorFeedbackState.statusMessage, logoutErrorFeedbackState.statusType);
      showToast(logoutErrorFeedbackState.toastMessage, logoutErrorFeedbackState.toastType);
      dom.logoutBtn.disabled = false;
      dom.logoutBtn.textContent = previousLabel;
    }
  });

  dom.confirmCancelBtn?.addEventListener('click', () => resolvePendingConfirmation(false));
  dom.confirmOkBtn?.addEventListener('click', () => resolvePendingConfirmation(true));
  dom.confirmModal?.addEventListener('click', (event) => {
    if (event.target === dom.confirmModal) {
      resolvePendingConfirmation(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.confirmModal?.classList.contains('active')) {
      resolvePendingConfirmation(false);
    }
  });

  dom.tableBody?.addEventListener('click', async (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger) return;

    const uid = normalizeText(trigger.dataset.userId || '');
    if (!uid) return;

    const action = normalizeText(trigger.dataset.action || '');
    if (action === 'update-role') {
      const roleSelect = trigger.closest('tr')?.querySelector('select.role-select');
      const nextRole = normalizeText(roleSelect?.value || '');
      if (!nextRole) return;

      const roleUpdateState = buildAdminUserRoleUpdateState(findUserRecord(uid), {
        nextRole,
        updatableRoles: UPDATABLE_ROLES
      });
      trigger.disabled = true;
      const previousLabel = trigger.textContent;
      trigger.textContent = roleUpdateState.progressLabel;
      await updateUserRole(uid, nextRole);
      trigger.textContent = previousLabel;
      trigger.disabled = !canRenderRoleChangeControl(findUserRecord(uid));
      return;
    }

    if (action !== 'review-deletion') return;
    const decision = normalizeText(trigger.dataset.decision || '');
    if (!decision) return;

    const reviewState = buildAdminUserDeletionReviewState(findUserRecord(uid), {
      currentRole: state.currentRole,
      decision
    });
    if (!reviewState.canReview) {
      await reviewUserDeletionRequest(uid, decision);
      return;
    }

    trigger.disabled = true;
    const previousLabel = trigger.textContent;
    trigger.textContent = reviewState.progressLabel;
    await reviewUserDeletionRequest(uid, decision);
    trigger.textContent = previousLabel;
    trigger.disabled = false;
  });
};

const init = async () => {
  applyPanelTheme(getStoredTheme());
  initSidebarNavigation();
  bindEvents();
  updateLastUpdatedIndicator();
  setInterval(updateLastUpdatedIndicator, 60000);

  try {
    const canAccessPanel = await ensurePanelAccess();
    if (!canAccessPanel) return;

    await Promise.all([
      fetchUsers(),
      loadGlobalStats()
    ]);

    if (!state.globalSearchIndexLoaded) {
      const globalSearchIdleFeedbackState = buildAdminGlobalSearchFeedbackState({
        isIndexLoaded: state.globalSearchIndexLoaded
      });
      renderGlobalSearchResults([]);
      setGlobalSearchStatus(globalSearchIdleFeedbackState.statusMessage, globalSearchIdleFeedbackState.statusType);
    }

    if (!state.activityLogsLoaded) {
      const activityLogsIdleFeedbackState = buildActivityLogsIdleFeedbackState();
      renderActivityLogTable([]);
      populateActivityClassFilter([]);
      setActivityStatus(activityLogsIdleFeedbackState.statusMessage, activityLogsIdleFeedbackState.statusType);
    }

    updateActivityFilterControls();

    const initSuccessFeedbackState = buildAdminInitSuccessFeedbackState();
    showToast(initSuccessFeedbackState.toastMessage, initSuccessFeedbackState.toastType);
  } catch (error) {
    console.error('Failed to initialize admin panel:', error);
    const initErrorFeedbackState = buildAdminInitErrorFeedbackState({
      errorMessage: formatAuthError(error)
    });
    setPanelStatus(initErrorFeedbackState.statusMessage, initErrorFeedbackState.statusType);
    showToast(initErrorFeedbackState.toastMessage, initErrorFeedbackState.toastType);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function fetchAllStudentsGlobal() {
  if (!isFirebaseConfigured) {
    return [];
  }

  return fetchGlobalStudentSearchIndex();
}

async function fetchAdminClassNameMap() {
  if (!isFirebaseConfigured) {
    return new Map();
  }

  const catalog = await fetchClassCatalog();
  const classes = Array.isArray(catalog?.classes) ? catalog.classes : [];
  const classMap = new Map();
  classes.forEach((entry) => {
    const ownerId = normalizeText(entry?.ownerId || '');
    const classId = normalizeText(entry?.id || '');
    const classKey = buildAdminRegistryClassKey(ownerId, classId);
    if (!classKey) {
      return;
    }

    const ownerRecord = findAdminUserRecord(state.users, ownerId);
    classMap.set(classKey, {
      name: normalizeDisplayText(entry?.name || entry?.className || '', 'Unnamed Class'),
      ownerId,
      ownerName: normalizeDisplayText(entry?.ownerName || ownerRecord?.name || ownerRecord?.email || '', 'Unknown Teacher')
    });
  });
  return classMap;
}

const getAdminStudentsFilterState = () => {
  return buildAdminStudentsFilterState({
    searchText: dom.adminStudentsSearchInput?.value || '',
    selectedClass: dom.adminStudentsClassFilter?.value || '',
    selectedTeacher: dom.adminStudentsTeacherFilter?.value || ''
  });
};

const updateAdminStudentsFilterControls = () => {
  const { hasActiveCriteria } = getAdminStudentsFilterState();
  if (dom.adminStudentsClearFiltersBtn) {
    dom.adminStudentsClearFiltersBtn.disabled = !hasActiveCriteria;
  }
};

const renderAdminStudentsFilterOptions = (classMap = new Map(), students = []) => {
  const visibleClassMap = getVisibleAdminStudentsClassMap(classMap, {
    shouldIncludeOwner: shouldIncludeGlobalSearchOwner
  });

  const {
    classOptionMarkup,
    classSelectedValue,
    classDisabled,
    teacherOptionMarkup,
    teacherSelectedValue,
    teacherDisabled
  } = buildAdminStudentsFilterOptionsState(visibleClassMap, students, {
    previousClass: dom.adminStudentsClassFilter?.value || '',
    previousTeacher: dom.adminStudentsTeacherFilter?.value || ''
  });

  if (dom.adminStudentsClassFilter) {
    dom.adminStudentsClassFilter.innerHTML = classOptionMarkup;
    dom.adminStudentsClassFilter.value = classSelectedValue;
    dom.adminStudentsClassFilter.disabled = classDisabled;
  }

  if (dom.adminStudentsTeacherFilter) {
    dom.adminStudentsTeacherFilter.innerHTML = teacherOptionMarkup;
    dom.adminStudentsTeacherFilter.value = teacherSelectedValue;
    dom.adminStudentsTeacherFilter.disabled = teacherDisabled;
  }
  updateAdminStudentsFilterControls();
};

const renderAdminStudentsSkeletonRows = (rowCount = 6) => {
  if (!dom.adminStudentsTableBody) return;
  dom.adminStudentsTableBody.innerHTML = buildAdminStudentsSkeletonMarkup({
    rowCount,
    columnCount: ADMIN_STUDENTS_TABLE_COLUMN_COUNT
  });
};

const renderAdminStudentsPagination = ({
  totalItems = 0,
  totalPages = 1,
  currentPage = 1,
  startIndex = 0,
  endIndex = 0,
  isLoading = false
} = {}) => {
  if (!dom.adminStudentsPagination) return;

  const paginationViewState = buildAdminStudentsPaginationViewState({
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
    isLoading
  });

  dom.adminStudentsPagination.classList.toggle('hidden', !paginationViewState.shouldShow);

  if (dom.adminStudentsPaginationSummary) {
    dom.adminStudentsPaginationSummary.textContent = paginationViewState.summaryText;
  }

  if (dom.adminStudentsPageIndicator) {
    dom.adminStudentsPageIndicator.textContent = paginationViewState.pageIndicatorText;
  }

  if (dom.adminStudentsPrevPageBtn) {
    dom.adminStudentsPrevPageBtn.disabled = paginationViewState.prevDisabled;
  }

  if (dom.adminStudentsNextPageBtn) {
    dom.adminStudentsNextPageBtn.disabled = paginationViewState.nextDisabled;
  }
};

const renderAdminStudentsTable = (groups = [], startIndex = 0, {
  hasActiveCriteria = false
} = {}) => {
  if (!dom.adminStudentsTableBody) return;
  dom.adminStudentsTableBody.innerHTML = buildAdminStudentsTableMarkup(groups, {
    startIndex,
    hasActiveCriteria,
    canDelete: canDeleteAdminRegistryStudents(state.currentRole),
    columnCount: ADMIN_STUDENTS_TABLE_COLUMN_COUNT
  });
};

const updateAdminStudentsView = () => {
  const viewState = buildAdminStudentsRegistryViewState(
    state.adminStudentsRegistry,
    getAdminStudentsFilterState(),
    {
      requestedPage: state.adminStudentsRegistryPage,
      pageSize: ADMIN_STUDENTS_PAGE_SIZE,
      isLoaded: state.adminStudentsRegistryLoaded
    }
  );

  state.adminStudentsRegistryPage = viewState.pagination.currentPage;
  renderAdminStudentsTable(viewState.pagination.groups, viewState.pagination.startIndex, {
    hasActiveCriteria: viewState.filterState.hasActiveCriteria
  });
  renderAdminStudentsPagination(viewState.pagination);
  updateAdminStudentsFilterControls();

  if (!state.adminStudentsRegistryLoaded) {
    return;
  }

  setAdminStudentsStatus(viewState.statusMessage, viewState.statusType);
};

const loadAdminStudentsRegistry = async () => {
  if (!dom.adminStudentsView) {
    return;
  }

  const registryLoadRequestState = buildAdminStudentsRegistryLoadRequestState({
    isFirebaseConfigured: Boolean(isFirebaseConfigured)
  });

  if (!registryLoadRequestState.canLoad) {
    state.adminStudentsRegistry = [];
    state.adminStudentsRegistryLoaded = false;
    state.adminStudentsRegistryPage = 1;
    renderAdminStudentsFilterOptions();
    renderAdminStudentsTable([]);
    renderAdminStudentsPagination();
    setAdminStudentsStatus(registryLoadRequestState.statusMessage, registryLoadRequestState.statusType);
    setElementVisibility(dom.adminStudentsLoading, false);
    setSectionLoadingState(dom.adminStudentsView, false);

    return;
  }

  if (state.adminStudentsRegistryLoaded) {
    updateAdminStudentsView();
    return;
  }

  state.adminStudentsRegistryPage = Math.max(1, Number.parseInt(state.adminStudentsRegistryPage, 10) || 1);
  setElementVisibility(dom.adminStudentsLoading, true);
  setSectionLoadingState(dom.adminStudentsView, true);
  setAdminStudentsStatus(registryLoadRequestState.progressStatusMessage);
  if (dom.adminStudentsClassFilter) {
    dom.adminStudentsClassFilter.disabled = true;
  }

  if (dom.adminStudentsTeacherFilter) {
    dom.adminStudentsTeacherFilter.disabled = true;
  }
  updateAdminStudentsFilterControls();
  renderAdminStudentsSkeletonRows();
  renderAdminStudentsPagination({ isLoading: true });

  try {
    const [studentRecords, classMap] = await Promise.all([
      fetchAllStudentsGlobal(),
      fetchAdminClassNameMap()
    ]);
    const students = buildAdminStudentsRegistryRecords(studentRecords, classMap, {
      users: state.users,
      shouldIncludeOwner: shouldIncludeGlobalSearchOwner
    });
    state.adminStudentsRegistry = students;
    state.adminStudentsRegistryLoaded = true;
    state.globalStats = {
      ...state.globalStats,
      totalStudents: students.length
    };
    renderStats();
    renderAdminStudentsFilterOptions(classMap, students);
    updateAdminStudentsView();
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to load global student registry:', error);
    state.adminStudentsRegistry = [];
    state.adminStudentsRegistryLoaded = false;
    state.adminStudentsRegistryPage = 1;
    renderAdminStudentsFilterOptions();
    renderAdminStudentsTable([]);
    renderAdminStudentsPagination();
    const registryLoadErrorFeedbackState = buildAdminStudentsRegistryLoadErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error)
    });
    if (isPermissionDeniedError(error)) {
      setAdminStudentsStatus(registryLoadErrorFeedbackState.statusMessage, registryLoadErrorFeedbackState.statusType);
      showToast(registryLoadErrorFeedbackState.toastMessage, registryLoadErrorFeedbackState.toastType);

      return;
    }
    setAdminStudentsStatus(registryLoadErrorFeedbackState.statusMessage, registryLoadErrorFeedbackState.statusType);
    showToast(registryLoadErrorFeedbackState.toastMessage, registryLoadErrorFeedbackState.toastType);
  } finally {
    setElementVisibility(dom.adminStudentsLoading, false);
    setSectionLoadingState(dom.adminStudentsView, false);
    updateAdminStudentsFilterControls();
  }
};

const removeAdminRegistryStudentFromState = (ownerId = '', studentId = '') => {
  const { nextStudents, removedCount } = removeAdminRegistryStudentEntries(state.adminStudentsRegistry, {
    ownerId,
    studentId
  });
  if (!removedCount) {
    return 0;
  }

  state.adminStudentsRegistry = nextStudents;
  state.globalStats = {
    ...state.globalStats,
    totalStudents: nextStudents.length
  };
  renderStats();
  renderAdminStudentsFilterOptions(new Map(), nextStudents);
  updateAdminStudentsView();
  return removedCount;
};

const handleAdminRegistryStudentDelete = async ({ ownerId = '', studentId = '', studentName = '' } = {}) => {
  const deleteRequestState = buildAdminRegistryStudentDeleteRequestState({
    ownerId,
    studentId,
    studentName,
    canDelete: canDeleteAdminRegistryStudents(state.currentRole)
  });

  if (!deleteRequestState.canSubmitDelete) {
    setAdminStudentsStatus(deleteRequestState.statusMessage, deleteRequestState.statusType);
    showToast(deleteRequestState.toastMessage, deleteRequestState.toastType);
    return;
  }

  const shouldContinue = await requestConfirmation({
    message: deleteRequestState.confirmationMessage,
    confirmLabel: deleteRequestState.confirmLabel,
    dangerous: deleteRequestState.dangerous
  });

  if (!shouldContinue) {
    setAdminStudentsStatus(deleteRequestState.canceledStatusMessage, deleteRequestState.canceledStatusType);
    return;
  }

  try {
    setAdminStudentsStatus(deleteRequestState.progressStatusMessage);
    const result = await deleteAdminRegistryStudent({
      ownerId: deleteRequestState.normalizedOwnerId,
      studentId: deleteRequestState.normalizedStudentId,
      studentName: deleteRequestState.normalizedStudentName
    });
    const removedCount = removeAdminRegistryStudentFromState(deleteRequestState.normalizedOwnerId, deleteRequestState.normalizedStudentId);
    const shouldRefreshSearchIndex = state.globalSearchIndexLoaded;
    const shouldRefreshActivityLogs = state.activityLogsLoaded;
    invalidateAdminRuntimeCache('globalStats', 'globalSearchIndex', 'activityLogs');
    state.globalSearchIndexLoaded = false;
    state.activityLogsLoaded = false;
    await Promise.allSettled([
      loadGlobalStats(),
      shouldRefreshSearchIndex ? buildGlobalSearchIndex() : Promise.resolve(null),
      shouldRefreshActivityLogs ? loadActivityLogs() : Promise.resolve(null)
    ]);

    const deleteFeedbackState = buildAdminRegistryStudentDeleteFeedbackState({
      studentName: deleteRequestState.normalizedStudentName,
      deletedCount: result?.deletedCount,
      removedCount
    });
    setAdminStudentsStatus(deleteFeedbackState.statusMessage, deleteFeedbackState.statusType);
    showToast(deleteFeedbackState.toastMessage, deleteFeedbackState.toastType);
    if (deleteFeedbackState.shouldMarkUpdated) {
      markUpdatedNow();
    }
  } catch (error) {
    console.error('Failed to delete registry student:', error);
    const deleteErrorFeedbackState = buildAdminRegistryStudentDeleteErrorFeedbackState({
      isPermissionDenied: isPermissionDeniedError(error),
      errorMessage: formatAuthError(error)
    });
    if (isPermissionDeniedError(error)) {
      setAdminStudentsStatus(deleteErrorFeedbackState.statusMessage, deleteErrorFeedbackState.statusType);
      showToast(deleteErrorFeedbackState.toastMessage, deleteErrorFeedbackState.toastType);
      return;
    }
    setAdminStudentsStatus(deleteErrorFeedbackState.statusMessage, deleteErrorFeedbackState.statusType);
    showToast(deleteErrorFeedbackState.toastMessage, deleteErrorFeedbackState.toastType);
  }
};

const setAdminStudentsRegistryVisibility = (shouldShow) => {
  const studentsView = dom.adminStudentsView;
  const mainView = dom.adminMainView;
  if (!studentsView || !mainView) {
    return false;
  }

  studentsView.classList.toggle('hidden', !shouldShow);
  mainView.classList.toggle('hidden', !!shouldShow);
  dom.totalStudentsCard?.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
  if (shouldShow) {
    window.requestAnimationFrame(() => {
      studentsView.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
  return true;
};

const openAdminStudentsRegistryView = () => {
  const didToggleView = setAdminStudentsRegistryVisibility(true);
  if (!didToggleView) {
    return;
  }
  loadAdminStudentsRegistry().catch((error) => {
    console.error('Failed to open global student registry:', error);
  });
};

const initAdminStudentsRegistryView = () => {
  const totalStudentsCard = dom.totalStudentsCard || dom.totalStudents?.closest('[data-open-admin-students-registry="true"]') || document.querySelector('[data-open-admin-students-registry="true"]');

  const handleOpenRegistryTrigger = (event) => {
    if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    if (event?.type === 'keydown') {
      event.preventDefault();
    }
    openAdminStudentsRegistryView();
  };

  totalStudentsCard?.addEventListener('click', handleOpenRegistryTrigger);
  totalStudentsCard?.addEventListener('keydown', handleOpenRegistryTrigger);

  dom.adminStudentsBackBtn?.addEventListener('click', () => {
    const didToggleView = setAdminStudentsRegistryVisibility(false);
    if (!didToggleView) {
      return;
    }
    scrollToSidebarSection('overview', { smooth: false });
  });

  const handleAdminStudentsCriteriaChange = () => {
    state.adminStudentsRegistryPage = 1;
    updateAdminStudentsFilterControls();
    if (state.adminStudentsRegistryLoaded) {
      updateAdminStudentsView();
    }
  };

  dom.adminStudentsSearchInput?.addEventListener('input', () => {
    debounceAdminTask('adminStudentsSearchDebounceTimer', handleAdminStudentsCriteriaChange);
  });
  dom.adminStudentsClassFilter?.addEventListener('change', handleAdminStudentsCriteriaChange);
  dom.adminStudentsTeacherFilter?.addEventListener('change', handleAdminStudentsCriteriaChange);

  dom.adminStudentsClearFiltersBtn?.addEventListener('click', () => {
    if (dom.adminStudentsSearchInput) {
      dom.adminStudentsSearchInput.value = '';
    }
    if (dom.adminStudentsClassFilter) {
      dom.adminStudentsClassFilter.value = '';
    }
    if (dom.adminStudentsTeacherFilter) {
      dom.adminStudentsTeacherFilter.value = '';
    }
    state.adminStudentsRegistryPage = 1;
    updateAdminStudentsFilterControls();
    if (state.adminStudentsRegistryLoaded) {
      updateAdminStudentsView();
    }
    dom.adminStudentsSearchInput?.focus();
  });

  dom.adminStudentsPrevPageBtn?.addEventListener('click', () => {
    if (state.adminStudentsRegistryPage <= 1) {
      return;
    }

    state.adminStudentsRegistryPage -= 1;
    updateAdminStudentsView();
  });

  dom.adminStudentsNextPageBtn?.addEventListener('click', () => {
    state.adminStudentsRegistryPage += 1;
    updateAdminStudentsView();
  });

  dom.adminStudentsTableBody?.addEventListener('click', async (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-admin-student-delete="true"]') : null;
    if (!(trigger instanceof HTMLButtonElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deletePayload = {
      ownerId: trigger.dataset.ownerId || '',
      studentId: trigger.dataset.studentId || '',
      studentName: trigger.dataset.studentName || ''
    };
    const deleteRequestState = buildAdminRegistryStudentDeleteRequestState({
      ...deletePayload,
      canDelete: canDeleteAdminRegistryStudents(state.currentRole)
    });
    const previousLabel = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = deleteRequestState.progressLabel;
    try {
      await handleAdminRegistryStudentDelete(deletePayload);
    } finally {
      if (trigger.isConnected) {
        trigger.disabled = false;
        trigger.textContent = previousLabel || 'Delete';
      }
    }
  });

  dom.sidebarButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setAdminStudentsRegistryVisibility(false);
    }, true);
  });

  dom.refreshBtn?.addEventListener('click', () => {
    state.adminStudentsRegistryLoaded = false;
    state.adminStudentsRegistryPage = 1;
    if (!dom.adminStudentsView?.classList.contains('hidden')) {
      loadAdminStudentsRegistry().catch((error) => {
        console.error('Failed to refresh global student registry:', error);
      });
    }
  });

  updateAdminStudentsFilterControls();
};

document.addEventListener('DOMContentLoaded', () => {
  initAdminStudentsRegistryView();
});