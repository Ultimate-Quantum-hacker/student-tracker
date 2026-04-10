/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — services/db.js
   Centralized Firestore-first data access with cache fallback.
   ═══════════════════════════════════════════════ */

import {
  db,
  doc,
  collection,
  collectionGroup,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  isFirebaseConfigured,
  auth,
  authReadyPromise,
  onAuthStateChanged,
  onSnapshot
} from '../js/firebase.js';
import {
  normalizeStudentName,
  assertValidStudentName
} from '../js/student-name-utils.js';
import {
  MESSAGE_SUBJECT_MAX_LENGTH,
  MESSAGE_BODY_MAX_LENGTH
} from '../js/message-constraints.js';
import {
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DELETED,
  ACCOUNT_DELETION_STATUS_NONE,
  ACCOUNT_DELETION_STATUS_PENDING,
  ACCOUNT_DELETION_STATUS_APPROVED,
  ACCOUNT_DELETION_STATUS_REJECTED,
  isDeveloperAccountEmail,
  normalizeAccountStatus,
  normalizeAccountDeletionStatus
} from '../js/auth.js';
import {
  ROLE_TEACHER,
  ROLE_HEAD_TEACHER,
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  normalizeUserRole as normalizeAccessRole,
  normalizePermissions,
  inferRoleFromPermissions,
  buildRolePermissionPayload,
  canAccessAdminPanel,
  canReadAllData,
  canReadActivityLogs,
  canManageSystemConfig,
  canReviewAccountDeletion,
  canWriteClassData,
  canSendMessages,
  canReceiveMessages,
  canReplyToMessages,
  canStartConversations,
  canStartConversationWithRole,
  canViewAllConversations,
  canMessageAudienceType,
  formatUserRoleLabel,
  MESSAGE_AUDIENCE_ALL,
  MESSAGE_AUDIENCE_ROLE,
  MESSAGE_AUDIENCE_INDIVIDUAL,
  MESSAGE_AUDIENCE_CLASS
} from '../js/access-control.js';

const CACHE_KEY_PREFIX = 'studentAppData';
const USERS_COLLECTION = 'users';
const CLASSES_SUBCOLLECTION = 'classes';
const STUDENTS_SUBCOLLECTION = 'students';
const SUBJECTS_SUBCOLLECTION = 'subjects';
const EXAMS_SUBCOLLECTION = 'exams';
const MESSAGES_SUBCOLLECTION = 'messages';
const CONVERSATIONS_COLLECTION = 'conversations';
const CONVERSATION_MESSAGES_SUBCOLLECTION = 'messages';
const ACTIVITY_LOGS_COLLECTION = 'activityLogs';
const MAX_CONVERSATION_LIST_QUERY_LIMIT = 200;
const MESSAGE_MAILBOX_INBOX = 'inbox';
const MESSAGE_MAILBOX_SENT = 'sent';
const MESSAGE_PREVIEW_MAX_LENGTH = 180;
const DEFAULT_CLASS_NAME = 'My Class';
const TRASH_RETENTION_DAYS = 3;
const ACTIVITY_LOG_RETENTION_DAYS = 90;
const MAX_ACTIVITY_LOGS = 250;
const ACTIVITY_LOG_FETCH_LIMIT = MAX_ACTIVITY_LOGS;
const CLASS_MIGRATION_VERSION = 2;
const DATA_SCHEMA_VERSION = 2;

const ERROR_CODES = {
  READ_ONLY_MODE: 'READ_ONLY_MODE',
  CLASS_NOT_FOUND: 'CLASS_NOT_FOUND',
  INVALID_OWNER: 'INVALID_OWNER',
  MIGRATION_FAILED: 'MIGRATION_FAILED',
  INVALID_CLASS_CONTEXT: 'INVALID_CLASS_CONTEXT',
  MISSING_CLASS_ID: 'MISSING_CLASS_ID',
  MISSING_OWNER_ID: 'MISSING_OWNER_ID',
  PRIVILEGED_ROLE_POLICY: 'PRIVILEGED_ROLE_POLICY'
};

let currentClassId = '';
let currentClassOwnerId = '';
let currentClassOwnerName = '';
let currentClassOwnerRole = ROLE_TEACHER;
let currentUserRoleContext = 'teacher';
let currentUserPermissionsContext = [];
let globalClassCatalogCache = {
  ownerUserId: '',
  classes: [],
  trashClasses: [],
  loadedAt: 0
};
const GLOBAL_CLASS_CACHE_TTL_MS = 60 * 1000;
const FETCH_RESULT_CACHE_TTL_MS = 30 * 1000;
const ALLOW_EMPTY_CLASS_CATALOG_FIELD = 'allowEmptyClassCatalog';
let recentFetchAllDataCache = {
  scopeKey: '',
  classId: '',
  ownerId: '',
  payload: null,
  loadedAt: 0
};

const createDefaultRawData = () => ({
  schemaVersion: DATA_SCHEMA_VERSION,
  students: [],
  subjects: [],
  exams: []
});

const inferAllowEmptyClassCatalog = (classes = [], trashClasses = []) => {
  return asArray(classes).length === 0 && asArray(trashClasses).length > 0;
};

let writeChain = Promise.resolve();

const clone = (value) => JSON.parse(JSON.stringify(value));
const asArray = (value) => Array.isArray(value) ? value : [];
const buildClassDocMetadataPatch = (ownerId, classId, updatedAt, extra = {}) => ({
  id: String(classId || '').trim(),
  updatedAt: String(updatedAt || '').trim() || new Date().toISOString(),
  userId: String(ownerId || '').trim(),
  ownerId: String(ownerId || '').trim(),
  dataSchemaVersion: DATA_SCHEMA_VERSION,
  ...extra
});
const buildUserRootBootstrapPayload = (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  const authenticatedUser = auth?.currentUser || null;
  const accessProfile = isDeveloperAccountEmail(authenticatedUser?.email)
    ? buildRolePermissionPayload(ROLE_DEVELOPER)
    : buildRolePermissionPayload(ROLE_TEACHER);
  return {
    uid: normalizedUserId,
    userId: normalizedUserId,
    role: accessProfile.role,
    permissions: accessProfile.permissions,
    name: normalizeDisplayName(authenticatedUser?.displayName || authenticatedUser?.email || 'Teacher', 'Teacher'),
    email: normalizeEmailAddress(authenticatedUser?.email || ''),
    emailVerified: Boolean(authenticatedUser?.emailVerified),
    createdAt: serverTimestamp(),
    messageUnreadCount: 0,
    lastMessageAt: null
  };
};
const invalidateRecentFetchAllDataCache = () => {
  recentFetchAllDataCache = {
    scopeKey: '',
    classId: '',
    ownerId: '',
    payload: null,
    loadedAt: 0
  };
};
const readRecentFetchAllDataCache = ({ scopeKey = '', classId = '', ownerId = '' } = {}) => {
  const normalizedScopeKey = String(scopeKey || '').trim();
  const normalizedClassId = String(classId || '').trim();
  const normalizedOwnerId = String(ownerId || '').trim();
  const isFresh = (Date.now() - Number(recentFetchAllDataCache.loadedAt || 0)) < FETCH_RESULT_CACHE_TTL_MS;
  if (!normalizedScopeKey || !isFresh || recentFetchAllDataCache.scopeKey !== normalizedScopeKey || !recentFetchAllDataCache.payload) {
    return null;
  }
  if (normalizedClassId && recentFetchAllDataCache.classId !== normalizedClassId) {
    return null;
  }
  if (normalizedOwnerId && recentFetchAllDataCache.ownerId !== normalizedOwnerId) {
    return null;
  }
  return clone(recentFetchAllDataCache.payload);
};
const writeRecentFetchAllDataCache = ({ scopeKey = '', classId = '', ownerId = '', payload = null } = {}) => {
  const normalizedScopeKey = String(scopeKey || '').trim();
  if (!normalizedScopeKey || !payload) {
    return payload;
  }
  recentFetchAllDataCache = {
    scopeKey: normalizedScopeKey,
    classId: String(classId || '').trim(),
    ownerId: String(ownerId || '').trim(),
    payload: clone(payload),
    loadedAt: Date.now()
  };
  return payload;
};
const normalizeRole = (value) => normalizeAccessRole(value);
const normalizeEmailAddress = (value) => String(value || '').trim().toLowerCase();
const resolveNonDeveloperStoredRole = (role = '', fallbackRole = ROLE_TEACHER) => {
  const normalizedStoredRole = String(role || '').trim().toLowerCase();
  if (normalizedStoredRole === ROLE_ADMIN) {
    return ROLE_ADMIN;
  }
  if (normalizedStoredRole === ROLE_HEAD_TEACHER) {
    return ROLE_HEAD_TEACHER;
  }
  if (normalizedStoredRole === ROLE_TEACHER) {
    return ROLE_TEACHER;
  }
  const normalizedFallbackRole = normalizeRole(fallbackRole);
  if (normalizedFallbackRole === ROLE_ADMIN) {
    return ROLE_ADMIN;
  }
  if (normalizedFallbackRole === ROLE_HEAD_TEACHER) {
    return ROLE_HEAD_TEACHER;
  }
  return ROLE_TEACHER;
};
const resolveStoredAccessProfile = (role = '', permissions = [], fallbackRole = ROLE_TEACHER, email = '') => {
  if (isDeveloperAccountEmail(email)) {
    return buildRolePermissionPayload(ROLE_DEVELOPER);
  }
  const resolvedRole = inferRoleFromPermissions(permissions, role || fallbackRole);
  if (resolvedRole === ROLE_DEVELOPER) {
    return buildRolePermissionPayload(resolveNonDeveloperStoredRole(role, fallbackRole));
  }
  return buildRolePermissionPayload(resolvedRole, permissions || []);
};
const normalizeUserAccountLifecycleRecord = (payload = {}, fallback = {}) => ({
  status: normalizeAccountStatus(payload?.status ?? fallback?.status),
  accountDeletionStatus: normalizeAccountDeletionStatus(payload?.accountDeletionStatus ?? fallback?.accountDeletionStatus),
  accountDeletionRequestedAt: payload?.accountDeletionRequestedAt ?? fallback?.accountDeletionRequestedAt ?? null,
  accountDeletionRequestedBy: normalizeUserId(payload?.accountDeletionRequestedBy ?? fallback?.accountDeletionRequestedBy ?? ''),
  accountDeletionReviewedAt: payload?.accountDeletionReviewedAt ?? fallback?.accountDeletionReviewedAt ?? null,
  accountDeletionReviewedBy: normalizeUserId(payload?.accountDeletionReviewedBy ?? fallback?.accountDeletionReviewedBy ?? ''),
  deletedAt: payload?.deletedAt ?? fallback?.deletedAt ?? null
});
const isDeletedUserPayload = (payload = {}) => {
  return normalizeUserAccountLifecycleRecord(payload).status === ACCOUNT_STATUS_DELETED;
};
const buildUserLifecycleTargetLabel = (payload = {}, fallbackUserId = '') => {
  const normalizedUserId = normalizeUserId(payload?.uid || payload?.userId || fallbackUserId);
  const normalizedEmail = normalizeEmailAddress(payload?.email || '');
  const normalizedName = normalizeDisplayName(payload?.name || normalizedEmail || normalizedUserId || 'Teacher', 'Teacher');

  if (normalizedEmail && normalizedName && normalizedName !== normalizedEmail) {
    return `${normalizedName} (${normalizedEmail})`;
  }

  return normalizedName || normalizedEmail || normalizedUserId || 'Teacher';
};
const buildPrivilegedUserLifecycleRecord = (payload = {}, fallbackUserId = '') => {
  const uid = normalizeUserId(payload?.uid || payload?.userId || fallbackUserId);
  const email = normalizeEmailAddress(payload?.email || '');
  const accessProfile = resolveStoredAccessProfile(payload?.role || '', payload?.permissions || [], ROLE_TEACHER, email);
  return {
    uid,
    name: normalizeDisplayName(payload?.name || payload?.displayName || email || uid || 'Teacher', 'Teacher'),
    email,
    role: accessProfile.role,
    permissions: accessProfile.permissions,
    emailVerified: Boolean(payload?.emailVerified),
    createdAt: payload?.createdAt || payload?.updatedAt || null,
    updatedAt: payload?.updatedAt || null,
    roleUpdatedAt: payload?.roleUpdatedAt || null,
    roleUpdatedBy: normalizeUserId(payload?.roleUpdatedBy || ''),
    messageUnreadCount: Number.isFinite(Number(payload?.messageUnreadCount))
      ? Math.max(0, Math.floor(Number(payload.messageUnreadCount)))
      : 0,
    lastMessageAt: payload?.lastMessageAt || null,
    ...normalizeUserAccountLifecycleRecord(payload)
  };
};
const readPrivilegedUserLifecycleDirectory = async () => {
  if (!isFirebaseConfigured || !db) {
    return {
      users: [],
      ownerNameMap: new Map(),
      ownerRoleMap: new Map(),
      deletedUserIds: new Set()
    };
  }

  const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
  const users = [];
  const ownerNameMap = new Map();
  const ownerRoleMap = new Map();
  const deletedUserIds = new Set();

  usersSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    const uid = normalizeUserId(payload.uid || payload.userId || entry.id || '');
    if (!uid) {
      return;
    }

    const lifecycle = normalizeUserAccountLifecycleRecord(payload);
    const role = normalizeRole(payload.role || 'teacher');
    const name = normalizeDisplayName(payload.name || payload.displayName || payload.email || 'Teacher', 'Teacher');
    const email = normalizeEmailAddress(payload.email || '');

    users.push(buildPrivilegedUserLifecycleRecord({
      ...payload,
      uid,
      name,
      email,
      role
    }, uid));
    ownerNameMap.set(uid, name);
    ownerRoleMap.set(uid, role);
    if (lifecycle.status === ACCOUNT_STATUS_DELETED) {
      deletedUserIds.add(uid);
    }
  });

  return {
    users,
    ownerNameMap,
    ownerRoleMap,
    deletedUserIds
  };
};
const isVerifiedUserRecord = (payload = {}) => Boolean(payload?.emailVerified);
const isManageablePanelRole = (role = '') => {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === ROLE_TEACHER || normalizedRole === ROLE_HEAD_TEACHER || normalizedRole === ROLE_ADMIN;
};
const buildPrivilegedRoleUpdatePolicyState = (userPayload = {}, nextRole = 'teacher') => {
  const currentRole = resolveStoredAccessProfile(userPayload?.role || '', userPayload?.permissions || [], ROLE_TEACHER, userPayload?.email || '').role;
  const normalizedNextRole = normalizeRole(nextRole);
  const lifecycle = normalizeUserAccountLifecycleRecord(userPayload);

  if (isDeletedUserPayload(userPayload)) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      message: 'Deleted accounts cannot be updated in the admin panel.'
    };
  }

  if (lifecycle.accountDeletionStatus === ACCOUNT_DELETION_STATUS_PENDING) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      message: 'Pending deletion requests must be reviewed before role changes can be made.'
    };
  }

  if (lifecycle.accountDeletionStatus === ACCOUNT_DELETION_STATUS_APPROVED) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      message: 'Approved deletion requests cannot be updated in the admin panel.'
    };
  }

  if (currentRole === ROLE_DEVELOPER || normalizedNextRole === ROLE_DEVELOPER) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      message: 'Developer onboarding is manual and cannot be changed in the admin panel.'
    };
  }

  if (!isManageablePanelRole(currentRole) || !isManageablePanelRole(normalizedNextRole)) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      message: 'Only teacher, head teacher, and admin roles can be managed in the admin panel.'
    };
  }

  if (
    currentRole === ROLE_TEACHER
    && (normalizedNextRole === ROLE_HEAD_TEACHER || normalizedNextRole === ROLE_ADMIN)
    && !isVerifiedUserRecord(userPayload)
  ) {
    return {
      currentRole,
      normalizedNextRole,
      canUpdate: false,
      message: 'Only verified teacher accounts can be promoted to head teacher or admin.'
    };
  }

  return {
    currentRole,
    normalizedNextRole,
    canUpdate: true,
    message: ''
  };
};
const normalizeDeletedAtValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const isDeletedClassPayload = (payload = {}) => {
  return payload?.deleted === true || Boolean(normalizeDeletedAtValue(payload?.deletedAt));
};

const toIsoDateString = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const normalizeMessageMailbox = (value) => {
  return String(value || '').trim().toLowerCase() === MESSAGE_MAILBOX_SENT
    ? MESSAGE_MAILBOX_SENT
    : MESSAGE_MAILBOX_INBOX;
};

const normalizeMessageAudienceType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === MESSAGE_AUDIENCE_ALL) {
    return MESSAGE_AUDIENCE_ALL;
  }
  if (normalized === MESSAGE_AUDIENCE_ROLE) {
    return MESSAGE_AUDIENCE_ROLE;
  }
  if (normalized === MESSAGE_AUDIENCE_CLASS) {
    return MESSAGE_AUDIENCE_CLASS;
  }
  return MESSAGE_AUDIENCE_INDIVIDUAL;
};

const normalizeMessageSubject = (value) => {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MESSAGE_SUBJECT_MAX_LENGTH);
};

const normalizeMessageBody = (value) => {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, MESSAGE_BODY_MAX_LENGTH);
};

const buildMessagePreview = (value = '') => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= MESSAGE_PREVIEW_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MESSAGE_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
};

const buildMessageParticipantLabel = (name = '', email = '', userId = '', fallback = 'Teacher') => {
  const normalizedName = normalizeDisplayName(name || email || userId || fallback, fallback);
  const normalizedEmail = normalizeEmailAddress(email || '');
  if (normalizedEmail && normalizedName && normalizedName !== normalizedEmail) {
    return `${normalizedName} (${normalizedEmail})`;
  }
  return normalizedName || normalizedEmail || userId || fallback;
};

const normalizeMessageRecipientEntry = (record = {}, fallbackUserId = '') => {
  const uid = normalizeUserId(record?.uid || record?.userId || record?.recipientUserId || record?.senderId || fallbackUserId);
  if (!uid) {
    return null;
  }
  const email = normalizeEmailAddress(record?.email || record?.recipientEmail || record?.senderEmail || '');
  const role = normalizeRole(record?.role || record?.recipientRole || record?.senderRole || ROLE_TEACHER);
  const permissions = normalizePermissions(record?.permissions || []);
  const name = normalizeDisplayName(record?.name || record?.recipientName || record?.senderName || email || uid || 'Teacher', 'Teacher');
  return {
    uid,
    name,
    email,
    role,
    permissions,
    displayLabel: buildMessageParticipantLabel(name, email, uid, 'Teacher'),
    receivesMessages: record?.receivesMessages === false
      ? false
      : canReceiveMessages(role, permissions) || record?.receivesMessages === true
  };
};

const buildMessageRecipientsSummaryLabel = (recipients = []) => {
  const normalizedRecipients = asArray(recipients)
    .map(entry => normalizeMessageRecipientEntry(entry))
    .filter(Boolean);
  if (!normalizedRecipients.length) {
    return 'No recipients';
  }
  if (normalizedRecipients.length === 1) {
    return normalizedRecipients[0].displayLabel || 'Recipient';
  }
  const firstLabel = String(normalizedRecipients[0]?.displayLabel || 'Recipient').trim() || 'Recipient';
  const remainingCount = normalizedRecipients.length - 1;
  return `${firstLabel} and ${remainingCount} other${remainingCount === 1 ? '' : 's'}`;
};

const buildMessageAudienceLabel = ({
  audienceType = MESSAGE_AUDIENCE_INDIVIDUAL,
  audienceLabel = '',
  recipients = [],
  audienceRole = '',
  audienceClassName = ''
} = {}) => {
  const explicitLabel = String(audienceLabel || '').trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  const normalizedAudienceType = normalizeMessageAudienceType(audienceType);
  if (normalizedAudienceType === MESSAGE_AUDIENCE_ALL) {
    return 'All eligible users';
  }
  if (normalizedAudienceType === MESSAGE_AUDIENCE_ROLE) {
    return audienceRole ? `${formatUserRoleLabel(audienceRole)} users` : 'Selected role';
  }
  if (normalizedAudienceType === MESSAGE_AUDIENCE_CLASS) {
    return audienceClassName ? `Class owner: ${audienceClassName}` : 'Selected class';
  }
  return buildMessageRecipientsSummaryLabel(recipients);
};

const buildMessageDirectoryUserRecord = (payload = {}, fallbackUserId = '') => {
  const email = normalizeEmailAddress(payload?.email || '');
  const accessProfile = resolveStoredAccessProfile(payload?.role || '', payload?.permissions || [], ROLE_TEACHER, email);
  const lifecycle = normalizeUserAccountLifecycleRecord(payload);
  const recipient = normalizeMessageRecipientEntry({
    uid: payload?.uid || payload?.userId || fallbackUserId,
    name: payload?.name || payload?.displayName || email || fallbackUserId || 'Teacher',
    email,
    role: accessProfile.role,
    permissions: accessProfile.permissions,
    receivesMessages: canReceiveMessages(accessProfile.role, accessProfile.permissions)
  }, fallbackUserId);
  if (!recipient) {
    return null;
  }
  return {
    ...recipient,
    status: lifecycle.status,
    accountDeletionStatus: lifecycle.accountDeletionStatus,
    receivesMessages: recipient.receivesMessages && lifecycle.status !== ACCOUNT_STATUS_DELETED
  };
};

const normalizeMessageRecord = (messageId, payload = {}) => {
  const mailbox = normalizeMessageMailbox(payload?.mailbox);
  const senderId = normalizeUserId(payload?.senderId || payload?.senderUserId || payload?.fromUserId || payload?.fromUid || '');
  const senderName = normalizeDisplayName(payload?.senderName || payload?.senderDisplayName || payload?.senderEmail || senderId || 'Teacher', 'Teacher');
  const senderEmail = normalizeEmailAddress(payload?.senderEmail || '');
  const senderRole = normalizeRole(payload?.senderRole || ROLE_TEACHER);
  const recipientUserIds = asArray(payload?.recipientUserIds || payload?.recipientIds || payload?.toUserIds).map(value => normalizeUserId(value)).filter(Boolean);
  const recipientUserId = normalizeUserId(payload?.recipientUserId || payload?.recipientId || payload?.recipientUid || payload?.toUserId || payload?.toUid || recipientUserIds[0] || '');
  const recipientName = normalizeDisplayName(payload?.recipientName || payload?.recipientDisplayName || payload?.recipientEmail || recipientUserId || 'Recipient', 'Recipient');
  const recipientEmail = normalizeEmailAddress(payload?.recipientEmail || '');
  const recipientRole = normalizeRole(payload?.recipientRole || ROLE_TEACHER);
  const recipientCount = Math.max(1, Number(payload?.recipientCount || recipientUserIds.length || (recipientUserId ? 1 : 0)) || 1);
  const subject = normalizeMessageSubject(payload?.subject || '');
  const body = normalizeMessageBody(payload?.body || '');
  const sentAt = toIsoDateString(payload?.sentAt) || toIsoDateString(payload?.createdAt) || toIsoDateString(payload?.updatedAt);
  const createdAt = toIsoDateString(payload?.createdAt) || sentAt;
  const updatedAt = toIsoDateString(payload?.updatedAt) || sentAt;
  const audienceType = normalizeMessageAudienceType(payload?.audienceType);
  const audienceRole = normalizeRole(payload?.audienceRole || '');
  const audienceClassId = normalizeClassId(payload?.audienceClassId || payload?.classId || '');
  const audienceClassName = String(payload?.audienceClassName || '').trim();
  const counterpartLabel = mailbox === MESSAGE_MAILBOX_INBOX
    ? buildMessageParticipantLabel(senderName, senderEmail, senderId, 'Teacher')
    : recipientCount > 1
      ? `${recipientCount} recipients`
      : buildMessageParticipantLabel(recipientName, recipientEmail, recipientUserId, 'Recipient');
  const recipientLabel = recipientCount > 1
    ? `${recipientCount} recipients`
    : buildMessageParticipantLabel(recipientName, recipientEmail, recipientUserId, 'Recipient');

  return {
    id: String(messageId || payload?.id || '').trim(),
    mailbox,
    threadId: String(payload?.threadId || payload?.id || messageId || '').trim(),
    parentMessageId: String(payload?.parentMessageId || '').trim(),
    replyToMessageId: String(payload?.replyToMessageId || '').trim(),
    fromSentMessageId: String(payload?.fromSentMessageId || '').trim(),
    isReply: Boolean(payload?.isReply || payload?.parentMessageId),
    senderId,
    senderName,
    senderEmail,
    senderRole,
    recipientUserId,
    recipientName,
    recipientEmail,
    recipientRole,
    recipientUserIds,
    recipientCount,
    subject: subject || '(No subject)',
    body,
    bodyPreview: buildMessagePreview(payload?.bodyPreview || body),
    audienceType,
    audienceRole,
    audienceClassId,
    audienceClassName,
    audienceLabel: buildMessageAudienceLabel({
      audienceType,
      audienceLabel: payload?.audienceLabel,
      recipients: recipientCount <= 1
        ? [{ uid: recipientUserId, name: recipientName, email: recipientEmail, role: recipientRole }]
        : [],
      audienceRole,
      audienceClassName
    }),
    counterpartLabel,
    recipientLabel,
    isRead: mailbox === MESSAGE_MAILBOX_SENT ? true : Boolean(payload?.isRead),
    readAt: toIsoDateString(payload?.readAt),
    sentAt,
    createdAt,
    updatedAt,
    sortAt: sentAt || updatedAt || createdAt || ''
  };
};

const normalizeConversationUserIdList = (values = []) => {
  const seen = new Set();
  return asArray(values).reduce((result, value) => {
    const normalizedValue = normalizeUserId(value);
    if (!normalizedValue || seen.has(normalizedValue)) {
      return result;
    }
    seen.add(normalizedValue);
    result.push(normalizedValue);
    return result;
  }, []);
};

const normalizeConversationStringMap = (value = {}, formatter = (entry) => String(entry || '').trim()) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((result, [key, entryValue]) => {
    const normalizedKey = normalizeUserId(key);
    if (!normalizedKey) {
      return result;
    }
    const formattedValue = formatter(entryValue);
    if (formattedValue === null || formattedValue === undefined || formattedValue === '') {
      return result;
    }
    result[normalizedKey] = formattedValue;
    return result;
  }, {});
};

const normalizeConversationNumberMap = (value = {}) => {
  return normalizeConversationStringMap(value, (entry) => {
    const normalizedValue = Number.isFinite(Number(entry))
      ? Math.max(0, Math.floor(Number(entry)))
      : 0;
    return normalizedValue;
  });
};

const buildDirectConversationKey = (participantIds = []) => {
  return normalizeConversationUserIdList(participantIds).sort().join('__');
};

const sortConversationRecordsByNewest = (left = {}, right = {}) => {
  const leftTime = new Date(left?.sortAt || left?.lastMessageAt || left?.updatedAt || left?.createdAt || 0).getTime() || 0;
  const rightTime = new Date(right?.sortAt || right?.lastMessageAt || right?.updatedAt || right?.createdAt || 0).getTime() || 0;
  return rightTime - leftTime;
};

const sortConversationMessagesByOldest = (left = {}, right = {}) => {
  const leftTime = new Date(left?.sortAt || left?.createdAt || left?.updatedAt || left?.sentAt || 0).getTime() || 0;
  const rightTime = new Date(right?.sortAt || right?.createdAt || right?.updatedAt || right?.sentAt || 0).getTime() || 0;
  if (leftTime === rightTime) {
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  }
  return leftTime - rightTime;
};

const buildConversationParticipantMaps = (participants = []) => {
  return asArray(participants).reduce((result, participant) => {
    const normalizedParticipant = normalizeMessageRecipientEntry(participant);
    if (!normalizedParticipant?.uid) {
      return result;
    }
    result.participants.push(normalizedParticipant.uid);
    result.participantNames[normalizedParticipant.uid] = normalizedParticipant.name;
    result.participantEmails[normalizedParticipant.uid] = normalizedParticipant.email;
    result.participantRoles[normalizedParticipant.uid] = normalizeRole(normalizedParticipant.role || ROLE_TEACHER);
    return result;
  }, {
    participants: [],
    participantNames: {},
    participantEmails: {},
    participantRoles: {}
  });
};

const normalizeConversationRecord = (conversationId, payload = {}, currentUserId = '') => {
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  const participants = normalizeConversationUserIdList(payload?.participants || []);
  const participantNames = normalizeConversationStringMap(payload?.participantNames, (entry) => {
    return normalizeDisplayName(entry || '', 'Participant');
  });
  const participantEmails = normalizeConversationStringMap(payload?.participantEmails, (entry) => {
    return normalizeEmailAddress(entry || '');
  });
  const participantRoles = normalizeConversationStringMap(payload?.participantRoles, (entry) => {
    return normalizeRole(entry || ROLE_TEACHER);
  });
  const unreadCountByUser = normalizeConversationNumberMap(payload?.unreadCountByUser);
  const createdAt = toIsoDateString(payload?.createdAt) || toIsoDateString(payload?.updatedAt) || null;
  const updatedAt = toIsoDateString(payload?.updatedAt) || createdAt;
  const lastMessageAt = toIsoDateString(payload?.lastMessageAt) || updatedAt || createdAt;
  const counterpartUserId = participants.find((participantId) => participantId !== normalizedCurrentUserId) || '';
  const counterpartName = normalizeDisplayName(participantNames[counterpartUserId] || counterpartUserId || 'Conversation', 'Conversation');
  const counterpartEmail = normalizeEmailAddress(participantEmails[counterpartUserId] || '');
  const counterpartRole = normalizeRole(participantRoles[counterpartUserId] || ROLE_TEACHER);
  const title = participants.length > 1
    ? buildMessageParticipantLabel(counterpartName, counterpartEmail, counterpartUserId, 'Conversation')
    : buildMessageParticipantLabel(payload?.lastMessageSenderName || counterpartName, payload?.lastMessageSenderEmail || counterpartEmail, payload?.lastMessageSenderId || counterpartUserId, 'Conversation');
  return {
    id: String(conversationId || payload?.id || '').trim(),
    type: String(payload?.type || CONVERSATION_TYPE_DIRECT).trim().toLowerCase() || CONVERSATION_TYPE_DIRECT,
    source: 'conversation',
    isLegacy: false,
    directKey: String(payload?.directKey || buildDirectConversationKey(participants)).trim(),
    participants,
    participantNames,
    participantEmails,
    participantRoles,
    counterpartUserId,
    counterpartName,
    counterpartEmail,
    counterpartRole,
    title,
    unreadCountByUser,
    unreadCount: normalizedCurrentUserId ? Math.max(0, Number(unreadCountByUser[normalizedCurrentUserId] || 0)) : 0,
    lastMessageText: normalizeMessageBody(payload?.lastMessageText || ''),
    lastMessagePreview: buildMessagePreview(payload?.lastMessagePreview || payload?.lastMessageText || ''),
    lastMessageAt,
    lastMessageSenderId: normalizeUserId(payload?.lastMessageSenderId || ''),
    lastMessageSenderName: normalizeDisplayName(payload?.lastMessageSenderName || '', ''),
    lastMessageSenderRole: normalizeRole(payload?.lastMessageSenderRole || ROLE_TEACHER),
    createdAt,
    updatedAt,
    sortAt: lastMessageAt || updatedAt || createdAt || ''
  };
};

const normalizeConversationMessageRecord = (messageId, payload = {}, conversationId = '', currentUserId = '') => {
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  const senderId = normalizeUserId(payload?.senderId || payload?.senderUserId || payload?.fromUserId || payload?.fromUid || '');
  const senderName = normalizeDisplayName(payload?.senderName || payload?.senderDisplayName || payload?.senderEmail || senderId || 'Participant', 'Participant');
  const senderEmail = normalizeEmailAddress(payload?.senderEmail || '');
  const senderRole = normalizeRole(payload?.senderRole || ROLE_TEACHER);
  const text = normalizeMessageBody(payload?.text || payload?.body || '');
  const createdAt = toIsoDateString(payload?.createdAt) || toIsoDateString(payload?.sentAt) || toIsoDateString(payload?.updatedAt);
  const updatedAt = toIsoDateString(payload?.updatedAt) || createdAt;
  const readByUserIds = normalizeConversationUserIdList(payload?.readByUserIds || payload?.readBy || []);
  return {
    id: String(messageId || payload?.id || '').trim(),
    conversationId: String(conversationId || payload?.conversationId || '').trim(),
    source: String(payload?.source || 'conversation').trim().toLowerCase() || 'conversation',
    type: String(payload?.type || 'text').trim().toLowerCase() || 'text',
    senderId,
    senderName,
    senderEmail,
    senderRole,
    text,
    body: text,
    subject: normalizeMessageSubject(payload?.subject || ''),
    readByUserIds,
    isReadByCurrentUser: normalizedCurrentUserId ? readByUserIds.includes(normalizedCurrentUserId) : false,
    isOwnMessage: normalizedCurrentUserId ? senderId === normalizedCurrentUserId : false,
    createdAt,
    updatedAt,
    sentAt: createdAt,
    sortAt: createdAt || updatedAt || ''
  };
};

const getLegacyDirectCounterpartForMessage = (message = {}, actorUserId = '') => {
  const normalizedActorUserId = normalizeUserId(actorUserId);
  const mailbox = normalizeMessageMailbox(message?.mailbox);
  if (mailbox === MESSAGE_MAILBOX_INBOX) {
    return normalizeMessageRecipientEntry({
      uid: message?.senderId,
      name: message?.senderName,
      email: message?.senderEmail,
      role: message?.senderRole,
      receivesMessages: true
    });
  }
  if (Number(message?.recipientCount || 0) === 1 && normalizeUserId(message?.recipientUserId || '') !== normalizedActorUserId) {
    return normalizeMessageRecipientEntry({
      uid: message?.recipientUserId,
      name: message?.recipientName,
      email: message?.recipientEmail,
      role: message?.recipientRole,
      receivesMessages: true
    });
  }
  return null;
};

const buildLegacyConversationRecord = (entry = {}, currentUserId = '') => {
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  const messages = asArray(entry?.messages).slice().sort(sortConversationMessagesByOldest);
  const directCounterpart = normalizeMessageRecipientEntry(entry?.directCounterpart);
  const lastMessage = messages[messages.length - 1] || null;
  const directKey = directCounterpart?.uid ? buildDirectConversationKey([normalizedCurrentUserId, directCounterpart.uid]) : '';
  const unreadCount = messages.filter((message) => {
    return normalizeMessageMailbox(message?.mailbox) === MESSAGE_MAILBOX_INBOX && !Boolean(message?.isRead);
  }).length;
  const title = directCounterpart?.displayLabel
    || String(lastMessage?.audienceLabel || lastMessage?.recipientLabel || lastMessage?.subject || 'Conversation').trim()
    || 'Conversation';
  return {
    id: String(entry?.id || '').trim(),
    type: directCounterpart?.uid ? CONVERSATION_TYPE_DIRECT : 'legacy',
    source: 'legacy',
    isLegacy: true,
    directKey,
    participants: directCounterpart?.uid ? normalizeConversationUserIdList([normalizedCurrentUserId, directCounterpart.uid]) : [],
    participantNames: directCounterpart?.uid ? { [directCounterpart.uid]: directCounterpart.name } : {},
    participantEmails: directCounterpart?.uid ? { [directCounterpart.uid]: directCounterpart.email } : {},
    participantRoles: directCounterpart?.uid ? { [directCounterpart.uid]: normalizeRole(directCounterpart.role || ROLE_TEACHER) } : {},
    counterpartUserId: directCounterpart?.uid || '',
    counterpartName: directCounterpart?.name || title,
    counterpartEmail: normalizeEmailAddress(directCounterpart?.email || ''),
    counterpartRole: normalizeRole(directCounterpart?.role || ''),
    title,
    unreadCount,
    lastMessageText: String(lastMessage?.body || '').trim(),
    lastMessagePreview: buildMessagePreview(lastMessage?.body || lastMessage?.subject || ''),
    lastMessageAt: lastMessage?.sentAt || lastMessage?.updatedAt || null,
    lastMessageSenderId: normalizeUserId(lastMessage?.senderId || ''),
    lastMessageSenderName: normalizeDisplayName(lastMessage?.senderName || '', ''),
    lastMessageSenderRole: normalizeRole(lastMessage?.senderRole || ROLE_TEACHER),
    legacyMessages: messages,
    sortAt: lastMessage?.sortAt || lastMessage?.sentAt || lastMessage?.updatedAt || '',
    canReply: Boolean(directCounterpart?.uid)
  };
};

const buildLegacyConversationRecords = (messages = [], currentUserId = '') => {
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  const groups = new Map();
  asArray(messages).forEach((message) => {
    const directCounterpart = getLegacyDirectCounterpartForMessage(message, normalizedCurrentUserId);
    const directKey = directCounterpart?.uid ? buildDirectConversationKey([normalizedCurrentUserId, directCounterpart.uid]) : '';
    const groupId = directKey
      ? `legacy:direct:${directKey}`
      : (String(message?.threadId || '').trim()
        ? `legacy:thread:${String(message.threadId).trim()}`
        : `legacy:message:${String(message?.id || '').trim()}`);
    const existingEntry = groups.get(groupId) || {
      id: groupId,
      directCounterpart: directCounterpart || null,
      messages: []
    };
    if (!existingEntry.directCounterpart && directCounterpart) {
      existingEntry.directCounterpart = directCounterpart;
    }
    existingEntry.messages.push(message);
    groups.set(groupId, existingEntry);
  });
  return Array.from(groups.values()).map((entry) => {
    return buildLegacyConversationRecord(entry, normalizedCurrentUserId);
  }).sort(sortConversationRecordsByNewest);
};

const buildLegacyConversationMessages = (legacyMessages = [], currentUserId = '', conversationId = '') => {
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  return asArray(legacyMessages).map((message) => {
    const normalizedMessage = normalizeMessageRecord(message?.id || '', message);
    const readByUserIds = [];
    if (normalizedCurrentUserId && (normalizedMessage.mailbox === MESSAGE_MAILBOX_SENT || normalizedMessage.isRead)) {
      readByUserIds.push(normalizedCurrentUserId);
    }
    const messageRecord = normalizeConversationMessageRecord(`legacy:${normalizedMessage.id}`, {
      conversationId,
      source: 'legacy',
      type: 'legacy',
      senderId: normalizedMessage.senderId,
      senderName: normalizedMessage.senderName,
      senderEmail: normalizedMessage.senderEmail,
      senderRole: normalizedMessage.senderRole,
      text: normalizedMessage.body || normalizedMessage.subject || '',
      subject: normalizedMessage.subject,
      createdAt: normalizedMessage.sentAt || normalizedMessage.updatedAt,
      updatedAt: normalizedMessage.updatedAt || normalizedMessage.sentAt,
      readByUserIds
    }, conversationId, normalizedCurrentUserId);
    return {
      ...messageRecord,
      mailbox: normalizedMessage.mailbox,
      audienceLabel: normalizedMessage.audienceLabel,
      legacyMessageId: normalizedMessage.id,
      isLegacy: true,
      isUnreadLegacy: normalizedMessage.mailbox === MESSAGE_MAILBOX_INBOX && !normalizedMessage.isRead
    };
  }).sort(sortConversationMessagesByOldest);
};

const buildMessageRoleAudienceOptions = (users = []) => {
  const counts = new Map();
  asArray(users).forEach((user) => {
    const normalizedRole = normalizeRole(user?.role || '');
    if (!normalizedRole) {
      return;
    }
    counts.set(normalizedRole, (counts.get(normalizedRole) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([role, count]) => ({
      value: role,
      role,
      count,
      label: `${formatUserRoleLabel(role)} (${count})`
    }))
    .sort((left, right) => String(left.label || '').localeCompare(String(right.label || '')));
};

const buildMessageClassAudienceOptions = (classes = [], actorUserId = '') => {
  const normalizedActorUserId = normalizeUserId(actorUserId);
  const seen = new Set();
  return asArray(classes)
    .map((entry) => {
      const id = normalizeClassId(entry?.id || entry?.classId || '');
      const ownerId = normalizeUserId(entry?.ownerId || entry?.userId || '');
      const dedupeKey = `${id}:${ownerId}`;
      if (!id || !ownerId || ownerId === normalizedActorUserId || seen.has(dedupeKey)) {
        return null;
      }
      seen.add(dedupeKey);
      const name = normalizeClassName(entry?.name || entry?.className || '', '');
      const ownerName = normalizeDisplayName(entry?.ownerName || ownerId || 'Teacher', 'Teacher');
      const ownerRole = normalizeRole(entry?.ownerRole || ROLE_TEACHER);
      return {
        id,
        name,
        ownerId,
        ownerName,
        ownerRole,
        label: name ? `${name} - ${ownerName}` : ownerName
      };
    })
    .filter(Boolean)
    .sort((left, right) => String(left.label || '').localeCompare(String(right.label || '')));
};

const readMessageDirectoryUsers = async () => {
  if (!isFirebaseConfigured || !db) {
    return [];
  }
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));
  const users = [];
  snapshot.forEach((entry) => {
    const record = buildMessageDirectoryUserRecord(entry.data() || {}, entry.id);
    if (!record?.uid || !record.receivesMessages) {
      return;
    }
    users.push(record);
  });
  return users.sort((left, right) => {
    const leftLabel = String(left?.name || left?.email || left?.uid || '').trim().toLowerCase();
    const rightLabel = String(right?.name || right?.email || right?.uid || '').trim().toLowerCase();
    return leftLabel.localeCompare(rightLabel);
  });
};

const syncCurrentUserMessageMetadata = async (userId, messages = []) => {
  const normalizedUserId = normalizeUserId(userId);
  const unreadCount = asArray(messages).filter((message) => {
    return normalizeMessageMailbox(message?.mailbox) === MESSAGE_MAILBOX_INBOX && !Boolean(message?.isRead);
  }).length;
  const lastMessageAt = asArray(messages)
    .map(message => String(message?.sentAt || message?.updatedAt || message?.createdAt || '').trim())
    .find(Boolean) || null;

  if (normalizedUserId && normalizedUserId === getAuthenticatedUserId()) {
    try {
      await mergeUserRootMetadata(normalizedUserId, {
        userId: normalizedUserId,
        messageUnreadCount: unreadCount,
        lastMessageAt,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Failed to sync current user message metadata:', error);
    }
  }

  return {
    unreadCount,
    lastMessageAt
  };
};

const toCollectionDocId = (prefix, label, index) => {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}_${slug || index + 1}_${index + 1}`;
};

const normalizeSubjectRecord = (subject, index = 0) => {
  const payload = subject && typeof subject === 'object' && !Array.isArray(subject) ? subject : {};
  const name = String(payload.name || subject || '').trim();
  if (!name) {
    return null;
  }

  return {
    id: String(payload.id || '').trim() || toCollectionDocId('sub', name, index),
    name
  };
};

const normalizeExamRecord = (exam, index = 0) => {
  const payload = exam && typeof exam === 'object' && !Array.isArray(exam) ? exam : {};
  const title = String(payload.title || payload.name || exam || '').trim();
  if (!title) {
    return null;
  }

  const normalizedDate = toIsoDateString(payload.date) || String(payload.date || '').trim();
  return {
    ...(normalizedDate ? { date: normalizedDate } : {}),
    id: String(payload.id || '').trim() || toCollectionDocId('exam', title, index),
    title,
    name: title
  };
};

const buildEntityLookup = (items = [], labelSelector = () => '') => {
  const byId = new Map();
  const byLabel = new Map();

  asArray(items).forEach((item) => {
    const id = String(item?.id || '').trim();
    const label = String(labelSelector(item) || '').trim().toLowerCase();
    if (id) {
      byId.set(id, item);
    }
    if (id && label) {
      byLabel.set(label, id);
    }
  });

  return { byId, byLabel };
};

const resolveEntityScoreKey = (key, lookup) => {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return '';
  }
  if (lookup?.byId?.has(normalizedKey)) {
    return normalizedKey;
  }
  return lookup?.byLabel?.get(normalizedKey.toLowerCase()) || normalizedKey;
};

const normalizeScoreMapByIds = (scores = {}, subjectLookup = null, examLookup = null) => {
  const normalizedScores = {};

  Object.entries(scores && typeof scores === 'object' ? scores : {}).forEach(([subjectKey, examMap]) => {
    if (!examMap || typeof examMap !== 'object' || Array.isArray(examMap)) {
      return;
    }

    const resolvedSubjectKey = resolveEntityScoreKey(subjectKey, subjectLookup);
    if (!resolvedSubjectKey) {
      return;
    }

    Object.entries(examMap).forEach(([examKey, value]) => {
      const resolvedExamKey = resolveEntityScoreKey(examKey, examLookup);
      if (!resolvedExamKey) {
        return;
      }

      if (!normalizedScores[resolvedSubjectKey] || typeof normalizedScores[resolvedSubjectKey] !== 'object') {
        normalizedScores[resolvedSubjectKey] = {};
      }

      normalizedScores[resolvedSubjectKey][resolvedExamKey] = clone(value);
    });
  });

  return normalizedScores;
};

const buildScoreLookupsForRawData = (rawData = {}) => {
  const subjects = asArray(rawData?.subjects)
    .map((subject, index) => normalizeSubjectRecord(subject, index))
    .filter(Boolean);
  const exams = asArray(rawData?.exams)
    .map((exam, index) => normalizeExamRecord(exam, index))
    .filter(Boolean);

  return {
    subjectLookup: buildEntityLookup(subjects, subject => subject?.name || ''),
    examLookup: buildEntityLookup(exams, exam => exam?.title || exam?.name || '')
  };
};

const normalizeStudentScoresForRawData = (rawData = {}, scores = {}) => {
  const { subjectLookup, examLookup } = buildScoreLookupsForRawData(rawData);
  return normalizeScoreMapByIds(scores, subjectLookup, examLookup);
};

const normalizeRawData = (rawData) => {
  const input = rawData && typeof rawData === 'object' ? rawData : createDefaultRawData();
  const subjects = asArray(input.subjects)
    .map((subject, index) => normalizeSubjectRecord(subject, index))
    .filter(Boolean);
  const exams = asArray(input.exams)
    .map((exam, index) => normalizeExamRecord(exam, index))
    .filter(Boolean);
  const subjectLookup = buildEntityLookup(subjects, subject => subject?.name || '');
  const examLookup = buildEntityLookup(exams, exam => exam?.title || exam?.name || '');

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    students: asArray(input.students).map((student) => ({
      id: student?.id,
      name: normalizeStudentName(student?.name),
      notes: student?.notes || '',
      class: student?.class || '',
      scores: normalizeScoreMapByIds(student?.scores || {}, subjectLookup, examLookup)
    })),
    subjects: subjects.map(subject => ({
      id: subject.id,
      name: subject.name
    })),
    exams: exams.map(exam => ({
      ...(exam.date ? { date: exam.date } : {}),
      id: exam.id,
      title: exam.title,
      name: exam.title
    }))
  };

};

function parseCache(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.data) {
      return {
        data: normalizeRawData(parsed.data),
        lastUpdated: parsed.lastUpdated || null
      };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        data: normalizeRawData(parsed),
        lastUpdated: parsed.lastUpdated || null
      };
    }
  } catch (_error) {
    return null;
  }
  return null;
};

const safeParseCache = (raw) => {
  if (typeof parseCache === 'function') {
    return parseCache(raw);
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return {
      data: normalizeRawData(parsed.data || parsed),
      lastUpdated: parsed.lastUpdated || null
    };
  } catch (_error) {
    return null;
  }
};

const withTimestamp = (data) => ({
  data: normalizeRawData(data),
  lastUpdated: new Date().toISOString()
});

const enqueueWrite = (task) => {
  writeChain = writeChain.then(task, task);
  return writeChain;
};

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const isNavigatorOffline = () => {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
};

const classifyFirebaseError = (error) => {
  if (isNavigatorOffline()) {
    return 'network_offline';
  }

  if (!isFirebaseConfigured || !db) {
    return 'config';
  }

  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  if (code.includes('auth/unauthenticated') || code.includes('unauthenticated') || message.includes('authentication required')) {
    return 'unauthenticated';
  }

  if (code.includes('permission-denied') || message.includes('permission denied')) {
    return 'permission';
  }

  if (code.includes('deadline-exceeded') || message.includes('timed out') || message.includes('timeout')) {
    return 'timeout';
  }

  if (code.includes('unavailable') || code.includes('network-request-failed') || message.includes('network') || message.includes('failed to fetch')) {
    return 'network';
  }

  return 'unknown';
};

const shouldRetry = (errorType) => {
  return errorType === 'timeout' || errorType === 'network';
};

const isOfflineError = (errorType) => {
  return errorType === 'network_offline' || isNavigatorOffline();
};

const logOnlineFailure = (context, errorType) => {
  if (isNavigatorOffline()) return;

  if (errorType === 'permission' || errorType === 'config' || errorType === 'unauthenticated') {
    console.warn(`Online but Firebase ${errorType} issue during ${context}. Using cache fallback.`);
    return;
  }

  console.warn(`Online but failed to ${context}. Using cache fallback.`);
};

const persistStudentRestoreById = async (studentId, nextData) => {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    const error = new Error('Student id is required to restore student');
    return {
      data: nextData,
      remoteSaved: false,
      error,
      errorType: 'unknown',
      operation: 'restore student',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('restore student', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await updateDoc(getStudentDocRef(userId, normalizedStudentId, classId), {
        deleted: false,
        deletedAt: null,
        updatedAt,
        userId,
        ownerId: userId,
        classId
      });

      try {
        await cleanupLegacyStudentCompanionDoc(userId, normalizedStudentId, 'purge');
      } catch (error) {
        console.warn('Ignoring legacy root student restore cleanup failure:', error);
      }

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'restore student',
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to restore student via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('restore student', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'restore student',
    offline: isOfflineError(lastErrorType)
  };
};

const createContextError = (code, message) => {
  const error = new Error(message || code);
  error.code = code;
  return error;
};

const canRoleWrite = (roleOrOptions = getCurrentUserRoleContext()) => {
  const options = roleOrOptions && typeof roleOrOptions === 'object' && !Array.isArray(roleOrOptions)
    ? roleOrOptions
    : { role: roleOrOptions };
  const actorUserId = normalizeUserId(options?.actorUserId || getAuthenticatedUserId() || getCurrentUserId());
  const ownerId = normalizeUserId(options?.ownerId || currentClassOwnerId || actorUserId);
  const ownerRole = normalizeRole(options?.ownerRole || currentClassOwnerRole || ROLE_TEACHER);
  const role = normalizeRole(options?.role || getCurrentUserRoleContext());
  const permissions = normalizePermissions(options?.permissions || currentUserPermissionsContext, currentUserPermissionsContext);
  return canWriteClassData({
    actorRole: role,
    actorPermissions: permissions,
    actorUserId,
    ownerId,
    ownerRole
  });
};

const assertWritableRole = (operationLabel = 'modify data', options = {}) => {
  const role = normalizeRole(options?.role || getCurrentUserRoleContext());
  const actorUserId = normalizeUserId(options?.actorUserId || getAuthenticatedUserId() || getCurrentUserId());
  const canWrite = canRoleWrite({
    role,
    permissions: options?.permissions || currentUserPermissionsContext,
    actorUserId,
    ownerId: options?.ownerId || actorUserId,
    ownerRole: options?.ownerRole || role || ROLE_TEACHER
  });
  console.log('ROLE:', role);
  console.log('CAN WRITE:', canWrite);
  if (!canWrite) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `You do not have permission to ${operationLabel}`);
  }
};

const assertAdminOrDeveloperRole = (operationLabel = 'manage admin data') => {
  const role = getCurrentUserRoleContext();
  if (!canAccessAdminPanel(role, currentUserPermissionsContext)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `Only head teachers, admins, or developers can ${operationLabel}`);
  }
  return role;
};

const assertAdminRole = (operationLabel = 'manage admin data') => {
  const role = getCurrentUserRoleContext();
  if (role !== 'admin') {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `Only admins can ${operationLabel}`);
  }
  return role;
};

const assertDeveloperRole = (operationLabel = 'manage admin data') => {
  const role = getCurrentUserRoleContext();
  if (role !== 'developer') {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `Only developers can ${operationLabel}`);
  }
  return role;
};

const ensureValidClassContext = async (operationLabel = 'access class data', options = {}) => {
  const requireClass = options?.requireClass !== false;
  const requireWritable = options?.requireWritable === true;
  const actorUserId = await ensureAuthenticatedUserId(operationLabel);

  if (requireWritable) {
    assertWritableRole(operationLabel);
  }

  const classContext = await ensureActiveClassContext(actorUserId, { requireClass: false });
  const classId = normalizeClassId(classContext?.classId || '');
  const ownerId = normalizeUserId(classContext?.classOwnerId || '');

  if (!classId) {
    if (requireClass) {
      throw createContextError(ERROR_CODES.MISSING_CLASS_ID, `Missing class context for ${operationLabel}`);
    }
    return {
      actorUserId,
      classId: '',
      ownerId: '',
      className: DEFAULT_CLASS_NAME,
      ownerName: 'Teacher',
      ownerRole: ROLE_TEACHER,
      role: getCurrentUserRoleContext()
    };
  }

  if (!ownerId) {
    throw createContextError(ERROR_CODES.MISSING_OWNER_ID, `Missing class owner context for ${operationLabel}`);
  }

  let classPayload = null;
  if (!isFirebaseConfigured || !db) {
    const classes = Array.isArray(classContext?.classes) ? classContext.classes : [];
    classPayload = classes.find((entry) => normalizeClassId(entry?.id) === classId) || null;
  } else {
    const classSnapshot = await getDoc(getClassDocRef(ownerId, classId));
    if (!classSnapshot.exists()) {
      throw createContextError(ERROR_CODES.CLASS_NOT_FOUND, `Class not found for ${operationLabel}`);
    }
    classPayload = classSnapshot.data() || {};
  }

  if (!classPayload || isDeletedClassPayload(classPayload)) {
    throw createContextError(ERROR_CODES.CLASS_NOT_FOUND, `Class not found for ${operationLabel}`);
  }

  const persistedClassId = normalizeClassId(classPayload?.id || classId);
  if (persistedClassId && persistedClassId !== classId) {
    throw createContextError(ERROR_CODES.INVALID_CLASS_CONTEXT, 'Selected class context is stale or invalid');
  }

  const persistedOwnerId = normalizeUserId(classPayload?.ownerId || classPayload?.userId || ownerId);
  if (!persistedOwnerId) {
    throw createContextError(ERROR_CODES.MISSING_OWNER_ID, 'Class owner metadata is missing');
  }

  if (persistedOwnerId !== ownerId) {
    throw createContextError(ERROR_CODES.INVALID_OWNER, 'Selected class owner does not match class metadata');
  }

  const className = normalizeClassName(classPayload?.name || classContext?.className || DEFAULT_CLASS_NAME);
  const ownerName = normalizeDisplayName(classPayload?.ownerName || classContext?.classOwnerName || 'Teacher');
  const ownerRole = normalizeRole(classPayload?.ownerRole || classContext?.classOwnerRole || classPayload?.role || ROLE_TEACHER);
  if (requireWritable && !canRoleWrite({
    role: getCurrentUserRoleContext(),
    permissions: currentUserPermissionsContext,
    actorUserId,
    ownerId,
    ownerRole
  })) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `You do not have permission to ${operationLabel}`);
  }
  setCurrentClassContext(classId, actorUserId, ownerId, ownerName, ownerRole);

  return {
    actorUserId,
    classId,
    ownerId,
    className,
    ownerName,
    ownerRole,
    role: getCurrentUserRoleContext()
  };
};

const resolveCollectionDocRef = async (collectionRef, identity = {}, labelFields = []) => {
  const normalizedId = String(identity?.id || '').trim();
  const normalizedLabel = String(identity?.name || identity?.title || identity?.label || '').trim().toLowerCase();

  if (!normalizedId && !normalizedLabel) {
    return null;
  }

  const snapshot = await getDocs(collectionRef);
  let matchedRef = null;

  snapshot.forEach((entry) => {
    if (matchedRef) return;

    const payload = entry.data() || {};
    const payloadId = String(payload.id || entry.id || '').trim();
    if (normalizedId && (payloadId === normalizedId || String(entry.id || '').trim() === normalizedId)) {
      matchedRef = entry.ref;
      return;
    }

    if (normalizedLabel) {
      for (const field of labelFields) {
        const value = String(payload?.[field] || '').trim().toLowerCase();
        if (value && value === normalizedLabel) {
          matchedRef = entry.ref;
          return;
        }
      }
    }
  });

  return matchedRef;
};

const persistSubjectDeleteByIdentity = async (subjectIdentity, nextData) => {
  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('delete subject', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      const subjectDocRef = await resolveCollectionDocRef(
        getSubjectsCollectionRef(userId, classId),
        subjectIdentity,
        ['name']
      );
      if (!subjectDocRef) {
        throw new Error('Subject not found');
      }

      await updateDoc(subjectDocRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt,
        userId,
        ownerId: userId,
        classId
      });

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      const deletedId = String(subjectDocRef?.id || subjectIdentity?.id || '').trim();
      const deletedName = String(subjectIdentity?.name || '').trim() || 'Subject';

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'delete subject',
        offline: false,
        trashEntry: {
          id: deletedId,
          name: deletedName,
          deletedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to delete subject via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('delete subject', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'delete subject',
    offline: isOfflineError(lastErrorType)
  };
};

const persistExamDeleteByIdentity = async (examIdentity, nextData) => {
  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('delete exam', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      const examDocRef = await resolveCollectionDocRef(
        getExamsCollectionRef(userId, classId),
        examIdentity,
        ['title', 'name']
      );
      if (!examDocRef) {
        throw new Error('Exam not found');
      }

      await updateDoc(examDocRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt,
        userId,
        ownerId: userId,
        classId
      });

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      const deletedId = String(examDocRef?.id || examIdentity?.id || '').trim();
      const deletedName = String(examIdentity?.title || examIdentity?.name || '').trim() || 'Exam';

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'delete exam',
        offline: false,
        trashEntry: {
          id: deletedId,
          name: deletedName,
          deletedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to delete exam via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('delete exam', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'delete exam',
    offline: isOfflineError(lastErrorType)
  };
};

const persistSubjectRestoreById = async (subjectId, nextData) => {
  const normalizedSubjectId = String(subjectId || '').trim();
  if (!normalizedSubjectId) {
    return {
      data: nextData,
      remoteSaved: false,
      error: new Error('Subject id is required to restore subject'),
      errorType: 'unknown',
      operation: 'restore subject',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('restore subject', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await updateDoc(getSubjectDocRef(userId, normalizedSubjectId, classId), {
        deleted: false,
        deletedAt: null,
        updatedAt,
        userId,
        ownerId: userId,
        classId
      });

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'restore subject',
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to restore subject via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('restore subject', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'restore subject',
    offline: isOfflineError(lastErrorType)
  };
};

const persistExamRestoreById = async (examId, nextData) => {
  const normalizedExamId = String(examId || '').trim();
  if (!normalizedExamId) {
    return {
      data: nextData,
      remoteSaved: false,
      error: new Error('Exam id is required to restore exam'),
      errorType: 'unknown',
      operation: 'restore exam',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('restore exam', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await updateDoc(getExamDocRef(userId, normalizedExamId, classId), {
        deleted: false,
        deletedAt: null,
        updatedAt,
        userId,
        ownerId: userId,
        classId
      });

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'restore exam',
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to restore exam via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('restore exam', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'restore exam',
    offline: isOfflineError(lastErrorType)
  };
};

const persistSubjectHardDeleteById = async (subjectId, nextData) => {
  const normalizedSubjectId = String(subjectId || '').trim();
  if (!normalizedSubjectId) {
    return {
      data: nextData,
      remoteSaved: false,
      error: new Error('Subject id is required to permanently delete subject'),
      errorType: 'unknown',
      operation: 'permanently delete subject',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('permanently delete subject', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await deleteDoc(getSubjectDocRef(userId, normalizedSubjectId, classId));

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'permanently delete subject',
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to permanently delete subject via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('permanently delete subject', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'permanently delete subject',
    offline: isOfflineError(lastErrorType)
  };
};

const persistExamHardDeleteById = async (examId, nextData) => {
  const normalizedExamId = String(examId || '').trim();
  if (!normalizedExamId) {
    return {
      data: nextData,
      remoteSaved: false,
      error: new Error('Exam id is required to permanently delete exam'),
      errorType: 'unknown',
      operation: 'permanently delete exam',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('permanently delete exam', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await deleteDoc(getExamDocRef(userId, normalizedExamId, classId));

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'permanently delete exam',
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to permanently delete exam via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('permanently delete exam', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'permanently delete exam',
    offline: isOfflineError(lastErrorType)
  };
};

const persistStudentHardDeleteById = async (studentId, nextData) => {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    const error = new Error('Student id is required to permanently delete student');
    return {
      data: nextData,
      remoteSaved: false,
      error,
      errorType: 'unknown',
      operation: 'permanently delete student',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('permanently delete student', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await deleteDoc(getStudentDocRef(userId, normalizedStudentId, classId));

      try {
        await cleanupLegacyStudentCompanionDoc(userId, normalizedStudentId, 'purge');
      } catch (error) {
        console.warn('Ignoring legacy root student purge failure:', error);
      }

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'permanently delete student',
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to permanently delete student via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('permanently delete student', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'permanently delete student',
    offline: isOfflineError(lastErrorType)
  };
};

const fetchStudentTrashList = async () => {
  const classScope = await ensureValidClassContext('list student trash', { requireClass: false });
  const userId = classScope.ownerId;
  const classId = classScope.classId;
  if (!classId) {
    return [];
  }

  const snapshot = await getDocs(getStudentsCollectionRef(userId, classId));
  const trash = [];

  snapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted !== true) {
      return;
    }

    trash.push({
      id: String(payload.id || entry.id || '').trim(),
      name: String(payload.name || '').trim() || 'Student',
      deletedAt: normalizeDeletedAtValue(payload.deletedAt)
    });
  });

  return trash
    .filter(entry => entry.id)
    .sort((a, b) => {
      const aTime = new Date(a.deletedAt || 0).getTime() || 0;
      const bTime = new Date(b.deletedAt || 0).getTime() || 0;
      return bTime - aTime;
    });
};

const cleanupDeletedStudentsOlderThan = async (days = TRASH_RETENTION_DAYS) => {
  const studentTrash = await fetchStudentTrashList();
  if (!studentTrash.length) {
    return 0;
  }

  const expiredIds = getExpiredTrashIds(studentTrash, days);

  if (!expiredIds.length) {
    return 0;
  }

  for (const studentId of expiredIds) {
    const fallback = createDefaultRawData();
    await persistStudentHardDeleteById(studentId, fallback);
  }

  return expiredIds.length;
};

const getTrashRetentionCutoff = (days = TRASH_RETENTION_DAYS) => {
  return Date.now() - (Math.max(Number(days) || TRASH_RETENTION_DAYS, 1) * 24 * 60 * 60 * 1000);
};

const getExpiredTrashIds = (trashEntries = [], days = TRASH_RETENTION_DAYS) => {
  const cutoff = getTrashRetentionCutoff(days);
  return [...new Set(asArray(trashEntries)
    .filter((entry) => {
      const time = new Date(entry?.deletedAt || 0).getTime();
      return Number.isFinite(time) && time > 0 && time < cutoff;
    })
    .map((entry) => String(entry?.id || '').trim())
    .filter(Boolean))];
};

const cleanupExpiredClassScopedTrash = async (ownerId, classId, trashPayload = {}, days = TRASH_RETENTION_DAYS) => {
  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedOwnerId || !normalizedClassId || !isFirebaseConfigured || !db) {
    return {
      students: 0,
      subjects: 0,
      exams: 0,
      total: 0
    };
  }

  const expiredStudentIds = getExpiredTrashIds(trashPayload?.trashStudents || [], days);
  const expiredSubjectIds = getExpiredTrashIds(trashPayload?.trashSubjects || [], days);
  const expiredExamIds = getExpiredTrashIds(trashPayload?.trashExams || [], days);
  const total = expiredStudentIds.length + expiredSubjectIds.length + expiredExamIds.length;

  if (!total) {
    return {
      students: 0,
      subjects: 0,
      exams: 0,
      total: 0
    };
  }

  await Promise.all([
    ...expiredStudentIds.map(async (studentId) => {
      await deleteDoc(getStudentDocRef(normalizedOwnerId, studentId, normalizedClassId));
      try {
        await cleanupLegacyStudentCompanionDoc(normalizedOwnerId, studentId, 'purge');
      } catch (error) {
        console.warn('Ignoring legacy root student purge failure during automated trash cleanup:', error);
      }
    }),
    ...expiredSubjectIds.map((subjectId) => deleteDoc(getSubjectDocRef(normalizedOwnerId, subjectId, normalizedClassId))),
    ...expiredExamIds.map((examId) => deleteDoc(getExamDocRef(normalizedOwnerId, examId, normalizedClassId)))
  ]);

  const updatedAt = new Date().toISOString();
  await setDoc(
    getClassDocRef(normalizedOwnerId, normalizedClassId),
    buildClassDocMetadataPatch(normalizedOwnerId, normalizedClassId, updatedAt),
    { merge: true }
  );

  return {
    students: expiredStudentIds.length,
    subjects: expiredSubjectIds.length,
    exams: expiredExamIds.length,
    total
  };
};

const runAutomatedTrashCleanup = async (authUserId = '', role = getCurrentUserRoleContext(), classes = [], trashClasses = [], days = TRASH_RETENTION_DAYS) => {
  const normalizedAuthUserId = normalizeUserId(authUserId);
  if (!normalizedAuthUserId || !canRoleWrite(role) || !isFirebaseConfigured || !db) {
    return {
      classes: 0,
      students: 0,
      subjects: 0,
      exams: 0,
      total: 0
    };
  }

  let deletedClasses = 0;
  let deletedStudents = 0;
  let deletedSubjects = 0;
  let deletedExams = 0;

  const expiredTrashClassIds = getExpiredTrashIds(
    asArray(trashClasses).filter((entry) => normalizeUserId(entry?.ownerId || normalizedAuthUserId) === normalizedAuthUserId),
    days
  );

  for (const classId of expiredTrashClassIds) {
    try {
      await permanentlyDeleteClass(classId);
      deletedClasses += 1;
    } catch (error) {
      console.warn(`Automated trash cleanup failed for class ${classId}:`, error);
    }
  }

  const ownedClasses = asArray(classes).filter((entry) => normalizeUserId(entry?.ownerId || '') === normalizedAuthUserId);

  for (const classEntry of ownedClasses) {
    const ownerId = normalizeUserId(classEntry?.ownerId || '');
    const classId = normalizeClassId(classEntry?.id || '');
    if (!ownerId || !classId) {
      continue;
    }

    try {
      const modularResult = await readModularRawData(ownerId, classId);
      const cleanupResult = await cleanupExpiredClassScopedTrash(ownerId, classId, modularResult, days);
      deletedStudents += cleanupResult.students;
      deletedSubjects += cleanupResult.subjects;
      deletedExams += cleanupResult.exams;
    } catch (error) {
      console.warn(`Automated trash cleanup failed for class-scoped data ${classId}:`, error);
    }
  }

  return {
    classes: deletedClasses,
    students: deletedStudents,
    subjects: deletedSubjects,
    exams: deletedExams,
    total: deletedClasses + deletedStudents + deletedSubjects + deletedExams
  };
};

const hasAnyRawData = (rawData) => {
  const normalized = normalizeRawData(rawData);
  return normalized.students.length > 0 || normalized.subjects.length > 0 || normalized.exams.length > 0;
};

const getRawDataCounts = (rawData) => {
  const normalized = normalizeRawData(rawData);
  return {
    students: normalized.students.length,
    subjects: normalized.subjects.length,
    exams: normalized.exams.length
  };
};

const hasMatchingRawDataCounts = (leftCounts = {}, rightCounts = {}) => {
  return Number(leftCounts.students || 0) === Number(rightCounts.students || 0)
    && Number(leftCounts.subjects || 0) === Number(rightCounts.subjects || 0)
    && Number(leftCounts.exams || 0) === Number(rightCounts.exams || 0);
};

const formatRawDataCounts = (counts = {}) => {
  return `students=${Number(counts.students || 0)}, subjects=${Number(counts.subjects || 0)}, exams=${Number(counts.exams || 0)}`;
};

const normalizeUserId = (value) => String(value || '').trim();

const normalizeDisplayName = (value, fallback = 'Teacher') => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const getAuthenticatedUserId = () => {
  return normalizeUserId(auth?.currentUser?.uid);
};

const getAuthenticatedUserDisplayName = () => {
  const authUser = auth?.currentUser;
  return normalizeDisplayName(authUser?.displayName || authUser?.email || 'Teacher', 'Teacher');
};

const getActiveUserId = () => {
  return normalizeUserId(currentClassOwnerId) || getAuthenticatedUserId();
};

const getCurrentUserId = () => {
  return getActiveUserId();
};

const getFetchScopeKey = (userId = getAuthenticatedUserId() || getCurrentUserId(), role = getCurrentUserRoleContext()) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedRole = normalizeRole(role);
  if (!normalizedUserId) {
    return '';
  }
  return canReadAllData(normalizedRole, currentUserPermissionsContext)
    ? `${normalizedUserId}:admin-global`
    : normalizedUserId;
};

export const setCurrentUserRoleContext = (role = 'teacher', permissions = currentUserPermissionsContext) => {
  currentUserRoleContext = normalizeRole(role);
  currentUserPermissionsContext = normalizePermissions(permissions, currentUserPermissionsContext);
  return currentUserRoleContext;
};

export const getCurrentUserRoleContext = () => {
  return normalizeRole(currentUserRoleContext);
};

export const setCurrentUserAccessContext = (role = 'teacher', permissions = []) => {
  currentUserRoleContext = normalizeRole(role);
  currentUserPermissionsContext = normalizePermissions(permissions, currentUserPermissionsContext);
  return {
    role: currentUserRoleContext,
    permissions: [...currentUserPermissionsContext]
  };
};

export const getCurrentUserPermissionsContext = () => {
  return normalizePermissions(currentUserPermissionsContext, []);
};

export const setCurrentClassOwnerContext = (ownerId = '', ownerName = '', ownerRole = ROLE_TEACHER) => {
  currentClassOwnerId = normalizeUserId(ownerId);
  currentClassOwnerName = normalizeDisplayName(ownerName, currentClassOwnerName || 'Teacher');
  currentClassOwnerRole = normalizeRole(ownerRole || ROLE_TEACHER);
  return {
    ownerId: currentClassOwnerId,
    ownerName: currentClassOwnerName,
    ownerRole: currentClassOwnerRole
  };
};

export const getCurrentClassOwnerContext = () => {
  return {
    ownerId: normalizeUserId(currentClassOwnerId),
    ownerName: normalizeDisplayName(currentClassOwnerName, 'Teacher'),
    ownerRole: normalizeRole(currentClassOwnerRole)
  };
};

const waitForAuthResolution = async () => {
  await authReadyPromise;

  if (!auth) {
    return null;
  }

  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user || null);
      },
      () => {
        unsubscribe();
        resolve(auth.currentUser || null);
      }
    );
  });
};

const createUnauthenticatedError = (operationLabel = 'access data') => {
  const error = new Error(`Authentication required to ${operationLabel}`);
  error.code = 'auth/unauthenticated';
  return error;
};

const ensureAuthenticatedUserId = async (operationLabel = 'access data') => {
  await waitForAuthResolution();

  const userId = getAuthenticatedUserId();
  if (!userId) {
    throw createUnauthenticatedError(operationLabel);
  }
  return userId;
};

const ensureActiveUserId = async (operationLabel = 'access data') => {
  await waitForAuthResolution();

  const authUserId = getAuthenticatedUserId();
  if (!authUserId) {
    throw createUnauthenticatedError(operationLabel);
  }

  return getActiveUserId() || authUserId;
};

const normalizeClassId = (value) => String(value || '').trim();
const normalizeClassName = (value, fallback = DEFAULT_CLASS_NAME) => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const getClassSelectionKeyForUser = (userId) => `${CACHE_KEY_PREFIX}:activeClass:${userId}`;
const getClassSelectionOwnerKeyForUser = (userId) => `${CACHE_KEY_PREFIX}:activeClassOwner:${userId}`;

const persistClassSelection = (userId, classId, ownerId = '') => {
  if (!userId) return;
  const selectionKey = getClassSelectionKeyForUser(userId);
  const ownerSelectionKey = getClassSelectionOwnerKeyForUser(userId);
  const normalizedClassId = normalizeClassId(classId);
  const normalizedOwnerId = normalizeUserId(ownerId);

  if (typeof sessionStorage !== 'undefined') {
    if (normalizedClassId) {
      sessionStorage.setItem(selectionKey, normalizedClassId);
    } else {
      sessionStorage.removeItem(selectionKey);
    }

    if (normalizedOwnerId) {
      sessionStorage.setItem(ownerSelectionKey, normalizedOwnerId);
    } else {
      sessionStorage.removeItem(ownerSelectionKey);
    }
  }

  if (typeof localStorage !== 'undefined') {
    if (normalizedClassId) {
      localStorage.setItem(selectionKey, normalizedClassId);
    } else {
      localStorage.removeItem(selectionKey);
    }

    if (normalizedOwnerId) {
      localStorage.setItem(ownerSelectionKey, normalizedOwnerId);
    } else {
      localStorage.removeItem(ownerSelectionKey);
    }
  }
};

const readPersistedClassSelection = (userId) => {
  if (!userId) {
    return {
      classId: '',
      ownerId: ''
    };
  }

  const selectionKey = getClassSelectionKeyForUser(userId);
  const ownerSelectionKey = getClassSelectionOwnerKeyForUser(userId);
  const sessionClassId = typeof sessionStorage !== 'undefined'
    ? normalizeClassId(sessionStorage.getItem(selectionKey))
    : '';
  const sessionOwnerId = typeof sessionStorage !== 'undefined'
    ? normalizeUserId(sessionStorage.getItem(ownerSelectionKey))
    : '';
  if (sessionClassId) {
    return {
      classId: sessionClassId,
      ownerId: sessionOwnerId
    };
  }

  const localClassId = typeof localStorage !== 'undefined'
    ? normalizeClassId(localStorage.getItem(selectionKey))
    : '';
  const localOwnerId = typeof localStorage !== 'undefined'
    ? normalizeUserId(localStorage.getItem(ownerSelectionKey))
    : '';

  return {
    classId: localClassId,
    ownerId: localOwnerId
  };
};

const setCurrentClassContext = (classId, userId = getAuthenticatedUserId(), ownerId = '', ownerName = '', ownerRole = ROLE_TEACHER) => {
  currentClassId = normalizeClassId(classId);
  const normalizedOwnerId = normalizeUserId(ownerId);

  if (normalizedOwnerId) {
    currentClassOwnerId = normalizedOwnerId;
  } else {
    currentClassOwnerId = '';
  }

  if (ownerName) {
    currentClassOwnerName = normalizeDisplayName(ownerName, currentClassOwnerName || 'Teacher');
  } else {
    currentClassOwnerName = '';
  }

  currentClassOwnerRole = normalizedOwnerId
    ? normalizeRole(ownerRole || currentClassOwnerRole || ROLE_TEACHER)
    : ROLE_TEACHER;

  if (userId) {
    persistClassSelection(userId, currentClassId, currentClassOwnerId);
  }
  return currentClassId;
};

const getCurrentClassContext = () => normalizeClassId(currentClassId);

const toClassModel = (classId, payload = {}) => {
  const id = normalizeClassId(classId);
  const ownerId = normalizeUserId(payload.ownerId || payload.userId || payload.uid || '');
  const ownerName = normalizeDisplayName(payload.ownerName || payload.userName || payload.teacherName || '', 'Teacher');
  const ownerRole = normalizeRole(payload.ownerRole || payload.userRole || payload.role || ROLE_TEACHER);
  return {
    id,
    name: normalizeClassName(payload.name || payload.title || DEFAULT_CLASS_NAME),
    createdAt: payload.createdAt || null,
    ownerId,
    ownerName,
    ownerRole
  };
};

const toClassTrashEntry = (classId, payload = {}) => {
  const id = normalizeClassId(classId);
  const ownerId = normalizeUserId(payload.ownerId || payload.userId || payload.uid || '');
  const ownerName = normalizeDisplayName(payload.ownerName || payload.userName || payload.teacherName || '', 'Teacher');
  const ownerRole = normalizeRole(payload.ownerRole || payload.userRole || payload.role || ROLE_TEACHER);
  return {
    id,
    name: normalizeClassName(payload.name || payload.title || DEFAULT_CLASS_NAME),
    createdAt: payload.createdAt || null,
    deletedAt: normalizeDeletedAtValue(payload.deletedAt),
    ownerId,
    ownerName,
    ownerRole
  };
};

const sortClasses = (classes = []) => {
  return [...classes].sort((a, b) => {
    const aCreated = String(a?.createdAt || '');
    const bCreated = String(b?.createdAt || '');
    if (aCreated && bCreated && aCreated !== bCreated) {
      return aCreated.localeCompare(bCreated);
    }
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
};

const findClassEntryBySelection = (classes = [], classId = '', ownerId = '') => {
  const normalizedClasses = Array.isArray(classes)
    ? classes.map((entry) => toClassModel(entry?.id, entry)).filter((entry) => entry.id)
    : [];
  const normalizedClassId = normalizeClassId(classId);
  const normalizedOwnerId = normalizeUserId(ownerId);

  if (!normalizedClasses.length) {
    return null;
  }

  if (!normalizedClassId) {
    return normalizedClasses[0] || null;
  }

  const ownerAwareMatch = normalizedClasses.find((entry) => {
    if (entry.id !== normalizedClassId) {
      return false;
    }
    if (!normalizedOwnerId) {
      return true;
    }
    return normalizeUserId(entry.ownerId || '') === normalizedOwnerId;
  });

  if (ownerAwareMatch) {
    return ownerAwareMatch;
  }

  return normalizedClasses.find((entry) => entry.id === normalizedClassId) || normalizedClasses[0] || null;
};

const sortClassTrashEntries = (entries = []) => {
  return [...entries].sort((a, b) => {
    const aTime = new Date(a?.deletedAt || 0).getTime() || 0;
    const bTime = new Date(b?.deletedAt || 0).getTime() || 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
};

const getClassesCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION);
const getClassDocRef = (userId, classId) => doc(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId);
const getClassStudentsCollectionRef = (userId, classId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, STUDENTS_SUBCOLLECTION);
const getClassSubjectsCollectionRef = (userId, classId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, SUBJECTS_SUBCOLLECTION);
const getClassExamsCollectionRef = (userId, classId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, EXAMS_SUBCOLLECTION);
const getClassStudentDocRef = (userId, classId, studentId) => doc(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, STUDENTS_SUBCOLLECTION, studentId);
const getClassSubjectDocRef = (userId, classId, subjectId) => doc(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, SUBJECTS_SUBCOLLECTION, subjectId);
const getClassExamDocRef = (userId, classId, examId) => doc(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, EXAMS_SUBCOLLECTION, examId);
const getOwnerIdFromClassRefPath = (path = '') => {
  const segments = String(path || '').split('/').filter(Boolean);
  if (segments.length >= 2 && segments[0] === USERS_COLLECTION) {
    return normalizeUserId(segments[1]);
  }
  return '';
};
const parseGlobalStudentRefPath = (path = '') => {
  const segments = String(path || '').split('/').filter(Boolean);
  const isLegacyRootScoped = segments.length === 4
    && segments[0] === USERS_COLLECTION
    && segments[2] === STUDENTS_SUBCOLLECTION;
  const isClassScoped = segments.length === 6
    && segments[0] === USERS_COLLECTION
    && segments[2] === CLASSES_SUBCOLLECTION
    && segments[4] === STUDENTS_SUBCOLLECTION;
  const isSupportedPath = isLegacyRootScoped || isClassScoped;

  return {
    ownerId: isSupportedPath ? normalizeUserId(segments[1] || '') : '',
    classId: isClassScoped ? normalizeClassId(segments[3] || '') : '',
    studentDocId: isLegacyRootScoped
      ? String(segments[3] || '').trim()
      : isClassScoped
        ? String(segments[5] || '').trim()
        : '',
    isClassScoped,
    isSupportedPath
  };
};
const buildGlobalStudentIdentityKey = (ownerId = '', studentId = '') => {
  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedOwnerId || !normalizedStudentId) {
    return '';
  }
  return `${normalizedOwnerId}::${normalizedStudentId}`;
};
const pickPreferredGlobalStudentRecord = (current = null, candidate = null) => {
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
  return current;
};
const findStudentDocumentRefsByIdentity = async (ownerId = '', studentId = '') => {
  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedOwnerId || !normalizedStudentId || !isFirebaseConfigured || !db) {
    return [];
  }

  const snapshot = await getDocs(collectionGroup(db, STUDENTS_SUBCOLLECTION));
  const matches = [];

  snapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) {
      return;
    }
    const parsedPath = parseGlobalStudentRefPath(entry.ref?.path);
    if (!parsedPath.isSupportedPath) {
      return;
    }

    const resolvedOwnerId = normalizeUserId(parsedPath.ownerId || payload.ownerId || payload.userId || '');
    const resolvedStudentId = String(payload.id || parsedPath.studentDocId || entry.id || '').trim();
    if (resolvedOwnerId !== normalizedOwnerId || resolvedStudentId !== normalizedStudentId) {
      return;
    }

    matches.push({
      ref: entry.ref,
      ownerId: resolvedOwnerId,
      classId: parsedPath.classId,
      studentId: resolvedStudentId
    });
  });

  return matches;
};

const resolveClassIdFromCatalog = (userId, classes = []) => {
  const normalizedClasses = sortClasses(classes)
    .map(entry => toClassModel(entry.id, entry))
    .filter(entry => entry.id);

  if (!normalizedClasses.length) {
    setCurrentClassContext('', userId, '', '');
    return '';
  }

  const persistedSelection = readPersistedClassSelection(userId);
  const requestedClassId = normalizeClassId(currentClassId) || normalizeClassId(persistedSelection.classId || '');
  const requestedOwnerId = normalizeUserId(persistedSelection.ownerId || '');

  const nextClass = findClassEntryBySelection(normalizedClasses, requestedClassId, requestedOwnerId);
  const nextClassId = nextClass?.id || '';
  setCurrentClassContext(nextClassId, userId, nextClass?.ownerId || '', nextClass?.ownerName || '', nextClass?.ownerRole || ROLE_TEACHER);
  return nextClassId;
};

const getClassCatalogCacheKeyForUser = (userId) => `${CACHE_KEY_PREFIX}:classes:${userId}`;

const writeClassCatalogCache = (userId, classes = [], trashClasses = []) => {
  if (!userId || typeof localStorage === 'undefined') return;
  invalidateRecentFetchAllDataCache();
  const payload = {
    classes: sortClasses(classes)
      .map(entry => toClassModel(entry.id, entry))
      .filter(entry => entry.id),
    trashClasses: sortClassTrashEntries(trashClasses)
      .map(entry => toClassTrashEntry(entry.id, entry))
      .filter(entry => entry.id),
    lastUpdated: new Date().toISOString()
  };
  localStorage.setItem(getClassCatalogCacheKeyForUser(userId), JSON.stringify(payload));
};

const readClassCatalogCache = (userId) => {
  if (!userId || typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(getClassCatalogCacheKeyForUser(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const classes = asArray(parsed?.classes)
      .map(entry => toClassModel(entry?.id, entry))
      .filter(entry => entry.id);
    return sortClasses(classes);
  } catch (_error) {
    return [];
  }
};

const readClassTrashCache = (userId) => {
  if (!userId || typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(getClassCatalogCacheKeyForUser(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const trashClasses = asArray(parsed?.trashClasses)
      .map(entry => toClassTrashEntry(entry?.id, entry))
      .filter(entry => entry.id);
    return sortClassTrashEntries(trashClasses);
  } catch (_error) {
    return [];
  }
};

const resolveActiveClassModel = (userId, classes = []) => {
  const normalized = sortClasses(classes)
    .map(entry => toClassModel(entry.id, entry))
    .filter(entry => entry.id);
  const classId = resolveClassIdFromCatalog(userId, normalized);
  const persistedSelection = readPersistedClassSelection(userId);
  const activeClass = findClassEntryBySelection(
    normalized,
    classId,
    currentClassOwnerId || persistedSelection.ownerId || ''
  ) || null;
  return {
    classId,
    className: activeClass?.name || DEFAULT_CLASS_NAME
  };
};

const createMissingClassError = (operationLabel = 'access class data') => {
  const error = new Error(`Create a class first to ${operationLabel}`);
  error.code = 'class/not-found';
  return error;
};

const getCacheKeyForUser = (userId, classId = '') => `${CACHE_KEY_PREFIX}:${userId}:${normalizeClassId(classId) || 'default'}`;
const getUserRootRef = (userId) => doc(db, USERS_COLLECTION, userId);
const getMessagesCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, MESSAGES_SUBCOLLECTION);
const getMessageDocRef = (userId, messageId) => doc(db, USERS_COLLECTION, userId, MESSAGES_SUBCOLLECTION, messageId);
const getConversationsCollectionRef = () => collection(db, CONVERSATIONS_COLLECTION);
const getConversationDocRef = (conversationId) => doc(db, CONVERSATIONS_COLLECTION, conversationId);
const getConversationMessagesCollectionRef = (conversationId) => collection(db, CONVERSATIONS_COLLECTION, conversationId, CONVERSATION_MESSAGES_SUBCOLLECTION);
const getConversationMessageDocRef = (conversationId, messageId) => doc(db, CONVERSATIONS_COLLECTION, conversationId, CONVERSATION_MESSAGES_SUBCOLLECTION, messageId);
const getStudentsCollectionRef = (userId, classId = getCurrentClassContext()) => getClassStudentsCollectionRef(userId, normalizeClassId(classId));
const getSubjectsCollectionRef = (userId, classId = getCurrentClassContext()) => getClassSubjectsCollectionRef(userId, normalizeClassId(classId));
const getExamsCollectionRef = (userId, classId = getCurrentClassContext()) => getClassExamsCollectionRef(userId, normalizeClassId(classId));
const ensureUserRootProfileDocument = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!isFirebaseConfigured || !db || !normalizedUserId) {
    return;
  }

  const userRootRef = getUserRootRef(normalizedUserId);
  const snapshot = await getDoc(userRootRef);
  if (snapshot.exists()) {
    return;
  }

  if (getCurrentUserRoleContext() !== 'teacher') {
    return;
  }

  const bootstrapPayload = buildUserRootBootstrapPayload(normalizedUserId);
  if (!bootstrapPayload.email) {
    return;
  }

  await setDoc(userRootRef, bootstrapPayload, { merge: true });
};

const syncCurrentUserRootProfileMetadata = async (userId, currentData = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const existingData = currentData && typeof currentData === 'object' ? currentData : {};
  if (!isFirebaseConfigured || !db || !normalizedUserId || !Object.keys(existingData).length) {
    return existingData;
  }

  const authenticatedUser = auth?.currentUser || null;
  const patch = {};
  if (normalizeUserId(existingData.uid || '') !== normalizedUserId) {
    patch.uid = normalizedUserId;
  }
  if (normalizeUserId(existingData.userId || '') !== normalizedUserId) {
    patch.userId = normalizedUserId;
  }

  const normalizedEmail = normalizeEmailAddress(authenticatedUser?.email || '');
  if (normalizedEmail && normalizedEmail !== normalizeEmailAddress(existingData.email || '')) {
    patch.email = normalizedEmail;
  }

  const normalizedName = normalizeDisplayName(
    authenticatedUser?.displayName || existingData.name || authenticatedUser?.email || 'Teacher',
    'Teacher'
  );
  if (normalizedName && normalizedName !== normalizeDisplayName(existingData.name || '', '')) {
    patch.name = normalizedName;
  }

  const emailVerified = Boolean(authenticatedUser?.emailVerified);
  if (!Object.prototype.hasOwnProperty.call(existingData, 'emailVerified') || Boolean(existingData.emailVerified) !== emailVerified) {
    patch.emailVerified = emailVerified;
  }

  const existingPermissions = normalizePermissions(existingData.permissions || [], []);
  const hasStoredAccessMetadata = Object.prototype.hasOwnProperty.call(existingData, 'role') || existingPermissions.length > 0;
  if (hasStoredAccessMetadata) {
    const accessProfile = resolveStoredAccessProfile(
      existingData.role || '',
      existingPermissions,
      getCurrentUserRoleContext() || ROLE_TEACHER,
      existingData.email || normalizedEmail || ''
    );
    if (accessProfile.role !== normalizeRole(existingData.role || '')) {
      patch.role = accessProfile.role;
    }
    if (JSON.stringify(existingPermissions) !== JSON.stringify(accessProfile.permissions)) {
      patch.permissions = accessProfile.permissions;
    }
  } else if (getCurrentUserRoleContext() === 'teacher') {
    const accessProfile = buildRolePermissionPayload(ROLE_TEACHER);
    patch.role = accessProfile.role;
    patch.permissions = accessProfile.permissions;
  }

  if (!Object.keys(patch).length) {
    return existingData;
  }

  patch.updatedAt = new Date().toISOString();
  await setDoc(getUserRootRef(normalizedUserId), patch, { merge: true });
  return {
    ...existingData,
    ...patch
  };
};

const mergeUserRootMetadata = async (userId, patch = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!isFirebaseConfigured || !db || !normalizedUserId) {
    return;
  }

  await ensureUserRootProfileDocument(normalizedUserId);
  await setDoc(getUserRootRef(normalizedUserId), patch, { merge: true });
};
const getStudentDocRef = (userId, studentId, classId = getCurrentClassContext()) => getClassStudentDocRef(userId, normalizeClassId(classId), studentId);
const getLegacyStudentDocRef = (userId, studentId) => doc(db, USERS_COLLECTION, userId, STUDENTS_SUBCOLLECTION, studentId);
const getSubjectDocRef = (userId, subjectId, classId = getCurrentClassContext()) => getClassSubjectDocRef(userId, normalizeClassId(classId), subjectId);
const getExamDocRef = (userId, examId, classId = getCurrentClassContext()) => getClassExamDocRef(userId, normalizeClassId(classId), examId);
const getLegacyStudentsCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, STUDENTS_SUBCOLLECTION);
const getLegacySubjectsCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, SUBJECTS_SUBCOLLECTION);
const getLegacyExamsCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, EXAMS_SUBCOLLECTION);

const cleanupLegacyStudentCompanionDoc = async (userId, studentId, action = 'soft-delete', options = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedStudentId = String(studentId || '').trim();
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!normalizedUserId || !normalizedStudentId || !isFirebaseConfigured || !db) {
    return false;
  }

  const legacyStudentRef = getLegacyStudentDocRef(normalizedUserId, normalizedStudentId);
  const updatedAt = String(options?.updatedAt || '').trim() || new Date().toISOString();
  const classId = normalizeClassId(options?.classId || '');

  try {
    if (normalizedAction === 'purge') {
      await deleteDoc(legacyStudentRef);
      return true;
    }

    const patch = {
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt,
      userId: normalizedUserId,
      ownerId: normalizedUserId
    };
    if (classId) {
      patch.classId = classId;
    }

    await updateDoc(legacyStudentRef, patch);
    return true;
  } catch (error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    if (code.includes('not-found') || message.includes('no document to update')) {
      return false;
    }
    throw error;
  }
};

const readLegacyRawData = async (userId) => {
  if (!isFirebaseConfigured || !db || !userId) {
    return createDefaultRawData();
  }

  let studentsSnapshot;
  let subjectsSnapshot;
  let examsSnapshot;

  try {
    [studentsSnapshot, subjectsSnapshot, examsSnapshot] = await Promise.all([
      getDocs(getLegacyStudentsCollectionRef(userId)),
      getDocs(getLegacySubjectsCollectionRef(userId)),
      getDocs(getLegacyExamsCollectionRef(userId))
    ]);
  } catch (error) {
    if (classifyFirebaseError(error) === 'permission') {
      console.warn('Skipping legacy root data read during class migration due to permissions:', error);
      return createDefaultRawData();
    }
    throw error;
  }

  const students = [];
  studentsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) return;
    students.push({
      id: String(payload.id || entry.id || '').trim(),
      name: normalizeStudentName(payload.name),
      notes: payload.notes || '',
      class: payload.class || '',
      scores: payload.scores && typeof payload.scores === 'object' ? clone(payload.scores) : {}
    });
  });

  const subjects = [];
  subjectsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) return;
    const name = String(payload.name || entry.id || '').trim();
    if (name) {
      subjects.push({
        id: String(payload.id || entry.id || '').trim(),
        name
      });
    }
  });

  const exams = [];
  examsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) return;
    const title = String(payload.title || payload.name || entry.id || '').trim();
    if (title) {
      const normalizedDate = toIsoDateString(payload.date) || String(payload.date || '').trim();
      exams.push({
        ...(normalizedDate ? { date: normalizedDate } : {}),
        id: String(payload.id || entry.id || '').trim(),
        title,
        name: title
      });
    }
  });

  return normalizeRawData({
    students,
    subjects,
    exams
  });
};

const updateMigrationState = async (userId, status, extra = {}) => {
  if (!isFirebaseConfigured || !db || !userId) {
    return;
  }

  await mergeUserRootMetadata(userId, {
    uid: userId,
    classMigrationStatus: String(status || '').trim() || 'unknown',
    classMigrationVersion: CLASS_MIGRATION_VERSION,
    classMigrationComplete: status === 'completed',
    classMigrationUpdatedAt: new Date().toISOString(),
    ...extra
  });
};

const readUserRootData = async (userId) => {
  if (!isFirebaseConfigured || !db || !userId) {
    return {};
  }

  const snapshot = await getDoc(getUserRootRef(userId));
  return snapshot.exists() ? (snapshot.data() || {}) : {};
};

const readRecipientRootMessageMetadata = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  try {
    return await readUserRootData(normalizedUserId);
  } catch (error) {
    console.warn(`Failed to read recipient message metadata for ${normalizedUserId}:`, error);
    return null;
  }
};

const buildCurrentMessageSenderProfile = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  const userRootData = normalizedUserId ? await readUserRootData(normalizedUserId) : {};
  const authenticatedEmail = normalizeEmailAddress(auth?.currentUser?.email || '');
  return {
    uid: normalizedUserId,
    name: normalizeDisplayName(userRootData?.name || getAuthenticatedUserDisplayName(), 'Teacher'),
    email: authenticatedEmail || normalizeEmailAddress(userRootData?.email || ''),
    role: normalizeRole(userRootData?.role || getCurrentUserRoleContext() || ROLE_TEACHER)
  };
};

const resolveOutboundMessageRecipients = async (payload = {}, actorUserId = '') => {
  const normalizedAudienceType = normalizeMessageAudienceType(payload?.audienceType);
  const audienceDirectory = await fetchMessageAudienceDirectory();
  let recipients = [];
  let audienceRole = '';
  let audienceClassId = '';
  let audienceClassName = '';

  if (normalizedAudienceType === MESSAGE_AUDIENCE_ALL) {
    recipients = audienceDirectory.users || [];
  } else if (normalizedAudienceType === MESSAGE_AUDIENCE_ROLE) {
    audienceRole = normalizeRole(payload?.audienceRole || payload?.role || '');
    if (!audienceRole) {
      throw new Error('Select a role to continue');
    }
    recipients = asArray(audienceDirectory.users).filter(user => normalizeRole(user?.role || '') === audienceRole);
  } else if (normalizedAudienceType === MESSAGE_AUDIENCE_CLASS) {
    audienceClassId = normalizeClassId(payload?.audienceClassId || payload?.classId || '');
    if (!audienceClassId) {
      throw new Error('Select a class to continue');
    }
    const classEntry = asArray(audienceDirectory.classes).find(entry => normalizeClassId(entry?.id || '') === audienceClassId) || null;
    if (!classEntry) {
      throw new Error('Select a class to continue');
    }
    audienceClassName = normalizeClassName(classEntry?.name || classEntry?.label || '', '');
    const classOwner = normalizeMessageRecipientEntry({
      uid: classEntry?.ownerId,
      name: classEntry?.ownerName,
      role: classEntry?.ownerRole,
      receivesMessages: true
    });
    recipients = classOwner ? [classOwner] : [];
  } else {
    const recipientUserId = normalizeUserId(payload?.recipientUserId || payload?.uid || '');
    if (!recipientUserId) {
      throw new Error('Select a recipient to continue');
    }
    recipients = asArray(audienceDirectory.users).filter(user => normalizeUserId(user?.uid || '') === recipientUserId);
  }

  const normalizedRecipients = [];
  const seen = new Set();
  asArray(recipients).forEach((recipient) => {
    const normalizedRecipient = normalizeMessageRecipientEntry(recipient);
    if (!normalizedRecipient?.uid || normalizedRecipient.uid === normalizeUserId(actorUserId) || !normalizedRecipient.receivesMessages || seen.has(normalizedRecipient.uid)) {
      return;
    }
    seen.add(normalizedRecipient.uid);
    normalizedRecipients.push(normalizedRecipient);
  });

  if (!normalizedRecipients.length) {
    throw new Error('No eligible recipients found for the selected To option');
  }

  return {
    audienceType: normalizedAudienceType,
    audienceRole,
    audienceClassId,
    audienceClassName,
    recipients: normalizedRecipients,
    audienceLabel: buildMessageAudienceLabel({
      audienceType: normalizedAudienceType,
      recipients: normalizedRecipients,
      audienceRole,
      audienceClassName,
      audienceLabel: payload?.audienceLabel
    })
  };
};

const deliverMessageCopies = async ({
  actorUserId = '',
  senderProfile = {},
  recipients = [],
  audienceType = MESSAGE_AUDIENCE_INDIVIDUAL,
  audienceRole = '',
  audienceClassId = '',
  audienceClassName = '',
  audienceLabel = '',
  subject = '',
  body = '',
  threadId = '',
  parentMessageId = '',
  isReply = false
} = {}) => {
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (!normalizedActorUserId || !isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const normalizedRecipients = [];
  const seen = new Set();
  asArray(recipients).forEach((recipient) => {
    const normalizedRecipient = normalizeMessageRecipientEntry(recipient);
    if (!normalizedRecipient?.uid || normalizedRecipient.uid === normalizedActorUserId || !normalizedRecipient.receivesMessages || seen.has(normalizedRecipient.uid)) {
      return;
    }
    seen.add(normalizedRecipient.uid);
    normalizedRecipients.push(normalizedRecipient);
  });

  if (!normalizedRecipients.length) {
    throw new Error('At least one recipient is required');
  }

  const normalizedSubject = normalizeMessageSubject(subject);
  const normalizedBody = normalizeMessageBody(body);
  if (!normalizedSubject) {
    throw new Error('Subject is required');
  }
  if (!normalizedBody) {
    throw new Error('Message body is required');
  }

  const createdAt = new Date().toISOString();
  const senderId = normalizeUserId(senderProfile?.uid || normalizedActorUserId);
  const senderName = normalizeDisplayName(senderProfile?.name || getAuthenticatedUserDisplayName(), 'Teacher');
  const senderEmail = normalizeEmailAddress(auth?.currentUser?.email || senderProfile?.email || '');
  const senderRole = normalizeRole(senderProfile?.role || getCurrentUserRoleContext() || ROLE_TEACHER);
  const senderMessagesRef = getMessagesCollectionRef(normalizedActorUserId);
  const sentRef = doc(senderMessagesRef);
  const resolvedThreadId = String(threadId || parentMessageId || sentRef.id).trim() || sentRef.id;
  const resolvedAudienceType = normalizeMessageAudienceType(audienceType);
  const resolvedAudienceLabel = buildMessageAudienceLabel({
    audienceType: resolvedAudienceType,
    audienceLabel,
    recipients: normalizedRecipients,
    audienceRole,
    audienceClassName
  });
  const recipientSummaryLabel = buildMessageRecipientsSummaryLabel(normalizedRecipients);
  const singleRecipient = normalizedRecipients.length === 1 ? normalizedRecipients[0] : null;
  const recipientUserIds = normalizedRecipients.map(recipient => recipient.uid);
  const recipientRootRecords = await Promise.all(normalizedRecipients.map(async (recipient) => {
    const rootData = await readRecipientRootMessageMetadata(recipient.uid);
    return [recipient.uid, rootData];
  }));
  const recipientRootMap = new Map(recipientRootRecords);
  const batch = writeBatch(db);
  const basePayload = {
    threadId: resolvedThreadId,
    parentMessageId: String(parentMessageId || '').trim(),
    replyToMessageId: String(parentMessageId || '').trim(),
    isReply: Boolean(isReply || parentMessageId),
    senderId,
    senderName,
    senderEmail,
    senderRole,
    subject: normalizedSubject,
    body: normalizedBody,
    bodyPreview: buildMessagePreview(normalizedBody),
    audienceType: resolvedAudienceType,
    audienceRole: normalizeRole(audienceRole || ''),
    audienceClassId: normalizeClassId(audienceClassId || ''),
    audienceClassName: String(audienceClassName || '').trim(),
    audienceLabel: resolvedAudienceLabel,
    recipientCount: normalizedRecipients.length,
    sentAt: serverTimestamp(),
    createdAt,
    updatedAt: createdAt
  };

  batch.set(sentRef, {
    id: sentRef.id,
    mailbox: MESSAGE_MAILBOX_SENT,
    ...basePayload,
    recipientUserId: singleRecipient?.uid || '',
    recipientName: singleRecipient?.name || recipientSummaryLabel,
    recipientEmail: singleRecipient?.email || '',
    recipientRole: singleRecipient?.role || ROLE_TEACHER,
    recipientUserIds,
    recipientLabel: recipientSummaryLabel,
    isRead: true,
    readAt: serverTimestamp()
  }, { merge: true });

  const inboxMessages = [];
  normalizedRecipients.forEach((recipient) => {
    const inboxRef = doc(getMessagesCollectionRef(recipient.uid));
    const inboxPayload = {
      id: inboxRef.id,
      mailbox: MESSAGE_MAILBOX_INBOX,
      ...basePayload,
      recipientUserId: recipient.uid,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      recipientRole: recipient.role,
      recipientUserIds: [recipient.uid],
      recipientLabel: recipient.displayLabel,
      fromSentMessageId: sentRef.id,
      isRead: false,
      readAt: null
    };
    batch.set(inboxRef, inboxPayload, { merge: true });

    const existingRootData = recipientRootMap.get(recipient.uid) || {};
    if (Object.keys(existingRootData).length) {
      const existingUnreadCount = Number.isFinite(Number(existingRootData?.messageUnreadCount))
        ? Math.max(0, Math.floor(Number(existingRootData.messageUnreadCount)))
        : 0;
      batch.set(getUserRootRef(recipient.uid), {
        userId: recipient.uid,
        messageUnreadCount: existingUnreadCount + 1,
        lastMessageAt: createdAt,
        updatedAt: createdAt
      }, { merge: true });
    }

    inboxMessages.push(normalizeMessageRecord(inboxRef.id, {
      ...inboxPayload,
      sentAt: createdAt,
      readAt: null
    }));
  });

  await batch.commit();

  try {
    await mergeUserRootMetadata(normalizedActorUserId, {
      userId: normalizedActorUserId,
      lastMessageAt: createdAt,
      updatedAt: createdAt
    });
  } catch (error) {
    console.warn('Failed to update sender message metadata:', error);
  }

  return {
    threadId: resolvedThreadId,
    recipientCount: normalizedRecipients.length,
    audienceLabel: resolvedAudienceLabel,
    inboxMessages,
    sentMessage: normalizeMessageRecord(sentRef.id, {
      id: sentRef.id,
      mailbox: MESSAGE_MAILBOX_SENT,
      ...basePayload,
      recipientUserId: singleRecipient?.uid || '',
      recipientName: singleRecipient?.name || recipientSummaryLabel,
      recipientEmail: singleRecipient?.email || '',
      recipientRole: singleRecipient?.role || ROLE_TEACHER,
      recipientUserIds,
      recipientLabel: recipientSummaryLabel,
      isRead: true,
      readAt: createdAt,
      sentAt: createdAt
    })
  };
};

export const fetchCurrentUserMessages = async () => {
  const userId = await ensureAuthenticatedUserId('read messages');
  if (!isFirebaseConfigured || !db) {
    return {
      messages: [],
      unreadCount: 0,
      lastMessageAt: null
    };
  }

  const snapshot = await getDocs(query(getMessagesCollectionRef(userId), orderBy('sentAt', 'desc')));
  const messages = [];
  snapshot.forEach((entry) => {
    const record = normalizeMessageRecord(entry.id, entry.data() || {});
    if (!record.id) {
      return;
    }
    messages.push(record);
  });

  messages.sort((left, right) => {
    const leftTime = new Date(left?.sortAt || 0).getTime() || 0;
    const rightTime = new Date(right?.sortAt || 0).getTime() || 0;
    return rightTime - leftTime;
  });

  const metadata = await syncCurrentUserMessageMetadata(userId, messages);
  return {
    messages,
    unreadCount: metadata.unreadCount,
    lastMessageAt: metadata.lastMessageAt
  };
};

export const fetchMessageAudienceDirectory = async () => {
  const actorUserId = await ensureAuthenticatedUserId('read message audience directory');
  const actorRole = getCurrentUserRoleContext();
  const actorPermissions = getCurrentUserPermissionsContext();
  const capabilities = {
    canSend: canSendMessages(actorRole, actorPermissions),
    canReply: canReplyToMessages(actorRole, actorPermissions),
    canMessageIndividuals: canMessageAudienceType(MESSAGE_AUDIENCE_INDIVIDUAL, actorRole, actorPermissions),
    canMessageRoles: canMessageAudienceType(MESSAGE_AUDIENCE_ROLE, actorRole, actorPermissions),
    canMessageClasses: canMessageAudienceType(MESSAGE_AUDIENCE_CLASS, actorRole, actorPermissions),
    canMessageAll: canMessageAudienceType(MESSAGE_AUDIENCE_ALL, actorRole, actorPermissions)
  };

  let users = [];
  if (capabilities.canMessageIndividuals || capabilities.canMessageRoles || capabilities.canMessageAll) {
    users = (await readMessageDirectoryUsers()).filter((entry) => {
      return normalizeUserId(entry?.uid || '') && normalizeUserId(entry?.uid || '') !== actorUserId && entry.receivesMessages;
    });
  }

  let classes = [];
  if (capabilities.canMessageClasses) {
    try {
      const classCatalog = await fetchClassCatalog();
      classes = buildMessageClassAudienceOptions(classCatalog?.classes || [], actorUserId);
    } catch (error) {
      console.warn('Failed to build class messaging directory:', error);
    }
  }

  return {
    users,
    roles: capabilities.canMessageRoles || capabilities.canMessageAll ? buildMessageRoleAudienceOptions(users) : [],
    classes,
    capabilities
  };
};

const buildMergedConversationList = (conversationRecords = [], legacyMessages = [], actorUserId = '') => {
  const normalizedActorUserId = normalizeUserId(actorUserId);
  const normalizedConversationRecords = asArray(conversationRecords).filter(record => String(record?.id || '').trim());
  const activeDirectKeys = new Set(normalizedConversationRecords
    .map(record => String(record?.directKey || '').trim())
    .filter(Boolean));
  const legacyConversations = buildLegacyConversationRecords(legacyMessages, normalizedActorUserId).filter((record) => {
    const directKey = String(record?.directKey || '').trim();
    return !directKey || !activeDirectKeys.has(directKey);
  });
  return normalizedConversationRecords.concat(legacyConversations).sort(sortConversationRecordsByNewest);
};

const syncCurrentUserConversationMetadata = async (userId, conversations = []) => {
  const normalizedUserId = normalizeUserId(userId);
  const unreadCount = asArray(conversations).reduce((total, conversation) => {
    return total + Math.max(0, Math.floor(Number(conversation?.unreadCount || 0)));
  }, 0);
  const lastMessageAt = asArray(conversations)
    .map(conversation => String(conversation?.lastMessageAt || conversation?.updatedAt || conversation?.createdAt || '').trim())
    .find(Boolean) || null;

  if (normalizedUserId && normalizedUserId === getAuthenticatedUserId()) {
    try {
      await mergeUserRootMetadata(normalizedUserId, {
        userId: normalizedUserId,
        messageUnreadCount: unreadCount,
        lastMessageAt,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Failed to sync current user conversation metadata:', error);
    }
  }

  return {
    unreadCount,
    lastMessageAt
  };
};

const readConversationListRecords = async (actorUserId = '', actorRole = '', actorPermissions = []) => {
  if (!isFirebaseConfigured || !db) {
    return [];
  }

  const normalizedActorUserId = normalizeUserId(actorUserId);
  const source = canViewAllConversations(actorRole, actorPermissions)
    ? query(getConversationsCollectionRef(), limit(MAX_CONVERSATION_LIST_QUERY_LIMIT))
    : query(
      getConversationsCollectionRef(),
      where('participants', 'array-contains', normalizedActorUserId),
      limit(MAX_CONVERSATION_LIST_QUERY_LIMIT)
    );
  const snapshot = await getDocs(source);
  const conversations = [];
  snapshot.forEach((entry) => {
    const record = normalizeConversationRecord(entry.id, entry.data() || {}, normalizedActorUserId);
    if (!record.id) {
      return;
    }
    conversations.push(record);
  });
  return conversations.sort(sortConversationRecordsByNewest);
};

const buildConversationUnreadCountByUser = (existingMap = {}, participantIds = [], senderId = '') => {
  const normalizedSenderId = normalizeUserId(senderId);
  const previousMap = normalizeConversationNumberMap(existingMap);
  return normalizeConversationUserIdList(participantIds).reduce((result, participantId) => {
    const existingCount = Number.isFinite(Number(previousMap?.[participantId]))
      ? Math.max(0, Math.floor(Number(previousMap[participantId])))
      : 0;
    result[participantId] = participantId === normalizedSenderId ? 0 : existingCount + 1;
    return result;
  }, {});
};

const mergeConversationMessageLists = (...messageLists) => {
  const merged = [];
  const seen = new Set();
  messageLists.reduce((result, list) => result.concat(asArray(list)), []).forEach((message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) {
      return;
    }
    const cacheKey = `${String(message?.source || 'conversation').trim()}:${messageId}`;
    if (seen.has(cacheKey)) {
      return;
    }
    seen.add(cacheKey);
    merged.push(message);
  });
  return merged.sort(sortConversationMessagesByOldest);
};

const getLegacyDirectKeyFromConversationId = (conversationId = '') => {
  const normalizedConversationId = String(conversationId || '').trim();
  return normalizedConversationId.startsWith('legacy:direct:')
    ? normalizedConversationId.slice('legacy:direct:'.length)
    : '';
};

const getLegacyConversationRecipientUserId = (conversationId = '', actorUserId = '') => {
  const directKey = getLegacyDirectKeyFromConversationId(conversationId);
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (!directKey) {
    return '';
  }
  return directKey.split('__').map(normalizeUserId).find((participantId) => {
    return participantId && participantId !== normalizedActorUserId;
  }) || '';
};

const buildLegacyDirectConversationMessages = (legacyMessages = [], directKey = '', currentUserId = '', conversationId = '') => {
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  const normalizedDirectKey = String(directKey || '').trim();
  if (!normalizedCurrentUserId || !normalizedDirectKey) {
    return [];
  }
  return buildLegacyConversationMessages(asArray(legacyMessages).filter((message) => {
    const directCounterpart = getLegacyDirectCounterpartForMessage(message, normalizedCurrentUserId);
    if (!directCounterpart?.uid) {
      return false;
    }
    return buildDirectConversationKey([normalizedCurrentUserId, directCounterpart.uid]) === normalizedDirectKey;
  }), normalizedCurrentUserId, conversationId);
};

const resolveConversationRecipientDirectoryEntry = async (recipientUserId = '', actorUserId = '', actorRole = '', actorPermissions = []) => {
  const normalizedRecipientUserId = normalizeUserId(recipientUserId);
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (!normalizedRecipientUserId || normalizedRecipientUserId === normalizedActorUserId) {
    throw new Error('Select a valid recipient to continue');
  }

  const directory = await fetchConversationDirectory();
  const recipient = asArray(directory.users).find((entry) => {
    return normalizeUserId(entry?.uid || '') === normalizedRecipientUserId;
  }) || null;
  if (!recipient?.uid) {
    throw new Error('Select a valid recipient to continue');
  }
  if (!canStartConversationWithRole(recipient.role, actorRole, actorPermissions)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to start a conversation with that user');
  }
  return recipient;
};

const resolveConversationWriteTarget = async ({
  conversationId = '',
  recipientUserId = '',
  actorUserId = '',
  actorRole = '',
  actorPermissions = []
} = {}) => {
  const normalizedConversationId = String(conversationId || '').trim();
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (normalizedConversationId && !normalizedConversationId.startsWith('legacy:')) {
    const conversationSnapshot = await getDoc(getConversationDocRef(normalizedConversationId));
    if (!conversationSnapshot.exists()) {
      throw new Error('The selected conversation could not be found');
    }
    const conversationRecord = normalizeConversationRecord(conversationSnapshot.id, conversationSnapshot.data() || {}, normalizedActorUserId);
    if (!conversationRecord.participants.includes(normalizedActorUserId)) {
      throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You can only send messages in conversations you participate in');
    }
    return {
      conversationId: normalizedConversationId,
      conversationRecord,
      recipient: null
    };
  }

  if (!canStartConversations(actorRole, actorPermissions)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to start conversations');
  }

  const fallbackRecipientUserId = normalizeUserId(recipientUserId || getLegacyConversationRecipientUserId(normalizedConversationId, normalizedActorUserId));
  const recipient = await resolveConversationRecipientDirectoryEntry(fallbackRecipientUserId, normalizedActorUserId, actorRole, actorPermissions);
  const directConversationId = buildDirectConversationKey([normalizedActorUserId, recipient.uid]);
  const conversationSnapshot = await getDoc(getConversationDocRef(directConversationId));
  return {
    conversationId: directConversationId,
    conversationRecord: conversationSnapshot.exists()
      ? normalizeConversationRecord(conversationSnapshot.id, conversationSnapshot.data() || {}, normalizedActorUserId)
      : null,
    recipient
  };
};

export const fetchConversationDirectory = async () => {
  const actorUserId = await ensureAuthenticatedUserId('read conversation directory');
  const actorRole = getCurrentUserRoleContext();
  const actorPermissions = getCurrentUserPermissionsContext();
  const capabilities = {
    canSend: canStartConversations(actorRole, actorPermissions) || canReplyToMessages(actorRole, actorPermissions),
    canReply: canReplyToMessages(actorRole, actorPermissions),
    canStart: canStartConversations(actorRole, actorPermissions),
    canViewAll: canViewAllConversations(actorRole, actorPermissions)
  };

  let users = [];
  if (capabilities.canStart) {
    users = (await readMessageDirectoryUsers()).filter((entry) => {
      const candidateUserId = normalizeUserId(entry?.uid || '');
      const candidateRole = normalizeRole(entry?.role || '');
      return candidateUserId
        && candidateUserId !== actorUserId
        && entry.receivesMessages
        && canStartConversationWithRole(candidateRole, actorRole, actorPermissions);
    });
  }

  return {
    users,
    roles: buildMessageRoleAudienceOptions(users),
    classes: [],
    capabilities
  };
};

export const fetchCurrentUserConversations = async () => {
  const actorUserId = await ensureAuthenticatedUserId('read conversations');
  if (!isFirebaseConfigured || !db) {
    return {
      conversations: [],
      unreadCount: 0,
      lastMessageAt: null
    };
  }

  const actorRole = getCurrentUserRoleContext();
  const actorPermissions = getCurrentUserPermissionsContext();
  const [conversationRecords, legacyPayload] = await Promise.all([
    readConversationListRecords(actorUserId, actorRole, actorPermissions),
    fetchCurrentUserMessages()
  ]);
  const conversations = buildMergedConversationList(conversationRecords, legacyPayload.messages, actorUserId);
  const metadata = await syncCurrentUserConversationMetadata(actorUserId, conversations);
  return {
    conversations,
    unreadCount: metadata.unreadCount,
    lastMessageAt: metadata.lastMessageAt
  };
};

export const fetchConversationMessages = async (conversationId = '') => {
  const actorUserId = await ensureAuthenticatedUserId('read conversation messages');
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return {
      conversation: null,
      messages: [],
      unreadCount: 0
    };
  }

  if (normalizedConversationId.startsWith('legacy:')) {
    const legacyPayload = await fetchCurrentUserMessages();
    const legacyConversation = buildLegacyConversationRecords(legacyPayload.messages, actorUserId).find((entry) => {
      return String(entry?.id || '').trim() === normalizedConversationId;
    }) || null;
    return {
      conversation: legacyConversation,
      messages: buildLegacyConversationMessages(legacyConversation?.legacyMessages || [], actorUserId, normalizedConversationId),
      unreadCount: Math.max(0, Math.floor(Number(legacyConversation?.unreadCount || 0)))
    };
  }

  const conversationSnapshot = await getDoc(getConversationDocRef(normalizedConversationId));
  if (!conversationSnapshot.exists()) {
    throw new Error('The selected conversation could not be found');
  }

  const conversationRecord = normalizeConversationRecord(conversationSnapshot.id, conversationSnapshot.data() || {}, actorUserId);
  const messagesSnapshot = await getDocs(getConversationMessagesCollectionRef(normalizedConversationId));
  const conversationMessages = [];
  messagesSnapshot.forEach((entry) => {
    const record = normalizeConversationMessageRecord(entry.id, entry.data() || {}, normalizedConversationId, actorUserId);
    if (!record.id) {
      return;
    }
    conversationMessages.push(record);
  });

  const legacyPayload = conversationRecord.directKey
    ? await fetchCurrentUserMessages()
    : { messages: [] };
  return {
    conversation: conversationRecord,
    messages: mergeConversationMessageLists(
      conversationMessages,
      buildLegacyDirectConversationMessages(legacyPayload.messages, conversationRecord.directKey, actorUserId, normalizedConversationId)
    ),
    unreadCount: Math.max(0, Math.floor(Number(conversationRecord?.unreadCount || 0)))
  };
};

export const subscribeCurrentUserConversations = async ({ onChange, onError } = {}) => {
  const actorUserId = await ensureAuthenticatedUserId('subscribe to conversations');
  if (!isFirebaseConfigured || !db) {
    if (typeof onChange === 'function') {
      onChange({
        conversations: [],
        unreadCount: 0,
        lastMessageAt: null
      });
    }
    return () => {};
  }

  const actorRole = getCurrentUserRoleContext();
  const actorPermissions = getCurrentUserPermissionsContext();
  const source = canViewAllConversations(actorRole, actorPermissions)
    ? query(getConversationsCollectionRef(), limit(MAX_CONVERSATION_LIST_QUERY_LIMIT))
    : query(
      getConversationsCollectionRef(),
      where('participants', 'array-contains', normalizeUserId(actorUserId)),
      limit(MAX_CONVERSATION_LIST_QUERY_LIMIT)
    );
  let disposed = false;

  const emitPayload = async (snapshot) => {
    if (disposed) {
      return;
    }

    try {
      const conversationRecords = [];
      snapshot.forEach((entry) => {
        const record = normalizeConversationRecord(entry.id, entry.data() || {}, actorUserId);
        if (!record.id) {
          return;
        }
        conversationRecords.push(record);
      });
      const legacyPayload = await fetchCurrentUserMessages();
      const conversations = buildMergedConversationList(conversationRecords, legacyPayload.messages, actorUserId);
      const metadata = await syncCurrentUserConversationMetadata(actorUserId, conversations);
      if (!disposed && typeof onChange === 'function') {
        onChange({
          conversations,
          unreadCount: metadata.unreadCount,
          lastMessageAt: metadata.lastMessageAt
        });
      }
    } catch (error) {
      if (typeof onError === 'function') {
        onError(error);
      } else {
        console.warn('Conversation subscription update failed:', error);
      }
    }
  };

  const unsubscribe = onSnapshot(source, (snapshot) => {
    void emitPayload(snapshot);
  }, (error) => {
    if (typeof onError === 'function') {
      onError(error);
    } else {
      console.warn('Conversation subscription failed:', error);
    }
  });

  return () => {
    disposed = true;
    unsubscribe();
  };
};

export const subscribeConversationMessages = async (conversationId = '', { onChange, onError } = {}) => {
  const actorUserId = await ensureAuthenticatedUserId('subscribe to conversation messages');
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    if (typeof onChange === 'function') {
      onChange({
        conversation: null,
        messages: [],
        unreadCount: 0
      });
    }
    return () => {};
  }

  if (normalizedConversationId.startsWith('legacy:') || !isFirebaseConfigured || !db) {
    try {
      const payload = await fetchConversationMessages(normalizedConversationId);
      if (typeof onChange === 'function') {
        onChange(payload);
      }
    } catch (error) {
      if (typeof onError === 'function') {
        onError(error);
      } else {
        console.warn('Legacy conversation load failed:', error);
      }
    }
    return () => {};
  }

  let disposed = false;
  let currentConversation = null;
  let currentMessages = [];

  const emitPayload = async () => {
    if (disposed) {
      return;
    }
    try {
      const legacyPayload = currentConversation?.directKey
        ? await fetchCurrentUserMessages()
        : { messages: [] };
      const messages = mergeConversationMessageLists(
        currentMessages,
        buildLegacyDirectConversationMessages(legacyPayload.messages, currentConversation?.directKey || '', actorUserId, normalizedConversationId)
      );
      if (!disposed && typeof onChange === 'function') {
        onChange({
          conversation: currentConversation,
          messages,
          unreadCount: Math.max(0, Math.floor(Number(currentConversation?.unreadCount || 0)))
        });
      }
    } catch (error) {
      if (typeof onError === 'function') {
        onError(error);
      } else {
        console.warn('Conversation thread subscription update failed:', error);
      }
    }
  };

  const unsubscribeConversation = onSnapshot(getConversationDocRef(normalizedConversationId), (snapshot) => {
    currentConversation = snapshot.exists()
      ? normalizeConversationRecord(snapshot.id, snapshot.data() || {}, actorUserId)
      : null;
    void emitPayload();
  }, (error) => {
    if (typeof onError === 'function') {
      onError(error);
    } else {
      console.warn('Conversation document subscription failed:', error);
    }
  });

  const unsubscribeMessages = onSnapshot(getConversationMessagesCollectionRef(normalizedConversationId), (snapshot) => {
    const liveMessages = [];
    snapshot.forEach((entry) => {
      const record = normalizeConversationMessageRecord(entry.id, entry.data() || {}, normalizedConversationId, actorUserId);
      if (!record.id) {
        return;
      }
      liveMessages.push(record);
    });
    currentMessages = liveMessages.sort(sortConversationMessagesByOldest);
    void emitPayload();
  }, (error) => {
    if (typeof onError === 'function') {
      onError(error);
    } else {
      console.warn('Conversation messages subscription failed:', error);
    }
  });

  return () => {
    disposed = true;
    unsubscribeConversation();
    unsubscribeMessages();
  };
};

export const sendConversationMessage = async (payload = {}) => {
  const actorUserId = await ensureAuthenticatedUserId('send conversation messages');
  const actorRole = getCurrentUserRoleContext();
  const actorPermissions = getCurrentUserPermissionsContext();
  if (!canStartConversations(actorRole, actorPermissions) && !String(payload?.conversationId || '').trim()) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to start conversations');
  }
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const normalizedActorUserId = normalizeUserId(actorUserId);
  const normalizedBody = normalizeMessageBody(payload?.body || payload?.text || payload?.message || '');
  if (!normalizedBody) {
    throw new Error('Message body is required');
  }

  const senderProfile = await buildCurrentMessageSenderProfile(normalizedActorUserId);
  const target = await resolveConversationWriteTarget({
    conversationId: payload?.conversationId,
    recipientUserId: payload?.recipientUserId || payload?.uid,
    actorUserId: normalizedActorUserId,
    actorRole,
    actorPermissions
  });
  const senderParticipant = normalizeMessageRecipientEntry({
    ...senderProfile,
    receivesMessages: true
  });
  const recipientParticipant = target.recipient
    ? normalizeMessageRecipientEntry(target.recipient)
    : null;
  const participantMaps = buildConversationParticipantMaps([senderParticipant, recipientParticipant].filter(Boolean));
  const existingConversation = target.conversationRecord || null;
  const participants = normalizeConversationUserIdList(
    (existingConversation?.participants || []).concat(participantMaps.participants)
  );
  if (!participants.length) {
    throw new Error('At least one participant is required');
  }

  const participantNames = {
    ...(existingConversation?.participantNames || {}),
    ...participantMaps.participantNames
  };
  const participantEmails = {
    ...(existingConversation?.participantEmails || {}),
    ...participantMaps.participantEmails
  };
  const participantRoles = {
    ...(existingConversation?.participantRoles || {}),
    ...participantMaps.participantRoles
  };
  const conversationIdValue = String(target.conversationId || '').trim();
  const directKey = buildDirectConversationKey(participants);
  const createdAt = new Date().toISOString();
  const nextUnreadCountByUser = buildConversationUnreadCountByUser(existingConversation?.unreadCountByUser || {}, participants, normalizedActorUserId);
  const messageRef = doc(getConversationMessagesCollectionRef(conversationIdValue));
  const conversationPayload = {
    id: conversationIdValue,
    type: CONVERSATION_TYPE_DIRECT,
    directKey,
    participants,
    participantNames,
    participantEmails,
    participantRoles,
    initiatorId: existingConversation?.participants?.length ? (existingConversation?.participants[0] || normalizedActorUserId) : normalizedActorUserId,
    initiatorRole: existingConversation?.participants?.length ? normalizeRole(existingConversation?.participantRoles?.[existingConversation.participants[0]] || senderProfile.role) : normalizeRole(senderProfile.role),
    lastMessageText: normalizedBody,
    lastMessagePreview: buildMessagePreview(normalizedBody),
    lastMessageAt: createdAt,
    lastMessageSenderId: normalizedActorUserId,
    lastMessageSenderName: normalizeDisplayName(senderProfile?.name || getAuthenticatedUserDisplayName(), 'Teacher'),
    lastMessageSenderRole: normalizeRole(senderProfile?.role || ROLE_TEACHER),
    unreadCountByUser: nextUnreadCountByUser,
    createdAt: existingConversation?.createdAt || createdAt,
    updatedAt: createdAt
  };
  const messagePayload = {
    id: messageRef.id,
    conversationId: conversationIdValue,
    type: 'text',
    senderId: normalizedActorUserId,
    senderName: normalizeDisplayName(senderProfile?.name || getAuthenticatedUserDisplayName(), 'Teacher'),
    senderEmail: normalizeEmailAddress(senderProfile?.email || auth?.currentUser?.email || ''),
    senderRole: normalizeRole(senderProfile?.role || ROLE_TEACHER),
    text: normalizedBody,
    body: normalizedBody,
    readByUserIds: [normalizedActorUserId],
    createdAt,
    updatedAt: createdAt,
    sentAt: serverTimestamp()
  };

  const batch = writeBatch(db);
  batch.set(getConversationDocRef(conversationIdValue), conversationPayload, { merge: true });
  batch.set(messageRef, messagePayload, { merge: true });

  const otherParticipants = participants.filter(participantId => participantId !== normalizedActorUserId);
  const rootMetadataRecords = await Promise.all(otherParticipants.map(async (participantId) => {
    const rootData = await readRecipientRootMessageMetadata(participantId);
    return [participantId, rootData];
  }));
  const rootMetadataMap = new Map(rootMetadataRecords);
  otherParticipants.forEach((participantId) => {
    const existingRootData = rootMetadataMap.get(participantId) || {};
    if (Object.keys(existingRootData).length) {
      const existingUnreadCount = Number.isFinite(Number(existingRootData?.messageUnreadCount))
        ? Math.max(0, Math.floor(Number(existingRootData.messageUnreadCount)))
        : 0;
      batch.set(getUserRootRef(participantId), {
        userId: participantId,
        messageUnreadCount: existingUnreadCount + 1,
        lastMessageAt: createdAt,
        updatedAt: createdAt
      }, { merge: true });
    }
  });

  await batch.commit();

  try {
    await mergeUserRootMetadata(normalizedActorUserId, {
      userId: normalizedActorUserId,
      lastMessageAt: createdAt,
      updatedAt: createdAt
    });
  } catch (error) {
    console.warn('Failed to update sender conversation metadata:', error);
  }

  return {
    conversation: normalizeConversationRecord(conversationIdValue, conversationPayload, normalizedActorUserId),
    message: normalizeConversationMessageRecord(messageRef.id, {
      ...messagePayload,
      sentAt: createdAt
    }, conversationIdValue, normalizedActorUserId)
  };
};

export const markConversationAsRead = async (conversationId = '') => {
  const actorUserId = await ensureAuthenticatedUserId('mark conversation as read');
  const normalizedConversationId = String(conversationId || '').trim();
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (!normalizedConversationId || !isFirebaseConfigured || !db) {
    return false;
  }

  if (normalizedConversationId.startsWith('legacy:')) {
    const legacyPayload = await fetchCurrentUserMessages();
    const legacyConversation = buildLegacyConversationRecords(legacyPayload.messages, normalizedActorUserId).find((entry) => {
      return String(entry?.id || '').trim() === normalizedConversationId;
    }) || null;
    const unreadMessages = asArray(legacyConversation?.legacyMessages).filter((message) => {
      return normalizeMessageMailbox(message?.mailbox) === MESSAGE_MAILBOX_INBOX && !Boolean(message?.isRead);
    });
    if (!unreadMessages.length) {
      return false;
    }
    await Promise.all(unreadMessages.map(message => markMessageAsRead(message.id)));
    return true;
  }

  const conversationRef = getConversationDocRef(normalizedConversationId);
  const conversationSnapshot = await getDoc(conversationRef);
  if (!conversationSnapshot.exists()) {
    return false;
  }

  const conversationData = conversationSnapshot.data() || {};
  const conversationRecord = normalizeConversationRecord(conversationSnapshot.id, conversationData, normalizedActorUserId);
  if (!conversationRecord.participants.includes(normalizedActorUserId)) {
    return false;
  }

  const unreadCountByUser = normalizeConversationNumberMap(conversationData?.unreadCountByUser);
  const clearedUnreadCount = Number.isFinite(Number(unreadCountByUser?.[normalizedActorUserId]))
    ? Math.max(0, Math.floor(Number(unreadCountByUser[normalizedActorUserId])))
    : 0;
  const messageSnapshot = await getDocs(getConversationMessagesCollectionRef(normalizedConversationId));
  const batch = writeBatch(db);
  const updatedAt = new Date().toISOString();
  let shouldCommit = clearedUnreadCount > 0;

  messageSnapshot.forEach((entry) => {
    const record = normalizeConversationMessageRecord(entry.id, entry.data() || {}, normalizedConversationId, normalizedActorUserId);
    if (!record.id || record.isOwnMessage || record.readByUserIds.includes(normalizedActorUserId)) {
      return;
    }
    shouldCommit = true;
    batch.set(getConversationMessageDocRef(normalizedConversationId, record.id), {
      readByUserIds: record.readByUserIds.concat(normalizedActorUserId),
      updatedAt
    }, { merge: true });
  });

  if (shouldCommit) {
    batch.set(conversationRef, {
      unreadCountByUser: {
        ...unreadCountByUser,
        [normalizedActorUserId]: 0
      },
      updatedAt
    }, { merge: true });
    await batch.commit();

    try {
      const currentRootData = await readUserRootData(normalizedActorUserId);
      const existingUnreadCount = Number.isFinite(Number(currentRootData?.messageUnreadCount))
        ? Math.max(0, Math.floor(Number(currentRootData.messageUnreadCount)))
        : 0;
      await mergeUserRootMetadata(normalizedActorUserId, {
        userId: normalizedActorUserId,
        messageUnreadCount: Math.max(0, existingUnreadCount - clearedUnreadCount),
        updatedAt
      });
    } catch (error) {
      console.warn('Failed to update unread metadata after marking a conversation as read:', error);
    }
  }

  if (conversationRecord.directKey) {
    const legacyPayload = await fetchCurrentUserMessages();
    const matchingLegacyMessages = asArray(legacyPayload.messages).filter((message) => {
      const directCounterpart = getLegacyDirectCounterpartForMessage(message, normalizedActorUserId);
      if (!directCounterpart?.uid) {
        return false;
      }
      return buildDirectConversationKey([normalizedActorUserId, directCounterpart.uid]) === conversationRecord.directKey
        && normalizeMessageMailbox(message?.mailbox) === MESSAGE_MAILBOX_INBOX
        && !Boolean(message?.isRead);
    });
    if (matchingLegacyMessages.length) {
      await Promise.all(matchingLegacyMessages.map(message => markMessageAsRead(message.id)));
      return true;
    }
  }

  return shouldCommit;
};

export const sendMessage = async (payload = {}) => {
  const actorUserId = await ensureAuthenticatedUserId('send messages');
  const actorRole = getCurrentUserRoleContext();
  const actorPermissions = getCurrentUserPermissionsContext();
  if (!canSendMessages(actorRole, actorPermissions)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to send messages');
  }

  const resolvedAudienceType = normalizeMessageAudienceType(payload?.audienceType);
  if (!canMessageAudienceType(resolvedAudienceType, actorRole, actorPermissions)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to message that audience');
  }

  const senderProfile = await buildCurrentMessageSenderProfile(actorUserId);
  const recipientSelection = await resolveOutboundMessageRecipients(payload, actorUserId);
  return deliverMessageCopies({
    actorUserId,
    senderProfile,
    recipients: recipientSelection.recipients,
    audienceType: recipientSelection.audienceType,
    audienceRole: recipientSelection.audienceRole,
    audienceClassId: recipientSelection.audienceClassId,
    audienceClassName: recipientSelection.audienceClassName,
    audienceLabel: recipientSelection.audienceLabel,
    subject: payload?.subject,
    body: payload?.body,
    threadId: payload?.threadId,
    parentMessageId: payload?.parentMessageId,
    isReply: false
  });
};

export const replyToMessage = async (messageId = '', payload = {}) => {
  const actorUserId = await ensureAuthenticatedUserId('reply to message');
  const actorRole = getCurrentUserRoleContext();
  const actorPermissions = getCurrentUserPermissionsContext();
  if (!canReplyToMessages(actorRole, actorPermissions)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to reply to messages');
  }

  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) {
    throw new Error('Message id is required');
  }

  const messageSnapshot = await getDoc(getMessageDocRef(actorUserId, normalizedMessageId));
  if (!messageSnapshot.exists()) {
    throw new Error('The selected message could not be found');
  }

  const messageRecord = normalizeMessageRecord(messageSnapshot.id, messageSnapshot.data() || {});
  const directRecipient = messageRecord.mailbox === MESSAGE_MAILBOX_INBOX
    ? normalizeMessageRecipientEntry({
      uid: messageRecord.senderId,
      name: messageRecord.senderName,
      email: messageRecord.senderEmail,
      role: messageRecord.senderRole,
      receivesMessages: true
    })
    : messageRecord.recipientCount === 1
      ? normalizeMessageRecipientEntry({
        uid: messageRecord.recipientUserId,
        name: messageRecord.recipientName,
        email: messageRecord.recipientEmail,
        role: messageRecord.recipientRole,
        receivesMessages: true
      })
      : null;

  if (!directRecipient?.uid || directRecipient.uid === actorUserId) {
    throw new Error('Replies are only available for direct conversations');
  }

  const existingSubject = normalizeMessageSubject(messageRecord.subject || 'Message');
  const replySubject = normalizeMessageSubject(payload?.subject || '') || (
    existingSubject.toLowerCase().startsWith('re:') ? existingSubject : `Re: ${existingSubject}`
  );
  const senderProfile = await buildCurrentMessageSenderProfile(actorUserId);
  return deliverMessageCopies({
    actorUserId,
    senderProfile,
    recipients: [directRecipient],
    audienceType: MESSAGE_AUDIENCE_INDIVIDUAL,
    audienceLabel: directRecipient.displayLabel,
    subject: replySubject,
    body: payload?.body,
    threadId: messageRecord.threadId || messageRecord.id,
    parentMessageId: messageRecord.id,
    isReply: true
  });
};

const setMessageReadState = async (messageId = '', isRead = true) => {
  const actorUserId = await ensureAuthenticatedUserId(isRead ? 'mark message as read' : 'mark message as unread');
  const normalizedMessageId = String(messageId || '').trim();
  const nextReadState = Boolean(isRead);
  if (!normalizedMessageId || !isFirebaseConfigured || !db) {
    return false;
  }

  const messageRef = getMessageDocRef(actorUserId, normalizedMessageId);
  const snapshot = await getDoc(messageRef);
  if (!snapshot.exists()) {
    return false;
  }

  const messageRecord = normalizeMessageRecord(snapshot.id, snapshot.data() || {});
  if (messageRecord.mailbox !== MESSAGE_MAILBOX_INBOX || messageRecord.isRead === nextReadState) {
    return false;
  }

  const updatedAt = new Date().toISOString();
  const currentRootData = await readUserRootData(actorUserId);
  const existingUnreadCount = Number.isFinite(Number(currentRootData?.messageUnreadCount))
    ? Math.max(0, Math.floor(Number(currentRootData.messageUnreadCount)))
    : 0;

  await updateDoc(messageRef, {
    isRead: nextReadState,
    readAt: nextReadState ? serverTimestamp() : null,
    updatedAt
  });

  try {
    await mergeUserRootMetadata(actorUserId, {
      userId: actorUserId,
      messageUnreadCount: Math.max(0, existingUnreadCount + (nextReadState ? -1 : 1)),
      updatedAt
    });
  } catch (error) {
    console.warn('Failed to update unread metadata after changing a message read state:', error);
  }

  return true;
};

export const markMessageAsRead = async (messageId = '') => {
  return setMessageReadState(messageId, true);
};

export const markMessageAsUnread = async (messageId = '') => {
  return setMessageReadState(messageId, false);
};

const ensureDefaultClassDocument = async (userId) => {
  const existingCatalog = await readClassCatalogFromFirestore(userId);
  const activeClasses = existingCatalog.classes || [];
  if (activeClasses.length > 0) {
    return activeClasses[0];
  }

  const createdAt = new Date().toISOString();
  const ownerName = getAuthenticatedUserDisplayName();
  const classDocRef = doc(getClassesCollectionRef(userId));
  const classId = normalizeClassId(classDocRef.id);

  await setDoc(classDocRef, buildClassDocMetadataPatch(userId, classId, createdAt, {
    name: DEFAULT_CLASS_NAME,
    createdAt,
    deleted: false,
    deletedAt: null,
    ownerName,
    ownerRole: getCurrentUserRoleContext()
  }));

  await mergeUserRootMetadata(userId, {
    uid: userId,
    activeClassId: classId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: false,
    updatedAt: createdAt
  });

  return toClassModel(classId, {
    id: classId,
    name: DEFAULT_CLASS_NAME,
    createdAt,
    ownerId: userId,
    ownerName,
    ownerRole: getCurrentUserRoleContext()
  });
};

const ensureClassMigration = async (userId) => {
  if (!isFirebaseConfigured || !db || !userId) {
    return;
  }

  const userSnapshot = await getDoc(getUserRootRef(userId));
  const migrationPayload = userSnapshot.exists() ? (userSnapshot.data() || {}) : {};
  const migrationComplete = migrationPayload.classMigrationComplete === true
    && Number(migrationPayload.classMigrationVersion || 0) >= CLASS_MIGRATION_VERSION;
  if (migrationComplete) {
    return;
  }

  await updateMigrationState(userId, 'running', {
    classMigrationStartedAt: migrationPayload.classMigrationStartedAt || new Date().toISOString(),
    classMigrationError: null
  });

  try {
    let classEntry = await ensureDefaultClassDocument(userId);
    if (!classEntry?.id) {
      throw createContextError(ERROR_CODES.CLASS_NOT_FOUND, 'Failed to resolve class for migration');
    }

    const classOwnerId = normalizeUserId(classEntry.ownerId || '');
    const classId = normalizeClassId(classEntry.id || '');
    if (!classOwnerId || !classId) {
      throw createContextError(ERROR_CODES.INVALID_CLASS_CONTEXT, 'Invalid migration class context');
    }

    const [legacyRawData, modularRawData] = await Promise.all([
      readLegacyRawData(userId),
      readModularRawData(classOwnerId, classId)
    ]);

    const hasLegacyData = hasAnyRawData(legacyRawData);
    const legacyCounts = getRawDataCounts(legacyRawData);
    const classCountsBeforeSync = getRawDataCounts(modularRawData?.data || createDefaultRawData());
    const countsMismatchBeforeSync = !hasMatchingRawDataCounts(legacyCounts, classCountsBeforeSync);

    if (hasLegacyData && countsMismatchBeforeSync) {
      await writeModularData(classOwnerId, classId, legacyRawData);
    }

    const modularAfterSync = await readModularRawData(classOwnerId, classId);
    const classCountsAfterSync = getRawDataCounts(modularAfterSync?.data || createDefaultRawData());

    if (hasLegacyData && !hasMatchingRawDataCounts(legacyCounts, classCountsAfterSync)) {
      throw createContextError(
        ERROR_CODES.MIGRATION_FAILED,
        `Migration verification mismatch (${formatRawDataCounts(legacyCounts)} vs ${formatRawDataCounts(classCountsAfterSync)})`
      );
    }

    const migrationUpdatedAt = new Date().toISOString();
    await setDoc(
      getClassDocRef(classOwnerId, classId),
      buildClassDocMetadataPatch(classOwnerId, classId, migrationUpdatedAt),
      { merge: true }
    );

    await updateMigrationState(userId, 'completed', {
      classMigrationError: null,
      classMigrationCountsLegacy: legacyCounts,
      classMigrationCountsClass: classCountsAfterSync,
      activeClassId: classId,
      updatedAt: migrationUpdatedAt
    });
  } catch (error) {
    await updateMigrationState(userId, 'failed', {
      classMigrationError: String(error?.message || 'Migration failed').slice(0, 500)
    });
    const migrationError = createContextError(ERROR_CODES.MIGRATION_FAILED, 'Class migration failed');
    migrationError.cause = error;
    throw migrationError;
  }
};

const getLegacyStudentsForSelectedClass = (legacyRawData, options = {}) => {
  const normalized = normalizeRawData(legacyRawData);
  const normalizedClassId = normalizeClassId(options?.classId || '');
  const normalizedClassName = normalizeClassName(options?.className || '', '').toLowerCase();
  const classes = Array.isArray(options?.classes) ? options.classes : [];

  if (!normalized.students.length) {
    return [];
  }

  if (classes.length <= 1) {
    return normalized.students;
  }

  return normalized.students.filter((student) => {
    const studentClass = normalizeClassName(student?.class || '', '').toLowerCase();
    const studentClassId = normalizeClassId(student?.class || '');
    if (!studentClass && !studentClassId) {
      return false;
    }

    return (normalizedClassName && studentClass === normalizedClassName)
      || (normalizedClassId && studentClassId === normalizedClassId);
  });
};

const repairLegacyStudentsIntoClassScope = async (ownerId, classId, className, classes = [], modularResult = null) => {
  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedClassId = normalizeClassId(classId);
  const normalizedClassName = normalizeClassName(className || '', '');
  const authenticatedUserId = normalizeUserId(getAuthenticatedUserId() || '');

  if (!normalizedOwnerId || !normalizedClassId) {
    return modularResult;
  }

  if (!canRoleWrite() || !authenticatedUserId || authenticatedUserId !== normalizedOwnerId) {
    return modularResult;
  }

  try {
    const modularData = normalizeRawData(modularResult?.data || createDefaultRawData());
    if (modularData.students.length > 0) {
      return modularResult;
    }

    const legacyRawData = await readLegacyRawData(normalizedOwnerId);
    const legacyStudents = getLegacyStudentsForSelectedClass(legacyRawData, {
      classId: normalizedClassId,
      className: normalizedClassName,
      classes
    });

    if (!legacyStudents.length) {
      return modularResult;
    }

    const existingIds = new Set([
      ...modularData.students.map((student) => String(student?.id || '').trim()),
      ...(Array.isArray(modularResult?.trashStudents)
        ? modularResult.trashStudents.map((student) => String(student?.id || '').trim())
        : [])
    ].filter(Boolean));
    const missingStudents = legacyStudents.filter((student) => {
      const studentId = String(student?.id || '').trim();
      return Boolean(studentId) && !existingIds.has(studentId);
    });

    if (!missingStudents.length) {
      return modularResult;
    }

    const updatedAt = new Date().toISOString();
    const nextOrder = modularData.students.length;

    await Promise.all(missingStudents.map((student, index) => {
      const studentId = String(student?.id || '').trim();
      return setDoc(getStudentDocRef(normalizedOwnerId, studentId, normalizedClassId), {
        id: studentId,
        name: normalizeStudentName(student?.name),
        notes: student?.notes || '',
        class: student?.class || normalizedClassName,
        scores: student?.scores && typeof student.scores === 'object' ? clone(student.scores) : {},
        deleted: false,
        deletedAt: null,
        order: nextOrder + index,
        userId: normalizedOwnerId,
        ownerId: normalizedOwnerId,
        classId: normalizedClassId,
        updatedAt
      }, { merge: false });
    }));

    await setDoc(
      getClassDocRef(normalizedOwnerId, normalizedClassId),
      buildClassDocMetadataPatch(normalizedOwnerId, normalizedClassId, updatedAt),
      { merge: true }
    );

    await mergeUserRootMetadata(normalizedOwnerId, {
      userId: normalizedOwnerId,
      activeClassId: normalizedClassId,
      updatedAt
    });

    return readModularRawData(normalizedOwnerId, normalizedClassId);
  } catch (error) {
    console.warn('Skipping legacy student class repair during fetch data:', error);
    return modularResult;
  }
};

const normalizeClassOwnerMetadata = async (ownerId = '', classId = '', payload = {}, classRef = null) => {
  if (!ownerId || !classId || !classRef || !isFirebaseConfigured || !db) {
    return;
  }

  const authenticatedUserId = getAuthenticatedUserId();
  if (!authenticatedUserId || normalizeUserId(ownerId) !== authenticatedUserId) {
    return;
  }

  const hasOwnerId = normalizeUserId(payload?.ownerId || payload?.userId || '') === ownerId;
  const hasOwnerName = String(payload?.ownerName || '').trim().length > 0;
  const hasOwnerRole = normalizeRole(payload?.ownerRole || payload?.role || '') === normalizeRole(currentUserRoleContext || ROLE_TEACHER);
  if (hasOwnerId && hasOwnerName && hasOwnerRole) {
    return;
  }

  const ownerName = normalizeDisplayName(
    payload?.ownerName || payload?.userName || payload?.teacherName || getAuthenticatedUserDisplayName() || currentClassOwnerName || 'Teacher',
    'Teacher'
  );
  await setDoc(classRef, {
    id: classId,
    ownerId,
    ownerName,
    ownerRole: normalizeRole(currentUserRoleContext || ROLE_TEACHER),
    userId: ownerId
  }, { merge: true });
};

const readClassCatalogFromFirestore = async (userId) => {
  const classesSnapshot = await getDocs(getClassesCollectionRef(userId));
  const classes = [];
  const trashClasses = [];
  const metadataPatchTasks = [];
  const authenticatedUserId = getAuthenticatedUserId();
  const currentUserRole = getCurrentUserRoleContext();

  classesSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    const classId = normalizeClassId(entry.id);
    if (!classId) return;
    metadataPatchTasks.push(normalizeClassOwnerMetadata(userId, classId, payload, entry.ref));
    const ownerId = normalizeUserId(payload.ownerId || payload.userId || userId);
    const ownerName = normalizeDisplayName(
      payload.ownerName || (ownerId === getAuthenticatedUserId() ? getAuthenticatedUserDisplayName() : '') || 'Teacher',
      'Teacher'
    );
    const ownerRole = normalizeRole(
      payload.ownerRole
      || payload.userRole
      || (ownerId === authenticatedUserId ? currentUserRole : payload.role)
      || ROLE_TEACHER
    );
    const normalizedPayload = {
      ...payload,
      ownerId,
      ownerName,
      ownerRole,
      userId: ownerId
    };

    if (isDeletedClassPayload(normalizedPayload)) {
      trashClasses.push(toClassTrashEntry(entry.id, normalizedPayload));
      return;
    }
    classes.push(toClassModel(entry.id, normalizedPayload));
  });

  if (metadataPatchTasks.length) {
    await Promise.allSettled(metadataPatchTasks);
  }

  return {
    classes: sortClasses(classes.filter(entry => entry.id)),
    trashClasses: sortClassTrashEntries(trashClasses.filter(entry => entry.id))
  };
};

const readGlobalClassCatalogFromFirestore = async (requesterUserId = '') => {
  const now = Date.now();
  if (
    globalClassCatalogCache.ownerUserId === requesterUserId
    && (now - Number(globalClassCatalogCache.loadedAt || 0)) < GLOBAL_CLASS_CACHE_TTL_MS
    && Array.isArray(globalClassCatalogCache.classes)
  ) {
    return {
      classes: sortClasses(globalClassCatalogCache.classes),
      trashClasses: []
    };
  }

  const classesSnapshot = await getDocs(collectionGroup(db, CLASSES_SUBCOLLECTION));
  let ownerNameMap = new Map();
  let ownerRoleMap = new Map();
  let deletedUserIds = new Set();
  try {
    const privilegedDirectory = await readPrivilegedUserLifecycleDirectory();
    ownerNameMap = privilegedDirectory.ownerNameMap || new Map();
    ownerRoleMap = privilegedDirectory.ownerRoleMap || new Map();
    deletedUserIds = privilegedDirectory.deletedUserIds || new Set();
  } catch (error) {
    console.warn('Falling back to class metadata only for global class catalog:', error);
  }

  const classes = [];
  const metadataPatchTasks = [];
  classesSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (isDeletedClassPayload(payload)) return;

    const classId = normalizeClassId(entry.id);
    const ownerId = normalizeUserId(payload.ownerId || payload.userId || getOwnerIdFromClassRefPath(entry.ref?.path));
    if (!classId || !ownerId || deletedUserIds.has(ownerId)) return;

    const ownerName = normalizeDisplayName(payload.ownerName || ownerNameMap.get(ownerId) || 'Teacher', 'Teacher');
    const ownerRole = normalizeRole(payload.ownerRole || ownerRoleMap.get(ownerId) || payload.role || ROLE_TEACHER);
    const normalizedClass = toClassModel(classId, {
      ...payload,
      ownerId,
      ownerName,
      ownerRole
    });
    classes.push(normalizedClass);
    metadataPatchTasks.push(normalizeClassOwnerMetadata(ownerId, classId, payload, entry.ref));
  });

  if (metadataPatchTasks.length) {
    await Promise.allSettled(metadataPatchTasks);
  }

  const dedupedByOwnerAndClass = new Map();
  classes.forEach((entry) => {
    const key = `${normalizeUserId(entry.ownerId)}::${normalizeClassId(entry.id)}`;
    if (!key) return;
    dedupedByOwnerAndClass.set(key, entry);
  });

  const normalizedClasses = sortClasses(Array.from(dedupedByOwnerAndClass.values()))
    .filter((entry) => {
      const ownerId = normalizeUserId(entry?.ownerId || '');
      const className = normalizeClassName(entry?.name || '', '');
      return Boolean(ownerId && className);
    });

  console.log('Classes loaded:', normalizedClasses.length);
  globalClassCatalogCache = {
    ownerUserId: requesterUserId,
    classes: normalizedClasses,
    trashClasses: [],
    loadedAt: now
  };

  return {
    classes: normalizedClasses,
    trashClasses: []
  };
};

const ensureClassCatalog = async (userId) => {
  const role = getCurrentUserRoleContext();
  const authUserId = getAuthenticatedUserId() || userId;
  const useGlobalCatalog = canReadAllData(role, currentUserPermissionsContext);
  const scopeKey = useGlobalCatalog ? `${authUserId}:admin-global` : authUserId;
  let allowEmptyClassCatalog = false;

  if (!useGlobalCatalog) {
    const userRootData = await readUserRootData(authUserId);
    allowEmptyClassCatalog = userRootData?.[ALLOW_EMPTY_CLASS_CATALOG_FIELD] === true;
    if (!allowEmptyClassCatalog) {
      await ensureClassMigration(authUserId);
      await ensureDefaultClassDocument(authUserId);
    }
  }

  const catalog = useGlobalCatalog
    ? await readGlobalClassCatalogFromFirestore(authUserId)
    : await readClassCatalogFromFirestore(authUserId);
  writeClassCatalogCache(scopeKey, catalog.classes, catalog.trashClasses);
  return {
    ...catalog,
    allowEmptyClassCatalog
  };
};

const ensureActiveClassContext = async (userId, options = {}) => {
  const requireClass = options?.requireClass !== false;
  const role = getCurrentUserRoleContext();
  const authUserId = getAuthenticatedUserId() || userId;
  const useGlobalCatalog = canReadAllData(role, currentUserPermissionsContext);
  const scopeKey = useGlobalCatalog ? `${authUserId}:admin-global` : authUserId;
  if (!isFirebaseConfigured || !db) {
    const classes = readClassCatalogCache(scopeKey);
    const trashClasses = readClassTrashCache(scopeKey);
    const allowEmptyClassCatalog = inferAllowEmptyClassCatalog(classes, trashClasses);
    const { classId, className } = resolveActiveClassModel(authUserId, classes);
    const persistedSelection = readPersistedClassSelection(authUserId);
    const activeClass = findClassEntryBySelection(classes, classId, currentClassOwnerId || persistedSelection.ownerId || '') || null;
    const classOwnerId = normalizeUserId(activeClass?.ownerId || '');
    const classOwnerName = normalizeDisplayName(activeClass?.ownerName || '', 'Teacher');
    const classOwnerRole = normalizeRole(activeClass?.ownerRole || ROLE_TEACHER);
    setCurrentClassContext(classId, authUserId, classOwnerId, classOwnerName, classOwnerRole);
    if (requireClass && !classId) {
      throw createMissingClassError('save class data');
    }

    console.log('Classes:', classes.length);
    console.log('Selected class:', classId || '(none)');
    console.log('Owner ID:', classOwnerId || '(none)');
    console.log('Current Class ID:', classId || '(none)');
    console.log('User ID:', classOwnerId || '(none)');
    return {
      classes,
      trashClasses,
      classId,
      className,
      classOwnerId,
      classOwnerName,
      classOwnerRole,
      allowEmptyClassCatalog
    };
  }

  const catalog = await ensureClassCatalog(authUserId);
  const classes = catalog.classes || [];
  const trashClasses = catalog.trashClasses || [];
  const { classId, className } = resolveActiveClassModel(authUserId, classes);
  const persistedSelection = readPersistedClassSelection(authUserId);
  const activeClass = findClassEntryBySelection(
    classes,
    classId,
    currentClassOwnerId || persistedSelection.ownerId || ''
  ) || null;
  const classOwnerId = normalizeUserId(activeClass?.ownerId || '');
  const classOwnerName = normalizeDisplayName(activeClass?.ownerName || '', 'Teacher');
  const classOwnerRole = normalizeRole(activeClass?.ownerRole || ROLE_TEACHER);
  setCurrentClassContext(classId, authUserId, classOwnerId, classOwnerName, classOwnerRole);
  if (requireClass && !classId) {
    throw createMissingClassError('save class data');
  }

  console.log('Classes:', classes.length);
  console.log('Selected class:', classId || '(none)');
  console.log('Owner ID:', classOwnerId || '(none)');
  console.log('Current Class ID:', classId || '(none)');
  console.log('User ID:', classOwnerId || '(none)');
  return {
    classes,
    trashClasses,
    classId,
    className,
    classOwnerId,
    classOwnerName,
    classOwnerRole,
    allowEmptyClassCatalog: Boolean(catalog?.allowEmptyClassCatalog)
  };
};

const mapStudentsToDocs = (students, ownerId, classId, updatedAt) => {
  return asArray(students).map((student, index) => {
    const id = String(student?.id || '').trim() || toCollectionDocId('student', student?.name || 'student', index);
    return {
      id,
      data: {
        id,
        name: normalizeStudentName(student?.name),
        notes: student?.notes || '',
        class: student?.class || '',
        scores: student?.scores && typeof student.scores === 'object' ? clone(student.scores) : {},
        deleted: false,
        deletedAt: null,
        order: index,
        userId: ownerId,
        ownerId,
        classId,
        updatedAt
      }
    };
  });
};

const mapSubjectsToDocs = (subjects, ownerId, classId, updatedAt) => {
  return asArray(subjects)
    .map((subject, index) => {
      const normalizedSubject = normalizeSubjectRecord(subject, index);
      if (!normalizedSubject) {
        return null;
      }
      return {
        id: normalizedSubject.id,
        data: {
          id: normalizedSubject.id,
          name: normalizedSubject.name,
          deleted: false,
          deletedAt: null,
          order: index,
          userId: ownerId,
          ownerId,
          classId,
          updatedAt
        }
      };
    })
    .filter(Boolean);
};

const mapExamsToDocs = (exams, ownerId, classId, updatedAt) => {
  return asArray(exams)
    .map((exam, index) => {
      const normalizedExam = normalizeExamRecord(exam, index);
      if (!normalizedExam) {
        return null;
      }
      return {
        id: normalizedExam.id,
        data: {
          ...(normalizedExam.date ? { date: normalizedExam.date } : {}),
          id: normalizedExam.id,
          title: normalizedExam.title,
          name: normalizedExam.title,
          deleted: false,
          deletedAt: null,
          order: index,
          userId: ownerId,
          ownerId,
          classId,
          updatedAt
        }
      };
    })
    .filter(Boolean);
};

const syncCollectionDocuments = async (collectionRef, targetDocs, options = {}) => {
  const preserveDeleted = options?.preserveDeleted === true;
  const existingSnapshot = await getDocs(collectionRef);
  const targetMap = new Map((targetDocs || []).map((entry) => [entry.id, entry.data]));
  const operations = [];

  existingSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (!targetMap.has(entry.id)) {
      if (preserveDeleted && payload.deleted === true) {
        return;
      }
      operations.push(deleteDoc(entry.ref));
    }
  });

  targetMap.forEach((data, id) => {
    operations.push(setDoc(doc(collectionRef, id), data, { merge: false }));
  });

  await Promise.all(operations);
};

const writeModularData = async (ownerId, classId, rawData) => {
  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedOwnerId) {
    throw createContextError(ERROR_CODES.MISSING_OWNER_ID, 'Owner id is required to write class data');
  }
  if (!normalizedClassId) {
    throw createContextError(ERROR_CODES.MISSING_CLASS_ID, 'Class id is required to write class data');
  }

  const normalized = normalizeRawData(rawData);
  const updatedAt = new Date().toISOString();

  const studentDocs = mapStudentsToDocs(normalized.students, normalizedOwnerId, normalizedClassId, updatedAt);
  const subjectDocs = mapSubjectsToDocs(normalized.subjects, normalizedOwnerId, normalizedClassId, updatedAt);
  const examDocs = mapExamsToDocs(normalized.exams, normalizedOwnerId, normalizedClassId, updatedAt);

  await Promise.all([
    syncCollectionDocuments(getStudentsCollectionRef(normalizedOwnerId, normalizedClassId), studentDocs, { preserveDeleted: true }),
    syncCollectionDocuments(getSubjectsCollectionRef(normalizedOwnerId, normalizedClassId), subjectDocs, { preserveDeleted: true }),
    syncCollectionDocuments(getExamsCollectionRef(normalizedOwnerId, normalizedClassId), examDocs, { preserveDeleted: true })
  ]);

  await setDoc(
    getClassDocRef(normalizedOwnerId, normalizedClassId),
    buildClassDocMetadataPatch(normalizedOwnerId, normalizedClassId, updatedAt),
    { merge: true }
  );

  await mergeUserRootMetadata(normalizedOwnerId, {
    userId: normalizedOwnerId,
    updatedAt,
    activeClassId: normalizedClassId
  });

  return normalized;
};

const readRawDataFromCollectionRefs = async (studentsRef, subjectsRef, examsRef, expectedOwnerId = '', expectedClassId = '') => {
  const scopedOwnerId = normalizeUserId(expectedOwnerId);
  const scopedClassId = normalizeClassId(expectedClassId);
  const [studentsSnapshot, subjectsSnapshot, examsSnapshot] = await Promise.all([
    getDocs(studentsRef),
    getDocs(subjectsRef),
    getDocs(examsRef)
  ]);

  const students = [];
  const trashStudents = [];
  const trashSubjects = [];
  const trashExams = [];

  const assertScopedPayload = (payload = {}, fallbackId = '') => {
    if (!scopedClassId || !scopedOwnerId) {
      throw createContextError(ERROR_CODES.INVALID_CLASS_CONTEXT, 'Invalid class scope');
    }

    const payloadClassId = normalizeClassId(payload.classId || fallbackId || '');
    if (payloadClassId && payloadClassId !== scopedClassId) {
      throw createContextError(ERROR_CODES.INVALID_CLASS_CONTEXT, 'Child document classId mismatch detected');
    }

    const payloadOwnerId = normalizeUserId(payload.ownerId || payload.userId || '');
    if (payloadOwnerId && payloadOwnerId !== scopedOwnerId) {
      throw createContextError(ERROR_CODES.INVALID_OWNER, 'Child document ownerId mismatch detected');
    }
  };

  studentsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    assertScopedPayload(payload, scopedClassId);
    const deletedAtIso = normalizeDeletedAtValue(payload.deletedAt);
    if (payload.deleted === true) {
      trashStudents.push({
        id: String(payload.id || entry.id || '').trim(),
        name: normalizeStudentName(payload.name, 'Student'),
        deletedAt: deletedAtIso
      });
      return;
    }
    students.push({
      id: String(payload.id || entry.id || '').trim(),
      name: normalizeStudentName(payload.name),
      notes: payload.notes || '',
      class: payload.class || '',
      scores: payload.scores && typeof payload.scores === 'object' ? clone(payload.scores) : {},
      order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : Number.MAX_SAFE_INTEGER
    });
  });
  students.sort((a, b) => a.order - b.order);

  const subjects = [];
  subjectsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    assertScopedPayload(payload, scopedClassId);
    const deletedAtIso = normalizeDeletedAtValue(payload.deletedAt);
    if (payload.deleted === true) {
      trashSubjects.push({
        id: String(payload.id || entry.id || '').trim(),
        name: String(payload.name || '').trim() || 'Subject',
        deletedAt: deletedAtIso
      });
      return;
    }
    subjects.push({
      id: String(payload.id || entry.id || '').trim(),
      name: String(payload.name || '').trim(),
      order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : Number.MAX_SAFE_INTEGER
    });
  });
  subjects.sort((a, b) => a.order - b.order);

  const exams = [];
  examsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    assertScopedPayload(payload, scopedClassId);
    const deletedAtIso = normalizeDeletedAtValue(payload.deletedAt);
    if (payload.deleted === true) {
      trashExams.push({
        id: String(payload.id || entry.id || '').trim(),
        name: String(payload.title || payload.name || '').trim() || 'Exam',
        deletedAt: deletedAtIso
      });
      return;
    }
    const normalizedDate = toIsoDateString(payload.date) || String(payload.date || '').trim();
    exams.push({
      ...(normalizedDate ? { date: normalizedDate } : {}),
      id: String(payload.id || entry.id || '').trim(),
      title: String(payload.title || payload.name || '').trim(),
      order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : Number.MAX_SAFE_INTEGER
    });
  });
  exams.sort((a, b) => a.order - b.order);

  const data = normalizeRawData({
    students: students.map(({ id, name, notes, class: className, scores }) => ({ id, name, notes, class: className, scores })),
    subjects: subjects.map(({ id, name }) => ({ id, name })),
    exams: exams.map(({ id, title, date }) => ({ ...(date ? { date } : {}), id, title, name: title }))
  });

  return {
    data,
    hasData: hasAnyRawData(data),
    trashStudents: trashStudents
      .filter(entry => entry.id)
      .sort((a, b) => {
        const aTime = new Date(a.deletedAt || 0).getTime() || 0;
        const bTime = new Date(b.deletedAt || 0).getTime() || 0;
        return bTime - aTime;
      }),
    trashSubjects: trashSubjects
      .filter(entry => entry.id)
      .sort((a, b) => {
        const aTime = new Date(a.deletedAt || 0).getTime() || 0;
        const bTime = new Date(b.deletedAt || 0).getTime() || 0;
        return bTime - aTime;
      }),
    trashExams: trashExams
      .filter(entry => entry.id)
      .sort((a, b) => {
        const aTime = new Date(a.deletedAt || 0).getTime() || 0;
        const bTime = new Date(b.deletedAt || 0).getTime() || 0;
        return bTime - aTime;
      })
  };
};

const readModularRawData = async (ownerId, classId) => {
  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedOwnerId || !normalizedClassId || !isFirebaseConfigured || !db) {
    return {
      data: createDefaultRawData(),
      hasData: false,
      trashStudents: [],
      trashSubjects: [],
      trashExams: []
    };
  }

  return readRawDataFromCollectionRefs(
    getStudentsCollectionRef(normalizedOwnerId, normalizedClassId),
    getSubjectsCollectionRef(normalizedOwnerId, normalizedClassId),
    getExamsCollectionRef(normalizedOwnerId, normalizedClassId),
    normalizedOwnerId,
    normalizedClassId
  );
};

const getActivityLogTimestampIso = (payload = {}) => {
  return toIsoDateString(payload.timestamp)
    || toIsoDateString(payload.createdAt)
    || toIsoDateString(payload.time)
    || toIsoDateString(payload.date)
    || null;
};

const getActivityLogRetentionCutoff = (days = ACTIVITY_LOG_RETENTION_DAYS) => {
  return Date.now() - (Math.max(Number(days) || ACTIVITY_LOG_RETENTION_DAYS, 1) * 24 * 60 * 60 * 1000);
};

const buildActivityLogRow = (entry) => {
  const normalizeLogScalar = (value, fallback = '') => {
    if (value === null || value === undefined) {
      return fallback;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const normalized = String(value).trim();
      if (!normalized || normalized === '[object Object]' || normalized === 'NaN' || normalized === 'Infinity') {
        return fallback;
      }
      return normalized;
    }

    if (typeof value?.toDate === 'function') {
      return toIsoDateString(value) || fallback;
    }

    if (typeof value === 'object') {
      const candidate = value.id
        ?? value.uid
        ?? value.name
        ?? value.title
        ?? value.label
        ?? value.email
        ?? '';
      return normalizeLogScalar(candidate, fallback);
    }

    return fallback;
  };

  const payload = entry?.data() || {};
  const timestampIso = getActivityLogTimestampIso(payload);
  const normalizedAction = normalizeLogScalar(payload.action || payload.event || payload.type || '').toLowerCase();
  const normalizedStudentId = normalizeLogScalar(payload.studentId || payload.targetId || payload.target?.id || '');
  const explicitTargetType = normalizeLogScalar(payload.targetType || payload.entity || payload.target?.type || '', '').toLowerCase();
  const normalizedTargetType = explicitTargetType || (normalizedStudentId || normalizedAction.includes('student') ? 'student' : 'record');
  const normalizedRawStudentName = normalizeStudentName(payload.studentName || payload.targetLabel || payload.target?.label || payload.target?.name || payload.targetName || '');
  const normalizedStudentName = normalizedRawStudentName && normalizedRawStudentName !== normalizedStudentId
    ? normalizedRawStudentName
    : '';
  const normalizedTargetLabel = normalizedTargetType === 'student'
    ? normalizedStudentName
    : normalizeLogScalar(payload.targetLabel || payload.target?.label || payload.target?.name || payload.targetName || '');
  const normalizedTargetId = normalizedTargetType === 'student'
    ? normalizedStudentId
    : normalizeLogScalar(payload.targetId || payload.target?.id || payload.target || '');

  return {
    id: String(entry?.id || '').trim(),
    userId: normalizeLogScalar(payload.userId || payload.actorId || payload.uid || ''),
    userEmail: normalizeLogScalar(payload.userEmail || payload.email || '').toLowerCase(),
    userRole: normalizeRole(payload.userRole || payload.role || 'teacher'),
    action: normalizedAction,
    studentId: normalizedStudentId,
    studentName: normalizedStudentName,
    targetLabel: normalizedTargetLabel,
    targetId: normalizedTargetId,
    targetType: normalizedTargetType,
    dataOwnerUserId: normalizeLogScalar(payload.dataOwnerUserId || payload.ownerId || payload.dataOwnerId || ''),
    classId: normalizeLogScalar(payload.classId || payload.class?.id || ''),
    className: normalizeLogScalar(payload.className || payload.class?.name || ''),
    ownerId: normalizeLogScalar(payload.ownerId || payload.dataOwnerUserId || payload.classOwnerId || payload.owner?.id || ''),
    ownerName: normalizeLogScalar(payload.ownerName || payload.classOwnerName || payload.owner?.name || ''),
    logVersion: Number(payload.logVersion || 1),
    timestamp: timestampIso,
    timestampLabel: timestampIso || ''
  };
};

const sortActivityLogsByTimeDesc = (entries = []) => {
  return [...entries].sort((a, b) => {
    const aTime = new Date(a?.timestamp || 0).getTime() || 0;
    const bTime = new Date(b?.timestamp || 0).getTime() || 0;
    return bTime - aTime;
  });
};

const trimActivityLogCollection = async (days = ACTIVITY_LOG_RETENTION_DAYS, maxEntries = MAX_ACTIVITY_LOGS) => {
  if (!isFirebaseConfigured || !db) {
    return {
      expired: 0,
      overflow: 0,
      total: 0
    };
  }

  const logsSnapshot = await getDocs(query(
    collection(db, ACTIVITY_LOGS_COLLECTION),
    orderBy('timestamp', 'desc')
  ));
  const cutoff = getActivityLogRetentionCutoff(days);
  const normalizedMaxEntries = Math.max(Number(maxEntries) || MAX_ACTIVITY_LOGS, 1);
  const expiredEntries = [];
  const retainedEntries = [];

  logsSnapshot.docs.forEach((entry) => {
    const payload = entry.data() || {};
    const timestampMs = new Date(getActivityLogTimestampIso(payload) || 0).getTime();
    if (Number.isFinite(timestampMs) && timestampMs > 0 && timestampMs < cutoff) {
      expiredEntries.push(entry);
      return;
    }
    retainedEntries.push(entry);
  });

  const overflowEntries = retainedEntries.slice(normalizedMaxEntries);
  if (!expiredEntries.length && !overflowEntries.length) {
    return {
      expired: 0,
      overflow: 0,
      total: 0
    };
  }

  await Promise.all([...expiredEntries, ...overflowEntries].map((entry) => deleteDoc(entry.ref)));
  return {
    expired: expiredEntries.length,
    overflow: overflowEntries.length,
    total: expiredEntries.length + overflowEntries.length
  };
};

export const logActivity = async (action, targetId, targetType, options = {}) => {
  try {
    if (!isFirebaseConfigured || !db) {
      return false;
    }

    const actorUserId = getAuthenticatedUserId();
    if (!actorUserId) {
      return false;
    }

    const normalizedAction = String(action || '').trim().toLowerCase();
    const normalizedTargetType = String(targetType || '').trim().toLowerCase();
    if (!normalizedAction || !normalizedTargetType) {
      return false;
    }

    const normalizedTargetId = String(targetId || '').trim();
    const normalizedTargetLabel = normalizedTargetType === 'student'
      ? normalizeStudentName(options?.studentName || options?.targetLabel || options?.targetName || '')
      : String(options?.targetLabel || options?.targetName || '').trim();
    const normalizedStudentId = normalizedTargetType === 'student' ? normalizedTargetId : '';
    const normalizedStudentName = normalizedTargetType === 'student' ? normalizedTargetLabel : '';

    const classId = normalizeClassId(options?.classId || currentClassId || '');
    const ownerId = normalizeUserId(options?.ownerId || currentClassOwnerId || '');
    const className = normalizeClassName(options?.className || '', '');
    const ownerName = normalizeDisplayName(options?.ownerName || currentClassOwnerName || 'Teacher', 'Teacher');
    const userRole = normalizeRole(options?.userRole || getCurrentUserRoleContext());

    await addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), {
      userId: actorUserId,
      userEmail: String(auth?.currentUser?.email || '').trim().toLowerCase(),
      userRole,
      action: normalizedAction,
      targetId: normalizedTargetId,
      targetLabel: normalizedTargetLabel,
      targetType: normalizedTargetType,
      studentId: normalizedStudentId,
      studentName: normalizedStudentName,
      dataOwnerUserId: String(options?.dataOwnerUserId || ownerId || '').trim(),
      classId,
      className,
      ownerId,
      ownerName,
      logVersion: 2,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    if (canReadActivityLogs(userRole, currentUserPermissionsContext)) {
      try {
        await trimActivityLogCollection();
      } catch (error) {
        console.warn('Failed to trim activity logs:', error);
      }
    }

    return true;
  } catch (error) {
    console.warn('Failed to write activity log entry:', error);
    return false;
  }
};

export const fetchActivityLogs = async ({ userId = '', sort = 'desc', maxEntries = MAX_ACTIVITY_LOGS } = {}) => {
  await ensureAuthenticatedUserId('read activity logs');
  if (!canReadActivityLogs(getCurrentUserRoleContext(), currentUserPermissionsContext)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to read activity logs');
  }
  if (!isFirebaseConfigured || !db) {
    return [];
  }

  try {
    await trimActivityLogCollection();
  } catch (error) {
    console.warn('Failed to trim activity logs during privileged read:', error);
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedSort = String(sort || '').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
  const normalizedLimit = Math.max(10, Math.min(Number(maxEntries) || MAX_ACTIVITY_LOGS, ACTIVITY_LOG_FETCH_LIMIT));

  const logsQuery = query(
    collection(db, ACTIVITY_LOGS_COLLECTION),
    orderBy('timestamp', 'desc'),
    limit(normalizedLimit)
  );
  const logsSnapshot = await getDocs(logsQuery);

  let logs = [];
  logsSnapshot.forEach((entry) => {
    logs.push(buildActivityLogRow(entry));
  });

  logs = sortActivityLogsByTimeDesc(logs);

  if (normalizedUserId) {
    logs = logs.filter((entry) => {
      return entry.userId === normalizedUserId || entry.dataOwnerUserId === normalizedUserId;
    });
  }

  if (normalizedSort === 'asc') {
    logs.reverse();
  }

  return logs;
};

export const readCachedData = (classId = '') => {
  const userId = getCurrentUserId();
  if (!userId || typeof localStorage === 'undefined') {
    return null;
  }

  const persistedSelection = readPersistedClassSelection(userId);
  const scopedClassId = normalizeClassId(classId) || getCurrentClassContext() || normalizeClassId(persistedSelection.classId || '');
  const cached = safeParseCache(localStorage.getItem(getCacheKeyForUser(userId, scopedClassId)));
  if (cached?.data) {
    console.log('Loaded from cache');
  }
  if (!cached) {
    return null;
  }
  return {
    ...cached,
    classId: scopedClassId
  };
};

export const writeCacheCopy = (rawData, classId = '') => {
  const userId = getCurrentUserId();
  if (!userId || typeof localStorage === 'undefined') {
    return null;
  }

  const persistedSelection = readPersistedClassSelection(userId);
  const scopedClassId = normalizeClassId(classId) || getCurrentClassContext() || normalizeClassId(persistedSelection.classId || '');
  const cacheEnvelope = withTimestamp(rawData);
  localStorage.setItem(getCacheKeyForUser(userId, scopedClassId), JSON.stringify(cacheEnvelope));
  const currentScopeKey = getFetchScopeKey(getAuthenticatedUserId() || userId);
  if (
    recentFetchAllDataCache.payload
    && recentFetchAllDataCache.scopeKey === currentScopeKey
    && recentFetchAllDataCache.classId === scopedClassId
  ) {
    recentFetchAllDataCache = {
      ...recentFetchAllDataCache,
      ownerId: normalizeUserId(currentClassOwnerId || recentFetchAllDataCache.ownerId || ''),
      payload: {
        ...recentFetchAllDataCache.payload,
        data: normalizeRawData(rawData)
      },
      loadedAt: Date.now()
    };
  } else {
    invalidateRecentFetchAllDataCache();
  }
  return {
    ...cacheEnvelope,
    classId: scopedClassId
  };
};

export const fetchRoleScopedStudentCount = async (role = '') => {
  const normalizedRole = normalizeRole(role || getCurrentUserRoleContext());
  const getCachedCount = (classId = '') => {
    const cached = readCachedData(classId);
    return Array.isArray(cached?.data?.students) ? cached.data.students.length : 0;
  };

  try {
    const classScope = await ensureValidClassContext('read dashboard student count', { requireClass: false });
    const ownerId = normalizeUserId(classScope?.ownerId || '');
    const classId = normalizeClassId(classScope?.classId || '');

    if (!ownerId || !classId || !isFirebaseConfigured || !db) {
      return getCachedCount(classId);
    }

    const snapshot = await getDocs(getStudentsCollectionRef(ownerId, classId));
    let totalStudents = 0;
    snapshot.forEach((entry) => {
      const payload = entry.data() || {};
      if (payload.deleted === true) {
        return;
      }
      const payloadOwnerId = normalizeUserId(payload.ownerId || payload.userId || ownerId);
      const payloadClassId = normalizeClassId(payload.classId || classId);
      if (payloadOwnerId !== ownerId || payloadClassId !== classId) {
        return;
      }
      totalStudents += 1;
    });

    return totalStudents;
  } catch (error) {
    console.warn(`Failed to fetch ${normalizedRole} dashboard student count:`, error);
    return getCachedCount(getCurrentClassContext());
  }
};

export const fetchAllData = async () => {
  let userId = '';
  let authUserId = '';
  const role = getCurrentUserRoleContext();
  const getScopeKey = () => {
    const scopedAuthId = authUserId || getAuthenticatedUserId() || userId;
    return canReadAllData(role, currentUserPermissionsContext) ? `${scopedAuthId}:admin-global` : scopedAuthId;
  };
  try {
    userId = await ensureActiveUserId('fetch data');
    authUserId = getAuthenticatedUserId() || userId;
    console.log('Auth UID:', getAuthenticatedUserId() || '(none)');
    console.log('Role:', getCurrentUserRoleContext());
    console.log('Active UID:', userId || '(none)');
  } catch (error) {
    return {
      data: createDefaultRawData(),
      trashStudents: [],
      trashSubjects: [],
      trashExams: [],
      trashClasses: [],
      classes: [],
      currentClassId: '',
      currentClassName: DEFAULT_CLASS_NAME,
      source: 'default',
      offline: false,
      error,
      errorType: 'unauthenticated',
      allowEmptyClassCatalog: false
    };
  }

  const cacheScopeKey = getScopeKey();
  const persistedSelection = readPersistedClassSelection(authUserId || userId);
  const requestedClassId = normalizeClassId(currentClassId || persistedSelection.classId || '');
  const requestedOwnerId = normalizeUserId(currentClassOwnerId || persistedSelection.ownerId || '');
  const recentFetch = readRecentFetchAllDataCache({
    scopeKey: cacheScopeKey,
    classId: requestedClassId,
    ownerId: requestedOwnerId
  });
  if (recentFetch) {
    console.log('Using in-memory data cache for scope:', cacheScopeKey);
    return recentFetch;
  }

  if (!isFirebaseConfigured || !db) {
    console.warn('Firebase unavailable. Falling back to cache/default data.');
    const cachedClasses = readClassCatalogCache(cacheScopeKey);
    const cachedTrashClasses = readClassTrashCache(cacheScopeKey);
    const allowEmptyClassCatalog = inferAllowEmptyClassCatalog(cachedClasses, cachedTrashClasses);
    const { classId, className } = resolveActiveClassModel(authUserId || userId, cachedClasses);
    const cached = readCachedData(classId);
    if (cached?.data) {
      const result = {
        data: cached.data,
        trashStudents: [],
        trashSubjects: [],
        trashExams: [],
        trashClasses: cachedTrashClasses,
        classes: cachedClasses,
        currentClassId: classId,
        currentClassName: className,
        source: 'cache',
        offline: false,
        error: null,
        errorType: 'config',
        allowEmptyClassCatalog
      };
      return writeRecentFetchAllDataCache({ scopeKey: cacheScopeKey, classId, ownerId: requestedOwnerId, payload: result });
    }

    const fallback = createDefaultRawData();
    writeCacheCopy(fallback, classId);
    const result = {
      data: fallback,
      trashStudents: [],
      trashSubjects: [],
      trashExams: [],
      trashClasses: cachedTrashClasses,
      classes: cachedClasses,
      currentClassId: classId,
      currentClassName: className,
      source: 'default',
      offline: false,
      error: null,
      errorType: 'config',
      allowEmptyClassCatalog
    };
    return writeRecentFetchAllDataCache({ scopeKey: cacheScopeKey, classId, ownerId: requestedOwnerId, payload: result });
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      let classScope = await ensureActiveClassContext(userId, { requireClass: false });
      let scopedClasses = classScope.classes || [];
      let scopedTrashClasses = classScope.trashClasses || [];
      let scopedClassId = classScope.classId;
      let scopedClassName = classScope.className;
      let scopedOwnerId = normalizeUserId(classScope.classOwnerId || '');
      const cacheScopeKey = getScopeKey();

      const cleanupResult = await runAutomatedTrashCleanup(authUserId, role, scopedClasses, scopedTrashClasses);
      if (cleanupResult.total > 0) {
        classScope = await ensureActiveClassContext(userId, { requireClass: false });
        scopedClasses = classScope.classes || [];
        scopedTrashClasses = classScope.trashClasses || [];
        scopedClassId = classScope.classId;
        scopedClassName = classScope.className;
        scopedOwnerId = normalizeUserId(classScope.classOwnerId || '');
      }

      if (!scopedClassId) {
        const result = {
          data: createDefaultRawData(),
          trashStudents: [],
          trashSubjects: [],
          trashExams: [],
          trashClasses: scopedTrashClasses,
          classes: scopedClasses,
          currentClassId: '',
          currentClassName: scopedClassName,
          source: 'firebase',
          offline: false,
          error: null,
          errorType: null,
          allowEmptyClassCatalog: Boolean(classScope?.allowEmptyClassCatalog)
        };
        return writeRecentFetchAllDataCache({ scopeKey: cacheScopeKey, classId: '', ownerId: '', payload: result });
      }

      if (!scopedOwnerId) {
        throw createContextError(ERROR_CODES.MISSING_OWNER_ID, 'Missing class owner context for fetch data');
      }

      let modularResult = await readModularRawData(scopedOwnerId, scopedClassId);
      modularResult = await repairLegacyStudentsIntoClassScope(
        scopedOwnerId,
        scopedClassId,
        scopedClassName,
        scopedClasses,
        modularResult
      );
      writeClassCatalogCache(cacheScopeKey, scopedClasses, scopedTrashClasses);

      const nextData = modularResult?.data || createDefaultRawData();
      writeCacheCopy(nextData, scopedClassId);
      console.log('Synced from Firebase (modular)');
      const result = {
        data: nextData,
        trashStudents: Array.isArray(modularResult?.trashStudents) ? modularResult.trashStudents : [],
        trashSubjects: Array.isArray(modularResult?.trashSubjects) ? modularResult.trashSubjects : [],
        trashExams: Array.isArray(modularResult?.trashExams) ? modularResult.trashExams : [],
        trashClasses: scopedTrashClasses,
        classes: scopedClasses,
        currentClassId: scopedClassId,
        currentClassName: scopedClassName,
        source: 'firebase',
        offline: false,
        error: null,
        errorType: null,
        allowEmptyClassCatalog: Boolean(classScope?.allowEmptyClassCatalog)
      };
      return writeRecentFetchAllDataCache({ scopeKey: cacheScopeKey, classId: scopedClassId, ownerId: scopedOwnerId, payload: result });
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Firebase error:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        console.warn(`Retrying Firebase fetch (${attempt + 1}/${RETRY_ATTEMPTS}) after ${lastErrorType} error`);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('fetch data', lastErrorType);
  }

  const offline = isOfflineError(lastErrorType);
  const cachedClasses = readClassCatalogCache(cacheScopeKey);
  const cachedTrashClasses = readClassTrashCache(cacheScopeKey);
  const allowEmptyClassCatalog = inferAllowEmptyClassCatalog(cachedClasses, cachedTrashClasses);
  const { classId, className } = resolveActiveClassModel(authUserId || userId, cachedClasses);
  const cached = readCachedData(classId);

  if (cached?.data) {
    return {
      data: cached.data,
      trashStudents: [],
      trashSubjects: [],
      trashExams: [],
      trashClasses: cachedTrashClasses,
      classes: cachedClasses,
      currentClassId: classId,
      currentClassName: className,
      source: 'cache',
      offline,
      error: lastError,
      errorType: lastErrorType,
      allowEmptyClassCatalog
    };
  }

  const fallback = createDefaultRawData();
  writeCacheCopy(fallback, classId);
  return {
    data: fallback,
    trashStudents: [],
    trashSubjects: [],
    trashExams: [],
    trashClasses: cachedTrashClasses,
    classes: cachedClasses,
    currentClassId: classId,
    currentClassName: className,
    source: 'default',
    offline,
    error: lastError,
    errorType: lastErrorType,
    allowEmptyClassCatalog
  };
};

const persistStudentCreate = async (studentData, nextData) => {
  const nextStudent = studentData && typeof studentData === 'object' ? clone(studentData) : {};
  const normalizedStudentId = String(nextStudent.id || '').trim();
  if (!normalizedStudentId) {
    const error = new Error('Student id is required to save student');
    return {
      data: nextData,
      remoteSaved: false,
      error,
      errorType: 'unknown',
      operation: 'save student',
      offline: false
    };
  }

  nextStudent.name = assertValidStudentName(nextStudent.name);
  nextStudent.scores = normalizeStudentScoresForRawData(nextData, nextStudent.scores || {});

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('save student', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();
      const studentOrder = Math.max(
        0,
        asArray(nextData?.students).findIndex((student) => String(student?.id || '').trim() === normalizedStudentId)
      );

      await setDoc(getStudentDocRef(userId, normalizedStudentId, classId), {
        id: normalizedStudentId,
        name: nextStudent.name,
        notes: nextStudent.notes || '',
        class: nextStudent.class || '',
        scores: nextStudent.scores && typeof nextStudent.scores === 'object' ? clone(nextStudent.scores) : {},
        deleted: false,
        deletedAt: null,
        order: studentOrder,
        userId,
        ownerId: userId,
        classId,
        updatedAt
      }, { merge: false });

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'save student',
        classId,
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to save student via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        console.warn(`Retrying save student (${attempt + 1}/${RETRY_ATTEMPTS}) after ${lastErrorType} error`);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('save student', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'save student',
    offline: isOfflineError(lastErrorType)
  };
};

const persistBulkStudentCreate = async (studentEntries = [], nextData) => {
  const normalizedEntries = asArray(studentEntries).map((entry) => {
    const normalizedStudentId = String(entry?.id || '').trim();
    if (!normalizedStudentId) {
      return null;
    }

    const nextStudent = {
      id: normalizedStudentId,
      name: normalizeStudentName(entry?.name || ''),
      notes: entry?.notes || '',
      class: entry?.class || '',
      scores: normalizeStudentScoresForRawData(nextData, entry?.scores || {})
    };

    nextStudent.name = assertValidStudentName(nextStudent.name);
    return nextStudent;
  }).filter(Boolean);

  if (!normalizedEntries.length) {
    return {
      data: nextData,
      remoteSaved: true,
      error: null,
      errorType: null,
      operation: 'save bulk students',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('save bulk students', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await ensureUserRootProfileDocument(userId);

      const batch = writeBatch(db);
      normalizedEntries.forEach((student) => {
        const studentOrder = Math.max(
          0,
          asArray(nextData?.students).findIndex((entry) => String(entry?.id || '').trim() === student.id)
        );

        batch.set(getStudentDocRef(userId, student.id, classId), {
          id: student.id,
          name: student.name,
          notes: student.notes || '',
          class: student.class || '',
          scores: student.scores && typeof student.scores === 'object' ? clone(student.scores) : {},
          deleted: false,
          deletedAt: null,
          order: studentOrder,
          userId,
          ownerId: userId,
          classId,
          updatedAt
        }, { merge: false });
      });

      batch.set(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );
      batch.set(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

      await batch.commit();

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'save bulk students',
        classId,
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to save bulk students via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        console.warn(`Retrying save bulk students (${attempt + 1}/${RETRY_ATTEMPTS}) after ${lastErrorType} error`);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('save bulk students', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'save bulk students',
    offline: isOfflineError(lastErrorType)
  };
};

const normalizeStudentPatch = (studentData, rawData = null) => {
  const source = studentData && typeof studentData === 'object' ? studentData : {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(source, 'name')) {
    patch.name = normalizeStudentName(source.name);
  }

  if (Object.prototype.hasOwnProperty.call(source, 'notes')) {
    patch.notes = source.notes || '';
  }

  if (Object.prototype.hasOwnProperty.call(source, 'class')) {
    patch.class = source.class || '';
  }

  if (Object.prototype.hasOwnProperty.call(source, 'scores')) {
    patch.scores = normalizeStudentScoresForRawData(rawData || {}, source.scores || {});
  }

  return patch;
};

const persistStudentUpdateById = async (studentId, studentData, nextData) => {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    const error = new Error('Student id is required to update student');
    return {
      data: nextData,
      remoteSaved: false,
      error,
      errorType: 'unknown',
      operation: 'update student',
      offline: false
    };
  }

  const patch = normalizeStudentPatch(studentData, nextData);
  if (!Object.keys(patch).length) {
    return {
      data: nextData,
      remoteSaved: true,
      error: null,
      errorType: null,
      operation: 'update student',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('update student', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();
      console.log('Editing student:', normalizedStudentId);
      console.log('User:', userId);

      await updateDoc(getStudentDocRef(userId, normalizedStudentId, classId), {
        ...patch,
        userId,
        ownerId: userId,
        classId,
        updatedAt
      });

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'update student',
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to update student via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        console.warn(`Retrying update student (${attempt + 1}/${RETRY_ATTEMPTS}) after ${lastErrorType} error`);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('update student', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'update student',
    offline: isOfflineError(lastErrorType)
  };
};

const persistBulkStudentScoreUpdates = async (studentScoreEntries = [], nextData) => {
  const normalizedEntries = asArray(studentScoreEntries).map((entry) => {
    const normalizedStudentId = String(entry?.studentId || entry?.id || '').trim();
    if (!normalizedStudentId) {
      return null;
    }

    const patch = normalizeStudentPatch({ scores: entry?.scores || {} }, nextData);
    if (!Object.prototype.hasOwnProperty.call(patch, 'scores')) {
      return null;
    }

    return {
      studentId: normalizedStudentId,
      scores: patch.scores
    };
  }).filter(Boolean);

  if (!normalizedEntries.length) {
    return {
      data: nextData,
      remoteSaved: true,
      error: null,
      errorType: null,
      operation: 'save bulk student scores',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('save bulk student scores', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();

      await ensureUserRootProfileDocument(userId);

      const batch = writeBatch(db);
      normalizedEntries.forEach(({ studentId, scores }) => {
        batch.update(getStudentDocRef(userId, studentId, classId), {
          scores,
          userId,
          ownerId: userId,
          classId,
          updatedAt
        });
      });
      batch.set(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );
      batch.set(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });
      await batch.commit();

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'save bulk student scores',
        offline: false,
        classId
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to save bulk student scores via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        console.warn(`Retrying save bulk student scores (${attempt + 1}/${RETRY_ATTEMPTS}) after ${lastErrorType} error`);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('save bulk student scores', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'save bulk student scores',
    offline: isOfflineError(lastErrorType)
  };
};

const persistStudentDeleteById = async (studentId, nextData, studentMeta = {}) => {
  const normalizedStudentId = String(studentId || '').trim();
  const normalizedStudentName = String(studentMeta?.name || '').trim() || 'Student';
  if (!normalizedStudentId) {
    const error = new Error('Student id is required to delete student');
    return {
      data: nextData,
      remoteSaved: false,
      error,
      errorType: 'unknown',
      operation: 'delete student',
      offline: false
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext('delete student', { requireWritable: true });
      const userId = classScope.ownerId;
      const classId = classScope.classId;
      const updatedAt = new Date().toISOString();
      console.log('Deleting student:', normalizedStudentId);
      console.log('User:', userId);

      await updateDoc(getStudentDocRef(userId, normalizedStudentId, classId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt,
        userId,
        ownerId: userId,
        classId
      });

      try {
        await cleanupLegacyStudentCompanionDoc(userId, normalizedStudentId, 'soft-delete', {
          updatedAt,
          classId
        });
      } catch (error) {
        console.warn('Ignoring legacy root student delete cleanup failure:', error);
      }

      await setDoc(
        getClassDocRef(userId, classId),
        buildClassDocMetadataPatch(userId, classId, updatedAt),
        { merge: true }
      );

      await mergeUserRootMetadata(userId, {
        userId,
        activeClassId: classId,
        updatedAt
      });

      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: 'delete student',
        offline: false,
        trashEntry: {
          id: normalizedStudentId,
          name: normalizedStudentName,
          deletedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error('Failed to delete student via Firebase:', error);

      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        console.warn(`Retrying delete student (${attempt + 1}/${RETRY_ATTEMPTS}) after ${lastErrorType} error`);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure('delete student', lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: 'delete student',
    offline: isOfflineError(lastErrorType)
  };
};

const saveRemote = async (rawData, ownerId, classId) => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const payload = await writeModularData(ownerId, classId, rawData);
  console.log('Saved to Firebase');
  return payload;
};

const persistRemoteFirst = async (rawData, operationLabel) => {
  const nextData = normalizeRawData(rawData);
  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classScope = await ensureValidClassContext(operationLabel, { requireWritable: true });
      const ownerId = classScope.ownerId;
      const classId = classScope.classId;
      console.log('Active UID:', ownerId);
      await saveRemote(nextData, ownerId, classId);
      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: operationLabel,
        classId,
        offline: false
      };
    } catch (error) {
      lastError = error;
      lastErrorType = classifyFirebaseError(error);
      console.error(`Failed to ${operationLabel} via Firebase:`, error);
      if (attempt < RETRY_ATTEMPTS && shouldRetry(lastErrorType) && !isNavigatorOffline()) {
        console.warn(`Retrying ${operationLabel} (${attempt + 1}/${RETRY_ATTEMPTS}) after ${lastErrorType} error`);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (!isOfflineError(lastErrorType)) {
    logOnlineFailure(operationLabel, lastErrorType);
  }

  return {
    data: nextData,
    remoteSaved: false,
    error: lastError,
    errorType: lastErrorType,
    operation: operationLabel,
    offline: isOfflineError(lastErrorType)
  };
};

const deleteCollectionDocuments = async (collectionRef) => {
  const snapshot = await getDocs(collectionRef);
  const operations = [];
  snapshot.forEach((entry) => {
    operations.push(deleteDoc(entry.ref));
  });
  await Promise.all(operations);
};

const getAvailableStorageRefs = () => {
  const refs = [];
  try {
    if (typeof sessionStorage !== 'undefined') {
      refs.push(sessionStorage);
    }
  } catch {}

  try {
    if (typeof localStorage !== 'undefined') {
      refs.push(localStorage);
    }
  } catch {}

  return refs;
};

const clearStorageEntriesMatching = (storageRef, predicate = () => false) => {
  if (!storageRef || typeof storageRef.length !== 'number') {
    return;
  }

  const keysToRemove = [];
  for (let index = 0; index < storageRef.length; index += 1) {
    const key = String(storageRef.key(index) || '').trim();
    if (key && predicate(key)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    storageRef.removeItem(key);
  });
};

const clearUserScopedCachedState = (userId = '') => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return;
  }

  const classSelectionKey = getClassSelectionKeyForUser(normalizedUserId);
  const classSelectionOwnerKey = getClassSelectionOwnerKeyForUser(normalizedUserId);
  const classCatalogKey = getClassCatalogCacheKeyForUser(normalizedUserId);
  const rawDataPrefix = `${CACHE_KEY_PREFIX}:${normalizedUserId}:`;
  const classCatalogPrefix = `${CACHE_KEY_PREFIX}:classes:${normalizedUserId}`;

  getAvailableStorageRefs().forEach((storageRef) => {
    clearStorageEntriesMatching(storageRef, (key) => {
      return key === classSelectionKey
        || key === classSelectionOwnerKey
        || key === classCatalogKey
        || key.startsWith(rawDataPrefix)
        || key.startsWith(classCatalogPrefix);
    });
  });

  if (
    getAuthenticatedUserId() === normalizedUserId
    || getCurrentUserId() === normalizedUserId
    || currentClassOwnerId === normalizedUserId
  ) {
    setCurrentClassContext('', normalizedUserId, '', '');
  }

  invalidateRecentFetchAllDataCache();
  globalClassCatalogCache.loadedAt = 0;
};

const purgeUserOwnedFirestoreData = async (userId = '') => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId || !isFirebaseConfigured || !db) {
    return;
  }

  const classesSnapshot = await getDocs(getClassesCollectionRef(normalizedUserId));
  for (const entry of classesSnapshot.docs || []) {
    const classId = normalizeClassId(entry.id);
    if (!classId) {
      continue;
    }

    await Promise.all([
      deleteCollectionDocuments(getStudentsCollectionRef(normalizedUserId, classId)),
      deleteCollectionDocuments(getSubjectsCollectionRef(normalizedUserId, classId)),
      deleteCollectionDocuments(getExamsCollectionRef(normalizedUserId, classId))
    ]);
    await deleteDoc(entry.ref);
  }

  await Promise.all([
    deleteCollectionDocuments(getLegacyStudentsCollectionRef(normalizedUserId)),
    deleteCollectionDocuments(getLegacySubjectsCollectionRef(normalizedUserId)),
    deleteCollectionDocuments(getLegacyExamsCollectionRef(normalizedUserId))
  ]);
};

export const setCurrentClassId = (classId) => {
  return setCurrentClassContext(classId);
};

export const getCurrentClassId = () => {
  return getCurrentClassContext();
};

export const fetchClassCatalog = async () => {
  const userId = await ensureAuthenticatedUserId('fetch class catalog');
  const role = getCurrentUserRoleContext();
  const cacheScopeKey = canReadAllData(role, currentUserPermissionsContext) ? `${userId}:admin-global` : userId;

  if (!isFirebaseConfigured || !db) {
    const cachedClasses = readClassCatalogCache(cacheScopeKey);
    const cachedTrashClasses = readClassTrashCache(cacheScopeKey);
    const allowEmptyClassCatalog = inferAllowEmptyClassCatalog(cachedClasses, cachedTrashClasses);
    const { classId, className } = resolveActiveClassModel(userId, cachedClasses);
    const persistedSelection = readPersistedClassSelection(userId);
    const activeClass = findClassEntryBySelection(cachedClasses, classId, currentClassOwnerId || persistedSelection.ownerId || '') || null;
    setCurrentClassContext(classId, userId, activeClass?.ownerId || '', activeClass?.ownerName || '', activeClass?.ownerRole || ROLE_TEACHER);
    console.log('Classes:', cachedClasses.length);
    console.log('Selected class:', classId || '(none)');
    console.log('Owner ID:', activeClass?.ownerId || '(none)');
    return {
      classes: cachedClasses,
      trashClasses: cachedTrashClasses,
      currentClassId: classId,
      currentClassName: className,
      allowEmptyClassCatalog
    };
  }

  const catalog = await ensureClassCatalog(userId);
  const classes = catalog.classes || [];
  const trashClasses = catalog.trashClasses || [];
  const { classId, className } = resolveActiveClassModel(userId, classes);
  const persistedSelection = readPersistedClassSelection(userId);
  const activeClass = findClassEntryBySelection(classes, classId, currentClassOwnerId || persistedSelection.ownerId || '') || null;
  setCurrentClassContext(classId, userId, activeClass?.ownerId || '', activeClass?.ownerName || '', activeClass?.ownerRole || ROLE_TEACHER);
  writeClassCatalogCache(cacheScopeKey, classes, trashClasses);
  globalClassCatalogCache.loadedAt = 0;

  console.log('Classes:', classes.length);
  console.log('Selected class:', classId || '(none)');
  console.log('Owner ID:', activeClass?.ownerId || '(none)');

  return {
    classes,
    trashClasses,
    currentClassId: classId,
    currentClassName: className,
    allowEmptyClassCatalog: Boolean(catalog?.allowEmptyClassCatalog)
  };
};

export const fetchAdminUsers = async () => {
  await ensureAuthenticatedUserId('read admin users');
  assertAdminOrDeveloperRole('read admin users');
  if (!isFirebaseConfigured || !db) {
    return [];
  }

  const privilegedDirectory = await readPrivilegedUserLifecycleDirectory();
  const users = asArray(privilegedDirectory.users).filter((entry) => {
    return normalizeAccountStatus(entry?.status) !== ACCOUNT_STATUS_DELETED;
  });

  return users.sort((a, b) => {
    const aLabel = `${a.name || ''}|${a.email || ''}`.toLowerCase();
    const bLabel = `${b.name || ''}|${b.email || ''}`.toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
};

export const fetchGlobalStudentSearchIndex = async () => {
  await ensureAuthenticatedUserId('read global student search index');
  assertAdminOrDeveloperRole('read global student search index');
  if (!isFirebaseConfigured || !db) {
    return [];
  }

  const [snapshot, privilegedDirectory] = await Promise.all([
    getDocs(collectionGroup(db, STUDENTS_SUBCOLLECTION)),
    readPrivilegedUserLifecycleDirectory()
  ]);
  const dedupedStudents = new Map();
  const ownerNameMap = privilegedDirectory.ownerNameMap || new Map();
  const ownerRoleMap = privilegedDirectory.ownerRoleMap || new Map();
  const deletedUserIds = privilegedDirectory.deletedUserIds || new Set();

  snapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) {
      return;
    }
    const parsedPath = parseGlobalStudentRefPath(entry.ref?.path);
    if (!parsedPath.isSupportedPath) {
      return;
    }

    const userId = normalizeUserId(parsedPath.ownerId || payload.ownerId || payload.userId || '');
    if (!userId || deletedUserIds.has(userId)) {
      return;
    }
    const classId = normalizeClassId(parsedPath.classId || payload.classId || '');
    const className = normalizeClassName(payload.className || payload.class || '', '');
    const studentId = String(payload.id || parsedPath.studentDocId || entry.id || '').trim();
    const identityKey = buildGlobalStudentIdentityKey(userId, studentId);
    if (!identityKey) {
      return;
    }

    const candidate = {
      userId,
      ownerId: userId,
      classId,
      className,
      id: studentId,
      studentId,
      name: normalizeStudentName(payload.name, 'Student'),
      ownerName: ownerNameMap.get(userId) || '',
      userRole: ownerRoleMap.get(userId) || normalizeRole(payload.userRole || payload.role || 'teacher'),
      isClassScoped: Boolean(classId || parsedPath.isClassScoped)
    };

    const current = dedupedStudents.get(identityKey) || null;
    dedupedStudents.set(identityKey, pickPreferredGlobalStudentRecord(current, candidate));
  });

  return Array.from(dedupedStudents.values())
    .map(({ isClassScoped, ...entry }) => entry)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
};

export const fetchAdminGlobalStats = async () => {
  await ensureAuthenticatedUserId('read admin statistics');
  assertAdminOrDeveloperRole('read admin statistics');
  if (!isFirebaseConfigured || !db) {
    return {
      totalUsers: 0,
      totalStudents: 0,
      totalExams: 0
    };
  }

  const [privilegedDirectory, students, examsSnapshot] = await Promise.all([
    readPrivilegedUserLifecycleDirectory(),
    fetchGlobalStudentSearchIndex(),
    getDocs(collectionGroup(db, EXAMS_SUBCOLLECTION))
  ]);
  const deletedUserIds = privilegedDirectory.deletedUserIds || new Set();
  const activeUsers = asArray(privilegedDirectory.users).filter((entry) => {
    return normalizeAccountStatus(entry?.status) !== ACCOUNT_STATUS_DELETED;
  });

  let totalExams = 0;
  examsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) {
      return;
    }
    const ownerId = normalizeUserId(payload.ownerId || payload.userId || getOwnerIdFromClassRefPath(entry.ref?.path));
    if (ownerId && deletedUserIds.has(ownerId)) {
      return;
    }
    totalExams += 1;
  });

  return {
    totalUsers: activeUsers.length,
    totalStudents: Array.isArray(students) ? students.length : 0,
    totalExams
  };
};

export const requestCurrentUserAccountDeletion = async () => enqueueWrite(async () => {
  const userId = await ensureAuthenticatedUserId('request account deletion');
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  await ensureUserRootProfileDocument(userId);
  let userPayload = await readUserRootData(userId);
  userPayload = await syncCurrentUserRootProfileMetadata(userId, userPayload);
  const lifecycle = normalizeUserAccountLifecycleRecord(userPayload, {
    status: ACCOUNT_STATUS_ACTIVE,
    accountDeletionStatus: ACCOUNT_DELETION_STATUS_NONE
  });

  if (!normalizeUserId(userPayload.uid || userPayload.userId || userId)) {
    throw new Error('Unable to resolve your account profile. Sign in again and retry.');
  }
  if (lifecycle.status === ACCOUNT_STATUS_DELETED) {
    throw new Error('This account has already been deleted.');
  }
  if (lifecycle.accountDeletionStatus === ACCOUNT_DELETION_STATUS_PENDING) {
    throw new Error('Your account deletion request is already pending review.');
  }
  if (lifecycle.accountDeletionStatus === ACCOUNT_DELETION_STATUS_APPROVED) {
    throw new Error('Your account deletion request is already approved. Confirm deletion to continue.');
  }

  const updatedAt = new Date().toISOString();
  const requestedAt = updatedAt;
  await setDoc(getUserRootRef(userId), {
    uid: userId,
    userId,
    status: ACCOUNT_STATUS_ACTIVE,
    accountDeletionStatus: ACCOUNT_DELETION_STATUS_PENDING,
    accountDeletionRequestedAt: serverTimestamp(),
    accountDeletionRequestedBy: userId,
    accountDeletionReviewedAt: null,
    accountDeletionReviewedBy: '',
    deletedAt: null,
    updatedAt
  }, { merge: true });

  const updatedRecord = buildPrivilegedUserLifecycleRecord({
    ...userPayload,
    uid: userId,
    userId,
    status: ACCOUNT_STATUS_ACTIVE,
    accountDeletionStatus: ACCOUNT_DELETION_STATUS_PENDING,
    accountDeletionRequestedAt: requestedAt,
    accountDeletionRequestedBy: userId,
    accountDeletionReviewedAt: null,
    accountDeletionReviewedBy: '',
    deletedAt: null,
    updatedAt
  }, userId);

  await logActivity('user_account_delete_requested', userId, 'record', {
    dataOwnerUserId: userId,
    targetLabel: buildUserLifecycleTargetLabel(updatedRecord, userId),
    userRole: getCurrentUserRoleContext()
  });

  return updatedRecord;
});

export const reviewAdminUserAccountDeletion = async ({ uid = '', decision = '' } = {}) => enqueueWrite(async () => {
  const actorUserId = await ensureAuthenticatedUserId('review account deletion');
  if (!canReviewAccountDeletion(getCurrentUserRoleContext(), currentUserPermissionsContext)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'Only admins or developers can review account deletion');
  }
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const normalizedUid = normalizeUserId(uid);
  const normalizedDecision = String(decision || '').trim().toLowerCase();
  if (!normalizedUid) {
    throw new Error('User id is required');
  }
  if (normalizedDecision !== 'approve' && normalizedDecision !== 'reject') {
    throw new Error('A valid review decision is required.');
  }

  const userSnapshot = await getDoc(getUserRootRef(normalizedUid));
  if (!userSnapshot.exists()) {
    throw new Error('Unable to find the selected user account.');
  }

  const userPayload = userSnapshot.data() || {};
  const lifecycle = normalizeUserAccountLifecycleRecord(userPayload, {
    status: ACCOUNT_STATUS_ACTIVE,
    accountDeletionStatus: ACCOUNT_DELETION_STATUS_NONE
  });
  if (lifecycle.status === ACCOUNT_STATUS_DELETED) {
    throw new Error('Deleted accounts cannot be reviewed.');
  }
  if (lifecycle.accountDeletionStatus !== ACCOUNT_DELETION_STATUS_PENDING) {
    throw new Error('Only pending deletion requests can be reviewed.');
  }

  const nextDeletionStatus = normalizedDecision === 'approve'
    ? ACCOUNT_DELETION_STATUS_APPROVED
    : ACCOUNT_DELETION_STATUS_REJECTED;
  const updatedAt = new Date().toISOString();
  const reviewedAt = updatedAt;
  await setDoc(getUserRootRef(normalizedUid), {
    uid: normalizedUid,
    userId: normalizedUid,
    accountDeletionStatus: nextDeletionStatus,
    accountDeletionReviewedAt: serverTimestamp(),
    accountDeletionReviewedBy: actorUserId,
    updatedAt
  }, { merge: true });

  const updatedRecord = buildPrivilegedUserLifecycleRecord({
    ...userPayload,
    uid: normalizedUid,
    userId: normalizedUid,
    accountDeletionStatus: nextDeletionStatus,
    accountDeletionReviewedAt: reviewedAt,
    accountDeletionReviewedBy: actorUserId,
    updatedAt
  }, normalizedUid);

  await logActivity(
    normalizedDecision === 'approve' ? 'user_account_delete_approved' : 'user_account_delete_rejected',
    normalizedUid,
    'record',
    {
      dataOwnerUserId: normalizedUid,
      targetLabel: buildUserLifecycleTargetLabel(updatedRecord, normalizedUid),
      userRole: getCurrentUserRoleContext()
    }
  );

  return updatedRecord;
});

export const finalizeCurrentUserAccountDeletion = async () => enqueueWrite(async () => {
  const userId = await ensureAuthenticatedUserId('finalize account deletion');
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const userPayload = await readUserRootData(userId);
  const lifecycle = normalizeUserAccountLifecycleRecord(userPayload, {
    status: ACCOUNT_STATUS_ACTIVE,
    accountDeletionStatus: ACCOUNT_DELETION_STATUS_NONE
  });
  if (lifecycle.status === ACCOUNT_STATUS_DELETED) {
    throw new Error('This account has already been deleted.');
  }
  if (lifecycle.accountDeletionStatus !== ACCOUNT_DELETION_STATUS_APPROVED) {
    throw new Error('Your account deletion request must be approved before final confirmation.');
  }

  await purgeUserOwnedFirestoreData(userId);
  const updatedAt = new Date().toISOString();
  await mergeUserRootMetadata(userId, {
    uid: userId,
    activeClassId: '',
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: true,
    updatedAt
  });
  await setDoc(getUserRootRef(userId), {
    uid: userId,
    userId,
    status: ACCOUNT_STATUS_DELETED,
    deletedAt: serverTimestamp(),
    updatedAt
  }, { merge: true });

  clearUserScopedCachedState(userId);

  const deletedRecord = buildPrivilegedUserLifecycleRecord({
    ...userPayload,
    uid: userId,
    userId,
    status: ACCOUNT_STATUS_DELETED,
    deletedAt: updatedAt,
    updatedAt
  }, userId);

  await logActivity('user_account_deleted', userId, 'record', {
    dataOwnerUserId: userId,
    targetLabel: buildUserLifecycleTargetLabel(deletedRecord, userId),
    userRole: getCurrentUserRoleContext()
  });

  return deletedRecord;
});

export const updateAdminUserRole = async ({ uid = '', name = '', email = '', role = 'teacher' } = {}) => {
  const actorUserId = await ensureAuthenticatedUserId('update user role');
  assertDeveloperRole('update user roles');
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const normalizedUid = normalizeUserId(uid);
  const normalizedEmail = normalizeEmailAddress(email);
  if (!normalizedUid) {
    throw new Error('User id is required');
  }

  const userSnapshot = await getDoc(getUserRootRef(normalizedUid));
  if (!userSnapshot.exists()) {
    throw createContextError(
      ERROR_CODES.PRIVILEGED_ROLE_POLICY,
      'Privileged roles can only be assigned to existing signed-in teacher accounts.'
    );
  }

  const userPayload = userSnapshot.data() || {};
  const policyState = buildPrivilegedRoleUpdatePolicyState(userPayload, role);
  if (!policyState.canUpdate) {
    throw createContextError(ERROR_CODES.PRIVILEGED_ROLE_POLICY, policyState.message);
  }

  const currentRole = policyState.currentRole;
  const normalizedRole = policyState.normalizedNextRole;
  const accessProfile = buildRolePermissionPayload(normalizedRole);
  const resolvedEmail = normalizeEmailAddress(normalizedEmail || userPayload.email || '');
  const resolvedName = normalizeDisplayName(name || userPayload.name || resolvedEmail || 'Teacher', 'Teacher');
  const emailVerified = isVerifiedUserRecord(userPayload);
  const updatedAt = new Date().toISOString();

  await setDoc(getUserRootRef(normalizedUid), {
    uid: normalizedUid,
    userId: normalizedUid,
    name: resolvedName,
    email: resolvedEmail,
    role: accessProfile.role,
    permissions: accessProfile.permissions,
    emailVerified,
    updatedAt,
    roleUpdatedAt: updatedAt,
    roleUpdatedBy: actorUserId
  }, { merge: true });

  const classSnapshots = await getDocs(getClassesCollectionRef(normalizedUid));
  const classRoleUpdateTasks = [];
  classSnapshots.forEach((entry) => {
    classRoleUpdateTasks.push(setDoc(entry.ref, {
      ownerRole: accessProfile.role,
      updatedAt
    }, { merge: true }));
  });
  if (classRoleUpdateTasks.length) {
    await Promise.allSettled(classRoleUpdateTasks);
  }

  await logActivity('user_role_updated', normalizedUid, 'record', {
    dataOwnerUserId: normalizedUid,
    targetLabel: `${resolvedName || resolvedEmail || normalizedUid} (${currentRole} to ${accessProfile.role})`,
    userRole: getCurrentUserRoleContext()
  });

  return buildPrivilegedUserLifecycleRecord({
    ...userPayload,
    uid: normalizedUid,
    userId: normalizedUid,
    name: resolvedName,
    email: resolvedEmail,
    role: accessProfile.role,
    permissions: accessProfile.permissions,
    emailVerified,
    updatedAt,
    roleUpdatedAt: updatedAt,
    roleUpdatedBy: actorUserId
  }, normalizedUid);
};

export const syncCurrentUserClassOwnerName = async (ownerName = '') => {
  const userId = await ensureAuthenticatedUserId('update account profile');
  const normalizedOwnerName = normalizeDisplayName(ownerName, getAuthenticatedUserDisplayName());
  currentClassOwnerName = normalizedOwnerName;

  if (!isFirebaseConfigured || !db) {
    invalidateRecentFetchAllDataCache();
    globalClassCatalogCache.loadedAt = 0;
    return 0;
  }

  const classesSnapshot = await getDocs(getClassesCollectionRef(userId));
  const updatedAt = new Date().toISOString();
  const updateTasks = [];

  classesSnapshot.forEach((entry) => {
    const classId = normalizeClassId(entry.id);
    const payload = entry.data() || {};
    const ownerId = normalizeUserId(payload.ownerId || payload.userId || userId);
    if (!classId || ownerId !== userId) {
      return;
    }

    updateTasks.push(setDoc(entry.ref, buildClassDocMetadataPatch(userId, classId, updatedAt, {
      ownerName: normalizedOwnerName
    }), { merge: true }));
  });

  if (updateTasks.length) {
    await Promise.all(updateTasks);
  }

  invalidateRecentFetchAllDataCache();
  globalClassCatalogCache.loadedAt = 0;
  return updateTasks.length;
};

export const createClass = async (className) => {
  assertWritableRole('create class');
  const userId = await ensureAuthenticatedUserId('create class');
  const cacheScopeKey = getFetchScopeKey(userId);
  const normalizedName = normalizeClassName(className, DEFAULT_CLASS_NAME);
  const createdAt = new Date().toISOString();
  const ownerName = getAuthenticatedUserDisplayName();

  const classDocRef = doc(getClassesCollectionRef(userId));
  const classId = normalizeClassId(classDocRef.id);

  await setDoc(classDocRef, buildClassDocMetadataPatch(userId, classId, createdAt, {
    name: normalizedName,
    createdAt,
    deleted: false,
    deletedAt: null,
    ownerName,
    ownerRole: getCurrentUserRoleContext()
  }));

  const catalog = await ensureClassCatalog(userId);
  const classes = catalog.classes || [];
  const trashClasses = catalog.trashClasses || [];
  const nextClasses = sortClasses([...classes.filter(entry => entry.id !== classId), {
    id: classId,
    name: normalizedName,
    createdAt,
    ownerId: userId,
    ownerName,
    ownerRole: getCurrentUserRoleContext()
  }]);
  writeClassCatalogCache(cacheScopeKey, nextClasses, trashClasses);
  globalClassCatalogCache.loadedAt = 0;
  setCurrentClassContext(classId, userId, userId, ownerName, getCurrentUserRoleContext());

  await mergeUserRootMetadata(userId, {
    userId,
    activeClassId: classId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: false,
    updatedAt: createdAt
  });

  return {
    class: toClassModel(classId, { name: normalizedName, createdAt, ownerId: userId, ownerName, ownerRole: getCurrentUserRoleContext() }),
    classes: nextClasses,
    currentClassId: classId,
    currentClassName: normalizedName,
    allowEmptyClassCatalog: false
  };
};

const deleteClassesInternal = async (classIds = [], options = {}) => {
  const operationLabel = String(options?.operationLabel || 'delete class');
  const allowEmptyCatalog = options?.allowEmptyCatalog === true;

  assertWritableRole(operationLabel);
  const userId = await ensureAuthenticatedUserId(operationLabel);
  const cacheScopeKey = getFetchScopeKey(userId);
  const normalizedClassIds = [...new Set(asArray(classIds).map(classId => normalizeClassId(classId)).filter(Boolean))];
  if (!normalizedClassIds.length) {
    throw new Error('Select at least one class');
  }

  const catalog = await ensureClassCatalog(userId);
  const classes = catalog.classes || [];
  const trashClasses = catalog.trashClasses || [];
  const selectedClasses = normalizedClassIds.map((normalizedClassId) => {
    return classes.find(entry => entry.id === normalizedClassId) || null;
  });

  if (selectedClasses.some(entry => !entry)) {
    throw new Error('One or more selected classes are unavailable');
  }

  const unauthorizedClass = selectedClasses.find((classEntry) => !canRoleWrite({
    role: getCurrentUserRoleContext(),
    permissions: currentUserPermissionsContext,
    actorUserId: userId,
    ownerId: normalizeUserId(classEntry?.ownerId || ''),
    ownerRole: normalizeRole(classEntry?.ownerRole || ROLE_TEACHER)
  }));
  if (unauthorizedClass) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `You do not have permission to ${operationLabel}`);
  }

  const remainingClasses = sortClasses(classes.filter(entry => !normalizedClassIds.includes(entry.id)));
  if (!allowEmptyCatalog && remainingClasses.length === 0) {
    throw new Error('At least one class is required');
  }

  const updatedAt = new Date().toISOString();
  const deletedEntries = selectedClasses.map((classEntry) => {
    const classOwnerId = normalizeUserId(classEntry?.ownerId || '');
    if (!classOwnerId) {
      throw createContextError(ERROR_CODES.MISSING_OWNER_ID, 'Class owner metadata is missing');
    }

    return {
      id: normalizeClassId(classEntry?.id || ''),
      name: classEntry?.name,
      createdAt: classEntry?.createdAt || null,
      deletedAt: updatedAt,
      ownerId: classOwnerId,
      ownerName: classEntry?.ownerName || getAuthenticatedUserDisplayName(),
      ownerRole: normalizeRole(classEntry?.ownerRole || ROLE_TEACHER)
    };
  });

  await Promise.all(deletedEntries.map((classEntry) => {
    return setDoc(getClassDocRef(classEntry.ownerId, classEntry.id), buildClassDocMetadataPatch(classEntry.ownerId, classEntry.id, updatedAt, {
      name: classEntry.name,
      createdAt: classEntry.createdAt || null,
      deleted: true,
      deletedAt: serverTimestamp(),
      ownerName: classEntry.ownerName || getAuthenticatedUserDisplayName(),
      ownerRole: classEntry.ownerRole || ROLE_TEACHER
    }), { merge: true });
  }));

  const nextTrashClasses = sortClassTrashEntries([
    ...deletedEntries,
    ...trashClasses.filter(entry => !normalizedClassIds.includes(entry.id))
  ]);
  writeClassCatalogCache(cacheScopeKey, remainingClasses, nextTrashClasses);
  globalClassCatalogCache.loadedAt = 0;

  const { classId: nextClassId, className: nextClassName } = resolveActiveClassModel(userId, remainingClasses);
  const allowEmptyClassCatalog = remainingClasses.length === 0;

  await mergeUserRootMetadata(userId, {
    userId,
    activeClassId: nextClassId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: allowEmptyClassCatalog,
    updatedAt
  });

  return {
    classes: remainingClasses,
    trashClasses: nextTrashClasses,
    currentClassId: nextClassId,
    currentClassName: nextClassName,
    deletedEntries,
    allowEmptyClassCatalog
  };
};

export const deleteClass = async (classId) => {
  const result = await deleteClassesInternal([classId], {
    allowEmptyCatalog: false,
    operationLabel: 'delete class'
  });

  return {
    ...result,
    trashEntry: result.deletedEntries?.[0] || null
  };
};

export const deleteClasses = async (classIds = []) => {
  return deleteClassesInternal(classIds, {
    allowEmptyCatalog: true,
    operationLabel: 'delete classes'
  });
};

export const restoreClass = async (classId) => {
  assertWritableRole('restore class');
  const userId = await ensureAuthenticatedUserId('restore class');
  const cacheScopeKey = getFetchScopeKey(userId);
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedClassId) {
    throw new Error('Class id is required');
  }

  const catalog = await ensureClassCatalog(userId);
  const classes = catalog.classes || [];
  const trashClasses = catalog.trashClasses || [];
  const classEntry = trashClasses.find(entry => entry.id === normalizedClassId);
  if (!classEntry) {
    throw new Error('Class is not in trash');
  }

  const updatedAt = new Date().toISOString();
  const classOwnerId = normalizeUserId(classEntry.ownerId || '');
  if (!classOwnerId) {
    throw createContextError(ERROR_CODES.MISSING_OWNER_ID, 'Class owner metadata is missing');
  }
  if (!canRoleWrite({
    role: getCurrentUserRoleContext(),
    permissions: currentUserPermissionsContext,
    actorUserId: userId,
    ownerId: classOwnerId,
    ownerRole: normalizeRole(classEntry.ownerRole || ROLE_TEACHER)
  })) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to restore class');
  }

  await setDoc(getClassDocRef(classOwnerId, normalizedClassId), buildClassDocMetadataPatch(classOwnerId, normalizedClassId, updatedAt, {
    name: classEntry.name,
    createdAt: classEntry.createdAt || null,
    deleted: false,
    deletedAt: null,
    ownerName: classEntry.ownerName || getAuthenticatedUserDisplayName(),
    ownerRole: normalizeRole(classEntry.ownerRole || ROLE_TEACHER)
  }), { merge: true });

  const nextClasses = sortClasses([
    ...classes.filter(entry => entry.id !== normalizedClassId),
    {
      id: normalizedClassId,
      name: classEntry.name,
      createdAt: classEntry.createdAt || null,
      ownerId: classOwnerId,
      ownerName: classEntry.ownerName || getAuthenticatedUserDisplayName(),
      ownerRole: normalizeRole(classEntry.ownerRole || ROLE_TEACHER)
    }
  ]);
  const nextTrashClasses = sortClassTrashEntries(trashClasses.filter(entry => entry.id !== normalizedClassId));
  writeClassCatalogCache(cacheScopeKey, nextClasses, nextTrashClasses);
  globalClassCatalogCache.loadedAt = 0;

  const { classId: nextClassId, className: nextClassName } = resolveActiveClassModel(userId, nextClasses);
  await mergeUserRootMetadata(userId, {
    userId,
    activeClassId: nextClassId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: false,
    updatedAt
  });

  return {
    classes: nextClasses,
    trashClasses: nextTrashClasses,
    currentClassId: nextClassId,
    currentClassName: nextClassName,
    allowEmptyClassCatalog: false
  };
};

export const permanentlyDeleteClass = async (classId) => {
  assertWritableRole('permanently delete class');
  const userId = await ensureAuthenticatedUserId('permanently delete class');
  const cacheScopeKey = getFetchScopeKey(userId);
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedClassId) {
    throw new Error('Class id is required');
  }

  const catalog = await ensureClassCatalog(userId);
  const classes = catalog.classes || [];
  const trashClasses = catalog.trashClasses || [];
  const classEntry = trashClasses.find(entry => entry.id === normalizedClassId);
  if (!classEntry) {
    throw new Error('Class must be in trash before permanent deletion');
  }
  const classOwnerId = normalizeUserId(classEntry.ownerId || '');
  if (!classOwnerId) {
    throw createContextError(ERROR_CODES.MISSING_OWNER_ID, 'Class owner metadata is missing');
  }
  if (!canRoleWrite({
    role: getCurrentUserRoleContext(),
    permissions: currentUserPermissionsContext,
    actorUserId: userId,
    ownerId: classOwnerId,
    ownerRole: normalizeRole(classEntry.ownerRole || ROLE_TEACHER)
  })) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'You do not have permission to permanently delete class');
  }

  await Promise.all([
    deleteCollectionDocuments(getStudentsCollectionRef(classOwnerId, normalizedClassId)),
    deleteCollectionDocuments(getSubjectsCollectionRef(classOwnerId, normalizedClassId)),
    deleteCollectionDocuments(getExamsCollectionRef(classOwnerId, normalizedClassId))
  ]);
  await deleteDoc(getClassDocRef(classOwnerId, normalizedClassId));

  const updatedAt = new Date().toISOString();
  const nextTrashClasses = sortClassTrashEntries(trashClasses.filter(entry => entry.id !== normalizedClassId));
  writeClassCatalogCache(cacheScopeKey, classes, nextTrashClasses);
  globalClassCatalogCache.loadedAt = 0;

  const { classId: nextClassId, className: nextClassName } = resolveActiveClassModel(userId, classes);
  await mergeUserRootMetadata(userId, {
    userId,
    activeClassId: nextClassId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: classes.length === 0,
    updatedAt
  });

  return {
    classes,
    trashClasses: nextTrashClasses,
    currentClassId: nextClassId,
    currentClassName: nextClassName,
    allowEmptyClassCatalog: classes.length === 0
  };
};

export const saveAllData = async (rawData) => enqueueWrite(() => persistRemoteFirst(rawData, 'save data'));

export const saveStudent = async (rawData, studentData) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const nextStudent = studentData && typeof studentData === 'object' ? clone(studentData) : {};
  nextStudent.name = assertValidStudentName(nextStudent.name);
  if (Object.prototype.hasOwnProperty.call(nextStudent, 'scores')) {
    nextStudent.scores = normalizeStudentScoresForRawData(next, nextStudent.scores || {});
  }
  next.students.push(nextStudent);
  return persistStudentCreate(nextStudent, next);
});

export const saveBulkStudents = async (rawData, studentEntries = []) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const normalizedEntries = asArray(studentEntries).map((entry) => {
    const nextStudent = entry && typeof entry === 'object' ? clone(entry) : {};
    nextStudent.name = assertValidStudentName(nextStudent.name);
    if (Object.prototype.hasOwnProperty.call(nextStudent, 'scores')) {
      nextStudent.scores = normalizeStudentScoresForRawData(next, nextStudent.scores || {});
    }
    return nextStudent;
  });

  if (!normalizedEntries.length) {
    return {
      data: next,
      remoteSaved: true,
      error: null,
      errorType: null,
      operation: 'save bulk students',
      offline: false
    };
  }

  next.students = next.students.concat(normalizedEntries);
  return persistBulkStudentCreate(normalizedEntries, next);
});

export const updateStudent = async (rawData, studentId, studentData) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const nextStudentData = studentData && typeof studentData === 'object' ? clone(studentData) : {};
  if (Object.prototype.hasOwnProperty.call(nextStudentData, 'name')) {
    nextStudentData.name = assertValidStudentName(nextStudentData.name);
  }
  if (Object.prototype.hasOwnProperty.call(nextStudentData, 'scores')) {
    nextStudentData.scores = normalizeStudentScoresForRawData(next, nextStudentData.scores || {});
  }
  const idx = next.students.findIndex(student => student.id === studentId);
  if (idx !== -1) {
    next.students[idx] = { ...next.students[idx], ...nextStudentData };
  }
  return persistStudentUpdateById(studentId, nextStudentData, next);
});

export const deleteStudent = async (rawData, studentId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  next.students = next.students.filter(student => student.id !== studentId);
  const studentMeta = asArray(rawData?.students).find(student => student?.id === studentId) || {};
  return persistStudentDeleteById(studentId, next, studentMeta);
});

export const restoreStudent = async (rawData, studentId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  return persistStudentRestoreById(studentId, next);
});

export const permanentlyDeleteStudent = async (rawData, studentId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  return persistStudentHardDeleteById(studentId, next);
});

export const deleteAdminRegistryStudent = async ({ ownerId = '', studentId = '', studentName = '' } = {}) => enqueueWrite(async () => {
  await ensureAuthenticatedUserId('delete registry student');
  const actorRole = assertDeveloperRole('delete student records from the registry');
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedStudentId = String(studentId || '').trim();
  const normalizedStudentName = normalizeStudentName(studentName, 'Student');
  if (!normalizedOwnerId) {
    throw new Error('Owner id is required to delete registry student');
  }
  if (!normalizedStudentId) {
    throw new Error('Student id is required to delete registry student');
  }

  const matches = await findStudentDocumentRefsByIdentity(normalizedOwnerId, normalizedStudentId);
  if (!matches.length) {
    return {
      ownerId: normalizedOwnerId,
      studentId: normalizedStudentId,
      studentName: normalizedStudentName,
      deletedCount: 0
    };
  }

  const updatedAt = new Date().toISOString();
  await Promise.all(matches.map(({ ref, classId = '' }) => {
    const patch = {
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt,
      userId: normalizedOwnerId,
      ownerId: normalizedOwnerId
    };
    if (classId) {
      patch.classId = classId;
    }
    return updateDoc(ref, patch);
  }));

  const uniqueClassIds = Array.from(new Set(matches.map((entry) => normalizeClassId(entry?.classId || '')).filter(Boolean)));
  const metadataResults = await Promise.allSettled([
    ...uniqueClassIds.map((classId) => setDoc(
      getClassDocRef(normalizedOwnerId, classId),
      buildClassDocMetadataPatch(normalizedOwnerId, classId, updatedAt),
      { merge: true }
    )),
    setDoc(getUserRootRef(normalizedOwnerId), {
      userId: normalizedOwnerId,
      updatedAt
    }, { merge: true })
  ]);
  metadataResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.warn('Ignoring admin registry metadata sync failure:', result.reason);
    }
  });
  await logActivity('student_deleted', normalizedStudentId, 'student', {
    ownerId: normalizedOwnerId,
    dataOwnerUserId: normalizedOwnerId,
    targetLabel: normalizedStudentName,
    userRole: actorRole
  });

  return {
    ownerId: normalizedOwnerId,
    studentId: normalizedStudentId,
    studentName: normalizedStudentName,
    deletedCount: matches.length
  };
});

export const clearActivityLogs = async () => enqueueWrite(async () => {
  await ensureAuthenticatedUserId('clear activity logs');
  assertDeveloperRole('clear activity logs');
  if (!isFirebaseConfigured || !db) {
    return 0;
  }

  const logsSnapshot = await getDocs(query(
    collection(db, ACTIVITY_LOGS_COLLECTION),
    orderBy('timestamp', 'desc')
  ));
  if (!logsSnapshot.docs.length) {
    return 0;
  }

  await Promise.all(logsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
  return logsSnapshot.docs.length;
});

export const fetchStudentTrash = async () => {
  return fetchStudentTrashList();
};

export const cleanupDeletedStudents = async (days = TRASH_RETENTION_DAYS) => {
  return cleanupDeletedStudentsOlderThan(days);
};

export const saveScores = async (rawData, studentId, scores) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const normalizedScores = normalizeStudentScoresForRawData(next, scores || {});
  const student = next.students.find(item => item.id === studentId);
  if (student) {
    student.scores = normalizedScores;
  }
  return persistStudentUpdateById(studentId, { scores: normalizedScores }, next);
});

export const saveBulkStudentScores = async (rawData, studentScoreEntries = []) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const normalizedEntries = asArray(studentScoreEntries).map((entry) => {
    const normalizedStudentId = String(entry?.id || entry?.studentId || '').trim();
    if (!normalizedStudentId) {
      return null;
    }

    const normalizedPatch = normalizeStudentPatch({ scores: entry?.scores || {} }, next);
    if (!Object.prototype.hasOwnProperty.call(normalizedPatch, 'scores')) {
      return null;
    }

    return {
      studentId: normalizedStudentId,
      scores: normalizedPatch.scores
    };
  }).filter(Boolean);

  normalizedEntries.forEach(({ studentId, scores }) => {
    const studentIndex = next.students.findIndex((student) => String(student?.id || '').trim() === studentId);
    if (studentIndex !== -1) {
      next.students[studentIndex] = {
        ...next.students[studentIndex],
        scores
      };
    }
  });

  return persistBulkStudentScoreUpdates(normalizedEntries, next);
});

export const updateSubjects = async (rawData, subjects) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  next.subjects = asArray(subjects)
    .map((subject, index) => normalizeSubjectRecord(subject, index))
    .filter(Boolean);
  return persistRemoteFirst(next, 'update subjects');
});

export const deleteSubject = async (rawData, subjectIdentity) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const normalizedId = String(subjectIdentity?.id || subjectIdentity || '').trim();
  const normalizedName = String(subjectIdentity?.name || '').trim();

  next.subjects = next.subjects.filter((subject) => {
    const subjectId = String(subject?.id || '').trim();
    const subjectName = String(subject?.name || '').trim();
    if (normalizedId && subjectId === normalizedId) {
      return false;
    }
    if (normalizedName && subjectName === normalizedName) {
      return false;
    }
    return true;
  });

  return persistSubjectDeleteByIdentity({ id: normalizedId, name: normalizedName }, next);
});

export const restoreSubject = async (rawData, subjectId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  return persistSubjectRestoreById(subjectId, next);
});

export const permanentlyDeleteSubject = async (rawData, subjectId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  return persistSubjectHardDeleteById(subjectId, next);
});

export const updateExams = async (rawData, exams) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  next.exams = asArray(exams)
    .map((exam, index) => normalizeExamRecord(exam, index))
    .filter(Boolean);
  return persistRemoteFirst(next, 'update exams');
});

export const deleteExam = async (rawData, examIdentity) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const normalizedId = String(examIdentity?.id || examIdentity || '').trim();
  const normalizedTitle = String(examIdentity?.title || examIdentity?.name || '').trim();

  next.exams = next.exams.filter((exam) => {
    const examId = String(exam?.id || '').trim();
    const examTitle = String(exam?.title || exam?.name || '').trim();
    if (normalizedId && examId === normalizedId) {
      return false;
    }
    if (normalizedTitle && examTitle === normalizedTitle) {
      return false;
    }
    return true;
  });

  return persistExamDeleteByIdentity({ id: normalizedId, title: normalizedTitle }, next);
});

export const restoreExam = async (rawData, examId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  return persistExamRestoreById(examId, next);
});

export const permanentlyDeleteExam = async (rawData, examId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  return persistExamHardDeleteById(examId, next);
});
