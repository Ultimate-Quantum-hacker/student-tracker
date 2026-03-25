/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — services/db.js
   Centralized Firestore-first data access with cache fallback.
   ═══════════════════════════════════════════════ */

import { db, doc, collection, getDoc, getDocs, setDoc, deleteDoc, isFirebaseConfigured, auth, authReadyPromise, onAuthStateChanged } from '../js/firebase.js';

const CACHE_KEY_PREFIX = 'studentAppData';
const LEGACY_CACHE_KEY = 'studentAppData';
const LEGACY_REMOTE_COLLECTION = 'appState';
const USERS_COLLECTION = 'users';
const STUDENTS_SUBCOLLECTION = 'students';
const SUBJECTS_SUBCOLLECTION = 'subjects';
const EXAMS_SUBCOLLECTION = 'exams';

const createDefaultRawData = () => ({
  students: [],
  subjects: [],
  exams: []
});

let writeChain = Promise.resolve();

const clone = (value) => JSON.parse(JSON.stringify(value));
const asArray = (value) => Array.isArray(value) ? value : [];

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

const getCacheKeyForUser = (userId) => `${CACHE_KEY_PREFIX}:${userId}`;

const removeLegacyCacheIfPresent = () => {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(LEGACY_CACHE_KEY)) {
    localStorage.removeItem(LEGACY_CACHE_KEY);
  }
};

const getLegacyDocRef = (userId) => doc(db, LEGACY_REMOTE_COLLECTION, userId);
const getUserRootRef = (userId) => doc(db, USERS_COLLECTION, userId);
const getStudentsCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, STUDENTS_SUBCOLLECTION);
const getSubjectsCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, SUBJECTS_SUBCOLLECTION);
const getExamsCollectionRef = (userId) => collection(db, USERS_COLLECTION, userId, EXAMS_SUBCOLLECTION);

const mapStudentsToDocs = (students, userId, updatedAt) => {
  return asArray(students).map((student, index) => {
    const docId = String(student?.id || '').trim() || toDocId('st', student?.name, index);
    return {
      id: docId,
      data: {
        id: docId,
        name: String(student?.name || '').trim(),
        notes: student?.notes || '',
        class: student?.class || '',
        scores: student?.scores && typeof student.scores === 'object' ? clone(student.scores) : {},
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

const syncCollectionDocuments = async (collectionRef, targetDocs) => {
  const existingSnapshot = await getDocs(collectionRef);
  const targetMap = new Map((targetDocs || []).map((entry) => [entry.id, entry.data]));
  const operations = [];

  existingSnapshot.forEach((entry) => {
    if (!targetMap.has(entry.id)) {
      operations.push(deleteDoc(entry.ref));
    }
  });

  targetMap.forEach((data, id) => {
    operations.push(setDoc(doc(collectionRef, id), data, { merge: false }));
  });

  await Promise.all(operations);
};

const writeModularData = async (userId, rawData, options = {}) => {
  const normalized = normalizeRawData(rawData);
  const updatedAt = new Date().toISOString();

  const studentDocs = mapStudentsToDocs(normalized.students, userId, updatedAt);
  const subjectDocs = mapSubjectsToDocs(normalized.subjects, userId, updatedAt);
  const examDocs = mapExamsToDocs(normalized.exams, userId, updatedAt);

  await Promise.all([
    syncCollectionDocuments(getStudentsCollectionRef(userId), studentDocs),
    syncCollectionDocuments(getSubjectsCollectionRef(userId), subjectDocs),
    syncCollectionDocuments(getExamsCollectionRef(userId), examDocs)
  ]);

  await setDoc(getUserRootRef(userId), {
    userId,
    updatedAt,
    migrationComplete: options.migrationComplete ?? true,
    migratedAt: options.migrationComplete ? updatedAt : undefined
  }, { merge: true });

  return normalized;
};

const readLegacyRawData = async (userId) => {
  const snapshot = await getDoc(getLegacyDocRef(userId));
  const remotePayload = snapshot.exists() ? snapshot.data() : null;
  const remoteData = normalizeRawData(remotePayload?.data || remotePayload || createDefaultRawData());
  return {
    data: remoteData,
    hasData: hasAnyRawData(remoteData)
  };
};

const readModularRawData = async (userId) => {
  const [userMetaSnapshot, studentsSnapshot, subjectsSnapshot, examsSnapshot] = await Promise.all([
    getDoc(getUserRootRef(userId)),
    getDocs(getStudentsCollectionRef(userId)),
    getDocs(getSubjectsCollectionRef(userId)),
    getDocs(getExamsCollectionRef(userId))
  ]);

  const students = [];
  studentsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
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
    subjects.push({
      name: String(payload.name || '').trim(),
      order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : Number.MAX_SAFE_INTEGER
    });
  });
  subjects.sort((a, b) => a.order - b.order);

  const exams = [];
  examsSnapshot.forEach((entry) => {
    const payload = entry.data() || {};
    exams.push({
      title: String(payload.title || payload.name || '').trim(),
      order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : Number.MAX_SAFE_INTEGER
    });
  });
  exams.sort((a, b) => a.order - b.order);

  const meta = userMetaSnapshot.exists() ? userMetaSnapshot.data() || {} : {};
  const data = normalizeRawData({
    students: students.map(({ id, name, notes, class: className, scores }) => ({ id, name, notes, class: className, scores })),
    subjects: subjects.map((subject) => subject.name),
    exams: exams.map((exam) => exam.title)
  });

  return {
    data,
    hasData: hasAnyRawData(data),
    migrationComplete: Boolean(meta?.migrationComplete)
  };
};

const migrateLegacyData = async (userId, legacyData) => {
  const migrated = await writeModularData(userId, legacyData, { migrationComplete: true });
  console.log('Migration complete for UID:', userId);
  return migrated;
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

const saveRemote = async (rawData, userId, options = {}) => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const payload = await writeModularData(userId, rawData, {
    migrationComplete: options.migrationComplete ?? true
  });
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
      console.log('Active UID:', userId);
      await saveRemote(nextData, userId);
      return {
        data: nextData,
        remoteSaved: true,
        error: null,
        errorType: null,
        operation: operationLabel,
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

export const readCachedData = () => {
  const userId = getCurrentUserId();
  if (!userId) {
    return null;
  }

  removeLegacyCacheIfPresent();
  const cached = parseCache(localStorage.getItem(getCacheKeyForUser(userId)));
  if (cached?.data) {
    console.log('Loaded from cache');
  }
  return cached;
};

export const writeCacheCopy = (rawData) => {
  const userId = getCurrentUserId();
  if (!userId) {
    return null;
  }

  removeLegacyCacheIfPresent();
  const cacheEnvelope = withTimestamp(rawData);
  localStorage.setItem(getCacheKeyForUser(userId), JSON.stringify(cacheEnvelope));
  return cacheEnvelope;
};

export const fetchAllData = async () => {
  let userId = '';
  try {
    userId = await ensureAuthenticatedUserId('fetch data');
    console.log('Active UID:', userId);
  } catch (error) {
    return {
      data: createDefaultRawData(),
      source: 'default',
      offline: false,
      error,
      errorType: 'unauthenticated'
    };
  }

  if (!isFirebaseConfigured || !db) {
    console.warn('Firebase unavailable. Falling back to cache/default data.');
    const cached = readCachedData();
    if (cached?.data) {
      return {
        data: cached.data,
        source: 'cache',
        offline: false,
        error: null,
        errorType: 'config'
      };
    }

    const fallback = createDefaultRawData();
    writeCacheCopy(fallback);
    return {
      data: fallback,
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
      const modularResult = await readModularRawData(userId);

      if (modularResult?.hasData) {
        writeCacheCopy(modularResult.data);
        console.log('Synced from Firebase (modular)');
        return {
          data: modularResult.data,
          source: 'firebase',
          offline: false,
          error: null,
          errorType: null
        };
      }

      const legacyResult = await readLegacyRawData(userId);

      if (!modularResult?.migrationComplete) {
        const migratedData = await migrateLegacyData(userId, legacyResult?.data || createDefaultRawData());
        writeCacheCopy(migratedData);
        return {
          data: migratedData,
          source: 'firebase',
          offline: false,
          error: null,
          errorType: null
        };
      }

      if (legacyResult?.hasData) {
        writeCacheCopy(legacyResult.data);
        console.log('Synced from Firebase (legacy fallback)');
        return {
          data: legacyResult.data,
          source: 'firebase',
          offline: false,
          error: null,
          errorType: null
        };
      }

      const emptyData = createDefaultRawData();
      writeCacheCopy(emptyData);
      return {
        data: emptyData,
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
  const cached = readCachedData();

  if (cached?.data) {
    return {
      data: cached.data,
      source: 'cache',
      offline,
      error: lastError,
      errorType: lastErrorType
    };
  }

  const fallback = createDefaultRawData();
  writeCacheCopy(fallback);
  return {
    data: fallback,
    source: 'default',
    offline,
    error: lastError,
    errorType: lastErrorType
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
  return persistRemoteFirst(next, 'update student');
});

export const deleteStudent = async (rawData, studentId) => enqueueWrite(async () => {
  const next = normalizeRawData(rawData);
  next.students = next.students.filter(student => student.id !== studentId);
  return persistRemoteFirst(next, 'delete student');
});

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
