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

const DASHBOARD_PATH = '/index.html';
const LOGIN_PATH = '/login.html';
const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const UPDATABLE_ROLES = [ROLE_TEACHER, ROLE_ADMIN];

const state = {
  authUser: null,
  currentRole: ROLE_TEACHER,
  users: []
};

const dom = {
  roleBadge: document.getElementById('panel-role-badge'),
  status: document.getElementById('panel-status'),
  loading: document.getElementById('users-loading'),
  tableBody: document.getElementById('users-table-body'),
  searchInput: document.getElementById('users-search-input'),
  refreshBtn: document.getElementById('refresh-users-btn'),
  dashboardBtn: document.getElementById('go-dashboard-btn'),
  logoutBtn: document.getElementById('panel-logout-btn')
};

const redirectToDashboard = () => {
  if (window.location.pathname.endsWith(DASHBOARD_PATH)) return;
  window.location.replace(DASHBOARD_PATH);
};

const redirectToLogin = () => {
  if (window.location.pathname.endsWith(LOGIN_PATH)) return;
  window.location.replace(LOGIN_PATH);
};

const formatRoleLabel = (role) => {
  const normalized = normalizeUserRole(role);
  if (normalized === ROLE_DEVELOPER) return 'Developer';
  if (normalized === ROLE_ADMIN) return 'Admin';
  return 'Teacher';
};

const setStatus = (message, type = '') => {
  if (!dom.status) return;
  dom.status.textContent = String(message || '');
  dom.status.className = 'panel-status';
  if (type) {
    dom.status.classList.add(type);
  }
};

const setLoading = (isLoading) => {
  if (!dom.loading) return;
  dom.loading.style.display = isLoading ? 'block' : 'none';
};

const isPermissionDeniedError = (error) => String(error?.code || '').toLowerCase().includes('permission-denied');

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

const canEditRole = (record) => {
  const normalizedRole = normalizeUserRole(record?.role);
  if (!record?.uid) return false;
  if (normalizedRole === ROLE_DEVELOPER) return false;
  if (isDeveloperAccountEmail(record?.email)) return false;
  return true;
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

    row.appendChild(nameCell);
    row.appendChild(emailCell);
    row.appendChild(roleCell);
    row.appendChild(createdCell);
    row.appendChild(actionCell);

    dom.tableBody.appendChild(row);
  });
};

const fetchUsers = async () => {
  if (!db || !isFirebaseConfigured) {
    setStatus('Firebase is not configured. User management is unavailable.', 'error');
    setLoading(false);
    return;
  }

  setLoading(true);
  setStatus('Loading users...');

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
    setStatus(`Loaded ${records.length} user${records.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    console.error('Failed to fetch users:', error);
    if (isPermissionDeniedError(error)) {
      setStatus('Access denied. You don\'t have permission.', 'error');
      return;
    }
    setStatus(`Failed to load users: ${formatAuthError(error)}`, 'error');
  } finally {
    setLoading(false);
  }
};

const updateUserRole = async (uid, nextRole) => {
  const record = state.users.find((entry) => entry.uid === uid);
  if (!record) {
    setStatus('Unable to find selected user.', 'error');
    return;
  }

  const normalizedNextRole = normalizeUserRole(nextRole);
  const currentRole = normalizeUserRole(record.role);

  if (!UPDATABLE_ROLES.includes(normalizedNextRole)) {
    setStatus('Only teacher and admin roles can be assigned in this panel.', 'warning');
    return;
  }

  if (isDeveloperAccountEmail(record.email) && normalizedNextRole !== ROLE_DEVELOPER) {
    setStatus('Developer account role cannot be downgraded.', 'error');
    return;
  }

  if (record.uid === state.authUser?.uid && currentRole === ROLE_DEVELOPER && normalizedNextRole !== ROLE_DEVELOPER) {
    setStatus('You cannot remove your own developer role.', 'error');
    return;
  }

  if (currentRole === normalizedNextRole) {
    setStatus('No role changes to apply.', 'warning');
    return;
  }

  try {
    setStatus('Updating role...');
    await updateDoc(doc(db, 'users', uid), {
      uid,
      name: String(record.name || '').trim(),
      email: String(record.email || '').trim().toLowerCase(),
      role: normalizedNextRole
    });

    record.role = normalizedNextRole;
    renderUsersTable();
    setStatus('Role updated successfully.', 'success');
  } catch (error) {
    console.error('Failed to update role:', error);
    if (isPermissionDeniedError(error)) {
      setStatus('Access denied. You don\'t have permission.', 'error');
      return;
    }
    setStatus(`Failed to update role: ${formatAuthError(error)}`, 'error');
  }
};

const bindEvents = () => {
  dom.searchInput?.addEventListener('input', () => {
    renderUsersTable();
  });

  dom.refreshBtn?.addEventListener('click', async () => {
    await fetchUsers();
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
      setStatus(`Logout failed: ${formatAuthError(error)}`, 'error');
      dom.logoutBtn.disabled = false;
      dom.logoutBtn.textContent = previousLabel;
    }
  });

  dom.tableBody?.addEventListener('click', async (event) => {
    const trigger = event.target.closest('button[data-action="update-role"]');
    if (!trigger) return;

    const uid = String(trigger.dataset.userId || '').trim();
    if (!uid) return;

    const roleSelect = trigger.closest('tr')?.querySelector('select.role-select');
    const nextRole = String(roleSelect?.value || '').trim();
    if (!nextRole) return;

    trigger.disabled = true;
    const previousLabel = trigger.textContent;
    trigger.textContent = 'Updating...';

    await updateUserRole(uid, nextRole);

    trigger.textContent = previousLabel;
    trigger.disabled = !canEditRole(state.users.find((entry) => entry.uid === uid));
  });
};

const ensureDeveloperAccess = async () => {
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

  if (state.currentRole !== ROLE_DEVELOPER) {
    redirectToDashboard();
    return false;
  }

  return true;
};

const init = async () => {
  bindEvents();

  try {
    const canAccessPanel = await ensureDeveloperAccess();
    if (!canAccessPanel) return;
    await fetchUsers();
  } catch (error) {
    console.error('Failed to initialize developer panel:', error);
    setStatus(`Failed to initialize panel: ${formatAuthError(error)}`, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  init();
});
