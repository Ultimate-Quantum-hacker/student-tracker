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
  formatLastUpdatedLabel,
  prefersReducedMotion,
  buildIdentityMarkup,
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
  buildActivityLogsLoadFeedbackState,
  buildActivityLogsLoadErrorFeedbackState,
  buildActivityLogsClearErrorFeedbackState
} from './admin-activity-utils.js';

import {
  buildAdminRegistryStudentRecords,
  removeAdminRegistryStudentEntries,
  mapAdminRegistryClassRecord,
  buildAdminStudentsRegistryRecords,
  getVisibleAdminStudentsClassMap,
  buildAdminStudentsFilterState,
  buildAdminStudentsFilterOptionsState,
  buildAdminStudentsPaginationViewState,
  buildAdminStudentsRegistryViewState,
  buildAdminRegistryStudentDeleteFeedbackState,
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
  buildVisibleAdminGlobalSearchRows,
  getFilteredAdminGlobalSearchRows,
  buildAdminGlobalSearchFeedbackState,
  buildAdminGlobalSearchIndexRequestState,
  buildAdminGlobalSearchIndexFeedbackState,
  buildAdminGlobalSearchIndexErrorFeedbackState,
  buildAdminUserRoleUpdateState,
  buildAdminUserRoleUpdateFeedbackState,
  buildAdminUserRoleUpdateErrorFeedbackState,
  canManageAdminRoles,
  canDeleteAdminRegistryStudents,
  canEditAdminUserRole,
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

const canEditRole = (record) => {
  return canEditAdminUserRole(record, {
    currentRole: state.currentRole
  });
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

    if (canManageAdminRoles(state.currentRole)) {
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
    const { emptyMessage } = buildAdminGlobalSearchFeedbackState({
      searchTerm: dom.globalSearchInput?.value || '',
      resultCount: entries.length,
      isIndexLoaded: state.globalSearchIndexLoaded
    });
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
  const visibleUsers = getVisibleUsers();
  const { optionMarkup, selectedValue } = buildActivityUserFilterState(visibleUsers, {
    previousSelection: dom.activityUserFilter.value || ''
  });

  dom.activityUserFilter.innerHTML = optionMarkup;
  dom.activityUserFilter.value = selectedValue;
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
  const {
    selectedUserId,
    selectedClassKey,
    selectedAction,
    selectedSort,
    activityLogsCacheKey
  } = buildActivityLogsQueryState({
    userId: dom.activityUserFilter?.value || '',
    classKey: dom.activityClassFilter?.value || '',
    action: dom.activityActionFilter?.value || '',
    sort: dom.activitySortFilter?.value || 'desc'
  });

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

    const {
      entriesForClassFilter,
      filteredEntries
    } = filterAdminActivityEntries(entries, {
      selectedAction,
      selectedClassKey
    });

    populateActivityClassFilter(entriesForClassFilter);

    entries = filteredEntries;

    state.activityLogs = entries;
    state.activityLogsLoaded = true;
    renderActivityLogTable(entries);
    const visibleCount = getVisibleActivityEntries(entries).length;
    const loadFeedbackState = buildActivityLogsLoadFeedbackState({
      visibleCount
    });
    setActivityStatus(loadFeedbackState.statusMessage, loadFeedbackState.statusType);
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
  if (!record) {
    setPanelStatus('Unable to find selected user.', 'error');
    return;
  }
  if (!canManageAdminRoles(state.currentRole)) {
    setPanelStatus('Only developers can update roles in this panel.', 'warning');
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
    await updateAdminUserRole({
      uid,
      name: normalizeText(record.name || ''),
      email: normalizeText(record.email || '').toLowerCase(),
      role: roleUpdateState.normalizedNextRole
    });

    record.role = roleUpdateState.normalizedNextRole;
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

  return buildAdminRegistryStudentRecords(snapshot.docs.map((entry) => {
    return {
      payload: entry.data(),
      path: entry.ref?.path
    };
  }));
}

async function fetchAdminClassNameMap() {
  if (!isFirebaseConfigured || !db) {
    return new Map();
  }

  const snapshot = await getDocs(collectionGroup(db, 'classes'));
  const classMap = new Map();
  snapshot.forEach((entry) => {
    const mappedClass = mapAdminRegistryClassRecord({
      payload: entry.data(),
      path: entry.ref?.path,
      fallbackClassId: entry.id,
      users: state.users
    });
    if (!mappedClass) {
      return;
    }

    classMap.set(mappedClass.classKey, mappedClass.classInfo);
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