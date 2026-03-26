import {
  db,
  collection,
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
  fetchUserScopedData,
  fetchActivityLogs
} from '../services/db.js';

const DASHBOARD_PATH = '/index.html';
const LOGIN_PATH = '/login.html';
const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const UPDATABLE_ROLES = [ROLE_TEACHER, ROLE_ADMIN];

const state = {
  authUser: null,
  currentRole: ROLE_TEACHER,
  users: [],
  viewingUserId: '',
  activityLogs: [],
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
  totalUsers: document.getElementById('admin-total-users'),
  totalStudents: document.getElementById('admin-total-students'),
  totalExams: document.getElementById('admin-total-exams'),
  viewingIndicator: document.getElementById('viewing-context-indicator'),
  viewingLabel: document.getElementById('viewing-context-label'),
  clearViewingBtn: document.getElementById('clear-viewing-btn'),
  viewingLoading: document.getElementById('viewing-user-loading'),
  viewingSummary: document.getElementById('viewing-user-summary'),
  viewingClasses: document.getElementById('viewing-user-classes'),
  viewingStudents: document.getElementById('viewing-user-students'),
  viewingSubjects: document.getElementById('viewing-user-subjects'),
  viewingExams: document.getElementById('viewing-user-exams'),
  activityStatus: document.getElementById('activity-status'),
  activityLoading: document.getElementById('activity-loading'),
  activityBody: document.getElementById('activity-table-body'),
  activityUserFilter: document.getElementById('activity-user-filter'),
  activityActionFilter: document.getElementById('activity-action-filter'),
  activitySortFilter: document.getElementById('activity-sort-filter'),
  refreshActivityBtn: document.getElementById('refresh-activity-btn')
};

const redirectToDashboard = () => {
  if (window.location.pathname.endsWith(DASHBOARD_PATH)) return;
  window.location.replace(DASHBOARD_PATH);
};

const redirectToLogin = () => {
  if (window.location.pathname.endsWith(LOGIN_PATH)) return;
  window.location.replace(LOGIN_PATH);
};

const setPanelStatus = (message, type = '') => {
  if (!dom.status) return;
  dom.status.textContent = String(message || '');
  dom.status.className = 'panel-status';
  if (type) {
    dom.status.classList.add(type);
  }
};

const setActivityStatus = (message, type = '') => {
  if (!dom.activityStatus) return;
  dom.activityStatus.textContent = String(message || '');
  dom.activityStatus.className = 'panel-status';
  if (type) {
    dom.activityStatus.classList.add(type);
  }
};

const setElementVisibility = (element, shouldShow) => {
  if (!element) return;
  element.style.display = shouldShow ? 'block' : 'none';
};

const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatRoleLabel = (role) => {
  const normalized = normalizeUserRole(role);
  if (normalized === ROLE_DEVELOPER) return 'Developer';
  if (normalized === ROLE_ADMIN) return 'Admin';
  return 'Teacher';
};

const formatCreatedAt = (value) => {
  if (!value) return '—';
  if (typeof value?.toDate === 'function') {
    return value.toDate().toLocaleString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString();
};

const formatLogAction = (action) => {
  const normalized = String(action || '').trim().toLowerCase();
  if (!normalized) return 'Unknown Action';

  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const isPermissionDeniedError = (error) => String(error?.code || '').toLowerCase().includes('permission-denied');
const canManageRoles = () => state.currentRole === ROLE_DEVELOPER;

const findUserRecord = (uid = '') => {
  const normalizedUid = String(uid || '').trim();
  return state.users.find((entry) => entry.uid === normalizedUid) || null;
};

const getFilteredUsers = () => {
  const searchTerm = String(dom.searchInput?.value || '').trim().toLowerCase();
  if (!searchTerm) {
    return state.users.slice();
  }

  return state.users.filter((record) => {
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

  const options = normalizedRole === ROLE_DEVELOPER
    ? [ROLE_DEVELOPER]
    : UPDATABLE_ROLES;

  options.forEach((role) => {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = formatRoleLabel(role);
    if (role === normalizedRole) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  if (!canEditRole(record)) {
    select.disabled = true;
  }

  return select;
};

const renderViewingIndicator = () => {
  const activeRecord = findUserRecord(state.viewingUserId);
  const hasViewingContext = Boolean(activeRecord && state.viewingUserId);

  if (dom.viewingIndicator) {
    dom.viewingIndicator.hidden = !hasViewingContext;
  }
  if (!hasViewingContext) {
    if (dom.viewingLabel) {
      dom.viewingLabel.textContent = 'Viewing as yourself';
    }
    return;
  }

  const roleLabel = formatRoleLabel(activeRecord.role);
  if (dom.viewingLabel) {
    dom.viewingLabel.textContent = `Viewing as: ${activeRecord.name || activeRecord.email || activeRecord.uid} (${roleLabel})`;
  }
};

const renderUsersTable = () => {
  if (!dom.tableBody) return;

  const filteredUsers = getFilteredUsers();
  if (!filteredUsers.length) {
    dom.tableBody.innerHTML = '<tr><td colspan="5" class="empty-row">No users match your search.</td></tr>';
    return;
  }

  dom.tableBody.innerHTML = '';

  filteredUsers.forEach((record) => {
    const row = document.createElement('tr');
    const isViewingUser = String(record.uid || '').trim() === String(state.viewingUserId || '').trim();
    if (isViewingUser) {
      row.classList.add('row-active');
    }

    const nameCell = document.createElement('td');
    nameCell.textContent = String(record.name || '—');

    const emailCell = document.createElement('td');
    emailCell.className = 'email-cell';
    emailCell.textContent = String(record.email || '—');

    const roleCell = document.createElement('td');
    roleCell.appendChild(buildRoleSelect(record));

    const createdCell = document.createElement('td');
    createdCell.textContent = formatCreatedAt(record.createdAt);

    const actionCell = document.createElement('td');
    actionCell.className = 'table-actions-cell';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn btn-secondary';
    viewBtn.dataset.action = 'view-user';
    viewBtn.dataset.userId = record.uid;
    viewBtn.textContent = isViewingUser ? 'Viewing' : 'View Data';
    viewBtn.disabled = isViewingUser;

    actionCell.appendChild(viewBtn);

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
  if (dom.totalUsers) {
    dom.totalUsers.textContent = String(state.globalStats.totalUsers || 0);
  }
  if (dom.totalStudents) {
    dom.totalStudents.textContent = String(state.globalStats.totalStudents || 0);
  }
  if (dom.totalExams) {
    dom.totalExams.textContent = String(state.globalStats.totalExams || 0);
  }
};

const renderViewingUserData = (payload = null) => {
  if (!dom.viewingSummary || !dom.viewingClasses || !dom.viewingStudents || !dom.viewingSubjects || !dom.viewingExams) {
    return;
  }

  if (!payload) {
    dom.viewingSummary.innerHTML = '<div class="empty-row">Select a user to preview their data context.</div>';
    dom.viewingClasses.innerHTML = '<li class="empty-row">No data loaded.</li>';
    dom.viewingStudents.innerHTML = '<li class="empty-row">No data loaded.</li>';
    dom.viewingSubjects.innerHTML = '<li class="empty-row">No data loaded.</li>';
    dom.viewingExams.innerHTML = '<li class="empty-row">No data loaded.</li>';
    return;
  }

  const counts = payload.counts || {};
  dom.viewingSummary.innerHTML = `
    <div class="mini-stat-card"><span>Classes</span><strong>${Number(counts.classes || 0)}</strong></div>
    <div class="mini-stat-card"><span>Students</span><strong>${Number(counts.students || 0)}</strong></div>
    <div class="mini-stat-card"><span>Subjects</span><strong>${Number(counts.subjects || 0)}</strong></div>
    <div class="mini-stat-card"><span>Exams</span><strong>${Number(counts.exams || 0)}</strong></div>
  `;

  const renderList = (container, entries, formatter, emptyMessage) => {
    if (!container) return;
    if (!Array.isArray(entries) || !entries.length) {
      container.innerHTML = `<li class="empty-row">${emptyMessage}</li>`;
      return;
    }

    container.innerHTML = entries.slice(0, 12).map((entry) => {
      return `<li>${formatter(entry)}</li>`;
    }).join('');
  };

  renderList(dom.viewingClasses, payload.classes, (entry) => {
    return `${escapeHtml(entry.name || 'Class')} <small>${escapeHtml(entry.id || '')}</small>`;
  }, 'No classes found.');

  renderList(dom.viewingStudents, payload.students, (entry) => {
    return `${escapeHtml(entry.name || 'Student')} <small>${escapeHtml(entry.classId || '')}</small>`;
  }, 'No students found.');

  renderList(dom.viewingSubjects, payload.subjects, (entry) => {
    return `${escapeHtml(entry.name || 'Subject')} <small>${escapeHtml(entry.classId || '')}</small>`;
  }, 'No subjects found.');

  renderList(dom.viewingExams, payload.exams, (entry) => {
    return `${escapeHtml(entry.title || 'Exam')} <small>${escapeHtml(entry.classId || '')}</small>`;
  }, 'No exams found.');
};

const renderActivityLogTable = (entries = []) => {
  if (!dom.activityBody) return;
  if (!entries.length) {
    dom.activityBody.innerHTML = '<tr><td colspan="6" class="empty-row">No activity logs found for the current filters.</td></tr>';
    return;
  }

  dom.activityBody.innerHTML = entries.map((entry) => {
    const actor = findUserRecord(entry.userId);
    const owner = findUserRecord(entry.dataOwnerUserId);
    const actorLabel = actor?.name || actor?.email || entry.userEmail || entry.userId || 'Unknown';
    const ownerLabel = owner?.name || owner?.email || entry.dataOwnerUserId || 'Unknown';

    return `
      <tr>
        <td>${escapeHtml(formatCreatedAt(entry.timestamp))}</td>
        <td>${escapeHtml(actorLabel)}</td>
        <td>${escapeHtml(formatLogAction(entry.action))}</td>
        <td>${escapeHtml(entry.targetType || '—')}${entry.targetId ? ` (${escapeHtml(entry.targetId)})` : ''}</td>
        <td>${escapeHtml(ownerLabel)}</td>
        <td>${escapeHtml(entry.classId || '—')}</td>
      </tr>
    `;
  }).join('');
};

const populateActivityUserFilter = () => {
  if (!dom.activityUserFilter) return;
  const selectedValue = String(dom.activityUserFilter.value || '').trim();

  const options = ['<option value="">All users</option>'];
  state.users.forEach((record) => {
    const label = `${record.name || record.email || record.uid} (${formatRoleLabel(record.role)})`;
    options.push(`<option value="${escapeHtml(record.uid)}">${escapeHtml(label)}</option>`);
  });

  dom.activityUserFilter.innerHTML = options.join('');
  const stillExists = state.users.some((record) => record.uid === selectedValue);
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
        uid: String(data.uid || snapshot.id || '').trim(),
        email: String(data.email || '').trim().toLowerCase(),
        name: String(data.name || '').trim(),
        role: normalizeUserRole(data.role),
        createdAt: data.createdAt || null
      });
    });

    records.sort((a, b) => {
      const emailA = String(a.email || '').toLowerCase();
      const emailB = String(b.email || '').toLowerCase();
      return emailA.localeCompare(emailB);
    });

    state.users = records;
    renderUsersTable();
    populateActivityUserFilter();
    setPanelStatus(`Loaded ${records.length} user${records.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    console.error('Failed to fetch users:', error);
    if (isPermissionDeniedError(error)) {
      setPanelStatus('Access denied. You do not have permission.', 'error');
      return;
    }
    setPanelStatus(`Failed to load users: ${formatAuthError(error)}`, 'error');
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
      totalUsers: state.users.length,
      totalStudents: 0,
      totalExams: 0
    };
  }
  renderStats();
};

const loadViewingUserData = async () => {
  if (!state.viewingUserId) {
    renderViewingIndicator();
    renderViewingUserData(null);
    return;
  }

  setElementVisibility(dom.viewingLoading, true);
  renderViewingIndicator();

  try {
    const payload = await fetchUserScopedData(state.viewingUserId);
    renderViewingUserData(payload);
  } catch (error) {
    console.error('Failed to load selected user data:', error);
    renderViewingUserData(null);
    setPanelStatus(`Failed to load selected user data: ${formatAuthError(error)}`, 'error');
  } finally {
    setElementVisibility(dom.viewingLoading, false);
  }
};

const loadActivityLogs = async () => {
  const selectedUserId = String(dom.activityUserFilter?.value || '').trim();
  const selectedAction = String(dom.activityActionFilter?.value || '').trim().toLowerCase();
  const selectedSort = String(dom.activitySortFilter?.value || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';

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
    setActivityStatus(`Loaded ${entries.length} log entr${entries.length === 1 ? 'y' : 'ies'}.`, 'success');
  } catch (error) {
    console.error('Failed to load activity logs:', error);
    state.activityLogs = [];
    renderActivityLogTable([]);
    if (isPermissionDeniedError(error)) {
      setActivityStatus('Access denied. You do not have permission to read activity logs.', 'error');
      return;
    }
    setActivityStatus(`Failed to load activity logs: ${formatAuthError(error)}`, 'error');
  } finally {
    setElementVisibility(dom.activityLoading, false);
  }
};

const setViewingUser = async (uid = '') => {
  state.viewingUserId = String(uid || '').trim();
  renderUsersTable();
  renderViewingIndicator();
  await loadViewingUserData();

  if (dom.activityUserFilter) {
    dom.activityUserFilter.value = state.viewingUserId;
  }
  await loadActivityLogs();
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

  try {
    setPanelStatus('Updating role...');
    await updateDoc(doc(db, 'users', uid), {
      uid,
      name: String(record.name || '').trim(),
      email: String(record.email || '').trim().toLowerCase(),
      role: normalizedNextRole
    });

    record.role = normalizedNextRole;
    renderUsersTable();
    populateActivityUserFilter();
    setPanelStatus('Role updated successfully.', 'success');
  } catch (error) {
    console.error('Failed to update role:', error);
    if (isPermissionDeniedError(error)) {
      setPanelStatus('Access denied. You do not have permission.', 'error');
      return;
    }
    setPanelStatus(`Failed to update role: ${formatAuthError(error)}`, 'error');
  }
};

const bindEvents = () => {
  dom.searchInput?.addEventListener('input', () => {
    renderUsersTable();
  });

  dom.refreshBtn?.addEventListener('click', async () => {
    await fetchUsers();
    await loadGlobalStats();
    await loadActivityLogs();
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

  dom.clearViewingBtn?.addEventListener('click', async () => {
    await setViewingUser('');
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
      dom.logoutBtn.disabled = false;
      dom.logoutBtn.textContent = previousLabel;
    }
  });

  dom.tableBody?.addEventListener('click', async (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger) return;

    const uid = String(trigger.dataset.userId || '').trim();
    if (!uid) return;

    const action = String(trigger.dataset.action || '').trim();
    if (action === 'view-user') {
      trigger.disabled = true;
      await setViewingUser(uid);
      return;
    }

    if (action !== 'update-role') {
      return;
    }

    const roleSelect = trigger.closest('tr')?.querySelector('select.role-select');
    const nextRole = String(roleSelect?.value || '').trim();
    if (!nextRole) return;

    trigger.disabled = true;
    const previousLabel = trigger.textContent;
    trigger.textContent = 'Updating...';

    await updateUserRole(uid, nextRole);

    trigger.textContent = previousLabel;
    trigger.disabled = !canEditRole(findUserRecord(uid));
  });
};

const ensurePanelAccess = async () => {
  const authUser = await waitForInitialAuthState();
  if (!authUser) {
    redirectToLogin();
    return false;
  }

  state.authUser = authUser;
  const resolvedRole = normalizeUserRole(await resolveUserRole(authUser));
  state.currentRole = isDeveloperAccountEmail(authUser?.email)
    ? ROLE_DEVELOPER
    : resolvedRole;

  console.log('Logged in email:', String(authUser?.email || '').trim().toLowerCase() || '(none)');
  console.log('Final role:', state.currentRole);

  if (dom.roleBadge) {
    dom.roleBadge.textContent = formatRoleLabel(state.currentRole);
  }

  if (state.currentRole !== ROLE_ADMIN && state.currentRole !== ROLE_DEVELOPER) {
    redirectToDashboard();
    return false;
  }

  return true;
};

const init = async () => {
  bindEvents();
  renderViewingUserData(null);
  renderViewingIndicator();

  try {
    const canAccessPanel = await ensurePanelAccess();
    if (!canAccessPanel) return;

    await fetchUsers();
    await loadGlobalStats();
    await loadActivityLogs();
  } catch (error) {
    console.error('Failed to initialize admin panel:', error);
    setPanelStatus(`Failed to initialize panel: ${formatAuthError(error)}`, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  init();
});
