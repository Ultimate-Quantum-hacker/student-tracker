/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — services/db.js
   Centralized Firestore-first data access with cache fallback.
   ═══════════════════════════════════════════════ */

import { db, doc, getDoc, setDoc, isFirebaseConfigured } from '../js/firebase.js';

const CACHE_KEY = 'studentAppData';
const REMOTE_COLLECTION = 'appState';
const REMOTE_DOC_ID = 'primary';

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

const getRemoteDocRef = () => doc(db, REMOTE_COLLECTION, REMOTE_DOC_ID);

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
    localStorage.removeItem(CACHE_KEY);
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

const saveRemote = async (rawData) => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase unavailable');
  }

  const payload = {
    data: normalizeRawData(rawData),
    updatedAt: new Date().toISOString()
  };

  await setDoc(getRemoteDocRef(), payload, { merge: true });
  console.log('Saved to Firebase');
  return payload.data;
};

const persistRemoteFirst = async (rawData, operationLabel) => {
  const nextData = normalizeRawData(rawData);
  try {
    await saveRemote(nextData);
    return { data: nextData, remoteSaved: true, error: null, operation: operationLabel };
  } catch (error) {
    console.error(`Failed to ${operationLabel} via Firebase:`, error);
    return { data: nextData, remoteSaved: false, error, operation: operationLabel };
  }
};

export const readCachedData = () => {
  const cached = parseCache(localStorage.getItem(CACHE_KEY));
  if (cached?.data) {
    console.log('Loaded from cache');
  }
  return cached;
};

export const writeCacheCopy = (rawData) => {
  const cacheEnvelope = withTimestamp(rawData);
  localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEnvelope));
  return cacheEnvelope;
};

export const fetchAllData = async () => {
  const cached = readCachedData();

  try {
    if (!isFirebaseConfigured || !db) {
      throw new Error('Firebase unavailable');
    }

    const snapshot = await getDoc(getRemoteDocRef());
    const remotePayload = snapshot.exists() ? snapshot.data() : null;
    const remoteData = normalizeRawData(remotePayload?.data || remotePayload || createDefaultRawData());
    writeCacheCopy(remoteData);
    console.log('Synced from Firebase');
    return {
      data: remoteData,
      source: 'firebase',
      offline: false,
      error: null
    };
  } catch (error) {
    console.error('Failed to fetch remote data:', error);

    if (cached?.data) {
      return {
        data: cached.data,
        source: 'cache',
        offline: true,
        error
      };
    }

    const fallback = createDefaultRawData();
    writeCacheCopy(fallback);
    return {
      data: fallback,
      source: 'default',
      offline: true,
      error
    };
  }
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
