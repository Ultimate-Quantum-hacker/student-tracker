/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — services/db.js
   Centralized Firestore-first data access with cache fallback.
   ═══════════════════════════════════════════════ */

import { db, doc, collection, addDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, isFirebaseConfigured, auth, authReadyPromise, onAuthStateChanged } from '../js/firebase.js';

const CACHE_KEY_PREFIX = 'studentAppData';
const USERS_COLLECTION = 'users';
const CLASSES_SUBCOLLECTION = 'classes';
const STUDENTS_SUBCOLLECTION = 'students';
const SUBJECTS_SUBCOLLECTION = 'subjects';
const EXAMS_SUBCOLLECTION = 'exams';
const DEFAULT_CLASS_NAME = 'My Class';
const TRASH_RETENTION_DAYS = 3;

let currentClassId = '';

const createDefaultRawData = () => ({
  students: [],
  subjects: [],
  exams: []
});

let writeChain = Promise.resolve();

const clone = (value) => JSON.parse(JSON.stringify(value));
const asArray = (value) => Array.isArray(value) ? value : [];

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

const normalizeRawData = (rawData) => {
  const input = rawData && typeof rawData === 'object' ? rawData : createDefaultRawData();

  return {
    students: asArray(input.students).map((student) => ({
      id: student?.id,
      name: String(student?.name || '').trim(),
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
      const userId = await ensureAuthenticatedUserId('restore student');
      const { classId } = await ensureActiveClassContext(userId);
      const updatedAt = new Date().toISOString();

      await updateDoc(getStudentDocRef(userId, normalizedStudentId, classId), {
        deleted: false,
        deletedAt: null,
        updatedAt,
        userId,
        classId
      });

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId
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
      const userId = await ensureAuthenticatedUserId('permanently delete student');
      const { classId } = await ensureActiveClassContext(userId);
      const updatedAt = new Date().toISOString();

      await deleteDoc(getStudentDocRef(userId, normalizedStudentId, classId));

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId
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
  const userId = await ensureAuthenticatedUserId('list student trash');
  const { classId } = await ensureActiveClassContext(userId, { requireClass: false });
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

const toDocId = (prefix, label, index) => {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}_${slug || index + 1}_${index + 1}`;
};

const getCurrentUserId = () => {
  const uid = auth?.currentUser?.uid;
  return uid ? String(uid).trim() : '';
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

  const userId = getCurrentUserId();
  if (!userId) {
    throw createUnauthenticatedError(operationLabel);
  }
  return userId;
};

const normalizeClassId = (value) => String(value || '').trim();
const normalizeClassName = (value, fallback = DEFAULT_CLASS_NAME) => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const getClassSelectionKeyForUser = (userId) => `${CACHE_KEY_PREFIX}:activeClass:${userId}`;

const persistClassSelection = (userId, classId) => {
  if (!userId) return;
  const selectionKey = getClassSelectionKeyForUser(userId);
  const normalizedClassId = normalizeClassId(classId);

  if (typeof sessionStorage !== 'undefined') {
    if (normalizedClassId) {
      sessionStorage.setItem(selectionKey, normalizedClassId);
    } else {
      sessionStorage.removeItem(selectionKey);
    }
  }

  if (typeof localStorage !== 'undefined') {
    if (normalizedClassId) {
      localStorage.setItem(selectionKey, normalizedClassId);
    } else {
      localStorage.removeItem(selectionKey);
    }
  }
};

const readPersistedClassSelection = (userId) => {
  if (!userId) return '';
  const selectionKey = getClassSelectionKeyForUser(userId);
  const sessionClassId = typeof sessionStorage !== 'undefined'
    ? normalizeClassId(sessionStorage.getItem(selectionKey))
    : '';
  if (sessionClassId) return sessionClassId;

  return typeof localStorage !== 'undefined'
    ? normalizeClassId(localStorage.getItem(selectionKey))
    : '';
};

const setCurrentClassContext = (classId, userId = getCurrentUserId()) => {
  currentClassId = normalizeClassId(classId);
  if (userId) {
    persistClassSelection(userId, currentClassId);
  }
  return currentClassId;
};

const getCurrentClassContext = () => normalizeClassId(currentClassId);

const toClassModel = (classId, payload = {}) => {
  const id = normalizeClassId(classId);
  return {
    id,
    name: normalizeClassName(payload.name || payload.title || DEFAULT_CLASS_NAME),
    createdAt: payload.createdAt || null
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

const getClassesCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION);
const getClassDocRef = (userId, classId) => doc(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId);
const getClassStudentsCollectionRef = (userId, classId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, STUDENTS_SUBCOLLECTION);
const getClassSubjectsCollectionRef = (userId, classId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, SUBJECTS_SUBCOLLECTION);
const getClassExamsCollectionRef = (userId, classId) => collection(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, EXAMS_SUBCOLLECTION);
const getClassStudentDocRef = (userId, classId, studentId) => doc(db, USERS_COLLECTION, userId, CLASSES_SUBCOLLECTION, classId, STUDENTS_SUBCOLLECTION, studentId);

const resolveClassIdFromCatalog = (userId, classes = []) => {
  const normalizedClasses = sortClasses(classes)
    .map(entry => toClassModel(entry.id, entry))
    .filter(entry => entry.id);

  if (!normalizedClasses.length) {
    setCurrentClassContext('', userId);
    return '';
  }

  const requestedClassId = normalizeClassId(currentClassId) || readPersistedClassSelection(userId);
  const matchedClass = normalizedClasses.find(entry => entry.id === requestedClassId);
  const nextClassId = matchedClass?.id || normalizedClasses[0].id;
  setCurrentClassContext(nextClassId, userId);
  return nextClassId;
};

const getClassCatalogCacheKeyForUser = (userId) => `${CACHE_KEY_PREFIX}:classes:${userId}`;

const writeClassCatalogCache = (userId, classes = []) => {
  if (!userId || typeof localStorage === 'undefined') return;
  const payload = {
    classes: sortClasses(classes)
      .map(entry => toClassModel(entry.id, entry))
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

const resolveActiveClassModel = (userId, classes = []) => {
  const normalized = sortClasses(classes)
    .map(entry => toClassModel(entry.id, entry))
    .filter(entry => entry.id);
  const classId = resolveClassIdFromCatalog(userId, normalized);
  const activeClass = normalized.find(entry => entry.id === classId) || null;
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

const mapStudentsToDocs = (students, userId, updatedAt) => {
  return asArray(students).map((student, index) => {
    const id = String(student?.id || '').trim() || toDocId('student', student?.name || 'student', index);
    return {
      id,
      data: {
        id,
        name: String(student?.name || '').trim(),
        notes: student?.notes || '',
        class: student?.class || '',
        scores: student?.scores && typeof student.scores === 'object' ? clone(student.scores) : {},
        deleted: false,
        deletedAt: null,
        order: index,
        userId,
        updatedAt
      }
    };
  });
};

const mapSubjectsToDocs = (subjects, userId, updatedAt) => {
  return asArray(subjects).map((subject, index) => {
    const name = String(subject || '').trim();
    const docId = toDocId('sub', name, index);
    return {
      id: docId,
      data: {
        id: docId,
        name,
        order: index,
        userId,
        updatedAt
      }
    };
  });
};

const mapExamsToDocs = (exams, userId, updatedAt) => {
  return asArray(exams).map((exam, index) => {
    const title = String(exam || '').trim();
    const docId = toDocId('exam', title, index);
    return {
      id: docId,
      data: {
        id: docId,
        title,
        name: title,
        order: index,
        userId,
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

const writeModularData = async (userId, classId, rawData) => {
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedClassId) {
    throw new Error('Class id is required to write class data');
  }

  const normalized = normalizeRawData(rawData);
  const updatedAt = new Date().toISOString();

  const studentDocs = mapStudentsToDocs(normalized.students, userId, updatedAt);
  const subjectDocs = mapSubjectsToDocs(normalized.subjects, userId, updatedAt);
  const examDocs = mapExamsToDocs(normalized.exams, userId, updatedAt);

  await Promise.all([
    syncCollectionDocuments(getStudentsCollectionRef(userId, normalizedClassId), studentDocs, { preserveDeleted: true }),
    syncCollectionDocuments(getSubjectsCollectionRef(userId, normalizedClassId), subjectDocs),
    syncCollectionDocuments(getExamsCollectionRef(userId, normalizedClassId), examDocs)
  ]);

  await setDoc(getClassDocRef(userId, normalizedClassId), {
    id: normalizedClassId,
    updatedAt,
    userId
  }, { merge: true });

  await setDoc(getUserRootRef(userId), {
    userId,
    updatedAt,
    activeClassId: normalizedClassId
  }, { merge: true });

  return normalized;
};

const readRawDataFromCollectionRefs = async (studentsRef, subjectsRef, examsRef) => {
  const [studentsSnapshot, subjectsSnapshot, examsSnapshot] = await Promise.all([
    getDocs(studentsRef),
    getDocs(subjectsRef),
    getDocs(examsRef)
  ]);

  const students = [];
  const trashStudents = [];
  studentsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    const deletedAtIso = normalizeDeletedAtValue(payload.deletedAt);
    if (payload.deleted === true) {
      trashStudents.push({
        id: String(payload.id || entry.id || '').trim(),
        name: String(payload.name || '').trim() || 'Student',
        deletedAt: deletedAtIso
      });
      return;
    }
    students.push({
      id: String(payload.id || entry.id || '').trim(),
      name: String(payload.name || '').trim(),
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
    if (payload.deleted === true) {
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
    if (payload.deleted === true) {
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
      })
  };
};

const readModularRawData = async (userId, classId) => {
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedClassId) {
    return {
      data: createDefaultRawData(),
      hasData: false,
      trashStudents: []
    };
  }

  return readRawDataFromCollectionRefs(
    getStudentsCollectionRef(userId, normalizedClassId),
    getSubjectsCollectionRef(userId, normalizedClassId),
    getExamsCollectionRef(userId, normalizedClassId)
  );
};

const readClassCatalogFromFirestore = async (userId) => {
  const classesSnapshot = await getDocs(getClassesCollectionRef(userId));
  const classes = [];

  classesSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    classes.push(toClassModel(entry.id, payload));
  });

  return sortClasses(classes.filter(entry => entry.id));
};

const ensureClassCatalog = async (userId) => {
  const classes = await readClassCatalogFromFirestore(userId);
  writeClassCatalogCache(userId, classes);
  return classes;
};

const ensureActiveClassContext = async (userId, options = {}) => {
  const requireClass = options?.requireClass !== false;

  if (!isFirebaseConfigured || !db) {
    const classes = readClassCatalogCache(userId);

    const { classId, className } = resolveActiveClassModel(userId, classes);
    if (requireClass && !classId) {
      throw createMissingClassError('save class data');
    }

    console.log('Current Class ID:', classId || '(none)');
    console.log('User ID:', userId || '(none)');
    return {
      classes,
      classId,
      className
    };
  }

  const classes = await ensureClassCatalog(userId);
  const { classId, className } = resolveActiveClassModel(userId, classes);
  if (requireClass && !classId) {
    throw createMissingClassError('save class data');
  }

  console.log('Current Class ID:', classId || '(none)');
  console.log('User ID:', userId || '(none)');
  return {
    classes,
    classId,
    className
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

    return {
      data: normalizeRawData(parsed),
      lastUpdated: null
    };
  } catch (error) {
    console.warn('Ignoring invalid app cache payload:', error);
    const currentUserId = getCurrentUserId();
    if (currentUserId) {
      localStorage.removeItem(getCacheKeyForUser(currentUserId));
    }
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

const RETRY_ATTEMPTS = 2;
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

  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
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

const normalizeStudentPatch = (studentData) => {
  const source = studentData && typeof studentData === 'object' ? studentData : {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(source, 'name')) {
    patch.name = String(source.name || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(source, 'notes')) {
    patch.notes = source.notes || '';
  }

  if (Object.prototype.hasOwnProperty.call(source, 'class')) {
    patch.class = source.class || '';
  }

  if (Object.prototype.hasOwnProperty.call(source, 'scores')) {
    patch.scores = source.scores && typeof source.scores === 'object' ? clone(source.scores) : {};
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

  const patch = normalizeStudentPatch(studentData);
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
      const userId = await ensureAuthenticatedUserId('update student');
      const { classId } = await ensureActiveClassContext(userId);
      const updatedAt = new Date().toISOString();
      console.log('Editing student:', normalizedStudentId);
      console.log('User:', userId);

      await updateDoc(getStudentDocRef(userId, normalizedStudentId, classId), {
        ...patch,
        userId,
        classId,
        updatedAt
      });

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId
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
      const userId = await ensureAuthenticatedUserId('delete student');
      const { classId } = await ensureActiveClassContext(userId);
      const updatedAt = new Date().toISOString();
      console.log('Deleting student:', normalizedStudentId);
      console.log('User:', userId);

      await updateDoc(getStudentDocRef(userId, normalizedStudentId, classId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt,
        userId,
        classId
      });

      await setDoc(getClassDocRef(userId, classId), {
        id: classId,
        updatedAt,
        userId
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

const saveRemote = async (rawData, userId, classId) => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const payload = await writeModularData(userId, classId, rawData);
  console.log('Saved to Firebase');
  return payload;
};

const persistRemoteFirst = async (rawData, operationLabel) => {
  const nextData = normalizeRawData(rawData);
  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const userId = await ensureAuthenticatedUserId(operationLabel);
      const { classId } = await ensureActiveClassContext(userId);
      console.log('Active UID:', userId);
      await saveRemote(nextData, userId, classId);
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

export const readCachedData = (classId = '') => {
  const userId = getCurrentUserId();
  if (!userId) {
    return null;
  }

  const scopedClassId = normalizeClassId(classId) || getCurrentClassContext() || readPersistedClassSelection(userId);
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

  const scopedClassId = normalizeClassId(classId) || getCurrentClassContext() || readPersistedClassSelection(userId);
  const cacheEnvelope = withTimestamp(rawData);
  localStorage.setItem(getCacheKeyForUser(userId, scopedClassId), JSON.stringify(cacheEnvelope));
  return {
    ...cacheEnvelope,
    classId: scopedClassId
  };
};

export const fetchAllData = async () => {
  let userId = '';
  try {
    userId = await ensureAuthenticatedUserId('fetch data');
    console.log('Active UID:', userId);
  } catch (error) {
    return {
      data: createDefaultRawData(),
      classes: [],
      currentClassId: '',
      currentClassName: DEFAULT_CLASS_NAME,
      source: 'default',
      offline: false,
      error,
      errorType: 'unauthenticated'
    };
  }

  if (!isFirebaseConfigured || !db) {
    console.warn('Firebase unavailable. Falling back to cache/default data.');
    const cachedClasses = readClassCatalogCache(userId);
    const { classId, className } = resolveActiveClassModel(userId, cachedClasses);
    const cached = readCachedData(classId);
    if (cached?.data) {
      return {
        data: cached.data,
        trashStudents: [],
        classes: cachedClasses,
        currentClassId: classId,
        currentClassName: className,
        source: 'cache',
        offline: false,
        error: null,
        errorType: 'config'
      };
    }

    const fallback = createDefaultRawData();
    writeCacheCopy(fallback, classId);
    return {
      data: fallback,
      trashStudents: [],
      classes: cachedClasses,
      currentClassId: classId,
      currentClassName: className,
      source: 'default',
      offline: false,
      error: null,
      errorType: 'config'
    };
  }

  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const classContext = await ensureActiveClassContext(userId, { requireClass: false });
      const scopedClasses = classContext.classes || [];
      const scopedClassId = classContext.classId;
      const scopedClassName = classContext.className;

      if (!scopedClassId) {
        return {
          data: createDefaultRawData(),
          trashStudents: [],
          classes: scopedClasses,
          currentClassId: '',
          currentClassName: scopedClassName,
          source: 'firebase',
          offline: false,
          error: null,
          errorType: null
        };
      }

      const modularResult = await readModularRawData(userId, scopedClassId);
      writeClassCatalogCache(userId, scopedClasses);

      const nextData = modularResult?.data || createDefaultRawData();
      writeCacheCopy(nextData, scopedClassId);
      console.log('Synced from Firebase (modular)');
      return {
        data: nextData,
        trashStudents: Array.isArray(modularResult?.trashStudents) ? modularResult.trashStudents : [],
        classes: scopedClasses,
        currentClassId: scopedClassId,
        currentClassName: scopedClassName,
        source: 'firebase',
        offline: false,
        error: null,
        errorType: null
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
  const cachedClasses = readClassCatalogCache(userId);
  const { classId, className } = resolveActiveClassModel(userId, cachedClasses);
  const cached = readCachedData(classId);

  if (cached?.data) {
    return {
      data: cached.data,
      trashStudents: [],
      classes: cachedClasses,
      currentClassId: classId,
      currentClassName: className,
      source: 'cache',
      offline,
      error: lastError,
      errorType: lastErrorType
    };
  }

  const fallback = createDefaultRawData();
  writeCacheCopy(fallback, classId);
  return {
    data: fallback,
    trashStudents: [],
    classes: cachedClasses,
    currentClassId: classId,
    currentClassName: className,
    source: 'default',
    offline,
    error: lastError,
    errorType: lastErrorType
  };
};

export const setCurrentClassId = (classId) => {
  return setCurrentClassContext(classId);
};

export const getCurrentClassId = () => {
  return getCurrentClassContext();
};

export const listClasses = async () => {
  const userId = await ensureAuthenticatedUserId('list classes');

  if (!isFirebaseConfigured || !db) {
    const cachedClasses = readClassCatalogCache(userId);
    const { classId, className } = resolveActiveClassModel(userId, cachedClasses);
    return {
      classes: cachedClasses,
      currentClassId: classId,
      currentClassName: className
    };
  }

  const classes = await ensureClassCatalog(userId);
  const { classId, className } = resolveActiveClassModel(userId, classes);
  writeClassCatalogCache(userId, classes);

  return {
    classes,
    currentClassId: classId,
    currentClassName: className
  };
};

export const createClass = async (className) => {
  const userId = await ensureAuthenticatedUserId('create class');
  const normalizedName = normalizeClassName(className, DEFAULT_CLASS_NAME);
  const createdAt = new Date().toISOString();

  const classDocRef = await addDoc(getClassesCollectionRef(userId), {
    name: normalizedName,
    createdAt,
    updatedAt: createdAt,
    userId
  });
  const classId = normalizeClassId(classDocRef.id);

  await setDoc(classDocRef, {
    id: classId
  }, { merge: true });

  const classes = await ensureClassCatalog(userId);
  const nextClasses = sortClasses([...classes.filter(entry => entry.id !== classId), {
    id: classId,
    name: normalizedName,
    createdAt
  }]);
  writeClassCatalogCache(userId, nextClasses);
  setCurrentClassContext(classId, userId);

  await setDoc(getUserRootRef(userId), {
    userId,
    activeClassId: classId,
    updatedAt: createdAt
  }, { merge: true });

  return {
    class: toClassModel(classId, { name: normalizedName, createdAt }),
    classes: nextClasses,
    currentClassId: classId,
    currentClassName: normalizedName
  };
};

export const deleteClass = async (classId) => {
  const userId = await ensureAuthenticatedUserId('delete class');
  const normalizedClassId = normalizeClassId(classId);
  if (!normalizedClassId) {
    throw new Error('Class id is required');
  }

  const classes = await ensureClassCatalog(userId);
  const classExists = classes.some(entry => entry.id === normalizedClassId);
  if (!classExists) {
    throw new Error('Class not found');
  }

  if (classes.length <= 1) {
    throw new Error('At least one class is required');
  }

  await Promise.all([
    deleteCollectionDocuments(getStudentsCollectionRef(userId, normalizedClassId)),
    deleteCollectionDocuments(getSubjectsCollectionRef(userId, normalizedClassId)),
    deleteCollectionDocuments(getExamsCollectionRef(userId, normalizedClassId))
  ]);
  await deleteDoc(getClassDocRef(userId, normalizedClassId));

  const remainingClasses = sortClasses(classes.filter(entry => entry.id !== normalizedClassId));
  writeClassCatalogCache(userId, remainingClasses);

  const { classId: nextClassId, className: nextClassName } = resolveActiveClassModel(userId, remainingClasses);
  const updatedAt = new Date().toISOString();

  await setDoc(getUserRootRef(userId), {
    userId,
    activeClassId: nextClassId,
    updatedAt
  }, { merge: true });

  return {
    classes: remainingClasses,
    currentClassId: nextClassId,
    currentClassName: nextClassName
  };
};

export const saveAllData = async (rawData) => enqueueWrite(() => persistRemoteFirst(rawData, 'save data'));

export const saveStudent = async (rawData, studentData) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  next.students.push(clone(studentData));
  return persistRemoteFirst(next, 'save student');
});

export const updateStudent = async (rawData, studentId, studentData) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  const idx = next.students.findIndex(student => student.id === studentId);
  if (idx !== -1) {
    next.students[idx] = { ...next.students[idx], ...clone(studentData) };
  }
  return persistStudentUpdateById(studentId, studentData, next);
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

export const updateExams = async (rawData, exams) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  next.exams = asArray(exams)
    .map(exam => String(exam?.title || exam?.name || exam || '').trim())
    .filter(Boolean);
  return persistRemoteFirst(next, 'update exams');
});
