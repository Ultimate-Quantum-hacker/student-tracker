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
  formatAuthError,
  isDeveloperAccountEmail
} from './auth.js';
import {
  fetchAdminGlobalStats,
  fetchActivityLogs,
  fetchAdminUsers,
  updateAdminUserRole,
  fetchGlobalStudentSearchIndex,
  setCurrentUserRoleContext
} from '../services/db.js';

const DASHBOARD_PATH = '/index.html';
const LOGIN_PATH = '/login.html';
const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const ROLE_STUDENT = 'student';
const UPDATABLE_ROLES = [ROLE_TEACHER, ROLE_ADMIN];
const THEME_STORAGE_KEY = 'theme';
const ADMIN_STUDENTS_PAGE_SIZE = 50;

const state = {
  authUser: null,
  currentRole: ROLE_TEACHER,
  users: [],
  activityLogs: [],
  globalSearchIndex: [],
  globalSearchResults: [],
  adminStudentsRegistry: [],
  adminStudentsRegistryLoaded: false,
  adminStudentsRegistryPage: 1,
  toastTimer: null,
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
  totalStudents: document.getElementById('admin-total-students'),
  totalExams: document.getElementById('admin-total-exams'),
  adminMainView: document.querySelector('.admin-main-view'),
  adminStudentsView: document.querySelector('.admin-students-view'),
  adminStudentsSearchInput: document.getElementById('admin-students-search-input'),
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
  overviewSection: document.getElementById('admin-section-overview'),
  usersSection: document.getElementById('admin-section-users'),
  searchSection: document.getElementById('admin-section-search'),
  activitySection: document.getElementById('admin-section-logs'),
  sidebarButtons: Array.from(document.querySelectorAll('.admin-sidebar-btn')),
  scrollSections: Array.from(document.querySelectorAll('.admin-scroll-section'))
};

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

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeText = (value) => String(value || '').trim();
const normalizeDisplayText = (value, fallback = '') => {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null' || lower === 'nan' || lower === 'infinity' || normalized === '[object Object]') {
    return fallback;
  }

  return normalized;
};
const normalizeCount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};

const getInitials = (value = '', fallback = 'NA') => {
  const normalized = normalizeDisplayText(value, '');
  if (!normalized) return fallback;

  const parts = normalized
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return normalized.slice(0, 2).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const getAvatarToneClass = (role = '') => {
  const normalized = normalizeText(role).toLowerCase();
  if (normalized === ROLE_DEVELOPER) return 'role-developer';
  if (normalized === ROLE_ADMIN) return 'role-admin';
  if (normalized === ROLE_TEACHER) return 'role-teacher';
  if (normalized === ROLE_STUDENT) return 'role-student';
  return 'role-default';
};

const buildAvatarMarkup = (label = '', role = '') => {
  const initials = getInitials(label, 'NA');
  return `<span class="avatar ${getAvatarToneClass(role)}" aria-hidden="true">${escapeHtml(initials)}</span>`;
};

const buildIdentityMarkup = ({
  label = 'Unknown',
  secondary = '',
  role = '',
  containerClass = 'identity-cell',
  copyClass = 'identity-copy'
} = {}) => {
  const safeLabel = normalizeDisplayText(label, 'Unknown');
  const safeSecondary = normalizeDisplayText(secondary, '');
  return `
    <div class="${containerClass}">
      ${buildAvatarMarkup(safeLabel, role)}
      <div class="${copyClass}">
        <strong>${escapeHtml(safeLabel)}</strong>
        ${safeSecondary ? `<span>${escapeHtml(safeSecondary)}</span>` : ''}
      </div>
    </div>
  `;
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

const formatRoleLabel = (role) => {
  const rawRole = normalizeText(role).toLowerCase();
  if (rawRole === ROLE_STUDENT) return 'Student';
  const normalized = normalizeUserRole(role);
  if (normalized === ROLE_DEVELOPER) return 'Developer';
  if (normalized === ROLE_ADMIN) return 'Admin';
  return 'Teacher';
};

const getRoleBadgeClass = (role) => {
  const rawRole = normalizeText(role).toLowerCase();
  if (rawRole === ROLE_STUDENT) return 'role-student';
  const normalized = normalizeUserRole(role);
  if (normalized === ROLE_DEVELOPER) return 'role-developer';
  if (normalized === ROLE_ADMIN) return 'role-admin';
  return 'role-teacher';
};

const formatCreatedAt = (value) => {
  if (!value) return '—';
  if (typeof value?.toDate === 'function') {
    return value.toDate().toLocaleString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
};

const formatTimeOfDay = (value) => {
  if (!value) return '—';
  const parsed = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatTargetIdentifier = (value = '') => {
  const target = normalizeDisplayText(value, '');
  if (!target) return '';

  if (/^\d{12,}$/.test(target)) {
    const asNumber = Number(target);
    if (Number.isFinite(asNumber) && asNumber > 946684800000) {
      const asDate = new Date(asNumber);
      if (!Number.isNaN(asDate.getTime())) {
        return asDate.toLocaleString();
      }
    }
  }

  if (target.length > 28) {
    return `${target.slice(0, 10)}…${target.slice(-6)}`;
  }

  return target;
};

const formatActionLabel = (action = '') => {
  const normalized = normalizeDisplayText(action, '').toLowerCase();
  if (!normalized) return 'updated';
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const isPermissionDeniedError = (error) => String(error?.code || '').toLowerCase().includes('permission-denied');
const canManageRoles = () => state.currentRole === ROLE_DEVELOPER;
const isAdminOnlyRole = () => state.currentRole === ROLE_ADMIN;

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
  if (isDeveloperAccountEmail(record?.email)) return false;
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

const formatTargetLabel = (entry = {}) => {
  const targetType = normalizeDisplayText(entry.targetType || 'record', 'record').toLowerCase();
  const targetId = formatTargetIdentifier(entry.targetId || '');
  const readableType = targetType
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'record';
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
    const actorRole = normalizeUserRole(actor?.role || entry.userRole);
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
        <td>${buildIdentityMarkup({ label: studentLabel, secondary: 'Student result', role: 'student' })}</td>
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
    const records = await fetchAdminUsers();
    state.users = Array.isArray(records) ? records : [];
    renderUsersTable();
    populateActivityUserFilter();
    setPanelStatus(`Loaded ${getVisibleUsers().length} user${getVisibleUsers().length === 1 ? '' : 's'}.`, 'success');
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to fetch users:', error);
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
    const stats = await fetchAdminGlobalStats();
    state.globalStats = {
      totalUsers: normalizeCount(stats?.totalUsers),
      totalStudents: normalizeCount(stats?.totalStudents),
      totalExams: normalizeCount(stats?.totalExams)
    };
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    state.globalStats = {
      totalUsers: getVisibleUsers().length,
      totalStudents: 0,
      totalExams: 0
    };
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
    renderGlobalSearchResults([]);
    setGlobalSearchStatus('Global search unavailable: Firebase is not configured.', 'error');
    setSectionLoadingState(dom.searchSection, false);
    return;
  }

  setElementVisibility(dom.globalSearchLoading, true);
  setSectionLoadingState(dom.searchSection, true);
  setGlobalSearchStatus('Building global search index...');

  try {
    let rows = await fetchGlobalStudentSearchIndex();
    rows = Array.isArray(rows)
      ? rows.filter((entry) => shouldIncludeGlobalSearchOwner(entry?.userId))
      : [];
    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    state.globalSearchIndex = rows;
    state.globalSearchResults = [];
    setGlobalSearchStatus(`Indexed ${rows.length} student${rows.length === 1 ? '' : 's'} for global search.`, 'success');
    renderGlobalSearchResults([]);
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to build global search index:', error);
    state.globalSearchIndex = [];
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

  setElementVisibility(dom.activityLoading, true);
  setSectionLoadingState(dom.activitySection, true);
  setActivityStatus('Loading activity logs...');

  try {
    let entries = await fetchActivityLogs({
      userId: selectedUserId,
      sort: selectedSort,
      maxEntries: 250
    });

    if (selectedAction) {
      entries = entries.filter((entry) => String(entry.action || '').trim().toLowerCase() === selectedAction);
    }

    populateActivityClassFilter(entries);

    if (selectedClassKey) {
      entries = entries.filter((entry) => getEntryClassFilterKey(entry) === selectedClassKey);
    }

    state.activityLogs = entries;
    renderActivityLogTable(entries);
    const visibleCount = getVisibleActivityEntries(entries).length;
    setActivityStatus(`Loaded ${visibleCount} log entr${visibleCount === 1 ? 'y' : 'ies'}.`, 'success');
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to load activity logs:', error);
    state.activityLogs = [];
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

  if (isDeveloperAccountEmail(record.email) && normalizedNextRole !== ROLE_DEVELOPER) {
    setPanelStatus('Developer account role cannot be downgraded.', 'error');
    return;
  }

  if (record.uid === state.authUser?.uid && currentRole === ROLE_DEVELOPER && normalizedNextRole !== ROLE_DEVELOPER) {
    setPanelStatus('You cannot remove your own developer role.', 'error');
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
  state.currentRole = isDeveloperAccountEmail(authUser?.email) ? ROLE_DEVELOPER : resolvedRole;
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

const bindEvents = () => {
  dom.searchInput?.addEventListener('input', () => renderUsersTable());
  dom.themeBtn?.addEventListener('click', () => togglePanelTheme());

  dom.refreshBtn?.addEventListener('click', async () => {
    await fetchUsers();
    await loadGlobalStats();
    await buildGlobalSearchIndex();
    await loadActivityLogs();
    showToast('Panel refreshed', 'success');
  });

  dom.refreshActivityBtn?.addEventListener('click', async () => {
    await loadActivityLogs();
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

  dom.globalSearchInput?.addEventListener('input', () => runGlobalSearch());

  dom.globalSearchClearBtn?.addEventListener('click', () => {
    if (dom.globalSearchInput) {
      dom.globalSearchInput.value = '';
      dom.globalSearchInput.focus();
    }
    runGlobalSearch();
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

    await fetchUsers();
    await loadGlobalStats();
    await buildGlobalSearchIndex();
    await loadActivityLogs();

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
  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    __docId: doc.id,
    __refPath: doc.ref?.path || ''
  }));
}

const getOwnerIdFromRegistryPath = (path = '') => {
  const segments = String(path || '').split('/').filter(Boolean);
  if (segments[0] === 'users' && segments[1]) {
    return normalizeDisplayText(segments[1], '');
  }
  return '';
};

const getRegistryAncestorIdFromPath = (path = '', collectionName = '') => {
  const normalizedCollectionName = normalizeText(collectionName);
  if (!normalizedCollectionName) {
    return '';
  }

  const segments = String(path || '').split('/').filter(Boolean);
  const collectionIndex = segments.lastIndexOf(normalizedCollectionName);
  if (collectionIndex === -1 || !segments[collectionIndex + 1]) {
    return '';
  }
  return normalizeDisplayText(segments[collectionIndex + 1], '');
};

const buildAdminRegistryClassKey = (ownerId = '', classId = '') => {
  const normalizedClassId = normalizeDisplayText(classId, '');
  if (!normalizedClassId) {
    return '';
  }

  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  return normalizedOwnerId ? `${normalizedOwnerId}::${normalizedClassId}` : normalizedClassId;
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

    const ownerId = normalizeDisplayText(
      payload.ownerId || payload.userId || getOwnerIdFromRegistryPath(entry.ref?.path),
      ''
    );
    const classId = normalizeDisplayText(
      payload.id || entry.id || getRegistryAncestorIdFromPath(entry.ref?.path, 'classes'),
      ''
    );
    const className = normalizeDisplayText(payload.name || payload.className || '', '');
    if (!classId || !className) {
      return;
    }

    const keyedClassId = buildAdminRegistryClassKey(ownerId, classId);
    if (keyedClassId) {
      classMap.set(keyedClassId, className);
    }
    if (!classMap.has(classId)) {
      classMap.set(classId, className);
    }
  });
  return classMap;
}

const mapAdminStudentRecord = (student = {}, classMap = new Map()) => {
  const ownerId = normalizeDisplayText(
    student.ownerId || student.userId || getOwnerIdFromRegistryPath(student.__refPath),
    ''
  );
  const classId = normalizeDisplayText(
    student.classId || getRegistryAncestorIdFromPath(student.__refPath, 'classes'),
    ''
  );
  const classKey = buildAdminRegistryClassKey(ownerId, classId);
  const name = student.name || 'Unnamed';
  const className = student.className || classMap.get(classKey) || classMap.get(classId) || 'Unknown Class';
  const owner = student.ownerName || 'Unknown';

  return {
    id: normalizeDisplayText(student.id || student.studentId || student.__docId || '', ''),
    name: normalizeDisplayText(name, 'Unnamed'),
    classId: normalizeDisplayText(classId, ''),
    className: normalizeDisplayText(className, 'Unknown Class'),
    owner: normalizeDisplayText(owner, 'Unknown')
  };
};

const sortAdminStudentsRegistry = (students = []) => {
  const sortedStudents = [...students];
  sortedStudents.sort((a, b) => {
    const classCompare = String(a.className || '').localeCompare(String(b.className || ''), undefined, { sensitivity: 'base', numeric: true });
    if (classCompare !== 0) return classCompare;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
  });
  return sortedStudents;
};

const getFilteredAdminStudents = () => {
  const term = normalizeText(dom.adminStudentsSearchInput?.value || '').toLowerCase();
  const students = Array.isArray(state.adminStudentsRegistry) ? state.adminStudentsRegistry : [];
  if (!term) {
    return sortAdminStudentsRegistry(students);
  }

  const filteredStudents = students.filter((student) => {
    return [student.name, student.className, student.owner, student.id]
      .some((value) => String(value || '').toLowerCase().includes(term));
  });

  return sortAdminStudentsRegistry(filteredStudents);
};

const buildAdminStudentsEmptyStateMarkup = ({
  icon = '🎓',
  title = 'No student records found.',
  detail = 'There are no active student entries to display in the registry right now.'
} = {}) => {
  return `<tr><td colspan="3" class="empty-row"><div class="smart-empty admin-students-empty"><span>${escapeHtml(icon)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></td></tr>`;
};

const renderAdminStudentsSkeletonRows = (rowCount = 6) => {
  if (!dom.adminStudentsTableBody) return;

  const skeletonMarkup = Array.from({ length: rowCount }, (_, index) => {
    const shouldRenderClassGroup = index === 0 || index % 3 === 0;
    return `
      ${shouldRenderClassGroup ? `<tr class="admin-students-group-row admin-students-group-row-skeleton" aria-hidden="true"><td colspan="3"><div class="admin-students-skeleton admin-students-skeleton-group"></div></td></tr>` : ''}
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
      </tr>
    `;
  }).join('');

  dom.adminStudentsTableBody.innerHTML = skeletonMarkup;
};

const getAdminStudentsPagination = (students = []) => {
  const totalItems = Array.isArray(students) ? students.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_STUDENTS_PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(state.adminStudentsRegistryPage, 10) || 1);
  const currentPage = totalItems ? Math.min(requestedPage, totalPages) : 1;
  const startIndex = totalItems ? (currentPage - 1) * ADMIN_STUDENTS_PAGE_SIZE : 0;
  const endIndex = Math.min(startIndex + ADMIN_STUDENTS_PAGE_SIZE, totalItems);

  state.adminStudentsRegistryPage = currentPage;

  return {
    items: students.slice(startIndex, endIndex),
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

const renderAdminStudentsTable = (students = []) => {
  if (!dom.adminStudentsTableBody) return;
  if (!students.length) {
    const hasSearchTerm = normalizeText(dom.adminStudentsSearchInput?.value || '');
    dom.adminStudentsTableBody.innerHTML = hasSearchTerm
      ? buildAdminStudentsEmptyStateMarkup({
        icon: '🔎',
        title: 'No students match your search.',
        detail: 'Try a different student, class, or owner keyword.'
      })
      : buildAdminStudentsEmptyStateMarkup({
        icon: '🎓',
        title: 'No student records found.',
        detail: 'The global registry does not have any active student entries to show yet.'
      });
    return;
  }

  let previousClassGroup = '';
  dom.adminStudentsTableBody.innerHTML = students.map((student) => {
    const classLabel = normalizeDisplayText(student.className, 'Unknown Class');
    const classGroupKey = classLabel.toLowerCase();
    const shouldRenderClassGroup = classGroupKey !== previousClassGroup;
    previousClassGroup = classGroupKey;
    return `
      ${shouldRenderClassGroup ? `<tr class="admin-students-group-row"><td colspan="3">${escapeHtml(classLabel)}</td></tr>` : ''}
      <tr class="fade-in">
        <td>${buildIdentityMarkup({ label: student.name, secondary: student.id ? `Record ID: ${student.id}` : 'Student record', role: ROLE_STUDENT })}</td>
        <td>
          <div class="admin-student-meta">
            <strong>${escapeHtml(classLabel)}</strong>
            <span>Class assignment</span>
          </div>
        </td>
        <td>
          <div class="admin-student-meta">
            <strong>${escapeHtml(student.owner)}</strong>
            <span>Data owner</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

const updateAdminStudentsView = () => {
  const filteredStudents = getFilteredAdminStudents();
  const totalLoadedStudents = Array.isArray(state.adminStudentsRegistry) ? state.adminStudentsRegistry.length : 0;
  const hasSearchTerm = normalizeText(dom.adminStudentsSearchInput?.value || '');
  const pagination = getAdminStudentsPagination(filteredStudents);
  const visibleRange = filteredStudents.length ? `${pagination.startIndex + 1}-${pagination.endIndex}` : '0';

  renderAdminStudentsTable(pagination.items);
  renderAdminStudentsPagination(pagination);

  if (!state.adminStudentsRegistryLoaded) {
    return;
  }

  if (totalLoadedStudents === 0) {
    setAdminStudentsStatus('No active student records were found in the global registry.', 'warning');
    return;
  }

  if (!filteredStudents.length && hasSearchTerm) {
    setAdminStudentsStatus('No students match your search in the loaded registry.', 'warning');
    return;
  }

  const message = hasSearchTerm
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
      : [];
    state.adminStudentsRegistry = sortAdminStudentsRegistry(students);
    state.adminStudentsRegistryLoaded = true;
    updateAdminStudentsView();
    markUpdatedNow();
  } catch (error) {
    console.error('Failed to load global student registry:', error);
    state.adminStudentsRegistry = [];
    state.adminStudentsRegistryLoaded = false;
    state.adminStudentsRegistryPage = 1;
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
  return true;
};

const initAdminStudentsRegistryView = () => {
  const totalStudentsCard = dom.totalStudents?.closest('.total-students-card') || document.querySelector('.total-students-card');

  totalStudentsCard?.addEventListener('click', () => {
    const didToggleView = setAdminStudentsRegistryVisibility(true);
    if (!didToggleView) {
      return;
    }
    loadAdminStudentsRegistry().catch((error) => {
      console.error('Failed to open global student registry:', error);
    });
  });

  dom.adminStudentsBackBtn?.addEventListener('click', () => {
    const didToggleView = setAdminStudentsRegistryVisibility(false);
    if (!didToggleView) {
      return;
    }
    scrollToSidebarSection('overview', { smooth: false });
  });

  dom.adminStudentsSearchInput?.addEventListener('input', () => {
    state.adminStudentsRegistryPage = 1;
    updateAdminStudentsView();
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
};

document.addEventListener('DOMContentLoaded', () => {
  initAdminStudentsRegistryView();
});