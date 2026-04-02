import { normalizeUserRole } from './auth.js';
import { formatRoleLabel, normalizeText } from './admin-display-utils.js';

const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';

const isAdminOnlyViewerRole = (currentRole = '') => normalizeUserRole(currentRole) === ROLE_ADMIN;
export const canManageAdminRoles = (currentRole = '') => normalizeUserRole(currentRole) === ROLE_DEVELOPER;
export const canDeleteAdminRegistryStudents = (currentRole = '') => {
  const normalizedCurrentRole = normalizeUserRole(currentRole);
  return normalizedCurrentRole === ROLE_ADMIN || normalizedCurrentRole === ROLE_DEVELOPER;
};

export const findAdminUserRecord = (users = [], uid = '') => {
  const records = Array.isArray(users) ? users : [];
  const normalizedUid = normalizeText(uid);
  if (!normalizedUid) {
    return null;
  }

  return records.find((entry) => normalizeText(entry?.uid || '') === normalizedUid) || null;
};

export const getVisibleAdminUsers = (users = [], {
  currentRole = ''
} = {}) => {
  const records = Array.isArray(users) ? users : [];
  if (!isAdminOnlyViewerRole(currentRole)) {
    return records.slice();
  }

  return records.filter((entry) => normalizeUserRole(entry?.role) !== ROLE_DEVELOPER);
};

export const getFilteredAdminUsers = (users = [], {
  currentRole = '',
  searchTerm = ''
} = {}) => {
  const visibleUsers = getVisibleAdminUsers(users, { currentRole });
  const normalizedSearchTerm = normalizeText(searchTerm).toLowerCase();
  if (!normalizedSearchTerm) {
    return visibleUsers;
  }

  return visibleUsers.filter((record) => {
    const name = String(record?.name || '').toLowerCase();
    const email = String(record?.email || '').toLowerCase();
    return name.includes(normalizedSearchTerm) || email.includes(normalizedSearchTerm);
  });
};

export const buildAdminUsersLoadFeedbackState = ({
  visibleCount = 0
} = {}) => {
  const parsedVisibleCount = Number(visibleCount);
  const normalizedVisibleCount = Number.isFinite(parsedVisibleCount) && parsedVisibleCount > 0
    ? Math.floor(parsedVisibleCount)
    : 0;

  return {
    statusMessage: `Loaded ${normalizedVisibleCount} user${normalizedVisibleCount === 1 ? '' : 's'}.`,
    statusType: 'success'
  };
};

export const canEditAdminUserRole = (record = {}, {
  currentRole = ''
} = {}) => {
  if (!canManageAdminRoles(currentRole)) {
    return false;
  }

  if (!normalizeText(record?.uid || '')) {
    return false;
  }

  return normalizeUserRole(record?.role) !== ROLE_DEVELOPER;
};

export const buildAdminUserRoleUpdateState = (record = {}, {
  nextRole = '',
  updatableRoles = []
} = {}) => {
  const currentRole = normalizeUserRole(record?.role);
  const normalizedNextRole = normalizeUserRole(nextRole);
  const normalizedUpdatableRoles = Array.isArray(updatableRoles)
    ? updatableRoles.map((role) => normalizeUserRole(role))
    : [];

  if (!normalizedUpdatableRoles.includes(normalizedNextRole)) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      statusMessage: 'Only teacher and admin roles can be assigned in this panel.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (currentRole === normalizedNextRole) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      statusMessage: 'No role changes to apply.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  const targetLabel = normalizeText(record?.name || record?.email || '') || 'this user';
  return {
    currentRole,
    normalizedNextRole,
    canUpdate: true,
    statusMessage: '',
    statusType: '',
    confirmationMessage: `Change role for ${targetLabel} from ${formatRoleLabel(currentRole)} to ${formatRoleLabel(normalizedNextRole)}?`,
    confirmLabel: 'Update Role',
    dangerous: true,
    canceledStatusMessage: 'Role change canceled.',
    canceledStatusType: 'warning',
    progressStatusMessage: 'Updating role...'
  };
};

export const getVisibleAdminActivityEntries = (entries = [], users = [], {
  currentRole = ''
} = {}) => {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  if (!isAdminOnlyViewerRole(currentRole)) {
    return normalizedEntries;
  }

  return normalizedEntries.filter((entry) => {
    const actor = findAdminUserRecord(users, entry?.userId);
    const owner = findAdminUserRecord(users, entry?.dataOwnerUserId);
    const actorRole = normalizeUserRole(actor?.role);
    const ownerRole = normalizeUserRole(owner?.role);
    return actorRole !== ROLE_DEVELOPER && ownerRole !== ROLE_DEVELOPER;
  });
};

export const shouldIncludeAdminOwner = (userId = '', users = [], {
  currentRole = ''
} = {}) => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return false;
  }

  if (!isAdminOnlyViewerRole(currentRole)) {
    return true;
  }

  const owner = findAdminUserRecord(users, normalizedUserId);
  return normalizeUserRole(owner?.role) !== ROLE_DEVELOPER;
};

export const buildVisibleAdminGlobalSearchRows = (rows = [], {
  shouldIncludeOwner = () => true
} = {}) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const includeOwner = typeof shouldIncludeOwner === 'function'
    ? shouldIncludeOwner
    : () => true;

  return normalizedRows
    .filter((entry) => includeOwner(entry?.userId))
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
};

export const getFilteredAdminGlobalSearchRows = (rows = [], {
  searchTerm = ''
} = {}) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedSearchTerm = normalizeText(searchTerm).toLowerCase();
  if (!normalizedSearchTerm) {
    return normalizedRows.slice();
  }

  return normalizedRows.filter((entry) => String(entry?.name || '').toLowerCase().includes(normalizedSearchTerm));
};

export const buildAdminGlobalSearchFeedbackState = ({
  searchTerm = '',
  resultCount = 0,
  isIndexLoaded = true
} = {}) => {
  const normalizedSearchTerm = normalizeText(searchTerm);
  const parsedResultCount = Number(resultCount);
  const normalizedResultCount = Number.isFinite(parsedResultCount) && parsedResultCount > 0
    ? Math.floor(parsedResultCount)
    : 0;

  if (!normalizedSearchTerm) {
    const idleMessage = isIndexLoaded
      ? 'Search by student name to see results.'
      : 'Search by student name to load results.';
    return {
      emptyMessage: idleMessage,
      statusMessage: idleMessage,
      statusType: ''
    };
  }

  return {
    emptyMessage: 'No search results found.',
    statusMessage: `Found ${normalizedResultCount} result${normalizedResultCount === 1 ? '' : 's'}.`,
    statusType: normalizedResultCount ? 'success' : 'warning'
  };
};

export const buildAdminGlobalSearchIndexFeedbackState = ({
  indexedCount = 0
} = {}) => {
  const parsedIndexedCount = Number(indexedCount);
  const normalizedIndexedCount = Number.isFinite(parsedIndexedCount) && parsedIndexedCount > 0
    ? Math.floor(parsedIndexedCount)
    : 0;

  return {
    statusMessage: `Indexed ${normalizedIndexedCount} student${normalizedIndexedCount === 1 ? '' : 's'} for global search.`,
    statusType: 'success'
  };
};
