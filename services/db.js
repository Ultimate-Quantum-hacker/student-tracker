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
  isFirebaseConfigured,
  auth,
  authReadyPromise,
  onAuthStateChanged
} from '../js/firebase.js';

const CACHE_KEY_PREFIX = 'studentAppData';
const USERS_COLLECTION = 'users';
const CLASSES_SUBCOLLECTION = 'classes';
const STUDENTS_SUBCOLLECTION = 'students';
const SUBJECTS_SUBCOLLECTION = 'subjects';
const EXAMS_SUBCOLLECTION = 'exams';
const ACTIVITY_LOGS_COLLECTION = 'activityLogs';
const DEFAULT_CLASS_NAME = 'My Class';
const TRASH_RETENTION_DAYS = 3;
const MAX_ACTIVITY_LOGS = 100;
const ACTIVITY_LOG_FETCH_LIMIT = MAX_ACTIVITY_LOGS;
const CLASS_MIGRATION_VERSION = 2;
const DEVELOPER_ACCOUNT_EMAIL = 'pokumike2@gmail.com';

const ERROR_CODES = {
  READ_ONLY_MODE: 'READ_ONLY_MODE',
  CLASS_NOT_FOUND: 'CLASS_NOT_FOUND',
  INVALID_OWNER: 'INVALID_OWNER',
  MIGRATION_FAILED: 'MIGRATION_FAILED',
  INVALID_CLASS_CONTEXT: 'INVALID_CLASS_CONTEXT',
  MISSING_CLASS_ID: 'MISSING_CLASS_ID',
  MISSING_OWNER_ID: 'MISSING_OWNER_ID'
};

let currentClassId = '';
let currentClassOwnerId = '';
let currentClassOwnerName = '';
let currentUserRoleContext = 'teacher';
let globalClassCatalogCache = {
  ownerUserId: '',
  classes: [],
  trashClasses: [],
  loadedAt: 0
};
const GLOBAL_CLASS_CACHE_TTL_MS = 60 * 1000;
const ALLOW_EMPTY_CLASS_CATALOG_FIELD = 'allowEmptyClassCatalog';

const createDefaultRawData = () => ({
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
const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'developer') return 'developer';
  return 'teacher';
};
const isDeveloperAccountEmailValue = (value = '') => String(value || '').trim().toLowerCase() === DEVELOPER_ACCOUNT_EMAIL;

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

const normalizeRawData = (rawData) => {
  const input = rawData && typeof rawData === 'object' ? rawData : createDefaultRawData();

  return {
    students: asArray(input.students).map((student) => ({
      id: student?.id,
      name: normalizeStudentName(student?.name),
      notes: student?.notes || '',
      class: student?.class || '',
      scores: student?.scores && typeof student.scores === 'object' ? clone(student.scores) : {}
    })),
    subjects: asArray(input.subjects)
      .map(subject => String(subject?.name || subject || '').trim())
      .filter(Boolean),
    exams: asArray(input.exams)
      .map(exam => String(exam?.title || exam?.name || exam || '').trim())
      .filter(Boolean)
  };

};

const parseCache = (raw) => {
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

const withTimestamp = (data) => ({
  data: normalizeRawData(data),
  lastUpdated: new Date().toISOString()
});

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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

const canRoleWrite = (role = getCurrentUserRoleContext()) => {
  return normalizeRole(role) !== 'admin';
};

const assertWritableRole = (operationLabel = 'modify data') => {
  const role = getCurrentUserRoleContext();
  console.log('ROLE:', role);
  console.log('CAN WRITE:', canRoleWrite(role));
  if (!canRoleWrite(role)) {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `Admin read-only mode: cannot ${operationLabel}`);
  }
};

const assertAdminOrDeveloperRole = (operationLabel = 'manage admin data') => {
  const role = getCurrentUserRoleContext();
  if (role !== 'admin' && role !== 'developer') {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, `Only admins or developers can ${operationLabel}`);
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

  if (!classPayload || classPayload.deleted === true) {
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
  const ownerName = normalizeDisplayName(classPayload?.ownerName || classContext?.classOwnerName || 'Teacher', 'Teacher');
  setCurrentClassContext(classId, actorUserId, ownerId, ownerName);

  return {
    actorUserId,
    classId,
    ownerId,
    className,
    ownerName,
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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId,
        ownerId: userId
      }, { merge: true });

      await setDoc(getUserRootRef(userId), {
        userId,
        activeClassId: classId,
        updatedAt
      }, { merge: true });

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

  const cutoff = Date.now() - (Math.max(Number(days) || TRASH_RETENTION_DAYS, 1) * 24 * 60 * 60 * 1000);
  const expiredIds = studentTrash
    .filter(entry => {
      const time = new Date(entry.deletedAt || 0).getTime();
      return Number.isFinite(time) && time > 0 && time < cutoff;
    })
    .map(entry => entry.id);

  if (!expiredIds.length) {
    return 0;
  }

  for (const studentId of expiredIds) {
    const fallback = createDefaultRawData();
    await persistStudentHardDeleteById(studentId, fallback);
  }

  return expiredIds.length;
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

const toDocId = (prefix, label, index) => {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}_${slug || index + 1}_${index + 1}`;
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

export const setCurrentUserRoleContext = (role = 'teacher') => {
  currentUserRoleContext = normalizeRole(role);
  return currentUserRoleContext;
};

export const getCurrentUserRoleContext = () => {
  return normalizeRole(currentUserRoleContext);
};

export const setCurrentClassOwnerContext = (ownerId = '', ownerName = '') => {
  currentClassOwnerId = normalizeUserId(ownerId);
  currentClassOwnerName = normalizeDisplayName(ownerName, currentClassOwnerName || 'Teacher');
  return {
    ownerId: currentClassOwnerId,
    ownerName: currentClassOwnerName
  };
};

export const getCurrentClassOwnerContext = () => {
  return {
    ownerId: normalizeUserId(currentClassOwnerId),
    ownerName: normalizeDisplayName(currentClassOwnerName, 'Teacher')
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
const normalizeStudentName = (value, fallback = '') => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return normalized || fallback;
};
const STUDENT_NAME_PATTERN = /^[A-Z\s]+$/;
const assertValidStudentName = (value) => {
  const normalized = normalizeStudentName(value);
  if (!normalized) {
    throw new Error('Student name is required');
  }
  if (!STUDENT_NAME_PATTERN.test(normalized)) {
    throw new Error('Student names can only contain letters and spaces');
  }
  return normalized;
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

const setCurrentClassContext = (classId, userId = getAuthenticatedUserId(), ownerId = '', ownerName = '') => {
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
  return {
    id,
    name: normalizeClassName(payload.name || payload.title || DEFAULT_CLASS_NAME),
    createdAt: payload.createdAt || null,
    ownerId,
    ownerName
  };
};

const toClassTrashEntry = (classId, payload = {}) => {
  const id = normalizeClassId(classId);
  const ownerId = normalizeUserId(payload.ownerId || payload.userId || payload.uid || '');
  const ownerName = normalizeDisplayName(payload.ownerName || payload.userName || payload.teacherName || '', 'Teacher');
  return {
    id,
    name: normalizeClassName(payload.name || payload.title || DEFAULT_CLASS_NAME),
    createdAt: payload.createdAt || null,
    deletedAt: normalizeDeletedAtValue(payload.deletedAt),
    ownerId,
    ownerName
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
  setCurrentClassContext(nextClassId, userId, nextClass?.ownerId || '', nextClass?.ownerName || '');
  return nextClassId;
};

const getClassCatalogCacheKeyForUser = (userId) => `${CACHE_KEY_PREFIX}:classes:${userId}`;

const writeClassCatalogCache = (userId, classes = [], trashClasses = []) => {
  if (!userId || typeof localStorage === 'undefined') return;
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
const getStudentsCollectionRef = (userId, classId = getCurrentClassContext()) => getClassStudentsCollectionRef(userId, normalizeClassId(classId));
const getSubjectsCollectionRef = (userId, classId = getCurrentClassContext()) => getClassSubjectsCollectionRef(userId, normalizeClassId(classId));
const getExamsCollectionRef = (userId, classId = getCurrentClassContext()) => getClassExamsCollectionRef(userId, normalizeClassId(classId));
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
      subjects.push(name);
    }
  });

  const exams = [];
  examsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) return;
    const title = String(payload.title || payload.name || entry.id || '').trim();
    if (title) {
      exams.push(title);
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

  await setDoc(getUserRootRef(userId), {
    uid: userId,
    classMigrationStatus: String(status || '').trim() || 'unknown',
    classMigrationVersion: CLASS_MIGRATION_VERSION,
    classMigrationComplete: status === 'completed',
    classMigrationUpdatedAt: new Date().toISOString(),
    ...extra
  }, { merge: true });
};

const readUserRootData = async (userId) => {
  if (!isFirebaseConfigured || !db || !userId) {
    return {};
  }

  const snapshot = await getDoc(getUserRootRef(userId));
  return snapshot.exists() ? (snapshot.data() || {}) : {};
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

  await setDoc(classDocRef, {
    id: classId,
    name: DEFAULT_CLASS_NAME,
    createdAt,
    updatedAt: createdAt,
    deleted: false,
    deletedAt: null,
    userId,
    ownerId: userId,
    ownerName
  });

  await setDoc(getUserRootRef(userId), {
    uid: userId,
    activeClassId: classId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: false,
    updatedAt: createdAt
  }, { merge: true });

  return toClassModel(classId, {
    id: classId,
    name: DEFAULT_CLASS_NAME,
    createdAt,
    ownerId: userId,
    ownerName
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

    await updateMigrationState(userId, 'completed', {
      classMigrationError: null,
      classMigrationCompletedAt: new Date().toISOString(),
      classMigrationCountsLegacy: legacyCounts,
      classMigrationCountsClass: classCountsAfterSync,
      activeClassId: classId,
      updatedAt: new Date().toISOString()
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

const mapStudentsToDocs = (students, ownerId, classId, updatedAt) => {
  return asArray(students).map((student, index) => {
    const id = String(student?.id || '').trim() || toDocId('student', student?.name || 'student', index);
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
  return asArray(subjects).map((subject, index) => {
    const name = String(subject || '').trim();
    const docId = toDocId('sub', name, index);
    return {
      id: docId,
      data: {
        id: docId,
        name,
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

const mapExamsToDocs = (exams, ownerId, classId, updatedAt) => {
  return asArray(exams).map((exam, index) => {
    const title = String(exam || '').trim();
    const docId = toDocId('exam', title, index);
    return {
      id: docId,
      data: {
        id: docId,
        title,
        name: title,
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

  await setDoc(getClassDocRef(normalizedOwnerId, normalizedClassId), {
    id: normalizedClassId,
    updatedAt,
    userId: normalizedOwnerId,
    ownerId: normalizedOwnerId
  }, { merge: true });

  await setDoc(getUserRootRef(normalizedOwnerId), {
    userId: normalizedOwnerId,
    updatedAt,
    activeClassId: normalizedClassId
  }, { merge: true });

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
    exams.push({
      title: String(payload.title || payload.name || '').trim(),
      order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : Number.MAX_SAFE_INTEGER
    });
  });
  exams.sort((a, b) => a.order - b.order);

  const data = normalizeRawData({
    students: students.map(({ id, name, notes, class: className, scores }) => ({ id, name, notes, class: className, scores })),
    subjects: subjects.map((subject) => subject.name),
    exams: exams.map((exam) => exam.title)
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

  const normalizeLogTimestamp = (payload = {}) => {
    return toIsoDateString(payload.timestamp)
      || toIsoDateString(payload.createdAt)
      || toIsoDateString(payload.time)
      || toIsoDateString(payload.date)
      || null;
  };

  const payload = entry?.data() || {};
  const timestampIso = normalizeLogTimestamp(payload);
  const normalizedTargetType = normalizeLogScalar(payload.targetType || payload.entity || payload.target?.type || 'record', 'record').toLowerCase();
  const normalizedStudentId = normalizeLogScalar(payload.studentId || payload.targetId || payload.target?.id || '');
  const normalizedStudentName = normalizeStudentName(payload.studentName || payload.targetLabel || payload.target?.label || payload.target?.name || payload.targetName || '');
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
    action: normalizeLogScalar(payload.action || payload.event || payload.type || '').toLowerCase(),
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

const trimActivityLogCollection = async () => {
  if (!isFirebaseConfigured || !db) {
    return 0;
  }

  const logsSnapshot = await getDocs(query(
    collection(db, ACTIVITY_LOGS_COLLECTION),
    orderBy('timestamp', 'desc')
  ));
  const overflowEntries = logsSnapshot.docs.slice(MAX_ACTIVITY_LOGS);
  if (!overflowEntries.length) {
    return 0;
  }

  await Promise.all(overflowEntries.map((entry) => deleteDoc(entry.ref)));
  return overflowEntries.length;
};

const logActivity = async (action, targetId, targetType, options = {}) => {
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

    try {
      await trimActivityLogCollection();
    } catch (error) {
      console.warn('Failed to trim activity logs:', error);
    }

    return true;
  } catch (error) {
    console.warn('Failed to write activity log entry:', error);
    return false;
  }
};

export const fetchActivityLogs = async ({ userId = '', sort = 'desc', maxEntries = MAX_ACTIVITY_LOGS } = {}) => {
  await ensureAuthenticatedUserId('read activity logs');
  if (!isFirebaseConfigured || !db) {
    return [];
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
  if (!userId) {
    return null;
  }

  const persistedSelection = readPersistedClassSelection(userId);
  const scopedClassId = normalizeClassId(classId) || getCurrentClassContext() || normalizeClassId(persistedSelection.classId || '');
  const cached = parseCache(localStorage.getItem(getCacheKeyForUser(userId, scopedClassId)));
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
  if (!userId) {
    return null;
  }

  const persistedSelection = readPersistedClassSelection(userId);
  const scopedClassId = normalizeClassId(classId) || getCurrentClassContext() || normalizeClassId(persistedSelection.classId || '');
  const cacheEnvelope = withTimestamp(rawData);
  localStorage.setItem(getCacheKeyForUser(userId, scopedClassId), JSON.stringify(cacheEnvelope));
  return {
    ...cacheEnvelope,
    classId: scopedClassId
  };
};

export const fetchAllData = async () => {
  let userId = '';
  let authUserId = '';
  const role = getCurrentUserRoleContext();
  const getScopeKey = () => {
    const scopedAuthId = authUserId || getAuthenticatedUserId() || userId;
    return role === 'admin' ? `${scopedAuthId}:admin-global` : scopedAuthId;
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

  if (!isFirebaseConfigured || !db) {
    console.warn('Firebase unavailable. Falling back to cache/default data.');
    const cacheScopeKey = getScopeKey();
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
        offline: false,
        error: null,
        errorType: 'config',
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
      offline: false,
      error: null,
      errorType: 'config',
      allowEmptyClassCatalog
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classContext = await ensureActiveClassContext(userId, { requireClass: false });
      const scopedClasses = classContext.classes || [];
      const scopedTrashClasses = classContext.trashClasses || [];
      const scopedClassId = classContext.classId;
      const scopedClassName = classContext.className;
      const scopedOwnerId = normalizeUserId(classContext.classOwnerId || '');
      const cacheScopeKey = getScopeKey();

      if (!scopedClassId) {
        return {
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
          allowEmptyClassCatalog: Boolean(classContext?.allowEmptyClassCatalog)
        };
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
      return {
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
        allowEmptyClassCatalog: Boolean(classContext?.allowEmptyClassCatalog)
      };
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
  const cacheScopeKey = getScopeKey();
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

export const setCurrentClassId = (classId) => {
  return setCurrentClassContext(classId);
};

export const getCurrentClassId = () => {
  return getCurrentClassContext();
};

export const fetchClassCatalog = async () => {
  const userId = await ensureAuthenticatedUserId('fetch class catalog');
  const role = getCurrentUserRoleContext();
  const cacheScopeKey = role === 'admin' ? `${userId}:admin-global` : userId;

  if (!isFirebaseConfigured || !db) {
    const cachedClasses = readClassCatalogCache(cacheScopeKey);
    const cachedTrashClasses = readClassTrashCache(cacheScopeKey);
    const allowEmptyClassCatalog = inferAllowEmptyClassCatalog(cachedClasses, cachedTrashClasses);
    const { classId, className } = resolveActiveClassModel(userId, cachedClasses);
    const persistedSelection = readPersistedClassSelection(userId);
    const activeClass = findClassEntryBySelection(cachedClasses, classId, currentClassOwnerId || persistedSelection.ownerId || '') || null;
    setCurrentClassContext(classId, userId, activeClass?.ownerId || '', activeClass?.ownerName || '');
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
  setCurrentClassContext(classId, userId, activeClass?.ownerId || '', activeClass?.ownerName || '');
  writeClassCatalogCache(cacheScopeKey, classes, trashClasses);
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

  const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
  const users = [];

  usersSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    const uid = normalizeUserId(payload.uid || payload.userId || entry.id || '');
    if (!uid) {
      return;
    }

    const email = String(payload.email || '').trim().toLowerCase();
    const role = isDeveloperAccountEmailValue(email)
      ? 'developer'
      : normalizeRole(payload.role || 'teacher');

    users.push({
      uid,
      name: normalizeDisplayName(payload.name || payload.displayName || email || 'Teacher', 'Teacher'),
      email,
      role,
      createdAt: payload.createdAt || payload.updatedAt || null,
      status: String(payload.status || '').trim().toLowerCase() || 'active'
    });
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

  const snapshot = await getDocs(collectionGroup(db, STUDENTS_SUBCOLLECTION));
  const dedupedStudents = new Map();

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
      userRole: normalizeRole(payload.userRole || payload.role || 'teacher'),
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

  const [usersSnapshot, students, examsSnapshot] = await Promise.all([
    getDocs(collection(db, USERS_COLLECTION)),
    fetchGlobalStudentSearchIndex(),
    getDocs(collectionGroup(db, EXAMS_SUBCOLLECTION))
  ]);

  let totalExams = 0;
  examsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    if (payload.deleted === true) {
      return;
    }
    totalExams += 1;
  });

  return {
    totalUsers: usersSnapshot.size,
    totalStudents: Array.isArray(students) ? students.length : 0,
    totalExams
  };
};

export const updateAdminUserRole = async ({ uid = '', name = '', email = '', role = 'teacher' } = {}) => {
  await ensureAuthenticatedUserId('update user role');
  if (getCurrentUserRoleContext() !== 'developer') {
    throw createContextError(ERROR_CODES.READ_ONLY_MODE, 'Only developers can update user roles');
  }
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const normalizedUid = normalizeUserId(uid);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedUid) {
    throw new Error('User id is required');
  }

  const normalizedRole = isDeveloperAccountEmailValue(normalizedEmail)
    ? 'developer'
    : normalizeRole(role);
  const updatedAt = new Date().toISOString();

  await setDoc(getUserRootRef(normalizedUid), {
    uid: normalizedUid,
    userId: normalizedUid,
    name: normalizeDisplayName(name || normalizedEmail || 'Teacher', 'Teacher'),
    email: normalizedEmail,
    role: normalizedRole,
    updatedAt
  }, { merge: true });

  return {
    uid: normalizedUid,
    role: normalizedRole
  };
};

export const createClass = async (className) => {
  assertWritableRole('create class');
  const userId = await ensureAuthenticatedUserId('create class');
  const normalizedName = normalizeClassName(className, DEFAULT_CLASS_NAME);
  const createdAt = new Date().toISOString();
  const ownerName = getAuthenticatedUserDisplayName();

  const classDocRef = doc(getClassesCollectionRef(userId));
  const classId = normalizeClassId(classDocRef.id);

  await setDoc(classDocRef, {
    id: classId,
    name: normalizedName,
    createdAt,
    updatedAt: createdAt,
    deleted: false,
    deletedAt: null,
    userId,
    ownerId: userId,
    ownerName
  });

  const catalog = await ensureClassCatalog(userId);
  const classes = catalog.classes || [];
  const trashClasses = catalog.trashClasses || [];
  const nextClasses = sortClasses([...classes.filter(entry => entry.id !== classId), {
    id: classId,
    name: normalizedName,
    createdAt,
    ownerId: userId,
    ownerName
  }]);
  writeClassCatalogCache(userId, nextClasses, trashClasses);
  globalClassCatalogCache.loadedAt = 0;
  setCurrentClassContext(classId, userId, userId, ownerName);

  await setDoc(getUserRootRef(userId), {
    userId,
    activeClassId: classId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: false,
    updatedAt: createdAt
  }, { merge: true });

  return {
    class: toClassModel(classId, { name: normalizedName, createdAt, ownerId: userId, ownerName }),
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
      ownerName: classEntry?.ownerName || getAuthenticatedUserDisplayName()
    };
  });

  await Promise.all(deletedEntries.map((classEntry) => {
    return setDoc(getClassDocRef(classEntry.ownerId, classEntry.id), {
      id: classEntry.id,
      name: classEntry.name,
      createdAt: classEntry.createdAt || null,
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt,
      userId: classEntry.ownerId,
      ownerId: classEntry.ownerId,
      ownerName: classEntry.ownerName || getAuthenticatedUserDisplayName()
    }, { merge: true });
  }));

  const nextTrashClasses = sortClassTrashEntries([
    ...deletedEntries,
    ...trashClasses.filter(entry => !normalizedClassIds.includes(entry.id))
  ]);
  writeClassCatalogCache(userId, remainingClasses, nextTrashClasses);
  globalClassCatalogCache.loadedAt = 0;

  const { classId: nextClassId, className: nextClassName } = resolveActiveClassModel(userId, remainingClasses);
  const allowEmptyClassCatalog = remainingClasses.length === 0;

  await setDoc(getUserRootRef(userId), {
    userId,
    activeClassId: nextClassId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: allowEmptyClassCatalog,
    updatedAt
  }, { merge: true });

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

  await setDoc(getClassDocRef(classOwnerId, normalizedClassId), {
    id: normalizedClassId,
    name: classEntry.name,
    createdAt: classEntry.createdAt || null,
    deleted: false,
    deletedAt: null,
    updatedAt,
    userId: classOwnerId,
    ownerId: classOwnerId,
    ownerName: classEntry.ownerName || getAuthenticatedUserDisplayName()
  }, { merge: true });

  const nextClasses = sortClasses([
    ...classes.filter(entry => entry.id !== normalizedClassId),
    {
      id: normalizedClassId,
      name: classEntry.name,
      createdAt: classEntry.createdAt || null,
      ownerId: classOwnerId,
      ownerName: classEntry.ownerName || getAuthenticatedUserDisplayName()
    }
  ]);
  const nextTrashClasses = sortClassTrashEntries(trashClasses.filter(entry => entry.id !== normalizedClassId));
  writeClassCatalogCache(userId, nextClasses, nextTrashClasses);
  globalClassCatalogCache.loadedAt = 0;

  const { classId: nextClassId, className: nextClassName } = resolveActiveClassModel(userId, nextClasses);
  await setDoc(getUserRootRef(userId), {
    userId,
    activeClassId: nextClassId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: false,
    updatedAt
  }, { merge: true });

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

  await Promise.all([
    deleteCollectionDocuments(getStudentsCollectionRef(classOwnerId, normalizedClassId)),
    deleteCollectionDocuments(getSubjectsCollectionRef(classOwnerId, normalizedClassId)),
    deleteCollectionDocuments(getExamsCollectionRef(classOwnerId, normalizedClassId))
  ]);
  await deleteDoc(getClassDocRef(classOwnerId, normalizedClassId));

  const updatedAt = new Date().toISOString();
  const nextTrashClasses = sortClassTrashEntries(trashClasses.filter(entry => entry.id !== normalizedClassId));
  writeClassCatalogCache(userId, classes, nextTrashClasses);
  globalClassCatalogCache.loadedAt = 0;

  const { classId: nextClassId, className: nextClassName } = resolveActiveClassModel(userId, classes);
  await setDoc(getUserRootRef(userId), {
    userId,
    activeClassId: nextClassId,
    [ALLOW_EMPTY_CLASS_CATALOG_FIELD]: classes.length === 0,
    updatedAt
  }, { merge: true });

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
  next.students.push(nextStudent);
  return persistRemoteFirst(next, 'save student');
});

export const updateStudent = async (rawData, studentId, studentData) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const nextStudentData = studentData && typeof studentData === 'object' ? clone(studentData) : {};
  if (Object.prototype.hasOwnProperty.call(nextStudentData, 'name')) {
    nextStudentData.name = assertValidStudentName(nextStudentData.name);
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
  const actorRole = assertAdminOrDeveloperRole('delete student records from the registry');
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
    ...uniqueClassIds.map((classId) => setDoc(getClassDocRef(normalizedOwnerId, classId), {
      id: classId,
      updatedAt,
      userId: normalizedOwnerId,
      ownerId: normalizedOwnerId
    }, { merge: true })),
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
  assertAdminOrDeveloperRole('clear activity logs');
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
  const student = next.students.find(item => item.id === studentId);
  if (student) {
    student.scores = scores && typeof scores === 'object' ? clone(scores) : {};
  }
  return persistRemoteFirst(next, 'save scores');
});

export const updateSubjects = async (rawData, subjects) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  next.subjects = asArray(subjects)
    .map(subject => String(subject?.name || subject || '').trim())
    .filter(Boolean);
  return persistRemoteFirst(next, 'update subjects');
});

export const deleteSubject = async (rawData, subjectIdentity) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const normalizedId = String(subjectIdentity?.id || subjectIdentity || '').trim();
  const normalizedName = String(subjectIdentity?.name || '').trim();

  if (normalizedName) {
    next.subjects = next.subjects.filter(subject => String(subject || '').trim() !== normalizedName);
  }

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
    .map(exam => String(exam?.title || exam?.name || exam || '').trim())
    .filter(Boolean);
  return persistRemoteFirst(next, 'update exams');
});

export const deleteExam = async (rawData, examIdentity) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const normalizedId = String(examIdentity?.id || examIdentity || '').trim();
  const normalizedTitle = String(examIdentity?.title || examIdentity?.name || '').trim();

  if (normalizedTitle) {
    next.exams = next.exams.filter(exam => String(exam || '').trim() !== normalizedTitle);
  }

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
