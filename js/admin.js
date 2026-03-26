import {
  db,
  collection,
  collectionGroup,
  getDocs,
  doc,
  updateDoc,
  isFirebaseConfigured
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
  fetchActivityLogs
} from '../services/db.js';

const DASHBOARD_PATH = '/index.html';
const LOGIN_PATH = '/login.html';
const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const UPDATABLE_ROLES = [ROLE_TEACHER, ROLE_ADMIN];
const THEME_STORAGE_KEY = 'theme';

const state = {
  authUser: null,
  currentRole: ROLE_TEACHER,
  users: [],
  activityLogs: [],
  globalSearchIndex: [],
  globalSearchResults: [],
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
  globalSearchInput: document.getElementById('global-student-search-input'),
  globalSearchClearBtn: document.getElementById('global-search-clear-btn'),
  globalSearchStatus: document.getElementById('global-search-status'),
  globalSearchLoading: document.getElementById('global-search-loading'),
  globalSearchResultsBody: document.getElementById('global-search-results-body'),
  activityStatus: document.getElementById('activity-status'),
  activityLoading: document.getElementById('activity-loading'),
  activityBody: document.getElementById('activity-table-body'),
  activityUserFilter: document.getElementById('activity-user-filter'),
  activityActionFilter: document.getElementById('activity-action-filter'),
  activitySortFilter: document.getElementById('activity-sort-filter'),
  refreshActivityBtn: document.getElementById('refresh-activity-btn'),
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
  element.style.display = shouldShow ? 'block' : 'none';
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
const formatRoleLabel = (role) => {
  const normalized = normalizeUserRole(role);
  if (normalized === ROLE_DEVELOPER) return 'Developer';
  if (normalized === ROLE_ADMIN) return 'Admin';
  return 'Teacher';
};
const getRoleBadgeClass = (role) => {
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
  dom.roleBadge.classList.remove('role-teacher', 'role-admin', 'role-developer');
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

    const nameCell = document.createElement('td');
    nameCell.textContent = String(record.name || '—');

    const emailCell = document.createElement('td');
    emailCell.className = 'email-cell';
    emailCell.textContent = String(record.email || '—');

    const roleCell = document.createElement('td');
    const roleWrap = document.createElement('div');
    roleWrap.className = 'role-cell-wrap';
    const badge = document.createElement('span');
    badge.className = `inline-role-badge ${getRoleBadgeClass(record.role)}`;
    badge.textContent = formatRoleLabel(record.role);
    roleWrap.appendChild(badge);
    roleWrap.appendChild(buildRoleSelect(record));
    roleCell.appendChild(roleWrap);

    const createdCell = document.createElement('td');
    createdCell.textContent = formatCreatedAt(record.createdAt);

    const actionCell = document.createElement('td');
    actionCell.className = 'table-actions-cell';

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
      actionCell.appendChild(updateBtn);
    }

    row.appendChild(nameCell);
    row.appendChild(emailCell);
    row.appendChild(roleCell);
    row.appendChild(createdCell);
    row.appendChild(actionCell);
    dom.tableBody.appendChild(row);
  });
};

const renderStats = () => {
  if (dom.totalUsers) dom.totalUsers.textContent = String(state.globalStats.totalUsers || 0);
  if (dom.totalStudents) dom.totalStudents.textContent = String(state.globalStats.totalStudents || 0);
  if (dom.totalExams) dom.totalExams.textContent = String(state.globalStats.totalExams || 0);
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
  const targetType = normalizeText(entry.targetType || 'record').toLowerCase();
  const targetId = normalizeText(entry.targetId || '');
  if (!targetId) return targetType || 'record';
  return `${targetType} '${targetId}'`;
};

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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
    const actorLabel = actor?.name || actor?.email || entry.userEmail || 'Unknown user';
    const ownerLabel = owner?.name || owner?.email || 'Unknown owner';
    const actorRole = normalizeUserRole(actor?.role);
    const ownerRole = normalizeUserRole(owner?.role);
    const actionTone = getActionTone(entry.action);
    const groupKey = getDateGroupKey(entry.timestamp);
    const shouldRenderGroup = groupKey !== lastGroup;
    lastGroup = groupKey;
    const sentence = `${actorLabel} ${actionTone.verb} ${formatTargetLabel(entry)} at ${formatTimeOfDay(entry.timestamp)}`;

    return `
      ${shouldRenderGroup ? `<tr class="activity-group-row"><td colspan="5">${getDateGroupLabel(groupKey)}</td></tr>` : ''}
      <tr class="activity-row ${actionTone.className}">
        <td>${escapeHtml(formatTimeOfDay(entry.timestamp))}</td>
        <td><span class="activity-sentence">${escapeHtml(sentence)}</span></td>
        <td><span class="inline-role-badge ${getRoleBadgeClass(actorRole)}">${escapeHtml(formatRoleLabel(actorRole))}</span></td>
        <td>${escapeHtml(ownerLabel)} <span class="inline-role-badge ${getRoleBadgeClass(ownerRole)}">${escapeHtml(formatRoleLabel(ownerRole))}</span></td>
        <td>${escapeHtml(entry.classId || '—')}</td>
      </tr>
    `;
  }).join('');
};

const renderGlobalSearchResults = (entries = []) => {
  if (!dom.globalSearchResultsBody) return;
  if (!entries.length) {
    dom.globalSearchResultsBody.innerHTML = '<tr><td colspan="4" class="empty-row"><div class="smart-empty"><span>🔎</span><p>No search results found.</p></div></td></tr>';
    return;
  }

  dom.globalSearchResultsBody.innerHTML = entries.map((entry) => {
    const owner = findUserRecord(entry.userId);
    const ownerLabel = owner?.name || owner?.email || 'Unknown owner';
    const ownerRole = normalizeUserRole(owner?.role);
    return `
      <tr>
        <td>${escapeHtml(entry.name || 'Student')}</td>
        <td>${escapeHtml(ownerLabel)}</td>
        <td><span class="inline-role-badge ${getRoleBadgeClass(ownerRole)}">${escapeHtml(formatRoleLabel(ownerRole))}</span></td>
        <td>${escapeHtml(entry.classId || '—')}</td>
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
  if (!db || !isFirebaseConfigured) {
    setPanelStatus('Firebase is not configured. User management is unavailable.', 'error');
    setElementVisibility(dom.usersLoading, false);
    return;
  }

  setElementVisibility(dom.usersLoading, true);
  setPanelStatus('Loading users...');

  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const records = [];
    usersSnapshot.forEach((snapshot) => {
      const data = snapshot.data() || {};
      records.push({
        docId: snapshot.id,
        uid: normalizeText(data.uid || snapshot.id),
        email: normalizeText(data.email || '').toLowerCase(),
        name: normalizeText(data.name || ''),
        role: normalizeUserRole(data.role),
        createdAt: data.createdAt || null
      });
    });

    records.sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));
    state.users = records;
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
  }
};

const loadGlobalStats = async () => {
  try {
    const stats = await fetchAdminGlobalStats();
    state.globalStats = {
      totalUsers: Number(stats?.totalUsers || 0),
      totalStudents: Number(stats?.totalStudents || 0),
      totalExams: Number(stats?.totalExams || 0)
    };
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    state.globalStats = {
      totalUsers: getVisibleUsers().length,
      totalStudents: 0,
      totalExams: 0
    };
    showToast('Failed to load global stats', 'error');
  }
  renderStats();
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

const buildGlobalSearchRowsFromSnapshot = (snapshot) => {
  const rows = [];
  snapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) return;

    const refPath = String(entry.ref?.path || '');
    const segments = refPath.split('/');
    const ownerFromPath = segments.length >= 2 ? segments[1] : '';
    const userId = normalizeText(payload.userId || ownerFromPath);
    if (!shouldIncludeGlobalSearchOwner(userId)) {
      return;
    }

    rows.push({
      id: normalizeText(payload.id || entry.id),
      name: normalizeText(payload.name || 'Student'),
      classId: normalizeText(payload.classId || ''),
      userId
    });
  });
  return rows;
};

const buildGlobalSearchRowsFromScopedCollections = async () => {
  const rows = [];
  const seen = new Set();
  let deniedReads = 0;
  let readablePathFound = false;

  const pushUniqueRow = (row) => {
    const userId = normalizeText(row?.userId || '');
    const classId = normalizeText(row?.classId || '');
    const id = normalizeText(row?.id || '');
    const key = `${userId}::${classId}::${id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    rows.push({
      id,
      name: normalizeText(row?.name || 'Student') || 'Student',
      classId,
      userId
    });
  };

  const visibleUsers = getVisibleUsers();
  for (const user of visibleUsers) {
    const userId = normalizeText(user?.uid || '');
    if (!shouldIncludeGlobalSearchOwner(userId)) {
      continue;
    }

    let classesSnapshot = null;
    try {
      classesSnapshot = await getDocs(collection(db, 'users', userId, 'classes'));
      readablePathFound = true;
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        deniedReads += 1;
        continue;
      }
      throw error;
    }

    const classIds = [];
    classesSnapshot.forEach((classEntry) => {
      const classData = classEntry.data() || {};
      const classId = normalizeText(classData.id || classEntry.id);
      if (classId) {
        classIds.push(classId);
      }
    });

    for (const classId of classIds) {
      try {
        const studentsSnapshot = await getDocs(collection(db, 'users', userId, 'classes', classId, 'students'));
        readablePathFound = true;
        studentsSnapshot.forEach((entry) => {
          const payload = entry.data() || {};
          if (payload.deleted === true) return;
          pushUniqueRow({
            id: normalizeText(payload.id || entry.id),
            name: normalizeText(payload.name || 'Student'),
            classId: normalizeText(payload.classId || classId),
            userId: normalizeText(payload.userId || userId)
          });
        });
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          deniedReads += 1;
          continue;
        }
        throw error;
      }
    }
  }

  if (!readablePathFound && deniedReads > 0) {
    const permissionError = new Error('Search unavailable due to permissions.');
    permissionError.code = 'permission-denied';
    throw permissionError;
  }

  return rows;
};

const buildGlobalSearchIndex = async () => {
  if (!db || !isFirebaseConfigured) {
    state.globalSearchIndex = [];
    renderGlobalSearchResults([]);
    setGlobalSearchStatus('Global search unavailable: Firebase is not configured.', 'error');
    return;
  }

  setElementVisibility(dom.globalSearchLoading, true);
  setGlobalSearchStatus('Building global search index...');

  try {
    let rows = [];
    let usedScopedFallback = false;

    try {
      const snapshot = await getDocs(collectionGroup(db, 'students'));
      rows = buildGlobalSearchRowsFromSnapshot(snapshot);
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }
      usedScopedFallback = true;
      rows = await buildGlobalSearchRowsFromScopedCollections();
    }

    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    state.globalSearchIndex = rows;
    state.globalSearchResults = [];
    const modeSuffix = usedScopedFallback ? ' (fallback mode)' : '';
    setGlobalSearchStatus(`Indexed ${rows.length} student${rows.length === 1 ? '' : 's'} for global search${modeSuffix}.`, 'success');
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
  const selectedAction = normalizeText(dom.activityActionFilter?.value || '').toLowerCase();
  const selectedSort = normalizeText(dom.activitySortFilter?.value || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  setElementVisibility(dom.activityLoading, true);
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
    await updateDoc(doc(db, 'users', uid), {
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
