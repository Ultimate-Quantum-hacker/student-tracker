import {
  ACCOUNT_DELETION_STATUS_APPROVED,
  ACCOUNT_DELETION_STATUS_PENDING,
  ACCOUNT_DELETION_STATUS_REJECTED,
  ACCOUNT_STATUS_DELETED,
  normalizeAccountDeletionStatus,
  normalizeAccountStatus,
  normalizeUserRole
} from './auth.js';
import { formatRoleLabel, normalizeText } from './admin-display-utils.js';

const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';

const getAdminUserAccountStatus = (record = {}) => normalizeAccountStatus(record?.status || 'active');
const getAdminUserDeletionStatus = (record = {}) => normalizeAccountDeletionStatus(record?.accountDeletionStatus || 'none');
const isDeletedAdminUserRecord = (record = {}) => getAdminUserAccountStatus(record) === ACCOUNT_STATUS_DELETED;
const hasLockedAdminDeletionRequest = (record = {}) => {
  const deletionStatus = getAdminUserDeletionStatus(record);
  return deletionStatus === ACCOUNT_DELETION_STATUS_PENDING || deletionStatus === ACCOUNT_DELETION_STATUS_APPROVED;
};

const isAdminOnlyViewerRole = (currentRole = '') => normalizeUserRole(currentRole) === ROLE_ADMIN;
export const canManageAdminRoles = (currentRole = '') => normalizeUserRole(currentRole) === ROLE_DEVELOPER;
export const canRunAdminDestructiveActions = (currentRole = '') => normalizeUserRole(currentRole) === ROLE_DEVELOPER;
export const canDeleteAdminRegistryStudents = (currentRole = '') => canRunAdminDestructiveActions(currentRole);
export const canClearAdminActivityLogs = (currentRole = '') => canRunAdminDestructiveActions(currentRole);
export const canReviewAdminAccountDeletion = (currentRole = '') => {
  const normalizedCurrentRole = normalizeUserRole(currentRole);
  return normalizedCurrentRole === ROLE_ADMIN;
};

export const getAdminPanelAccessSummary = (currentRole = '') => {
  const normalizedCurrentRole = normalizeUserRole(currentRole);
  if (normalizedCurrentRole === ROLE_DEVELOPER) {
    return 'Developer mode: review admin data, manage roles, and handle registry cleanup and activity-log maintenance where needed.';
  }

  if (normalizedCurrentRole === ROLE_ADMIN) {
    return 'Admin mode: review users, search, registry, activity history, and account deletion requests. A developer is still required for role changes and destructive admin actions.';
  }

  return 'Restricted access. Admin or developer role required for this panel.';
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

export const buildAdminUsersLoadRequestState = ({
  isFirebaseConfigured = true
} = {}) => {
  if (!isFirebaseConfigured) {
    return {
      canLoad: false,
      statusMessage: 'Firebase is not configured. User management is unavailable.',
      statusType: 'error',
      progressStatusMessage: ''
    };
  }

  return {
    canLoad: true,
    statusMessage: '',
    statusType: '',
    progressStatusMessage: 'Loading users...'
  };
};

export const buildAdminUsersLoadErrorFeedbackState = ({
  isPermissionDenied = false,
  errorMessage = ''
} = {}) => {
  if (isPermissionDenied) {
    return {
      statusMessage: 'Permission denied while loading users.',
      statusType: 'error',
      toastMessage: 'Permission denied',
      toastType: 'error'
    };
  }

  const normalizedErrorMessage = normalizeText(errorMessage);
  return {
    statusMessage: normalizedErrorMessage ? `Failed to load users: ${normalizedErrorMessage}` : 'Failed to load users.',
    statusType: 'error',
    toastMessage: 'Failed to load users',
    toastType: 'error'
  };
};

export const buildAdminUserDeletionReviewState = (record = {}, {
  currentRole = '',
  decision = ''
} = {}) => {
  const normalizedDecision = normalizeText(decision).toLowerCase();
  const targetLabel = normalizeText(record?.name || record?.email || '') || 'this user';
  const progressLabel = normalizedDecision === 'approve' ? 'Approving...' : 'Rejecting...';

  if (!canReviewAdminAccountDeletion(currentRole)) {
    return {
      canReview: false,
      normalizedDecision,
      progressLabel,
      statusMessage: 'Only admins can review deletion requests.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (isDeletedAdminUserRecord(record)) {
    return {
      canReview: false,
      normalizedDecision,
      progressLabel,
      statusMessage: 'Deleted accounts do not need review.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  const deletionStatus = getAdminUserDeletionStatus(record);
  if (deletionStatus !== ACCOUNT_DELETION_STATUS_PENDING) {
    return {
      canReview: false,
      normalizedDecision,
      progressLabel,
      statusMessage: deletionStatus === ACCOUNT_DELETION_STATUS_APPROVED
        ? 'This deletion request has already been approved.'
        : deletionStatus === ACCOUNT_DELETION_STATUS_REJECTED
          ? 'This deletion request has already been rejected.'
          : 'This account does not have a pending deletion request.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (normalizedDecision !== 'approve' && normalizedDecision !== 'reject') {
    return {
      canReview: false,
      normalizedDecision,
      progressLabel: 'Reviewing...',
      statusMessage: 'Choose a valid deletion review action.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  return {
    canReview: true,
    normalizedDecision,
    progressLabel,
    statusMessage: '',
    statusType: '',
    confirmationMessage: normalizedDecision === 'approve'
      ? `Approve the deletion request for ${targetLabel}? The user will still need to confirm the final deletion.`
      : `Reject the deletion request for ${targetLabel}?`,
    confirmLabel: normalizedDecision === 'approve' ? 'Approve Request' : 'Reject Request',
    dangerous: normalizedDecision === 'approve',
    canceledStatusMessage: 'Deletion review canceled.',
    canceledStatusType: 'warning',
    progressStatusMessage: normalizedDecision === 'approve'
      ? 'Approving deletion request...'
      : 'Rejecting deletion request...'
  };
};

export const buildAdminUserDeletionReviewFeedbackState = ({
  decision = ''
} = {}) => {
  const normalizedDecision = normalizeText(decision).toLowerCase();
  return {
    statusMessage: normalizedDecision === 'approve'
      ? 'Deletion request approved.'
      : 'Deletion request rejected.',
    statusType: 'success',
    toastMessage: normalizedDecision === 'approve'
      ? 'Deletion request approved'
      : 'Deletion request rejected',
    toastType: 'success'
  };
};

export const buildAdminUserDeletionReviewErrorFeedbackState = ({
  isPermissionDenied = false,
  errorMessage = '',
  decision = ''
} = {}) => {
  if (isPermissionDenied) {
    return {
      statusMessage: 'Access denied. You do not have permission.',
      statusType: 'error',
      toastMessage: 'Permission denied',
      toastType: 'error'
    };
  }

  const normalizedDecision = normalizeText(decision).toLowerCase();
  const normalizedErrorMessage = normalizeText(errorMessage);
  return {
    statusMessage: normalizedErrorMessage
      ? `Failed to ${normalizedDecision === 'approve' ? 'approve' : 'reject'} deletion request: ${normalizedErrorMessage}`
      : `Failed to ${normalizedDecision === 'approve' ? 'approve' : 'reject'} deletion request.`,
    statusType: 'error',
    toastMessage: normalizedDecision === 'approve'
      ? 'Failed to approve deletion request'
      : 'Failed to reject deletion request',
    toastType: 'error'
  };
};

export const buildAdminGlobalStatsLoadErrorFeedbackState = ({
  visibleUserCount = 0
} = {}) => {
  const parsedVisibleUserCount = Number(visibleUserCount);
  const normalizedVisibleUserCount = Number.isFinite(parsedVisibleUserCount) && parsedVisibleUserCount > 0
    ? Math.floor(parsedVisibleUserCount)
    : 0;

  return {
    fallbackGlobalStats: {
      totalUsers: normalizedVisibleUserCount,
      totalStudents: 0,
      totalExams: 0
    },
    toastMessage: 'Failed to load global stats',
    toastType: 'error'
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

   if (isDeletedAdminUserRecord(record) || hasLockedAdminDeletionRequest(record)) {
     return false;
   }

  return normalizeUserRole(record?.role) !== ROLE_DEVELOPER;
};

export const canPromoteTeacherRecordToAdmin = (record = {}) => {
  return normalizeUserRole(record?.role) === ROLE_TEACHER && Boolean(record?.emailVerified);
};

export const canRenderAdminRoleChangeControl = (record = {}, {
  currentRole = ''
} = {}) => {
  if (!canEditAdminUserRole(record, { currentRole })) {
    return false;
  }

  const normalizedRole = normalizeUserRole(record?.role);
  if (normalizedRole === ROLE_TEACHER) {
    return canPromoteTeacherRecordToAdmin(record);
  }

  return normalizedRole === ROLE_ADMIN;
};

export const getAdminUserRolePolicyLabel = (record = {}, {
  currentRole = ''
} = {}) => {
  if (isDeletedAdminUserRecord(record)) {
    return 'Deleted accounts cannot be updated';
  }

  const deletionStatus = getAdminUserDeletionStatus(record);
  if (deletionStatus === ACCOUNT_DELETION_STATUS_PENDING) {
    return 'Review the pending deletion request before changing this role';
  }
  if (deletionStatus === ACCOUNT_DELETION_STATUS_APPROVED) {
    return 'Deletion approved; role changes are locked';
  }

  if (!canManageAdminRoles(currentRole)) {
    return 'Role changes require a developer';
  }

  const normalizedRole = normalizeUserRole(record?.role);
  if (normalizedRole === ROLE_DEVELOPER) {
    return 'Developer onboarding is manual outside the app';
  }

  if (normalizedRole === ROLE_TEACHER && !Boolean(record?.emailVerified)) {
    return 'Verify this teacher account before admin promotion';
  }

  return 'Role can be updated by a developer';
};

export const getAdminUserAccountSummary = (record = {}) => {
  if (isDeletedAdminUserRecord(record)) {
    return 'Deleted account';
  }

  const deletionStatus = getAdminUserDeletionStatus(record);
  if (deletionStatus === ACCOUNT_DELETION_STATUS_PENDING) {
    return 'Pending deletion review';
  }
  if (deletionStatus === ACCOUNT_DELETION_STATUS_APPROVED) {
    return 'Deletion approved - awaiting user confirmation';
  }
  if (deletionStatus === ACCOUNT_DELETION_STATUS_REJECTED) {
    return 'Deletion request rejected';
  }

  const normalizedRole = normalizeUserRole(record?.role);
  if (normalizedRole === ROLE_DEVELOPER) {
    return 'Protected system account';
  }

  if (normalizedRole === ROLE_ADMIN) {
    return 'Privileged workspace member';
  }

  if (Boolean(record?.emailVerified)) {
    return 'Verified teacher account';
  }

  return 'Workspace member awaiting verification';
};

export const buildAdminUserRoleUpdatePrecheckState = ({
  hasRecord = false,
  canManageRoles = false
} = {}) => {
  if (!hasRecord) {
    return {
      canProceed: false,
      statusMessage: 'Unable to find selected user.',
      statusType: 'error'
    };
  }

  if (!canManageRoles) {
    return {
      canProceed: false,
      statusMessage: 'Only developers can update roles in this panel.',
      statusType: 'warning'
    };
  }

  return {
    canProceed: true,
    statusMessage: '',
    statusType: ''
  };
};

export const buildAdminUserRoleUpdateState = (record = {}, {
  nextRole = '',
  updatableRoles = []
} = {}) => {
  const currentRole = normalizeUserRole(record?.role);
  const isEmailVerified = Boolean(record?.emailVerified);
  const normalizedNextRole = normalizeUserRole(nextRole);
  const normalizedUpdatableRoles = Array.isArray(updatableRoles)
    ? updatableRoles.map((role) => normalizeUserRole(role))
    : [];
  const progressLabel = 'Updating...';

  if (isDeletedAdminUserRecord(record)) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      progressLabel,
      statusMessage: 'Deleted accounts cannot be updated in this panel.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  const deletionStatus = getAdminUserDeletionStatus(record);
  if (deletionStatus === ACCOUNT_DELETION_STATUS_PENDING) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      progressLabel,
      statusMessage: 'Review the pending deletion request before changing this role.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (deletionStatus === ACCOUNT_DELETION_STATUS_APPROVED) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      progressLabel,
      statusMessage: 'Deletion approved accounts cannot be updated in this panel.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (!normalizedUpdatableRoles.includes(normalizedNextRole)) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      progressLabel,
      statusMessage: 'Only teacher and admin roles can be assigned in this panel.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (currentRole === ROLE_DEVELOPER || normalizedNextRole === ROLE_DEVELOPER) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      progressLabel,
      statusMessage: 'Developer onboarding is manual and cannot be changed in this panel.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (currentRole === ROLE_TEACHER && normalizedNextRole === ROLE_ADMIN && !isEmailVerified) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      progressLabel,
      statusMessage: 'Verify this teacher email before promoting the account to admin.',
      statusType: 'warning',
      confirmationMessage: ''
    };
  }

  if (currentRole === normalizedNextRole) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      progressLabel,
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
    progressLabel,
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

export const buildAdminUserRoleUpdateFeedbackState = () => {
  return {
    statusMessage: 'Role updated successfully.',
    statusType: 'success',
    toastMessage: 'Role updated successfully',
    toastType: 'success'
  };
};

export const buildAdminUserRoleUpdateErrorFeedbackState = ({
  isPermissionDenied = false,
  errorMessage = ''
} = {}) => {
  if (isPermissionDenied) {
    return {
      statusMessage: 'Access denied. You do not have permission.',
      statusType: 'error',
      toastMessage: 'Permission denied',
      toastType: 'error'
    };
  }

  const normalizedErrorMessage = normalizeText(errorMessage);
  return {
    statusMessage: normalizedErrorMessage ? `Failed to update role: ${normalizedErrorMessage}` : 'Failed to update role.',
    statusType: 'error',
    toastMessage: 'Failed to update role',
    toastType: 'error'
  };
};

export const buildAdminLogoutRequestState = () => {
  return {
    progressLabel: 'Signing out...'
  };
};

export const buildAdminLogoutErrorFeedbackState = ({
  errorMessage = ''
} = {}) => {
  const normalizedErrorMessage = normalizeText(errorMessage);
  return {
    statusMessage: normalizedErrorMessage ? `Logout failed: ${normalizedErrorMessage}` : 'Logout failed.',
    statusType: 'error',
    toastMessage: 'Logout failed',
    toastType: 'error'
  };
};

export const buildAdminRefreshFeedbackState = () => {
  return {
    toastMessage: 'Panel refreshed',
    toastType: 'success'
  };
};

export const buildAdminInitSuccessFeedbackState = () => {
  return {
    toastMessage: 'Admin panel ready',
    toastType: 'success'
  };
};

export const buildAdminInitErrorFeedbackState = ({
  errorMessage = ''
} = {}) => {
  const normalizedErrorMessage = normalizeText(errorMessage);
  return {
    statusMessage: normalizedErrorMessage ? `Failed to initialize panel: ${normalizedErrorMessage}` : 'Failed to initialize panel.',
    statusType: 'error',
    toastMessage: 'Failed to initialize admin panel',
    toastType: 'error'
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

export const buildAdminGlobalSearchIndexRequestState = ({
  isFirebaseConfigured = true
} = {}) => {
  if (!isFirebaseConfigured) {
    return {
      canBuild: false,
      statusMessage: 'Global search unavailable: Firebase is not configured.',
      statusType: 'error',
      progressStatusMessage: ''
    };
  }

  return {
    canBuild: true,
    statusMessage: '',
    statusType: '',
    progressStatusMessage: 'Building global search index...'
  };
};

export const buildAdminGlobalSearchIndexErrorFeedbackState = ({
  isPermissionDenied = false,
  errorMessage = ''
} = {}) => {
  if (isPermissionDenied) {
    return {
      statusMessage: 'Search unavailable due to permissions.',
      statusType: 'error',
      toastMessage: 'Search unavailable due to permissions',
      toastType: 'warning'
    };
  }

  const normalizedErrorMessage = normalizeText(errorMessage);
  return {
    statusMessage: normalizedErrorMessage ? `Failed to build search index: ${normalizedErrorMessage}` : 'Failed to build search index.',
    statusType: 'error',
    toastMessage: 'Failed to load global search',
    toastType: 'error'
  };
};
