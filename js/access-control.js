export const ROLE_TEACHER = 'teacher';
export const ROLE_HEAD_TEACHER = 'head_teacher';
export const ROLE_ADMIN = 'admin';
export const ROLE_DEVELOPER = 'developer';
export const ROLE_LEGACY_USER = 'user';

export const PERMISSION_READ_OWN_CLASS_DATA = 'read_own_class_data';
export const PERMISSION_WRITE_OWN_CLASS_DATA = 'write_own_class_data';
export const PERMISSION_READ_ALL_DATA = 'read_all_data';
export const PERMISSION_WRITE_ALL_TEACHER_DATA = 'write_all_teacher_data';
export const PERMISSION_SEND_MESSAGES = 'send_messages';
export const PERMISSION_MESSAGE_ALL_USERS = 'message_all_users';
export const PERMISSION_MESSAGE_ROLES = 'message_roles';
export const PERMISSION_MESSAGE_INDIVIDUALS = 'message_individuals';
export const PERMISSION_MESSAGE_CLASS_GROUPS = 'message_class_groups';
export const PERMISSION_RECEIVE_MESSAGES = 'receive_messages';
export const PERMISSION_REPLY_MESSAGES = 'reply_messages';
export const PERMISSION_ACCESS_ADMIN_PANEL = 'access_admin_panel';
export const PERMISSION_MANAGE_USER_ROLES = 'manage_user_roles';
export const PERMISSION_MANAGE_SYSTEM_CONFIG = 'manage_system_config';
export const PERMISSION_REVIEW_ACCOUNT_DELETION = 'review_account_deletion';
export const PERMISSION_READ_ACTIVITY_LOGS = 'read_activity_logs';
export const PERMISSION_CLEAR_ACTIVITY_LOGS = 'clear_activity_logs';
export const PERMISSION_DELETE_REGISTRY_STUDENTS = 'delete_registry_students';

export const MESSAGE_AUDIENCE_ALL = 'all';
export const MESSAGE_AUDIENCE_ROLE = 'role';
export const MESSAGE_AUDIENCE_INDIVIDUAL = 'individual';
export const MESSAGE_AUDIENCE_CLASS = 'class';

export const DEFAULT_USER_ROLE = ROLE_TEACHER;
export const USER_ROLES = [
  ROLE_TEACHER,
  ROLE_HEAD_TEACHER,
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_LEGACY_USER
];

const ALL_PERMISSIONS = [
  PERMISSION_READ_OWN_CLASS_DATA,
  PERMISSION_WRITE_OWN_CLASS_DATA,
  PERMISSION_READ_ALL_DATA,
  PERMISSION_WRITE_ALL_TEACHER_DATA,
  PERMISSION_SEND_MESSAGES,
  PERMISSION_MESSAGE_ALL_USERS,
  PERMISSION_MESSAGE_ROLES,
  PERMISSION_MESSAGE_INDIVIDUALS,
  PERMISSION_MESSAGE_CLASS_GROUPS,
  PERMISSION_RECEIVE_MESSAGES,
  PERMISSION_REPLY_MESSAGES,
  PERMISSION_ACCESS_ADMIN_PANEL,
  PERMISSION_MANAGE_USER_ROLES,
  PERMISSION_MANAGE_SYSTEM_CONFIG,
  PERMISSION_REVIEW_ACCOUNT_DELETION,
  PERMISSION_READ_ACTIVITY_LOGS,
  PERMISSION_CLEAR_ACTIVITY_LOGS,
  PERMISSION_DELETE_REGISTRY_STUDENTS
];

const ROLE_PERMISSION_MAP = {
  [ROLE_TEACHER]: [
    PERMISSION_READ_OWN_CLASS_DATA,
    PERMISSION_WRITE_OWN_CLASS_DATA,
    PERMISSION_RECEIVE_MESSAGES,
    PERMISSION_REPLY_MESSAGES
  ],
  [ROLE_HEAD_TEACHER]: [
    PERMISSION_READ_OWN_CLASS_DATA,
    PERMISSION_WRITE_OWN_CLASS_DATA,
    PERMISSION_READ_ALL_DATA,
    PERMISSION_WRITE_ALL_TEACHER_DATA,
    PERMISSION_SEND_MESSAGES,
    PERMISSION_MESSAGE_INDIVIDUALS,
    PERMISSION_RECEIVE_MESSAGES,
    PERMISSION_REPLY_MESSAGES,
    PERMISSION_ACCESS_ADMIN_PANEL,
    PERMISSION_READ_ACTIVITY_LOGS
  ],
  [ROLE_ADMIN]: [
    PERMISSION_READ_ALL_DATA,
    PERMISSION_SEND_MESSAGES,
    PERMISSION_MESSAGE_ALL_USERS,
    PERMISSION_MESSAGE_ROLES,
    PERMISSION_MESSAGE_INDIVIDUALS,
    PERMISSION_MESSAGE_CLASS_GROUPS,
    PERMISSION_RECEIVE_MESSAGES,
    PERMISSION_REPLY_MESSAGES,
    PERMISSION_ACCESS_ADMIN_PANEL,
    PERMISSION_REVIEW_ACCOUNT_DELETION,
    PERMISSION_READ_ACTIVITY_LOGS
  ],
  [ROLE_DEVELOPER]: ALL_PERMISSIONS.filter((permission) => permission !== PERMISSION_REVIEW_ACCOUNT_DELETION)
};

const ROLE_HIERARCHY = {
  [ROLE_TEACHER]: 1,
  [ROLE_HEAD_TEACHER]: 2,
  [ROLE_ADMIN]: 3,
  [ROLE_DEVELOPER]: 4
};

const unique = (values = []) => Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));

export const normalizeUserRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === ROLE_LEGACY_USER) {
    return ROLE_TEACHER;
  }
  return USER_ROLES.includes(normalized) ? normalized : DEFAULT_USER_ROLE;
};

export const normalizePermission = (permission) => {
  const normalized = String(permission || '').trim().toLowerCase();
  return ALL_PERMISSIONS.includes(normalized) ? normalized : '';
};

export const normalizePermissions = (permissions = []) => {
  return unique((Array.isArray(permissions) ? permissions : []).map((permission) => normalizePermission(permission)).filter(Boolean));
};

export const getDefaultPermissionsForRole = (role) => {
  const normalizedRole = normalizeUserRole(role);
  return ROLE_PERMISSION_MAP[normalizedRole] ? ROLE_PERMISSION_MAP[normalizedRole].slice() : ROLE_PERMISSION_MAP[DEFAULT_USER_ROLE].slice();
};

export const resolvePermissionsForRole = (role, permissions = []) => {
  const normalizedPermissions = normalizePermissions(permissions);
  if (normalizedPermissions.length) {
    return normalizedPermissions;
  }
  return getDefaultPermissionsForRole(role);
};

export const getRoleHierarchyRank = (role) => {
  return ROLE_HIERARCHY[normalizeUserRole(role)] || ROLE_HIERARCHY[DEFAULT_USER_ROLE];
};

export const formatUserRoleLabel = (role) => {
  const normalizedRole = normalizeUserRole(role);
  if (normalizedRole === ROLE_DEVELOPER) return 'Developer';
  if (normalizedRole === ROLE_HEAD_TEACHER) return 'Head Teacher';
  if (normalizedRole === ROLE_ADMIN) return 'Admin';
  return 'Teacher';
};

export const hasPermission = (permission, roleOrRecord = '', explicitPermissions = []) => {
  const normalizedPermission = normalizePermission(permission);
  if (!normalizedPermission) {
    return false;
  }

  const role = typeof roleOrRecord === 'object' && roleOrRecord !== null
    ? normalizeUserRole(roleOrRecord.role)
    : normalizeUserRole(roleOrRecord);
  const permissions = typeof roleOrRecord === 'object' && roleOrRecord !== null
    ? resolvePermissionsForRole(roleOrRecord.role, roleOrRecord.permissions)
    : resolvePermissionsForRole(role, explicitPermissions);

  return permissions.includes(normalizedPermission);
};

export const hasAnyPermission = (permissionsToCheck = [], roleOrRecord = '', explicitPermissions = []) => {
  const normalizedChecks = unique((Array.isArray(permissionsToCheck) ? permissionsToCheck : []).map((permission) => normalizePermission(permission)).filter(Boolean));
  if (!normalizedChecks.length) {
    return false;
  }
  return normalizedChecks.some((permission) => hasPermission(permission, roleOrRecord, explicitPermissions));
};

export const canAccessAdminPanel = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_ACCESS_ADMIN_PANEL, roleOrRecord, explicitPermissions);
};

export const canReadAllData = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_READ_ALL_DATA, roleOrRecord, explicitPermissions);
};

export const canManageUserRoles = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_MANAGE_USER_ROLES, roleOrRecord, explicitPermissions);
};

export const canManageSystemConfig = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_MANAGE_SYSTEM_CONFIG, roleOrRecord, explicitPermissions);
};

export const canReviewAccountDeletion = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_REVIEW_ACCOUNT_DELETION, roleOrRecord, explicitPermissions);
};

export const canReadActivityLogs = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_READ_ACTIVITY_LOGS, roleOrRecord, explicitPermissions);
};

export const canClearActivityLogs = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_CLEAR_ACTIVITY_LOGS, roleOrRecord, explicitPermissions);
};

export const canDeleteRegistryStudents = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_DELETE_REGISTRY_STUDENTS, roleOrRecord, explicitPermissions);
};

export const canSendMessages = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_SEND_MESSAGES, roleOrRecord, explicitPermissions);
};

export const canReceiveMessages = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_RECEIVE_MESSAGES, roleOrRecord, explicitPermissions);
};

export const canReplyToMessages = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_REPLY_MESSAGES, roleOrRecord, explicitPermissions);
};

export const canMessageAudienceType = (audienceType, roleOrRecord = '', explicitPermissions = []) => {
  const normalizedAudienceType = String(audienceType || '').trim().toLowerCase();
  if (!canSendMessages(roleOrRecord, explicitPermissions)) {
    return false;
  }
  if (normalizedAudienceType === MESSAGE_AUDIENCE_ALL) {
    return hasPermission(PERMISSION_MESSAGE_ALL_USERS, roleOrRecord, explicitPermissions);
  }
  if (normalizedAudienceType === MESSAGE_AUDIENCE_ROLE) {
    return hasPermission(PERMISSION_MESSAGE_ROLES, roleOrRecord, explicitPermissions);
  }
  if (normalizedAudienceType === MESSAGE_AUDIENCE_CLASS) {
    return hasPermission(PERMISSION_MESSAGE_CLASS_GROUPS, roleOrRecord, explicitPermissions);
  }
  return hasPermission(PERMISSION_MESSAGE_INDIVIDUALS, roleOrRecord, explicitPermissions);
};

export const canWriteOwnedData = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_WRITE_OWN_CLASS_DATA, roleOrRecord, explicitPermissions);
};

export const canWriteTeacherScopedData = (roleOrRecord = '', explicitPermissions = []) => {
  return hasPermission(PERMISSION_WRITE_ALL_TEACHER_DATA, roleOrRecord, explicitPermissions);
};

export const canWriteClassData = ({
  actorRole = '',
  actorPermissions = [],
  actorUserId = '',
  ownerId = '',
  ownerRole = ''
} = {}) => {
  const normalizedActorUserId = String(actorUserId || '').trim();
  const normalizedOwnerId = String(ownerId || '').trim();
  const normalizedOwnerRole = normalizeUserRole(ownerRole);

  if (!normalizedActorUserId || !normalizedOwnerId) {
    return false;
  }

  if (normalizedActorUserId === normalizedOwnerId) {
    return canWriteOwnedData(actorRole, actorPermissions);
  }

  if (canManageSystemConfig(actorRole, actorPermissions)) {
    return true;
  }

  if (!canWriteTeacherScopedData(actorRole, actorPermissions)) {
    return false;
  }

  return normalizedOwnerRole === ROLE_TEACHER;
};

export const buildResolvedAccessProfile = ({
  role = DEFAULT_USER_ROLE,
  permissions = []
} = {}) => {
  const normalizedRole = normalizeUserRole(role);
  const resolvedPermissions = resolvePermissionsForRole(normalizedRole, permissions);
  return {
    role: normalizedRole,
    permissions: resolvedPermissions,
    roleRank: getRoleHierarchyRank(normalizedRole)
  };
};

export const buildRolePermissionPayload = (role = DEFAULT_USER_ROLE, permissions = []) => {
  const profile = buildResolvedAccessProfile({ role, permissions });
  return {
    role: profile.role,
    permissions: profile.permissions
  };
};
