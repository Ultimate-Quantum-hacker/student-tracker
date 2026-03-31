import {
  isFirebaseConfigured,
  db,
  getDocs,
  collectionGroup
} from './firebase.js';
import {
  waitForInitialAuthState,
  resolveUserRole,
  normalizeUserRole,
  logoutUser,
  formatAuthError
} from './auth.js';
import {
  fetchAdminGlobalStats,
  fetchActivityLogs,
  fetchAdminUsers,
  deleteAdminRegistryStudent,
  clearActivityLogs,
  updateAdminUserRole,
  fetchGlobalStudentSearchIndex,
  setCurrentUserRoleContext
} from '../services/db.js';
import { createRuntimeCache } from './admin-runtime-cache.js';
import {
  escapeHtml,
  normalizeText,
  normalizeDisplayText,
  normalizeCount,
  prefersReducedMotion,
  buildIdentityMarkup,
  formatRoleLabel,
  getRoleBadgeClass,
  formatCreatedAt,
  formatTimeOfDay,
  formatTargetIdentifier,
  formatActionLabel
} from './admin-display-utils.js';

const DASHBOARD_PATH = '/index.html';
const LOGIN_PATH = '/login.html';
const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const ROLE_STUDENT = 'student';
const UPDATABLE_ROLES = [ROLE_TEACHER, ROLE_ADMIN];
const THEME_STORAGE_KEY = 'theme';
const ADMIN_STUDENTS_PAGE_SIZE = 50;
const ADMIN_STUDENTS_TABLE_COLUMN_COUNT = 4;
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
  activityUserFilter: document.getElementById('activity-user-filter'),
  activityClassFilter: document.getElementById('activity-class-filter'),
  activityActionFilter: document.getElementById('activity-action-filter'),
  activitySortFilter: document.getElementById('activity-sort-filter'),
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
const canManageRoles = () => state.currentRole === ROLE_DEVELOPER;
const isAdminOnlyRole = () => state.currentRole === ROLE_ADMIN;
const canDeleteAdminStudents = () => state.currentRole === ROLE_ADMIN || state.currentRole === ROLE_DEVELOPER;

const updateLastUpdatedIndicator = () => {
  if (!dom.lastUpdated) return;
  if (!state.lastUpdatedAt) {
    dom.lastUpdated.textContent = 'Last updated: just now';
    return;
  }

  const diffMs = Date.now() - state.lastUpdatedAt;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) {
    dom.lastUpdated.textContent = 'Last updated: just now';
    return;
  }
  if (diffMinutes === 1) {
    dom.lastUpdated.textContent = 'Last updated: 1 minute ago';
    return;
  }
  dom.lastUpdated.textContent = `Last updated: ${diffMinutes} minutes ago`;
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
  const normalizedUid = normalizeText(uid);
  return state.users.find((entry) => entry.uid === normalizedUid) || null;
};

const getVisibleUsers = () => {
  if (!isAdminOnlyRole()) {
    return state.users.slice();
  }
  return state.users.filter((entry) => normalizeUserRole(entry.role) !== ROLE_DEVELOPER);
};

const getFilteredUsers = () => {
  const searchTerm = normalizeText(dom.searchInput?.value || '').toLowerCase();
  const source = getVisibleUsers();
  if (!searchTerm) {
    return source;
  }
  return source.filter((record) => {
    const name = String(record.name || '').toLowerCase();
    const email = String(record.email || '').toLowerCase();
    return name.includes(searchTerm) || email.includes(searchTerm);
  });
};

const canEditRole = (record) => {
  if (!canManageRoles()) return false;
  const normalizedRole = normalizeUserRole(record?.role);
  if (!record?.uid) return false;
  if (normalizedRole === ROLE_DEVELOPER) return false;
  return true;
};

const buildRoleSelect = (record) => {
  const normalizedRole = normalizeUserRole(record?.role);

  const select = document.createElement('select');
  select.className = 'role-select';
  select.dataset.userId = record.uid;
  select.setAttribute('aria-label', `Select role for ${record.email || 'teacher'}`);

  const options = normalizedRole === ROLE_DEVELOPER ? [ROLE_DEVELOPER] : UPDATABLE_ROLES;
  options.forEach((role) => {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = formatRoleLabel(role);
    option.selected = role === normalizedRole;
    select.appendChild(option);
  });

  if (!canEditRole(record)) {
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

const renderUsersTable = () => {
  if (!dom.tableBody) return;
  const filteredUsers = getFilteredUsers();
  if (!filteredUsers.length) {
    dom.tableBody.innerHTML = '<tr><td colspan="5" class="empty-row"><div class="smart-empty"><span>👤</span><p>No matching users found.</p></div></td></tr>';
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
    const accountSummary = normalizeUserRole(record.role) === ROLE_DEVELOPER
      ? 'Protected system account'
      : 'Workspace member';

    const nameCell = document.createElement('td');
    nameCell.innerHTML = buildIdentityMarkup({
      label: userLabel,
      secondary: accountSummary,
      role: record.role
    });

    const emailCell = document.createElement('td');
    emailCell.className = 'email-cell';
    emailCell.innerHTML = `
      <div class="email-stack">
        <strong>${escapeHtml(userEmail)}</strong>
        <span>${escapeHtml(canEditRole(record) ? 'Role can be updated' : 'Role editing unavailable')}</span>
      </div>
    `;

    const roleCell = document.createElement('td');
    const roleWrap = document.createElement('div');
    roleWrap.className = 'role-cell-wrap';
    const badge = document.createElement('span');
    badge.className = `inline-role-badge ${getRoleBadgeClass(record.role)}`;
    badge.textContent = formatRoleLabel(record.role);
    roleWrap.appendChild(badge);
    const roleSelectShell = document.createElement('div');
    roleSelectShell.className = 'input-shell role-select-shell search-container select-container';
    roleSelectShell.appendChild(buildRoleSelect(record));
    roleWrap.appendChild(roleSelectShell);
    roleCell.appendChild(roleWrap);

    const createdCell = document.createElement('td');
    createdCell.innerHTML = `
      <div class="table-meta-stack">
        <strong>${escapeHtml(formatCreatedAt(record.createdAt))}</strong>
        <span>Account created</span>
      </div>
    `;

    const actionCell = document.createElement('td');
    const actionWrap = document.createElement('div');
    actionWrap.className = 'table-actions-cell';

    if (canManageRoles()) {
      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.className = 'btn btn-primary';
      updateBtn.dataset.action = 'update-role';
      updateBtn.dataset.userId = record.uid;
      updateBtn.textContent = 'Update Role';
      if (!canEditRole(record)) {
        updateBtn.disabled = true;
        updateBtn.title = normalizeUserRole(record?.role) === ROLE_DEVELOPER
          ? 'Developer role cannot be changed here'
          : 'Role update is not allowed for this account';
      }
      actionWrap.appendChild(updateBtn);
    } else {
      actionWrap.innerHTML = '<span class="table-helper-text">View only</span>';
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

const getActionTone = (action = '') => {
  const normalized = normalizeText(action).toLowerCase();
  if (normalized.includes('delete') || normalized.includes('removed')) {
    return { className: 'activity-delete', verb: 'deleted' };
  }
  if (normalized.includes('update') || normalized.includes('edited') || normalized.includes('changed')) {
    return { className: 'activity-update', verb: 'updated' };
  }
  return { className: 'activity-add', verb: 'added' };
};

const resolveLegacyActivityStudentName = (entry = {}) => {
  const targetType = normalizeDisplayText(entry.targetType || '', '').toLowerCase();
  const action = normalizeDisplayText(entry.action || '', '').toLowerCase();
  if (targetType && targetType !== 'student' && !action.includes('student')) {
    return '';
  }

  const studentId = normalizeDisplayText(entry.studentId || entry.targetId || '', '');
  if (!studentId) {
    return '';
  }

  const ownerId = normalizeDisplayText(entry.ownerId || entry.dataOwnerUserId || '', '');
  const classId = normalizeDisplayText(entry.classId || '', '');

  const searchMatch = state.globalSearchIndex.find((candidate) => {
    const candidateId = normalizeDisplayText(candidate?.id || '', '');
    if (!candidateId || candidateId !== studentId) {
      return false;
    }

    const candidateOwnerId = normalizeDisplayText(candidate?.userId || candidate?.ownerId || '', '');
    if (ownerId && candidateOwnerId && candidateOwnerId !== ownerId) {
      return false;
    }

    const candidateClassId = normalizeDisplayText(candidate?.classId || '', '');
    if (classId && candidateClassId && candidateClassId !== classId) {
      return false;
    }

    return true;
  });
  if (searchMatch?.name) {
    return normalizeDisplayText(searchMatch.name, '');
  }

  const registryMatch = state.adminStudentsRegistry.find((candidate) => {
    const candidateId = normalizeDisplayText(candidate?.studentId || candidate?.id || '', '');
    if (!candidateId || candidateId !== studentId) {
      return false;
    }

    const candidateOwnerId = normalizeDisplayText(candidate?.ownerId || '', '');
    if (ownerId && candidateOwnerId && candidateOwnerId !== ownerId) {
      return false;
    }

    const candidateClassId = normalizeDisplayText(candidate?.classId || '', '');
    if (classId && candidateClassId && candidateClassId !== classId) {
      return false;
    }

    return true;
  });

  return normalizeDisplayText(registryMatch?.studentName || registryMatch?.name || '', '');
};

const formatTargetLabel = (entry = {}) => {
  const targetType = normalizeDisplayText(entry.targetType || 'record', 'record').toLowerCase();
  const resolvedStudentName = resolveLegacyActivityStudentName(entry);
  const targetLabel = normalizeDisplayText(entry.targetLabel || entry.studentName || resolvedStudentName || '', '');
  const targetId = formatTargetIdentifier(entry.targetId || '');
  const readableType = targetType
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'record';
  if (targetLabel) return `${readableType}: ${targetLabel}`;
  if (!targetId) return readableType;
  return `${readableType}: ${targetId}`;
};

const getEntryClassFilterKey = (entry = {}) => {
  const classId = normalizeText(entry.classId || '');
  const ownerId = normalizeText(entry.ownerId || entry.dataOwnerUserId || '');
  if (!classId) {
    return '';
  }
  return `${ownerId}::${classId}`;
};

const formatClassDisplayLabel = (entry = {}) => {
  const className = normalizeDisplayText(entry.className || '', '');
  const classId = normalizeDisplayText(entry.classId || '', '');
  const ownerName = normalizeDisplayText(entry.ownerName || '', '');
  const baseClassLabel = className || classId || 'Unknown class';

  if (ownerName) {
    return `${baseClassLabel} — ${ownerName}`;
  }
  return baseClassLabel;
};

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatDateLabel = (value) => {
  const parsed = toDateValue(value);
  if (!parsed) return 'Unknown date';
  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const getActionIcon = (toneClass = '') => {
  if (toneClass === 'activity-delete') return '−';
  if (toneClass === 'activity-update') return '↻';
  return '+';
};

const getDateGroupKey = (timestamp) => {
  const dateValue = toDateValue(timestamp);
  if (!dateValue) return 'earlier';

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(start);
  yesterdayStart.setDate(start.getDate() - 1);

  if (dateValue >= start) return 'today';
  if (dateValue >= yesterdayStart) return 'yesterday';
  return 'earlier';
};

const getDateGroupLabel = (key) => {
  if (key === 'today') return 'Today';
  if (key === 'yesterday') return 'Yesterday';
  return 'Earlier';
};

const getVisibleActivityEntries = (entries = []) => {
  if (!isAdminOnlyRole()) {
    return entries;
  }
  return entries.filter((entry) => {
    const actor = findUserRecord(entry.userId);
    const owner = findUserRecord(entry.dataOwnerUserId);
    const actorRole = normalizeUserRole(actor?.role);
    const ownerRole = normalizeUserRole(owner?.role);
    return actorRole !== ROLE_DEVELOPER && ownerRole !== ROLE_DEVELOPER;
  });
};

const populateActivityClassFilter = (entries = []) => {
  if (!dom.activityClassFilter) return;

  const previousSelection = normalizeText(dom.activityClassFilter.value || '');
  const classOptions = new Map();
  getVisibleActivityEntries(entries).forEach((entry) => {
    const classKey = getEntryClassFilterKey(entry);
    if (!classKey) return;
    if (classOptions.has(classKey)) return;
    classOptions.set(classKey, formatClassDisplayLabel(entry));
  });

  const sortedOptions = Array.from(classOptions.entries())
    .sort((a, b) => String(a[1] || '').localeCompare(String(b[1] || '')));

  const optionMarkup = ['<option value="">All classes</option>'];
  sortedOptions.forEach(([key, label]) => {
    optionMarkup.push(`<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`);
  });

  dom.activityClassFilter.innerHTML = optionMarkup.join('');
  dom.activityClassFilter.value = classOptions.has(previousSelection) ? previousSelection : '';
};

const renderActivityLogTable = (entries = []) => {
  if (!dom.activityBody) return;
  const visibleEntries = getVisibleActivityEntries(entries);
  if (!visibleEntries.length) {
    dom.activityBody.innerHTML = '<tr><td colspan="5" class="empty-row"><div class="smart-empty"><span>🧾</span><p>No activity recorded.</p></div></td></tr>';
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
      ${shouldRenderGroup ? `<tr class="activity-group-row"><td colspan="5">${getDateGroupLabel(groupKey)}</td></tr>` : ''}
      <tr class="activity-row ${actionTone.className} fade-in">
        <td title="${escapeHtml(timestampTitle)}">
          <div class="activity-time-cell">
            <strong>${escapeHtml(timeLabel)}</strong>
            <span>${escapeHtml(formatDateLabel(entry.timestamp))}</span>
          </div>
        </td>
        <td>
          <div class="activity-event-cell">
            <span class="activity-event-icon ${actionTone.className}" aria-hidden="true">${escapeHtml(getActionIcon(actionTone.className))}</span>
            <div class="activity-event-copy">
              <span class="activity-tag ${actionTone.className}">${escapeHtml(actionLabel)}</span>
              <strong>${escapeHtml(actorLabel)}</strong>
              <span class="activity-sentence">${escapeHtml(sentence)}</span>
            </div>
          </div>
        </td>
        <td><span class="inline-role-badge ${getRoleBadgeClass(actorRole)}">${escapeHtml(formatRoleLabel(actorRole))}</span></td>
        <td>${buildIdentityMarkup({
          label: ownerLabel,
          secondary: '',
          role: ownerRole,
          containerClass: 'activity-owner-cell',
          copyClass: 'activity-owner-copy'
        })}</td>
        <td title="${escapeHtml(normalizeDisplayText(entry.classId || '', ''))}"><span class="class-token">${escapeHtml(classCellLabel || '—')}</span></td>
      </tr>
    `;
  }).join('');
};

const renderGlobalSearchResults = (entries = []) => {
  if (!dom.globalSearchResultsBody) return;
  if (!entries.length) {
    const emptyMessage = normalizeText(dom.globalSearchInput?.value || '')
      ? 'No search results found.'
      : 'Search by student name to see results.';
    dom.globalSearchResultsBody.innerHTML = `<tr><td colspan="4" class="empty-row"><div class="smart-empty"><span>🔎</span><p>${escapeHtml(emptyMessage)}</p></div></td></tr>`;
    return;
  }

  dom.globalSearchResultsBody.innerHTML = entries.map((entry) => {
    const owner = findUserRecord(entry.userId);
    const studentLabel = normalizeDisplayText(entry.name || '', 'Student');
    const ownerLabel = normalizeDisplayText(owner?.name || owner?.email || '', 'Unknown owner');
    const ownerRole = normalizeUserRole(owner?.role || entry.userRole || 'teacher');
    const classLabel = normalizeDisplayText(entry.className || entry.classId || '', '—');
    return `
      <tr class="fade-in">
        <td>${buildIdentityMarkup({ label: studentLabel, role: 'student' })}</td>
        <td>${buildIdentityMarkup({
          label: ownerLabel,
          secondary: 'Data owner',
          role: ownerRole,
          containerClass: 'activity-owner-cell',
          copyClass: 'activity-owner-copy'
        })}</td>
        <td><span class="inline-role-badge ${getRoleBadgeClass(ownerRole)}">${escapeHtml(formatRoleLabel(ownerRole))}</span></td>
        <td><span class="class-token" title="${escapeHtml(normalizeDisplayText(entry.classId || '', ''))}">${escapeHtml(classLabel)}</span></td>
      </tr>
    `;
  }).join('');
};

const populateActivityUserFilter = () => {
  if (!dom.activityUserFilter) return;
  const selectedValue = normalizeText(dom.activityUserFilter.value || '');
  const options = ['<option value="">All users</option>'];

  getVisibleUsers().forEach((record) => {
    const label = `${record.name || record.email || 'Unknown user'} (${formatRoleLabel(record.role)})`;
    options.push(`<option value="${escapeHtml(record.uid)}">${escapeHtml(label)}</option>`);
  });

  dom.activityUserFilter.innerHTML = options.join('');
  const stillExists = getVisibleUsers().some((record) => record.uid === selectedValue);
  dom.activityUserFilter.value = stillExists ? selectedValue : '';
};

const fetchUsers = async () => {
  if (!isFirebaseConfigured) {
    setPanelStatus('Firebase is not configured. User management is unavailable.', 'error');
    setElementVisibility(dom.usersLoading, false);
    setSectionLoadingState(dom.usersSection, false);
    return;
  }

  setElementVisibility(dom.usersLoading, true);
  setSectionLoadingState(dom.usersSection, true);
  setPanelStatus('Loading users...');

  try {
    const cachedRecords = readAdminRuntimeCache('users');
    if (Array.isArray(cachedRecords)) {
      state.users = cachedRecords;
      state.usersLoaded = true;
      renderUsersTable();
      populateActivityUserFilter();
      setPanelStatus(`Loaded ${getVisibleUsers().length} user${getVisibleUsers().length === 1 ? '' : 's'}.`, 'success');
      markUpdatedNow();
      return state.users;
    }

    const records = await fetchAdminUsers();
    state.users = Array.isArray(records) ? records : [];
    state.usersLoaded = true;
    writeAdminRuntimeCache('users', state.users);
    renderUsersTable();
    populateActivityUserFilter();
    setPanelStatus(`Loaded ${getVisibleUsers().length} user${getVisibleUsers().length === 1 ? '' : 's'}.`, 'success');
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to fetch users:', error);
    state.usersLoaded = false;
    invalidateAdminRuntimeCache('users');
    if (isPermissionDeniedError(error)) {
      setPanelStatus('Permission denied while loading users.', 'error');
      showToast('Permission denied', 'error');
      return;
    }
    setPanelStatus(`Failed to load users: ${formatAuthError(error)}`, 'error');
    showToast('Failed to load users', 'error');
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
    state.globalStats = {
      totalUsers: getVisibleUsers().length,
      totalStudents: 0,
      totalExams: 0
    };
    invalidateAdminRuntimeCache('globalStats');
    showToast('Failed to load global stats', 'error');
  } finally {
    renderStats();
    setSectionLoadingState(dom.overviewSection, false);
  }
};

const shouldIncludeGlobalSearchOwner = (userId = '') => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return false;
  }

  if (!isAdminOnlyRole()) {
    return true;
  }

  const owner = findUserRecord(normalizedUserId);
  return normalizeUserRole(owner?.role) !== ROLE_DEVELOPER;
};

const buildGlobalSearchIndex = async () => {
  if (!isFirebaseConfigured) {
    state.globalSearchIndex = [];
    state.globalSearchIndexLoaded = false;
    renderGlobalSearchResults([]);
    setGlobalSearchStatus('Global search unavailable: Firebase is not configured.', 'error');
    setSectionLoadingState(dom.searchSection, false);
    return;
  }

  setElementVisibility(dom.globalSearchLoading, true);
  setSectionLoadingState(dom.searchSection, true);
  setGlobalSearchStatus('Building global search index...');

  try {
    if (!state.usersLoaded) {
      await fetchUsers();
    }

    const cachedRows = readAdminRuntimeCache('globalSearchIndex');
    if (Array.isArray(cachedRows)) {
      state.globalSearchIndex = cachedRows;
      state.globalSearchIndexLoaded = true;
      state.globalStats = {
        ...state.globalStats,
        totalStudents: cachedRows.length
      };
      renderStats();
      setGlobalSearchStatus(`Indexed ${cachedRows.length} student${cachedRows.length === 1 ? '' : 's'} for global search.`, 'success');
      renderGlobalSearchResults([]);
      markUpdatedNow();
      return state.globalSearchIndex;
    }

    let rows = await fetchGlobalStudentSearchIndex();
    rows = Array.isArray(rows)
      ? rows.filter((entry) => shouldIncludeGlobalSearchOwner(entry?.userId))
      : [];
    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    state.globalSearchIndex = rows;
    state.globalSearchIndexLoaded = true;
    writeAdminRuntimeCache('globalSearchIndex', rows);
    state.globalStats = {
      ...state.globalStats,
      totalStudents: rows.length
    };
    renderStats();
    setGlobalSearchStatus(`Indexed ${rows.length} student${rows.length === 1 ? '' : 's'} for global search.`, 'success');
    renderGlobalSearchResults([]);
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to build global search index:', error);
    state.globalSearchIndex = [];
    state.globalSearchIndexLoaded = false;
    invalidateAdminRuntimeCache('globalSearchIndex');
    renderGlobalSearchResults([]);
    if (isPermissionDeniedError(error)) {
      setGlobalSearchStatus('Search unavailable due to permissions.', 'error');
      showToast('Search unavailable due to permissions', 'warning');
      return;
    }
    setGlobalSearchStatus(`Failed to build search index: ${formatAuthError(error)}`, 'error');
    showToast('Failed to load global search', 'error');
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
    state.globalSearchResults = [];
    renderGlobalSearchResults([]);
    setGlobalSearchStatus(state.globalSearchIndexLoaded ? 'Search by student name to see results.' : 'Search by student name to load results.');
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
    state.globalSearchResults = [];
    renderGlobalSearchResults([]);
    setGlobalSearchStatus('Search by student name to see results.');
    return;
  }

  const results = state.globalSearchIndex.filter((entry) => String(entry.name || '').toLowerCase().includes(term));
  state.globalSearchResults = results;
  renderGlobalSearchResults(results);
  setGlobalSearchStatus(`Found ${results.length} result${results.length === 1 ? '' : 's'}.`, results.length ? 'success' : 'warning');
};

const loadActivityLogs = async () => {
  const selectedUserId = normalizeText(dom.activityUserFilter?.value || '');
  const selectedClassKey = normalizeText(dom.activityClassFilter?.value || '');
  const selectedAction = normalizeText(dom.activityActionFilter?.value || '').toLowerCase();
  const selectedSort = normalizeText(dom.activitySortFilter?.value || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const activityLogsCacheKey = buildActivityLogsCacheKey({ userId: selectedUserId, sort: selectedSort });

  setElementVisibility(dom.activityLoading, true);
  setSectionLoadingState(dom.activitySection, true);
  setActivityStatus('Loading activity logs...');

  try {
    if (!state.usersLoaded) {
      await fetchUsers();
    }

    let entries = readAdminRuntimeCache('activityLogs', activityLogsCacheKey);
    if (!Array.isArray(entries)) {
      entries = await fetchActivityLogs({
        userId: selectedUserId,
        sort: selectedSort,
        maxEntries: 100
      });
      writeAdminRuntimeCache('activityLogs', Array.isArray(entries) ? entries : [], activityLogsCacheKey);
    }

    if (selectedAction) {
      entries = entries.filter((entry) => String(entry.action || '').trim().toLowerCase() === selectedAction);
    }

    populateActivityClassFilter(entries);

    if (selectedClassKey) {
      entries = entries.filter((entry) => getEntryClassFilterKey(entry) === selectedClassKey);
    }

    state.activityLogs = entries;
    state.activityLogsLoaded = true;
    renderActivityLogTable(entries);
    const visibleCount = getVisibleActivityEntries(entries).length;
    setActivityStatus(`Loaded ${visibleCount} log entr${visibleCount === 1 ? 'y' : 'ies'}.`, 'success');
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to load activity logs:', error);
    state.activityLogs = [];
    state.activityLogsLoaded = false;
    invalidateAdminRuntimeCache('activityLogs');
    renderActivityLogTable([]);
    if (isPermissionDeniedError(error)) {
      setActivityStatus('Access denied. You do not have permission to read activity logs.', 'error');
      showToast('Permission denied', 'error');
      return;
    }
    setActivityStatus(`Failed to load activity logs: ${formatAuthError(error)}`, 'error');
    showToast('Failed to load activity logs', 'error');
  } finally {
    setElementVisibility(dom.activityLoading, false);
    setSectionLoadingState(dom.activitySection, false);
  }
};

const handleClearActivityLogs = async () => {
  const shouldContinue = await requestConfirmation({
    message: 'Clear all activity logs? This permanently removes the current log history.',
    confirmLabel: 'Clear Logs',
    dangerous: true
  });

  if (!shouldContinue) {
    setActivityStatus('Log clear canceled.', 'warning');
    return;
  }

  setElementVisibility(dom.activityLoading, true);
  setSectionLoadingState(dom.activitySection, true);
  setActivityStatus('Clearing activity logs...');

  try {
    const clearedCount = await clearActivityLogs();
    state.activityLogs = [];
    state.activityLogsLoaded = false;
    invalidateAdminRuntimeCache('activityLogs');
    renderActivityLogTable([]);
    populateActivityClassFilter([]);
    setActivityStatus(
      clearedCount
        ? `Cleared ${clearedCount} log entr${clearedCount === 1 ? 'y' : 'ies'}.`
        : 'No activity logs to clear.',
      clearedCount ? 'success' : 'warning'
    );
    showToast(clearedCount ? 'Activity logs cleared' : 'No activity logs to clear', clearedCount ? 'success' : 'warning');
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to clear activity logs:', error);
    if (isPermissionDeniedError(error)) {
      setActivityStatus('Access denied. You do not have permission to clear activity logs.', 'error');
      showToast('Permission denied', 'error');
      return;
    }
    setActivityStatus(`Failed to clear activity logs: ${formatAuthError(error)}`, 'error');
    showToast('Failed to clear activity logs', 'error');
  } finally {
    setElementVisibility(dom.activityLoading, false);
    setSectionLoadingState(dom.activitySection, false);
  }
};

const updateUserRole = async (uid, nextRole) => {
  const record = findUserRecord(uid);
  if (!record) {
    setPanelStatus('Unable to find selected user.', 'error');
    return;
  }
  if (!canManageRoles()) {
    setPanelStatus('Only developers can update roles in this panel.', 'warning');
    return;
  }

  const normalizedNextRole = normalizeUserRole(nextRole);
  const currentRole = normalizeUserRole(record.role);

  if (!UPDATABLE_ROLES.includes(normalizedNextRole)) {
    setPanelStatus('Only teacher and admin roles can be assigned in this panel.', 'warning');
    return;
  }

  if (currentRole === normalizedNextRole) {
    setPanelStatus('No role changes to apply.', 'warning');
    return;
  }

  const shouldContinue = await requestConfirmation({
    message: `Change role for ${record.name || record.email || 'this user'} from ${formatRoleLabel(currentRole)} to ${formatRoleLabel(normalizedNextRole)}?`,
    confirmLabel: 'Update Role',
    dangerous: true
  });

  if (!shouldContinue) {
    setPanelStatus('Role change canceled.', 'warning');
    return;
  }

  try {
    setPanelStatus('Updating role...');
    await updateAdminUserRole({
      uid,
      name: normalizeText(record.name || ''),
      email: normalizeText(record.email || '').toLowerCase(),
      role: normalizedNextRole
    });

    record.role = normalizedNextRole;
    renderUsersTable();
    populateActivityUserFilter();
    setPanelStatus('Role updated successfully.', 'success');
    showToast('Role updated successfully', 'success');
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to update role:', error);
    if (isPermissionDeniedError(error)) {
      setPanelStatus('Access denied. You do not have permission.', 'error');
      showToast('Permission denied', 'error');
      return;
    }
    setPanelStatus(`Failed to update role: ${formatAuthError(error)}`, 'error');
    showToast('Failed to update role', 'error');
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

const buildActivityLogsCacheKey = ({ userId = '', sort = 'desc' } = {}) => {
  const normalizedUserId = normalizeText(userId);
  const normalizedSort = normalizeText(sort).toLowerCase() === 'asc' ? 'asc' : 'desc';
  return `${normalizedUserId}::${normalizedSort}`;
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
    showToast('Panel refreshed', 'success');
  });

  dom.refreshActivityBtn?.addEventListener('click', async () => {
    invalidateAdminRuntimeCache('activityLogs');
    await loadActivityLogs();
  });

  dom.clearActivityBtn?.addEventListener('click', async () => {
    await handleClearActivityLogs();
  });

  dom.activityUserFilter?.addEventListener('change', async () => {
    await loadActivityLogs();
  });

  dom.activityClassFilter?.addEventListener('change', async () => {
    await loadActivityLogs();
  });

  dom.activityActionFilter?.addEventListener('change', async () => {
    await loadActivityLogs();
  });

  dom.activitySortFilter?.addEventListener('change', async () => {
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
    const previousLabel = dom.logoutBtn.textContent;
    dom.logoutBtn.disabled = true;
    dom.logoutBtn.textContent = 'Signing out...';
    try {
      await logoutUser();
      redirectToLogin();
    } catch (error) {
      setPanelStatus(`Logout failed: ${formatAuthError(error)}`, 'error');
      showToast('Logout failed', 'error');
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
    if (action !== 'update-role') return;
    const roleSelect = trigger.closest('tr')?.querySelector('select.role-select');
    const nextRole = normalizeText(roleSelect?.value || '');
    if (!nextRole) return;

    trigger.disabled = true;
    const previousLabel = trigger.textContent;
    trigger.textContent = 'Updating...';
    await updateUserRole(uid, nextRole);
    trigger.textContent = previousLabel;
    trigger.disabled = !canEditRole(findUserRecord(uid));
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
      renderGlobalSearchResults([]);
      setGlobalSearchStatus('Search by student name to load results.');
    }

    if (!state.activityLogsLoaded) {
      renderActivityLogTable([]);
      populateActivityClassFilter([]);
      setActivityStatus('Open this section or use refresh to load activity logs.');
    }

    showToast('Admin panel ready', 'success');
  } catch (error) {
    console.error('Failed to initialize admin panel:', error);

    setPanelStatus(`Failed to initialize panel: ${formatAuthError(error)}`, 'error');
    showToast('Failed to initialize admin panel', 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function fetchAllStudentsGlobal() {
  if (!isFirebaseConfigured || !db) {
    return [];
  }
  const snapshot = await getDocs(collectionGroup(db, 'students'));
  const dedupedStudents = new Map();

  snapshot.forEach((entry) => {
    const data = entry.data() || {};
    if (data.deleted === true) {
      return;
    }
    const parsedPath = parseAdminRegistryStudentPath(entry.ref?.path);
    if (!parsedPath.isSupportedPath) {
      return;
    }
    const ownerId = normalizeDisplayText(parsedPath.ownerId || data.ownerId || data.userId || '', '');

    const classId = normalizeDisplayText(parsedPath.classId || data.classId || '', '');
    const className = normalizeDisplayText(data.className || data.class || '', '');
    const studentId = normalizeDisplayText(data.id || parsedPath.studentDocId || '', '');
    const identityKey = buildAdminRegistryStudentIdentityKey(ownerId, studentId);

    if (!identityKey) {
      return;
    }

    const candidate = {
      ...data,
      id: studentId,
      ownerId,
      classId,
      className,
      isClassScoped: Boolean(classId || parsedPath.isClassScoped)
    };

    const current = dedupedStudents.get(identityKey) || null;
    dedupedStudents.set(identityKey, pickPreferredAdminRegistryStudentRecord(current, candidate));
  });

  return Array.from(dedupedStudents.values()).map((student) => {
    const { isClassScoped, ...nextStudent } = student;
    return nextStudent;
  });
}

const parseAdminRegistryStudentPath = (path = '') => {
  const segments = String(path || '').split('/').filter(Boolean);
  const isLegacyRootScoped = segments.length === 4
    && segments[0] === 'users'
    && segments[2] === 'students';
  const isClassScoped = segments.length === 6
    && segments[0] === 'users'
    && segments[2] === 'classes'
    && segments[4] === 'students';
  const isSupportedPath = isLegacyRootScoped || isClassScoped;

  return {
    ownerId: normalizeDisplayText(isSupportedPath ? segments[1] : '', ''),
    classId: isClassScoped ? normalizeDisplayText(segments[3], '') : '',
    studentDocId: normalizeDisplayText(
      isLegacyRootScoped
        ? segments[3]
        : isClassScoped
          ? segments[5]
          : '',
      ''
    ),
    isClassScoped,
    isSupportedPath
  };
};

const buildAdminRegistryStudentIdentityKey = (ownerId = '', studentId = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedStudentId = normalizeDisplayText(studentId, '');
  if (!normalizedOwnerId || !normalizedStudentId) {
    return '';
  }

  return `${normalizedOwnerId}::${normalizedStudentId}`;
};

const pickPreferredAdminRegistryStudentRecord = (current = null, candidate = null) => {
  if (!candidate) {
    return current;
  }

  if (!current) {
    return candidate;
  }

  if (candidate.isClassScoped && !current.isClassScoped) {
    return candidate;
  }

  if (current.isClassScoped && !candidate.isClassScoped) {
    return current;
  }

  if (!current.classId && candidate.classId) {
    return candidate;
  }

  if (!current.className && candidate.className) {
    return candidate;
  }

  return current;
};

const buildAdminRegistryClassKey = (ownerId = '', classId = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassId = normalizeDisplayText(classId, '');
  if (!normalizedOwnerId || !normalizedClassId) {
    return '';
  }

  return `${normalizedOwnerId}::${normalizedClassId}`;
};

const buildAdminRegistryFallbackClassKey = (ownerId = '', className = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassName = normalizeDisplayText(className, '').toLowerCase();
  if (!normalizedOwnerId || !normalizedClassName) {
    return '';
  }

  return `${normalizedOwnerId}::fallback::${normalizedClassName}`;
};

const resolveAdminRegistryTeacherName = (ownerId = '', classInfo = null, student = {}) => {
  const ownerRecord = findUserRecord(ownerId);
  return normalizeDisplayText(
    classInfo?.ownerName || student.ownerName || student.teacherName || ownerRecord?.name || ownerRecord?.email || '',
    'Unknown Teacher'
  );
};

async function fetchAdminClassNameMap() {
  if (!isFirebaseConfigured || !db) {
    return new Map();
  }

  const snapshot = await getDocs(collectionGroup(db, 'classes'));
  const classMap = new Map();
  snapshot.forEach((entry) => {
    const payload = entry.data() || {};

    if (payload.deleted === true) {
      return;
    }

    const path = String(entry.ref?.path || '').split('/').filter(Boolean);
    const ownerId = normalizeDisplayText(path[0] === 'users' ? path[1] : '', '');
    const classId = normalizeDisplayText(path[2] === 'classes' ? path[3] : entry.id || '', '');
    const classKey = buildAdminRegistryClassKey(ownerId, classId);
    if (!classKey) {
      return;
    }

    classMap.set(classKey, {
      name: normalizeDisplayText(payload.name || payload.className || payload.title || '', 'Unnamed Class'),
      ownerId,
      ownerName: resolveAdminRegistryTeacherName(ownerId, {
        ownerName: payload.ownerName || payload.teacherName || ''
      })
    });
  });
  return classMap;
}

const resolveAdminRegistryClassInfoByName = (classMap = new Map(), ownerId = '', className = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassName = normalizeDisplayText(className, '').toLowerCase();
  if (!(classMap instanceof Map) || !normalizedOwnerId || !normalizedClassName) {
    return {
      classKey: '',
      classInfo: null
    };
  }

  for (const [classKey, classInfo] of classMap.entries()) {
    if (normalizeDisplayText(classInfo?.ownerId, '') !== normalizedOwnerId) {
      continue;
    }

    if (normalizeDisplayText(classInfo?.name, '').toLowerCase() !== normalizedClassName) {
      continue;
    }

    return {
      classKey,
      classInfo
    };
  }

  return {
    classKey: '',
    classInfo: null
  };
};

const getAdminRegistryOwnerClasses = (classMap = new Map(), ownerId = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  if (!(classMap instanceof Map) || !normalizedOwnerId) {
    return [];
  }

  const matches = [];
  for (const [classKey, classInfo] of classMap.entries()) {
    if (normalizeDisplayText(classInfo?.ownerId, '') !== normalizedOwnerId) {
      continue;
    }

    matches.push({
      classKey,
      classInfo
    });
  }

  return matches;
};

const resolveAdminRegistryClassInfo = (classMap = new Map(), ownerId = '', classId = '', className = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassId = normalizeDisplayText(classId, '');
  const normalizedClassName = normalizeDisplayText(className, '');
  if (!(classMap instanceof Map) || !normalizedOwnerId) {
    return {
      classKey: '',
      classInfo: null
    };
  }

  const directClassKey = buildAdminRegistryClassKey(normalizedOwnerId, normalizedClassId);
  const directClassInfo = classMap.get(directClassKey) || null;
  if (directClassInfo) {
    return {
      classKey: directClassKey,
      classInfo: directClassInfo
    };
  }

  const candidateNames = [normalizedClassName, normalizedClassId].filter(Boolean);
  for (const candidateName of candidateNames) {
    const resolvedByName = resolveAdminRegistryClassInfoByName(classMap, normalizedOwnerId, candidateName);
    if (resolvedByName.classInfo) {
      return resolvedByName;
    }
  }

  const ownerClasses = getAdminRegistryOwnerClasses(classMap, normalizedOwnerId);
  if (ownerClasses.length === 1) {
    return ownerClasses[0];
  }

  return {
    classKey: '',
    classInfo: null
  };
};

const mapAdminStudentRecord = (student = {}, classMap = new Map()) => {
  const ownerId = normalizeDisplayText(student.ownerId || student.userId || '', '');
  const studentClassName = normalizeDisplayText(student.className || student.class || '', '');
  const classId = normalizeDisplayText(student.classId || '', '');
  const resolvedClass = resolveAdminRegistryClassInfo(classMap, ownerId, classId, studentClassName);
  const classKey = resolvedClass.classKey || buildAdminRegistryFallbackClassKey(ownerId, studentClassName || classId);

  return {
    name: normalizeDisplayText(student.name, 'Unnamed'),
    ownerId,
    studentId: normalizeDisplayText(student.id || '', ''),
    classId,
    classKey,
    className: normalizeDisplayText(resolvedClass.classInfo?.name || studentClassName || '', 'Unknown Class'),
    teacherName: resolveAdminRegistryTeacherName(ownerId, resolvedClass.classInfo, student)
  };
};

const sortAdminStudentsRegistry = (students = []) => {
  const sortedStudents = [...students];
  sortedStudents.sort((a, b) => {
    const classCompare = String(a.className || '').localeCompare(String(b.className || ''), undefined, { sensitivity: 'base', numeric: true });
    if (classCompare !== 0) return classCompare;
    const teacherCompare = String(a.teacherName || '').localeCompare(String(b.teacherName || ''), undefined, { sensitivity: 'base', numeric: true });
    if (teacherCompare !== 0) return teacherCompare;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
  });
  return sortedStudents;
};

const getAdminStudentsFilterState = () => {
  const searchText = normalizeText(dom.adminStudentsSearchInput?.value || '');
  const selectedClass = normalizeText(dom.adminStudentsClassFilter?.value || '');
  const selectedTeacher = normalizeText(dom.adminStudentsTeacherFilter?.value || '');

  return {
    searchText,
    searchTerm: searchText.toLowerCase(),
    selectedClass,
    selectedTeacher,
    hasActiveCriteria: Boolean(searchText || selectedClass || selectedTeacher)
  };
};

const updateAdminStudentsFilterControls = () => {
  const { hasActiveCriteria } = getAdminStudentsFilterState();
  if (dom.adminStudentsClearFiltersBtn) {
    dom.adminStudentsClearFiltersBtn.disabled = !hasActiveCriteria;
  }
};

const renderAdminStudentsFilterOptions = (classMap = new Map(), students = []) => {
  const previousClass = normalizeText(dom.adminStudentsClassFilter?.value || '');
  const previousTeacher = normalizeText(dom.adminStudentsTeacherFilter?.value || '');
  const classEntries = new Map();
  const teacherEntries = new Map();

  const registerEntry = ({
    classKey = '',
    className = '',
    ownerId = '',
    teacherName = ''
  } = {}) => {
    const normalizedClassKey = normalizeDisplayText(classKey, '');
    const normalizedClassName = normalizeDisplayText(className, 'Unnamed Class');
    const normalizedOwnerId = normalizeDisplayText(ownerId, '');
    const normalizedTeacherName = normalizeDisplayText(teacherName, 'Unknown Teacher');

    if (normalizedClassKey && normalizedOwnerId && !classEntries.has(normalizedClassKey)) {
      classEntries.set(normalizedClassKey, {
        value: normalizedClassKey,
        className: normalizedClassName,
        ownerId: normalizedOwnerId,
        teacherName: normalizedTeacherName
      });
    }

    if (normalizedOwnerId && !teacherEntries.has(normalizedOwnerId)) {
      teacherEntries.set(normalizedOwnerId, {
        value: normalizedOwnerId,
        label: normalizedTeacherName
      });
    }
  };

  if (classMap instanceof Map) {
    classMap.forEach((classInfo, classKey) => {
      if (!shouldIncludeGlobalSearchOwner(classInfo?.ownerId)) {
        return;
      }

      registerEntry({
        classKey,
        className: classInfo?.name,
        ownerId: classInfo?.ownerId,
        teacherName: classInfo?.ownerName
      });
    });
  }

  students.forEach((student) => {
    registerEntry({
      classKey: student.classKey,
      className: student.className,
      ownerId: student.ownerId,
      teacherName: student.teacherName
    });
  });

  const classNameCounts = new Map();
  classEntries.forEach((entry) => {
    const nameKey = String(entry.className || '').toLowerCase();
    classNameCounts.set(nameKey, (classNameCounts.get(nameKey) || 0) + 1);
  });

  if (dom.adminStudentsClassFilter) {
    const classOptions = ['<option value="">All classes</option>'];
    Array.from(classEntries.values())
      .sort((a, b) => {
        const classCompare = String(a.className || '').localeCompare(String(b.className || ''), undefined, { sensitivity: 'base', numeric: true });
        if (classCompare !== 0) return classCompare;
        return String(a.teacherName || '').localeCompare(String(b.teacherName || ''), undefined, { sensitivity: 'base', numeric: true });
      })
      .forEach((entry) => {
        const duplicateCount = classNameCounts.get(String(entry.className || '').toLowerCase()) || 0;
        const label = duplicateCount > 1 ? `${entry.className} — ${entry.teacherName}` : entry.className;
        classOptions.push(`<option value="${escapeHtml(entry.value)}">${escapeHtml(label)}</option>`);
      });

    dom.adminStudentsClassFilter.innerHTML = classOptions.join('');
    dom.adminStudentsClassFilter.value = classEntries.has(previousClass) ? previousClass : '';
    dom.adminStudentsClassFilter.disabled = classEntries.size === 0;
  }

  if (dom.adminStudentsTeacherFilter) {
    const teacherOptions = ['<option value="">All teachers</option>'];
    Array.from(teacherEntries.values())
      .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base', numeric: true }))
      .forEach((entry) => {
        teacherOptions.push(`<option value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)}</option>`);
      });

    dom.adminStudentsTeacherFilter.innerHTML = teacherOptions.join('');
    dom.adminStudentsTeacherFilter.value = teacherEntries.has(previousTeacher) ? previousTeacher : '';
    dom.adminStudentsTeacherFilter.disabled = teacherEntries.size === 0;
  }

  updateAdminStudentsFilterControls();
};

const getFilteredAdminStudents = () => {
  const { searchTerm, selectedClass, selectedTeacher } = getAdminStudentsFilterState();
  const students = Array.isArray(state.adminStudentsRegistry) ? state.adminStudentsRegistry : [];
  const searchedStudents = searchTerm
    ? students.filter((student) => {
      return [student.name, student.className, student.teacherName]
        .some((value) => String(value || '').toLowerCase().includes(searchTerm));
    })
    : students.slice();

  const filteredStudents = searchedStudents.filter((student) => {
    const matchesClass = !selectedClass || student.classKey === selectedClass;
    const matchesTeacher = !selectedTeacher || student.ownerId === selectedTeacher;
    return matchesClass && matchesTeacher;
  });

  return sortAdminStudentsRegistry(filteredStudents);
};

const buildAdminStudentsActionMarkup = (student = {}) => {
  const ownerId = normalizeDisplayText(student?.ownerId, '');
  const studentId = normalizeDisplayText(student?.studentId, '');
  const studentName = normalizeDisplayText(student?.name, 'Student');
  const isDisabled = !canDeleteAdminStudents() || !ownerId || !studentId;
  const buttonTitle = !canDeleteAdminStudents()
    ? 'Only admins and developers can delete registry students.'
    : !ownerId || !studentId
      ? 'This registry row is missing the student identity needed for deletion.'
      : `Delete ${studentName} from the registry`;

  return `
    <div class="table-actions-cell admin-student-row-actions">
      <button
        class="btn btn-danger admin-student-delete-btn"
        type="button"
        data-admin-student-delete="true"
        data-owner-id="${escapeHtml(ownerId)}"
        data-student-id="${escapeHtml(studentId)}"
        data-student-name="${escapeHtml(studentName)}"
        aria-label="${escapeHtml(buttonTitle)}"
        title="${escapeHtml(buttonTitle)}"
        ${isDisabled ? 'disabled' : ''}
      >Delete</button>
    </div>
  `;
};

const buildAdminStudentsEmptyStateMarkup = ({
  icon = '🎓',
  title = 'No student records found.',
  detail = 'There are no active student entries to display in the registry right now.'
} = {}) => {
  return `<tr><td colspan="${ADMIN_STUDENTS_TABLE_COLUMN_COUNT}" class="empty-row"><div class="smart-empty admin-students-empty"><span>${escapeHtml(icon)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></td></tr>`;
};

const renderAdminStudentsSkeletonRows = (rowCount = 6) => {
  if (!dom.adminStudentsTableBody) return;

  const skeletonMarkup = Array.from({ length: rowCount }, (_, index) => {
    const shouldRenderClassGroup = index === 0 || index % 3 === 0;
    return `
      ${shouldRenderClassGroup ? `<tr class="admin-students-group-row admin-students-group-row-skeleton" aria-hidden="true"><td colspan="${ADMIN_STUDENTS_TABLE_COLUMN_COUNT}"><div class="admin-students-skeleton admin-students-skeleton-group"></div></td></tr>` : ''}
      <tr class="admin-students-row-skeleton" aria-hidden="true">
        <td>
          <div class="admin-students-skeleton-stack">
            <div class="admin-students-skeleton admin-students-skeleton-title"></div>
            <div class="admin-students-skeleton admin-students-skeleton-copy"></div>
          </div>
        </td>
        <td>
          <div class="admin-students-skeleton-stack">
            <div class="admin-students-skeleton admin-students-skeleton-title"></div>
            <div class="admin-students-skeleton admin-students-skeleton-copy"></div>
          </div>
        </td>
        <td>
          <div class="admin-students-skeleton-stack">
            <div class="admin-students-skeleton admin-students-skeleton-title"></div>
            <div class="admin-students-skeleton admin-students-skeleton-copy"></div>
          </div>
        </td>
        <td>
          <div class="admin-students-row-actions">
            <div class="admin-students-skeleton admin-students-skeleton-action"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  dom.adminStudentsTableBody.innerHTML = skeletonMarkup;
};

const groupAdminStudentsRegistry = (students = []) => {
  const classNameCounts = new Map();
  students.forEach((student) => {
    const classLabel = normalizeDisplayText(student.className, 'Unknown Class');
    const nameKey = classLabel.toLowerCase();
    classNameCounts.set(nameKey, (classNameCounts.get(nameKey) || 0) + 1);
  });

  const groups = [];
  students.forEach((student) => {
    const classLabel = normalizeDisplayText(student.className, 'Unknown Class');
    const teacherLabel = normalizeDisplayText(student.teacherName, 'Unknown Teacher');
    const classKey = normalizeDisplayText(student.classKey, `${classLabel.toLowerCase()}::${teacherLabel.toLowerCase()}`);
    const duplicateCount = classNameCounts.get(classLabel.toLowerCase()) || 0;
    const groupLabel = duplicateCount > 1 ? `${classLabel} — ${teacherLabel}` : classLabel;
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.key !== classKey) {
      groups.push({
        key: classKey,
        label: groupLabel,
        students: [student]
      });
      return;
    }

    lastGroup.students.push(student);
  });

  return groups;
};

const getAdminStudentsPagination = (groups = []) => {
  const totalItems = Array.isArray(groups)
    ? groups.reduce((count, group) => count + (Array.isArray(group?.students) ? group.students.length : 0), 0)
    : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_STUDENTS_PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(state.adminStudentsRegistryPage, 10) || 1);
  const currentPage = totalItems ? Math.min(requestedPage, totalPages) : 1;
  const startIndex = totalItems ? (currentPage - 1) * ADMIN_STUDENTS_PAGE_SIZE : 0;
  const endIndex = Math.min(startIndex + ADMIN_STUDENTS_PAGE_SIZE, totalItems);

  const pageGroups = [];
  let studentCursor = 0;
  groups.forEach((group) => {
    const groupStudents = Array.isArray(group?.students) ? group.students : [];
    const nextCursor = studentCursor + groupStudents.length;

    if (nextCursor <= startIndex || studentCursor >= endIndex) {
      studentCursor = nextCursor;
      return;
    }

    const sliceStart = Math.max(0, startIndex - studentCursor);
    const sliceEnd = Math.min(groupStudents.length, endIndex - studentCursor);
    const slicedStudents = groupStudents.slice(sliceStart, sliceEnd);
    if (slicedStudents.length) {
      pageGroups.push({
        key: group?.key || `${pageGroups.length}`,
        label: normalizeDisplayText(group?.label, 'Unknown Class'),
        students: slicedStudents
      });
    }

    studentCursor = nextCursor;
  });

  state.adminStudentsRegistryPage = currentPage;

  return {
    groups: pageGroups,
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    endIndex
  };
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

  const shouldShow = Boolean(isLoading || totalItems > 0);
  dom.adminStudentsPagination.classList.toggle('hidden', !shouldShow);

  if (dom.adminStudentsPaginationSummary) {
    if (isLoading) {
      dom.adminStudentsPaginationSummary.textContent = 'Preparing registry pages...';
    } else if (!totalItems) {
      dom.adminStudentsPaginationSummary.textContent = 'No pages to display.';
    } else {
      dom.adminStudentsPaginationSummary.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems} student${totalItems === 1 ? '' : 's'}.`;
    }
  }

  if (dom.adminStudentsPageIndicator) {
    dom.adminStudentsPageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  if (dom.adminStudentsPrevPageBtn) {
    dom.adminStudentsPrevPageBtn.disabled = isLoading || currentPage <= 1 || totalItems === 0;
  }

  if (dom.adminStudentsNextPageBtn) {
    dom.adminStudentsNextPageBtn.disabled = isLoading || currentPage >= totalPages || totalItems === 0;
  }
};

const renderAdminStudentsTable = (groups = [], startIndex = 0) => {
  if (!dom.adminStudentsTableBody) return;
  const { hasActiveCriteria } = getAdminStudentsFilterState();
  if (!groups.length) {
    dom.adminStudentsTableBody.innerHTML = hasActiveCriteria
      ? buildAdminStudentsEmptyStateMarkup({
        icon: '🔎',
        title: 'No students match your filters.',
        detail: 'Try adjusting the search, class, or teacher filters.'
      })
      : buildAdminStudentsEmptyStateMarkup({
        icon: '🎓',
        title: 'No student records found.',
        detail: 'The global registry does not have any active student entries to show yet.'
      });
    return;
  }

  let studentNumber = Math.max(0, Number(startIndex) || 0);
  dom.adminStudentsTableBody.innerHTML = groups.map((group) => {
    const groupLabel = normalizeDisplayText(group?.label, 'Unknown Class');
    const rows = (Array.isArray(group?.students) ? group.students : []).map((student) => {
      studentNumber += 1;
      const classLabel = normalizeDisplayText(student.className, 'Unknown Class');
      return `
        <tr class="fade-in">
          <td>${buildIdentityMarkup({ label: student.name, role: ROLE_STUDENT, avatarLabel: String(studentNumber) })}</td>
          <td>
            <div class="admin-student-meta">
              <strong>${escapeHtml(classLabel)}</strong>
              <span>Class assignment</span>
            </div>
          </td>
          <td>
            <div class="admin-student-meta">
              <strong>${escapeHtml(student.teacherName)}</strong>
              <span>Teacher</span>
            </div>
          </td>
          <td>${buildAdminStudentsActionMarkup(student)}</td>
        </tr>
      `;
    }).join('');

    return `<tr class="admin-students-group-row"><td colspan="${ADMIN_STUDENTS_TABLE_COLUMN_COUNT}">${escapeHtml(groupLabel)}</td></tr>${rows}`;
  }).join('');
};

const updateAdminStudentsView = () => {
  const filteredStudents = getFilteredAdminStudents();
  const groupedStudents = groupAdminStudentsRegistry(filteredStudents);
  const totalLoadedStudents = Array.isArray(state.adminStudentsRegistry) ? state.adminStudentsRegistry.length : 0;
  const { hasActiveCriteria } = getAdminStudentsFilterState();
  const pagination = getAdminStudentsPagination(groupedStudents);
  const visibleRange = filteredStudents.length ? `${pagination.startIndex + 1}-${pagination.endIndex}` : '0';

  renderAdminStudentsTable(pagination.groups, pagination.startIndex);
  renderAdminStudentsPagination(pagination);
  updateAdminStudentsFilterControls();

  if (!state.adminStudentsRegistryLoaded) {
    return;
  }

  if (totalLoadedStudents === 0) {
    setAdminStudentsStatus('No active student records were found in the global registry.', 'warning');
    return;
  }

  if (!filteredStudents.length && hasActiveCriteria) {
    setAdminStudentsStatus('No students match your filters.', 'warning');
    return;
  }

  const message = hasActiveCriteria
    ? `Page ${pagination.currentPage} of ${pagination.totalPages}. Showing ${visibleRange} of ${filteredStudents.length} matching student${filteredStudents.length === 1 ? '' : 's'}.`
    : `Page ${pagination.currentPage} of ${pagination.totalPages}. Showing ${visibleRange} of ${filteredStudents.length} student${filteredStudents.length === 1 ? '' : 's'} in the registry.`;
  setAdminStudentsStatus(message, filteredStudents.length ? 'success' : 'warning');
};

const loadAdminStudentsRegistry = async () => {
  if (!dom.adminStudentsView) {
    return;
  }

  if (!isFirebaseConfigured || !db) {
    state.adminStudentsRegistry = [];
    state.adminStudentsRegistryLoaded = false;
    state.adminStudentsRegistryPage = 1;
    renderAdminStudentsFilterOptions();
    renderAdminStudentsTable([]);
    renderAdminStudentsPagination();
    setAdminStudentsStatus('Global student registry is unavailable because Firebase is not configured.', 'error');
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
  setAdminStudentsStatus('Loading global student registry...');
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
    const students = Array.isArray(studentRecords)
      ? studentRecords
        .filter((student) => student?.deleted !== true)
        .map((student) => mapAdminStudentRecord(student, classMap))
        .filter((student) => shouldIncludeGlobalSearchOwner(student.ownerId))
      : [];
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
    if (isPermissionDeniedError(error)) {
      setAdminStudentsStatus('Global student registry is unavailable due to permissions.', 'error');
      showToast('Global student registry unavailable due to permissions', 'warning');

      return;
    }
    setAdminStudentsStatus(`Failed to load global student registry: ${formatAuthError(error)}`, 'error');
    showToast('Failed to load global student registry', 'error');
  } finally {
    setElementVisibility(dom.adminStudentsLoading, false);
    setSectionLoadingState(dom.adminStudentsView, false);
    updateAdminStudentsFilterControls();
  }
};

const removeAdminRegistryStudentFromState = (ownerId = '', studentId = '') => {
  const targetKey = buildAdminRegistryStudentIdentityKey(ownerId, studentId);
  if (!targetKey) {
    return 0;
  }

  const currentStudents = Array.isArray(state.adminStudentsRegistry) ? state.adminStudentsRegistry : [];
  const nextStudents = currentStudents.filter((student) => {
    return buildAdminRegistryStudentIdentityKey(student.ownerId, student.studentId) !== targetKey;
  });
  const removedCount = currentStudents.length - nextStudents.length;
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
  if (!canDeleteAdminStudents()) {
    setAdminStudentsStatus('Only admins and developers can delete registry students.', 'warning');
    showToast('Student deletion unavailable', 'warning');
    return;
  }

  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedStudentId = normalizeDisplayText(studentId, '');
  const normalizedStudentName = normalizeDisplayText(studentName, 'Student');
  if (!normalizedOwnerId || !normalizedStudentId) {
    setAdminStudentsStatus('The selected registry row is missing the student identity needed for deletion.', 'warning');
    showToast('Student cannot be deleted from registry', 'warning');
    return;
  }

  const shouldContinue = await requestConfirmation({
    message: `Delete ${normalizedStudentName} from the registry? This moves every matching active student record for that teacher into Trash.`,
    confirmLabel: 'Delete Student',
    dangerous: true
  });

  if (!shouldContinue) {
    setAdminStudentsStatus('Student deletion canceled.', 'warning');
    return;
  }

  try {
    setAdminStudentsStatus(`Deleting ${normalizedStudentName} from the registry...`);
    const result = await deleteAdminRegistryStudent({
      ownerId: normalizedOwnerId,
      studentId: normalizedStudentId,
      studentName: normalizedStudentName
    });
    const removedCount = removeAdminRegistryStudentFromState(normalizedOwnerId, normalizedStudentId);
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

    if (Number(result?.deletedCount || 0) > 0) {
      setAdminStudentsStatus(`${normalizedStudentName} was removed from the registry.`, 'success');
      showToast('Student removed from registry', 'success');
      markUpdatedNow();
      return;
    }

    if (removedCount > 0) {
      setAdminStudentsStatus(`${normalizedStudentName} was already cleared, so the registry view was refreshed.`, 'warning');
      showToast('Registry refreshed', 'warning');
      markUpdatedNow();
      return;
    }

    setAdminStudentsStatus('No matching active student records were found for that registry entry.', 'warning');
    showToast('Student record not found', 'warning');
  } catch (error) {
    console.error('Failed to delete registry student:', error);
    if (isPermissionDeniedError(error)) {
      setAdminStudentsStatus('Access denied. You do not have permission to delete this registry record.', 'error');
      showToast('Permission denied', 'error');
      return;
    }
    setAdminStudentsStatus(`Failed to delete student record: ${formatAuthError(error)}`, 'error');
    showToast('Failed to delete student from registry', 'error');
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

    const previousLabel = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = 'Deleting...';
    try {
      await handleAdminRegistryStudentDelete({
        ownerId: trigger.dataset.ownerId || '',
        studentId: trigger.dataset.studentId || '',
        studentName: trigger.dataset.studentName || ''
      });
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