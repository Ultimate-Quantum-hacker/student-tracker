/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — state.js
   Manages global application state with Firestore sync + cache fallback.
   ═══════════════════════════════════════════════ */

import * as dataService from '../services/db.js';
import { normalizeStudentName } from './student-name-utils.js';
import {
  createStateContextApi,
  normalizeClassCatalogEntries,
  persistCurrentClassContext,
  readPersistedCurrentClassContext,
  resolveValidatedClassContext
} from './state-context.js';

window.TrackerApp = window.TrackerApp || {};

(function (app) {
  'use strict';

  // State Variables
  app.state = {
    classes: [],
    currentClassId: '',
    currentClassName: 'My Class',
    currentClassOwnerId: '',
    currentClassOwnerName: 'Teacher',
    currentUserRole: 'teacher',
    isRoleResolved: false,
    dashboardStudentCount: null,
    students: [],
    studentTrash: [],
    classTrash: [],
    subjectTrash: [],
    examTrash: [],
    exams: [],
    subjects: [],
    scores: [],
    lastBackup: null,
    theme: 'light',
    notesId: null,
    editingId: null,
    deletingId: null,
    studentRosterSearchTerm: '',
    searchTerm: '',
    isLoading: false,
    error: null,
    selectedBulkExamId: '',
    selectedPerformanceCategory: 'strong',
    allowEmptyClassCatalog: false,
    dataSchemaVersion: 2
  };

  const OFFLINE_CACHE_MESSAGE = 'Offline mode: using cached data';
  const OFFLINE_GRACE_PERIOD_MS = 3000;
  const DATA_LOAD_TIMEOUT_MS = 15000;
  const LEGACY_DEFAULT_SUBJECTS = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies', 'Computing'];
  const LEGACY_DEFAULT_EXAMS = ['Mock 1'];
  const DATA_SCHEMA_VERSION = 2;
  let stateWriteChain = Promise.resolve();
  let hasShownOfflineToast = false;

  const createLoadTimeoutError = (operationLabel = 'load app data') => {
    const error = new Error(`Timed out while trying to ${operationLabel}`);
    error.code = 'app/data-load-timeout';
    return error;
  };

  const withOperationTimeout = async (task, timeoutMs = DATA_LOAD_TIMEOUT_MS, operationLabel = 'load app data') => {
    const normalizedTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : 0;
    if (!normalizedTimeoutMs) {
      return typeof task === 'function' ? task() : task;
    }

    let timeoutId = null;
    try {
      return await Promise.race([
        Promise.resolve().then(() => (typeof task === 'function' ? task() : task)),
        new Promise((_, reject) => {
          timeoutId = globalThis.setTimeout(() => {
            reject(createLoadTimeoutError(operationLabel));
          }, normalizedTimeoutMs);
        })
      ]);
    } finally {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  };

  Object.assign(app, createStateContextApi(app, dataService));

  app.refreshDashboardStudentCount = async function () {
    const authUid = String(app.state.authUser?.uid || '').trim();
    const ownerUid = app.getCurrentClassOwnerId();
    const activeUserId = app.getEffectiveUserId();
    console.log('Auth UID:', authUid || '(none)');
    console.log('Class Owner UID:', ownerUid || '(none)');
    console.log('Active UID:', activeUserId || '(none)');

    try {
      if (typeof dataService.fetchRoleScopedStudentCount !== 'function') {
        console.warn('Fallback: student count unavailable');
        app.state.dashboardStudentCount = Array.isArray(app.state.students) ? app.state.students.length : 0;
        return app.state.dashboardStudentCount;
      }
      app.state.dashboardStudentCount = await dataService.fetchRoleScopedStudentCount(app.getCurrentUserRole());
    } catch (error) {
      console.warn('Failed to refresh dashboard student count:', error);
      app.state.dashboardStudentCount = Array.isArray(app.state.students) ? app.state.students.length : null;
    }
    return app.state.dashboardStudentCount;
  };

  app.fetchAdminGlobalStats = function () {
    return dataService.fetchAdminGlobalStats();
  };

  app.fetchUserScopedData = function (userId = '') {
    if (typeof dataService.fetchUserScopedData !== 'function') {
      console.warn('Fallback: user scoped data unavailable');
      return Promise.resolve(null);
    }
    return dataService.fetchUserScopedData(userId);
  };

  app.fetchActivityLogs = function (options = {}) {
    return dataService.fetchActivityLogs(options);
  };

  const persistedClassContext = readPersistedCurrentClassContext();
  app.state.currentClassId = persistedClassContext.classId;
  app.state.currentClassOwnerId = persistedClassContext.ownerId;

  const createDefaultRawData = () => ({
    schemaVersion: DATA_SCHEMA_VERSION,
    students: [],
    subjects: [],
    exams: []
  });

  const normalizeLabel = (value) => String(value || '').trim();
  const normalizeStudentUpdate = (studentData = {}) => {
    const nextStudentData = studentData && typeof studentData === 'object' ? { ...studentData } : {};
    if (Object.prototype.hasOwnProperty.call(nextStudentData, 'name')) {
      nextStudentData.name = normalizeStudentName(nextStudentData.name);
    }
    if (Object.prototype.hasOwnProperty.call(nextStudentData, 'scores')) {
      const subjectLookup = buildEntityLookup(app.state.subjects || [], subject => subject?.name || '');
      const examLookup = buildEntityLookup(app.state.exams || [], exam => exam?.title || exam?.name || '');
      nextStudentData.scores = normalizeScoreMapByIds(nextStudentData.scores || {}, subjectLookup, examLookup);
    }
    return nextStudentData;
  };
  const createId = (prefix, name, index) => {
    const base = normalizeLabel(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${prefix}_${base || index + 1}`;
  };

  const createCollectionDocId = (prefix, label, index) => {
    const base = normalizeLabel(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${prefix}_${base || index + 1}_${index + 1}`;
  };

  const normalizeSubjectRecord = (subject, index = 0) => {
    const payload = subject && typeof subject === 'object' && !Array.isArray(subject) ? subject : {};
    const name = normalizeLabel(payload.name || payload.label || payload.title || (typeof subject === 'string' ? subject : ''));
    if (!name) {
      return null;
    }

    return {
      ...payload,
      id: normalizeLabel(payload.id) || createCollectionDocId('sub', name, index),
      name
    };
  };

  const normalizeExamRecord = (exam, index = 0) => {
    const payload = exam && typeof exam === 'object' && !Array.isArray(exam) ? exam : {};
    const title = normalizeLabel(payload.title || payload.name || payload.label || (typeof exam === 'string' ? exam : ''));
    if (!title) {
      return null;
    }

    return {
      ...payload,
      id: normalizeLabel(payload.id) || createCollectionDocId('exam', title, index),
      title,
      name: title
    };
  };

  const buildEntityLookup = (items = [], labelSelector = () => '') => {
    const byId = new Map();
    const byLabel = new Map();

    (items || []).forEach((item) => {
      const id = normalizeLabel(item?.id);
      const label = normalizeLabel(labelSelector(item)).toLowerCase();
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
    const normalizedKey = normalizeLabel(key);
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

        normalizedScores[resolvedSubjectKey][resolvedExamKey] = app.normalizeScore(value);
      });
    });

    return normalizedScores;
  };

  const hasAnyRawScores = (students = []) => students.some(student => {
    const scoreMap = student?.scores || {};
    return Object.values(scoreMap).some(examMap => {
      if (!examMap || typeof examMap !== 'object') return false;
      return Object.values(examMap).some(value => value !== '' && value !== null && value !== undefined && !isNaN(Number(value)));
    });
  });

  const isLegacySeedTemplate = (subjects = [], exams = []) => {
    if (subjects.length !== LEGACY_DEFAULT_SUBJECTS.length || exams.length !== LEGACY_DEFAULT_EXAMS.length) {
      return false;
    }
    const sameSubjects = subjects.every((subject, index) => subject === LEGACY_DEFAULT_SUBJECTS[index]);
    const sameExams = exams.every((exam, index) => exam === LEGACY_DEFAULT_EXAMS[index]);
    return sameSubjects && sameExams;
  };

  app.normalizeScore = function (value) {
    return app.analytics?.normalizeScore
      ? app.analytics.normalizeScore(value)
      : Math.max(0, Math.min(100, isNaN(Number(value)) ? 0 : Number(value)));
  };

  const createReadOnlyContextError = (operationLabel = 'modify data') => {
    const error = new Error(`Read-only mode: admins cannot ${operationLabel}`);
    error.code = 'app/read-only-admin';
    return error;
  };

  const createMissingClassContextError = (operationLabel = 'modify data') => {
    const error = new Error(`Select a class before attempting to ${operationLabel}`);
    error.code = 'app/missing-class-context';
    return error;
  };

  const createMissingOwnerContextError = (operationLabel = 'modify data') => {
    const error = new Error(`Class owner context is missing for ${operationLabel}. Re-select the class and try again.`);
    error.code = 'app/missing-class-owner-context';
    return error;
  };

  const ensureWritableDataContext = (operationLabel = 'modify data') => {
    const canWrite = typeof app.canCurrentRoleWrite === 'function'
      ? app.canCurrentRoleWrite()
      : !(typeof app.isReadOnlyRoleContext === 'function' && app.isReadOnlyRoleContext());
    if (!canWrite) {
      throw createReadOnlyContextError(operationLabel);
    }
  };

  const ensureResolvedClassContext = (operationLabel = 'modify data') => {
    if (typeof app.syncDataContext === 'function') {
      app.syncDataContext();
    }

    const classId = String(app.state.currentClassId || '').trim();
    const ownerId = String(app.getCurrentClassOwnerId() || '').trim();
    const className = String(app.state.currentClassName || '').trim() || 'My Class';
    const ownerName = String(app.getCurrentClassOwnerName() || '').trim() || 'Teacher';

    if (!classId) {
      throw createMissingClassContextError(operationLabel);
    }
    if (!ownerId) {
      throw createMissingOwnerContextError(operationLabel);
    }

    return {
      classId,
      ownerId,
      className,
      ownerName
    };
  };

  app.ensureWritableClassContext = function (operationLabel = 'modify data') {
    ensureWritableDataContext(operationLabel);
    return ensureResolvedClassContext(operationLabel);
  };

  const enqueueStateWrite = (task, { allowInReadOnly = false, operationLabel = 'modify data' } = {}) => {
    const runTask = async () => {
      if (!allowInReadOnly) {
        ensureWritableDataContext(operationLabel);
      }
      return task();
    };

    stateWriteChain = stateWriteChain.then(runTask, runTask);
    return stateWriteChain;
  };

  const deepClone = (value) => JSON.parse(JSON.stringify(value));

  const logTrackedActivity = async (action, targetId, targetType, options = {}) => {
    try {
      const classId = String(options?.classId || app.state.currentClassId || '').trim();
      const ownerId = String(options?.ownerId || app.getCurrentClassOwnerId() || '').trim();
      const className = String(options?.className || app.state.currentClassName || '').trim();
      const ownerName = String(options?.ownerName || app.getCurrentClassOwnerName() || '').trim();

      await dataService.logActivity(action, targetId, targetType, {
        ...options,
        classId,
        className,
        ownerId,
        ownerName,
        userRole: app.getCurrentUserRole(),
        dataOwnerUserId: options?.dataOwnerUserId || ownerId || undefined
      });
    } catch (error) {
      console.warn('Activity log hook failed:', error);
    }
  };

  const sortTrashEntriesNewestFirst = (entries = []) => {
    return deepClone(entries)
      .filter(entry => String(entry?.id || '').trim())
      .sort((a, b) => {
        const aTime = new Date(a?.deletedAt || 0).getTime() || 0;
        const bTime = new Date(b?.deletedAt || 0).getTime() || 0;
        return bTime - aTime;
      });
  };

  const isNavigatorOffline = () => {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  };

  const setOfflineStatus = () => {
    app.state.error = OFFLINE_CACHE_MESSAGE;
    if (!hasShownOfflineToast && app.ui?.showToast) {
      app.ui.showToast(OFFLINE_CACHE_MESSAGE);
      hasShownOfflineToast = true;
    }
  };

  const clearOfflineStatus = () => {
    if (app.state.error === OFFLINE_CACHE_MESSAGE) {
      app.state.error = null;
    }
    hasShownOfflineToast = false;
  };

  app.readCachedData = function (classId = '') {
    return dataService.readCachedData(classId || app.state.currentClassId || '');
  };

  app.writeCachedData = function (rawData, classId = '') {
    return dataService.writeCacheCopy(rawData, classId || app.state.currentClassId || '');
  };

  app.resetCachedData = function (rawData = createDefaultRawData()) {
    const migrated = app.migrateToRawData(rawData);
    app.writeCachedData(migrated);
    return migrated;
  };

  app.overwriteStaleCache = function () {
    const canonical = app.getRawData();
    app.writeCachedData(canonical);
    return canonical;
  };

  const applySyncStatus = (saveResult) => {
    if (saveResult?.remoteSaved) {
      clearOfflineStatus();
      return;
    }

    if (saveResult?.error) {
      console.error('Firebase error:', saveResult.error);
    }

    if (saveResult?.offline && isNavigatorOffline()) {
      setOfflineStatus();
      return;
    }

    if (!isNavigatorOffline()) {
      clearOfflineStatus();
      const errorType = saveResult?.errorType || 'unknown';
      console.warn(`Online but failed to save data (${errorType})`);
    }
  };

  const createSyncFailure = (saveResult, operationLabel = 'save data') => {
    if (saveResult?.error instanceof Error) {
      saveResult.error.errorType = saveResult?.errorType || saveResult.error.errorType || 'unknown';
      return saveResult.error;
    }

    const errorType = saveResult?.errorType || 'unknown';
    const syncError = new Error(`Failed to ${operationLabel} in Firebase (${errorType})`);
    syncError.errorType = errorType;
    return syncError;
  };

  const assertRemoteWriteSucceeded = (saveResult, operationLabel = 'save data') => {
    applySyncStatus(saveResult);
    if (saveResult?.remoteSaved) {
      return;
    }

    throw createSyncFailure(saveResult, operationLabel);
  };

  const composeRawData = (students = [], subjects = [], exams = []) => {
    const normalizedSubjects = (subjects || [])
      .map((subject, index) => normalizeSubjectRecord(subject, index))
      .filter(Boolean);
    const normalizedExams = (exams || [])
      .map((exam, index) => normalizeExamRecord(exam, index))
      .filter(Boolean);
    const subjectLookup = buildEntityLookup(normalizedSubjects, subject => subject?.name || '');
    const examLookup = buildEntityLookup(normalizedExams, exam => exam?.title || exam?.name || '');

    return {
      schemaVersion: DATA_SCHEMA_VERSION,
      students: (students || []).map(student => ({
        id: student.id,
        name: student.name,
        notes: student.notes || '',
        class: student.class || '',
        scores: normalizeScoreMapByIds(student.scores || {}, subjectLookup, examLookup)
      })),
      subjects: normalizedSubjects.map(subject => ({
        id: subject.id,
        name: subject.name
      })),
      exams: normalizedExams.map(exam => ({
        ...(exam.date ? { date: exam.date } : {}),
        id: exam.id,
        title: exam.title,
        name: exam.title
      }))
    };
  };

  app.getRawData = function () {
    return composeRawData(app.state.students, app.state.subjects, app.state.exams);
  };

  const rebuildRuntimeScores = () => {
    app.state.scores = [];
    app.state.students.forEach(student => {
      app.state.subjects.forEach(subject => {
        app.state.exams.forEach(exam => {
          const score = app.analytics?.getScore
            ? app.analytics.getScore(student, subject, exam)
            : (student.scores?.[subject.id]?.[exam.id] ?? student.scores?.[subject.name]?.[exam.title]);
          if (score !== '' && score !== undefined && score !== null && !isNaN(score)) {
            app.state.scores.push({
              id: `${student.id}_${exam.id}_${subject.id}`,
              studentId: student.id,
              examId: exam.id,
              subjectId: subject.id,
              subject: subject.name,
              score: Number(score)
            });
          }
        });
      });
    });
  };

  app.applyRawData = function (rawData) {
    const data = app.migrateToRawData(rawData);

    app.state.dataSchemaVersion = Number(data.schemaVersion || DATA_SCHEMA_VERSION) || DATA_SCHEMA_VERSION;

    app.state.subjects = (data.subjects || [])
      .map((subject, index) => normalizeSubjectRecord(subject, index))
      .filter(Boolean);
    app.state.exams = (data.exams || [])
      .map((exam, index) => normalizeExamRecord(exam, index))
      .filter(Boolean);

    const subjectLookup = buildEntityLookup(app.state.subjects, subject => subject?.name || '');
    const examLookup = buildEntityLookup(app.state.exams, exam => exam?.title || exam?.name || '');

    app.state.students = (data.students || []).map((student, idx) => ({
      id: student.id || createId('st', student.name || `student-${idx + 1}`, idx),
      name: normalizeStudentName(student.name, `Student ${idx + 1}`),
      notes: student.notes || '',
      class: student.class || '',
      scores: normalizeScoreMapByIds(student.scores || {}, subjectLookup, examLookup)
    }));

    rebuildRuntimeScores();
  };

  app.migrateToRawData = function (legacyData) {
    if (!legacyData || typeof legacyData !== 'object') {
      return createDefaultRawData();
    }

    const subjects = (legacyData.subjects || [])
      .map((subject, index) => normalizeSubjectRecord(subject, index))
      .filter(Boolean);
    const exams = (legacyData.exams || [])
      .map((exam, index) => normalizeExamRecord(exam, index))
      .filter(Boolean);
    const subjectLookup = buildEntityLookup(subjects, subject => subject?.name || '');
    const examLookup = buildEntityLookup(exams, exam => exam?.title || exam?.name || '');

    const students = (legacyData.students || []).map((student, idx) => {
      const rawStudent = {
        id: student.id || createId('st', student.name || `student-${idx + 1}`, idx),
        name: normalizeStudentName(student.name),
        notes: student.notes || '',
        class: student.class || '',
        scores: normalizeScoreMapByIds(student.scores || {}, subjectLookup, examLookup)
      };

      return rawStudent;
    });

    (legacyData.scores || []).forEach(score => {
      const student = students.find(s => s.id === score.studentId);
      if (!student) return;
      const subjectKey = resolveEntityScoreKey(score.subjectId || score.subject, subjectLookup);
      const examKey = resolveEntityScoreKey(score.examId || score.exam || score.title || score.name, examLookup);
      if (!subjectKey || !examKey) return;
      if (!student.scores[subjectKey]) {
        student.scores[subjectKey] = {};
      }
      student.scores[subjectKey][examKey] = app.normalizeScore(score.score);
    });

    const normalizedSubjects = subjects.length ? subjects : createDefaultRawData().subjects;
    const normalizedExams = exams.length ? exams : createDefaultRawData().exams;
    const normalizedSubjectLabels = normalizedSubjects.map(subject => normalizeLabel(subject?.name || subject)).filter(Boolean);
    const normalizedExamLabels = normalizedExams.map(exam => normalizeLabel(exam?.title || exam?.name || exam)).filter(Boolean);

    if (!hasAnyRawScores(students) && isLegacySeedTemplate(normalizedSubjectLabels, normalizedExamLabels)) {
      return {
        schemaVersion: DATA_SCHEMA_VERSION,
        students,
        subjects: [],
        exams: []
      };
    }

    return {
      schemaVersion: DATA_SCHEMA_VERSION,
      students,
      subjects: normalizedSubjects,
      exams: normalizedExams
    };
  };

  // Persistence Methods
  app.save = async function () {
    return enqueueStateWrite(async () => {
      const canonical = app.getRawData();
      const saveResult = await dataService.saveAllData(canonical);
      applySyncStatus(saveResult);

      if (saveResult?.remoteSaved) {
        app.writeCachedData(canonical);
      }

      return saveResult;
    });
  };

  app.load = async function () {
    const loadStartedAt = Date.now();
    let firebaseDataLoaded = false;
    const syncDashboardStudentCountFromState = () => {
      app.state.dashboardStudentCount = Array.isArray(app.state.students) ? app.state.students.length : 0;
      return app.state.dashboardStudentCount;
    };

    const scheduleOfflineGraceCheck = () => {
      const elapsed = Date.now() - loadStartedAt;
      const waitMs = Math.max(OFFLINE_GRACE_PERIOD_MS - elapsed, 0);
      return setTimeout(() => {
        if (!firebaseDataLoaded && isNavigatorOffline()) {
          setOfflineStatus();
        }
      }, waitMs);
    };

    const offlineGraceTimer = scheduleOfflineGraceCheck();

    try {
      app.state.isLoading = true;
      app.state.error = null;
      app.state.dashboardStudentCount = null;

      if (!app.state.currentClassId) {
        const persistedContext = readPersistedCurrentClassContext();
        app.state.currentClassId = persistedContext.classId;
        app.state.currentClassOwnerId = persistedContext.ownerId;
      }

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }

      if (typeof dataService.setCurrentUserRoleContext === 'function') {
        dataService.setCurrentUserRoleContext(app.getCurrentUserRole());
      }

      const authUid = String(app.state.authUser?.uid || '').trim();
      console.log('Auth UID:', authUid || '(none)');
      console.log('Role:', app.getCurrentUserRole());
      console.log('Active UID:', app.getEffectiveUserId() || '(none)');

      const remoteResult = await withOperationTimeout(() => dataService.fetchAllData(), DATA_LOAD_TIMEOUT_MS, 'load app data');
      let nextClasses = normalizeClassCatalogEntries(remoteResult?.classes || []);
      let requestedClassId = String(remoteResult?.currentClassId || app.state.currentClassId || '').trim();

      if (!nextClasses.length && app.isAdminRole() && typeof dataService.fetchClassCatalog === 'function') {
        try {
          const adminCatalog = await withOperationTimeout(() => dataService.fetchClassCatalog(), DATA_LOAD_TIMEOUT_MS, 'load class catalog');
          nextClasses = normalizeClassCatalogEntries(adminCatalog?.classes || []);
          if (!requestedClassId) {
            requestedClassId = String(adminCatalog?.currentClassId || '').trim();
          }
        } catch (catalogError) {
          console.warn('Failed to load admin class catalog fallback:', catalogError);
        }
      }

      const requestedOwnerId = String(app.state.currentClassOwnerId || '').trim();
      const validatedClassContext = resolveValidatedClassContext(nextClasses, requestedClassId, requestedOwnerId);
      app.state.classes = nextClasses;
      app.state.currentClassId = validatedClassContext.classId;
      app.state.currentClassName = validatedClassContext.className;
      app.state.currentClassOwnerId = validatedClassContext.ownerId;
      app.state.currentClassOwnerName = validatedClassContext.ownerName;
      app.state.allowEmptyClassCatalog = remoteResult?.allowEmptyClassCatalog === true;
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
      app.syncDataContext();

      console.log('Classes loaded:', nextClasses.length);
      console.log('Selected class:', app.state.currentClassId || '(none)');
      console.log('Owner ID:', app.getCurrentClassOwnerId() || '(none)');

      if (validatedClassContext.isFallback) {
        console.warn('Persisted class selection was stale/invalid; selection has been reset to a valid class context.');
      }

      console.log('Current Class ID:', app.state.currentClassId || '(none)');
      console.log('User ID:', app.getCurrentClassOwnerId() || '(none)');

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }

      const remoteData = app.migrateToRawData(remoteResult?.data || createDefaultRawData());
      app.applyRawData(remoteData);
      app.state.studentTrash = sortTrashEntriesNewestFirst(Array.isArray(remoteResult?.trashStudents) ? remoteResult.trashStudents : []);
      app.state.classTrash = sortTrashEntriesNewestFirst(Array.isArray(remoteResult?.trashClasses) ? remoteResult.trashClasses : []);
      app.state.subjectTrash = sortTrashEntriesNewestFirst(Array.isArray(remoteResult?.trashSubjects) ? remoteResult.trashSubjects : []);
      app.state.examTrash = sortTrashEntriesNewestFirst(Array.isArray(remoteResult?.trashExams) ? remoteResult.trashExams : []);
      syncDashboardStudentCountFromState();
      app.writeCachedData(remoteData, app.state.currentClassId);

      if (remoteResult?.source === 'firebase') {
        firebaseDataLoaded = true;
        clearTimeout(offlineGraceTimer);
        clearOfflineStatus();
      } else if (!isNavigatorOffline()) {
        clearTimeout(offlineGraceTimer);
        clearOfflineStatus();
        if (remoteResult?.error) {
          console.warn(`Online but failed to fetch data (${remoteResult?.errorType || 'unknown'})`);
        }
      } else if ((Date.now() - loadStartedAt) >= OFFLINE_GRACE_PERIOD_MS) {
        clearTimeout(offlineGraceTimer);
        setOfflineStatus();
      }
    } catch (error) {
      console.error('Firebase error:', error);

      if (!isNavigatorOffline()) {
        clearTimeout(offlineGraceTimer);
        clearOfflineStatus();
        console.warn('Online but failed to fetch data (unexpected error)');
      } else if ((Date.now() - loadStartedAt) >= OFFLINE_GRACE_PERIOD_MS) {
        clearTimeout(offlineGraceTimer);
        setOfflineStatus();
      }

      if (String(error?.code || '').trim().toLowerCase() === 'app/data-load-timeout' && !isNavigatorOffline()) {
        app.state.error = 'Live data is taking too long to load. Showing cached data if available.';
      }

      const fallbackCache = app.readCachedData();
      if (fallbackCache?.data) {
        const fallbackClassId = String(fallbackCache.classId || app.state.currentClassId || '').trim();
        if (fallbackClassId) {
          app.state.currentClassId = fallbackClassId;
          const fallbackClassEntry = (app.state.classes || []).find((entry) => String(entry?.id || '').trim() === fallbackClassId) || null;
          app.state.currentClassOwnerId = String(fallbackClassEntry?.ownerId || app.state.currentClassOwnerId || '').trim();
          persistCurrentClassContext(fallbackClassId, app.state.currentClassOwnerId);
          if (typeof dataService.setCurrentClassId === 'function') {
            dataService.setCurrentClassId(fallbackClassId);
          }
          app.syncDataContext();
        }
        app.applyRawData(app.migrateToRawData(fallbackCache.data));
        app.state.studentTrash = sortTrashEntriesNewestFirst([]);
        app.state.classTrash = sortTrashEntriesNewestFirst([]);
        app.state.subjectTrash = sortTrashEntriesNewestFirst([]);
        app.state.examTrash = sortTrashEntriesNewestFirst([]);
        syncDashboardStudentCountFromState();
      } else {
        const fallback = createDefaultRawData();
        app.applyRawData(fallback);
        app.state.studentTrash = sortTrashEntriesNewestFirst([]);
        app.state.classTrash = sortTrashEntriesNewestFirst([]);
        app.state.subjectTrash = sortTrashEntriesNewestFirst([]);
        app.state.examTrash = sortTrashEntriesNewestFirst([]);
        syncDashboardStudentCountFromState();
        app.writeCachedData(fallback);
      }
    } finally {
      app.state.isLoading = false;
    }
  };

  const applyRuntimeCollections = (students, subjects, exams) => {
    app.applyRawData(composeRawData(students, subjects, exams));
  };

  const syncRuntimeAndCache = (students, subjects, exams, saveResult, operationLabel = 'save data') => {
    assertRemoteWriteSucceeded(saveResult, operationLabel);
    if (saveResult?.classId) {
      app.state.currentClassId = String(saveResult.classId || '').trim();
      const currentClassEntry = (app.state.classes || []).find((entry) => String(entry?.id || '').trim() === app.state.currentClassId) || null;
      app.state.currentClassOwnerId = String(currentClassEntry?.ownerId || app.state.currentClassOwnerId || '').trim();
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
      if (typeof dataService.setCurrentClassId === 'function' && app.state.currentClassId) {
        dataService.setCurrentClassId(app.state.currentClassId);
      }
      app.syncDataContext();
    }
    applyRuntimeCollections(students, subjects, exams);
    app.writeCachedData(composeRawData(students, subjects, exams));
  };

  app.createClass = async function (className) {
    return enqueueStateWrite(async () => {
      const nextName = normalizeLabel(className) || 'My Class';
      const result = await dataService.createClass(nextName);
      app.state.classes = Array.isArray(result?.classes) ? result.classes : app.state.classes;
      app.state.classes = normalizeClassCatalogEntries(app.state.classes);
      app.state.currentClassId = String(result?.currentClassId || '').trim();
      app.state.currentClassName = String(result?.currentClassName || nextName).trim() || nextName;
      app.state.allowEmptyClassCatalog = false;
      const currentClassEntry = (app.state.classes || []).find((entry) => String(entry?.id || '').trim() === app.state.currentClassId) || null;
      app.state.currentClassOwnerId = String(currentClassEntry?.ownerId || '').trim();
      app.state.currentClassOwnerName = String(currentClassEntry?.ownerName || '').trim() || 'Teacher';
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
      app.syncDataContext();

      console.log('Current Class ID:', app.state.currentClassId || '(none)');
      console.log('User ID:', app.getCurrentClassOwnerId() || '(none)');

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }

      await app.load();
      return result?.class || null;
    });
  };

  app.switchClass = async function (classId, ownerId = '') {
    return enqueueStateWrite(async () => {
      const nextClassId = normalizeLabel(classId);
      const requestedOwnerId = normalizeLabel(ownerId);
      if (!nextClassId) {
        throw new Error('Class id is required');
      }

      const currentOwnerId = String(app.state.currentClassOwnerId || '').trim();
      const isSameClassSelection = nextClassId === app.state.currentClassId
        && (!requestedOwnerId || requestedOwnerId === currentOwnerId);
      if (isSameClassSelection) {
        return true;
      }

      const activeClass = (app.state.classes || []).find((entry) => {
        const entryClassId = String(entry?.id || '').trim();
        const entryOwnerId = String(entry?.ownerId || '').trim();
        if (entryClassId !== nextClassId) {
          return false;
        }
        if (!requestedOwnerId) {
          return true;
        }
        return entryOwnerId === requestedOwnerId;
      });
      if (!activeClass) {
        throw new Error('Selected class is not available');
      }

      app.state.currentClassId = nextClassId;
      app.state.currentClassName = activeClass?.name || app.state.currentClassName || 'My Class';
      app.state.currentClassOwnerId = String(activeClass?.ownerId || requestedOwnerId || '').trim();
      app.state.currentClassOwnerName = String(activeClass?.ownerName || '').trim() || 'Teacher';
      persistCurrentClassContext(nextClassId, app.state.currentClassOwnerId);
      app.syncDataContext();

      console.log('Current Class ID:', nextClassId || '(none)');
      console.log('User ID:', app.getCurrentClassOwnerId() || '(none)');

      applyRuntimeCollections([], [], []);
      app.state.dashboardStudentCount = null;
      app.state.studentTrash = sortTrashEntriesNewestFirst([]);
      app.state.classTrash = sortTrashEntriesNewestFirst([]);
      app.state.subjectTrash = sortTrashEntriesNewestFirst([]);
      app.state.examTrash = sortTrashEntriesNewestFirst([]);

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(nextClassId);
      }

      await app.load();
      return true;
    }, { allowInReadOnly: true });
  };

  app.deleteClass = async function (classId) {
    return enqueueStateWrite(async () => {
      const targetClassId = normalizeLabel(classId || app.state.currentClassId);
      if (!targetClassId) {
        throw new Error('Class id is required');
      }

      const targetClass = deepClone(app.state.classes || []).find(entry => entry.id === targetClassId);

      const result = await dataService.deleteClass(targetClassId);
      app.state.classes = Array.isArray(result?.classes) ? result.classes : [];
      app.state.currentClassId = String(result?.currentClassId || '').trim();
      app.state.currentClassName = String(result?.currentClassName || '').trim() || 'My Class';
      app.state.classTrash = sortTrashEntriesNewestFirst(Array.isArray(result?.trashClasses) ? result.trashClasses : app.state.classTrash || []);
      app.state.allowEmptyClassCatalog = Boolean(result?.allowEmptyClassCatalog);
      const currentClassEntry = (app.state.classes || []).find((entry) => String(entry?.id || '').trim() === app.state.currentClassId) || null;
      app.state.currentClassOwnerId = String(currentClassEntry?.ownerId || '').trim();
      app.state.currentClassOwnerName = String(currentClassEntry?.ownerName || '').trim() || 'Teacher';
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
      app.syncDataContext();

      console.log('Current Class ID:', app.state.currentClassId || '(none)');
      console.log('User ID:', app.getCurrentClassOwnerId() || '(none)');

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }

      await app.load();
      return result?.trashEntry || {
        id: targetClassId,
        name: targetClass?.name || 'Class',
        deletedAt: new Date().toISOString()
      };
    });
  };

  app.deleteClasses = async function (classIds = []) {
    return enqueueStateWrite(async () => {
      const targetClassIds = [...new Set((Array.isArray(classIds) ? classIds : []).map(id => normalizeLabel(id)).filter(Boolean))];
      if (!targetClassIds.length) {
        throw new Error('Select at least one class');
      }

      const result = await dataService.deleteClasses(targetClassIds);
      app.state.classes = normalizeClassCatalogEntries(Array.isArray(result?.classes) ? result.classes : []);
      app.state.currentClassId = String(result?.currentClassId || '').trim();
      app.state.currentClassName = String(result?.currentClassName || '').trim() || 'My Class';
      app.state.classTrash = sortTrashEntriesNewestFirst(Array.isArray(result?.trashClasses) ? result.trashClasses : app.state.classTrash || []);
      app.state.allowEmptyClassCatalog = Boolean(result?.allowEmptyClassCatalog);
      const currentClassEntry = (app.state.classes || []).find((entry) => String(entry?.id || '').trim() === app.state.currentClassId) || null;
      app.state.currentClassOwnerId = String(currentClassEntry?.ownerId || '').trim();
      app.state.currentClassOwnerName = String(currentClassEntry?.ownerName || '').trim() || 'Teacher';
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
      app.syncDataContext();

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }

      await app.load();
      return Array.isArray(result?.deletedEntries) ? result.deletedEntries : [];
    });
  };

  app.restoreClass = async function (classId) {
    return enqueueStateWrite(async () => {
      const targetClassId = normalizeLabel(classId);
      if (!targetClassId) {
        throw new Error('Class id is required');
      }

      const trashEntry = deepClone(app.state.classTrash || []).find(entry => entry.id === targetClassId);
      if (!trashEntry) {
        throw new Error('Class is not in trash');
      }

      const result = await dataService.restoreClass(targetClassId);
      app.state.classes = Array.isArray(result?.classes) ? result.classes : app.state.classes;
      app.state.classTrash = sortTrashEntriesNewestFirst(Array.isArray(result?.trashClasses) ? result.trashClasses : app.state.classTrash || []);
      app.state.currentClassId = String(result?.currentClassId || app.state.currentClassId || '').trim();
      app.state.currentClassName = String(result?.currentClassName || app.state.currentClassName || 'My Class').trim() || 'My Class';
      app.state.allowEmptyClassCatalog = Boolean(result?.allowEmptyClassCatalog);
      const currentClassEntry = (app.state.classes || []).find((entry) => String(entry?.id || '').trim() === app.state.currentClassId) || null;
      app.state.currentClassOwnerId = String(currentClassEntry?.ownerId || '').trim();
      app.state.currentClassOwnerName = String(currentClassEntry?.ownerName || '').trim() || 'Teacher';
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
      app.syncDataContext();

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }

      await app.load();
      return true;
    });
  };

  app.permanentlyDeleteClass = async function (classId) {
    return enqueueStateWrite(async () => {
      const targetClassId = normalizeLabel(classId);
      if (!targetClassId) {
        throw new Error('Class id is required');
      }

      const trashEntry = deepClone(app.state.classTrash || []).find(entry => entry.id === targetClassId);
      if (!trashEntry) {
        throw new Error('Class is not in trash');
      }

      const result = await dataService.permanentlyDeleteClass(targetClassId);
      app.state.classes = Array.isArray(result?.classes) ? result.classes : app.state.classes;
      app.state.classTrash = sortTrashEntriesNewestFirst(Array.isArray(result?.trashClasses) ? result.trashClasses : app.state.classTrash || []);
      app.state.currentClassId = String(result?.currentClassId || app.state.currentClassId || '').trim();
      app.state.currentClassName = String(result?.currentClassName || app.state.currentClassName || 'My Class').trim() || 'My Class';
      app.state.allowEmptyClassCatalog = Boolean(result?.allowEmptyClassCatalog);
      const currentClassEntry = (app.state.classes || []).find((entry) => String(entry?.id || '').trim() === app.state.currentClassId) || null;
      app.state.currentClassOwnerId = String(currentClassEntry?.ownerId || '').trim();
      app.state.currentClassOwnerName = String(currentClassEntry?.ownerName || '').trim() || 'Teacher';
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
      app.syncDataContext();

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }

      await app.load();
      return true;
    });
  };

  // CRUD operations for students
  app.addStudent = async function (studentData) {
    return enqueueStateWrite(async () => {
      try {
        const classContext = ensureResolvedClassContext('add student');
        const normalizedStudentData = normalizeStudentUpdate(studentData);
        const newStudent = {
          id: app.utils.uuid(),
          name: normalizeStudentName(normalizedStudentData.name),
          class: normalizedStudentData.class || '',
          notes: normalizedStudentData.notes || '',
          scores: normalizedStudentData.scores && typeof normalizedStudentData.scores === 'object' ? normalizedStudentData.scores : {},
          classId: classContext.classId,
          ownerId: classContext.ownerId,
          userId: classContext.ownerId
        };

        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        nextStudents.push(newStudent);

        const saveResult = await dataService.saveStudent(app.getRawData(), newStudent);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'save student');
        await logTrackedActivity('student_added', newStudent.id, 'student', {
          classId: classContext.classId,
          ownerId: classContext.ownerId,
          className: classContext.className,
          ownerName: classContext.ownerName,
          targetLabel: newStudent.name || 'Student'
        });
        await app.refreshDashboardStudentCount();
        return newStudent;
      } catch (error) {
        console.error('Failed to add student:', error);
        throw error;
      }
    });
  };

  app.restoreAllStudentsFromTrash = async function () {
    return enqueueStateWrite(async () => {
      const studentTrashIds = sortTrashEntriesNewestFirst(app.state.studentTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);
      const classTrashIds = sortTrashEntriesNewestFirst(app.state.classTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);
      const subjectTrashIds = sortTrashEntriesNewestFirst(app.state.subjectTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);
      const examTrashIds = sortTrashEntriesNewestFirst(app.state.examTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);

      const totalTrashCount = studentTrashIds.length + classTrashIds.length + subjectTrashIds.length + examTrashIds.length;

      if (!totalTrashCount) {
        return 0;
      }

      for (const studentId of studentTrashIds) {
        const saveResult = await dataService.restoreStudent(app.getRawData(), studentId);
        assertRemoteWriteSucceeded(saveResult, 'restore student');
      }
      for (const classId of classTrashIds) {
        await dataService.restoreClass(classId);
      }
      for (const subjectId of subjectTrashIds) {
        const saveResult = await dataService.restoreSubject(app.getRawData(), subjectId);
        assertRemoteWriteSucceeded(saveResult, 'restore subject');
      }
      for (const examId of examTrashIds) {
        const saveResult = await dataService.restoreExam(app.getRawData(), examId);
        assertRemoteWriteSucceeded(saveResult, 'restore exam');
      }

      await app.load();
      app.state.studentTrash = sortTrashEntriesNewestFirst(app.state.studentTrash || []);
      app.state.classTrash = sortTrashEntriesNewestFirst(app.state.classTrash || []);
      app.state.subjectTrash = sortTrashEntriesNewestFirst(app.state.subjectTrash || []);
      app.state.examTrash = sortTrashEntriesNewestFirst(app.state.examTrash || []);
      return totalTrashCount;
    });
  };

  app.emptyStudentTrash = async function () {
    return enqueueStateWrite(async () => {
      const studentTrashIds = sortTrashEntriesNewestFirst(app.state.studentTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);
      const classTrashIds = sortTrashEntriesNewestFirst(app.state.classTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);
      const subjectTrashIds = sortTrashEntriesNewestFirst(app.state.subjectTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);
      const examTrashIds = sortTrashEntriesNewestFirst(app.state.examTrash || [])
        .map(entry => String(entry?.id || '').trim())
        .filter(Boolean);

      const totalTrashCount = studentTrashIds.length + classTrashIds.length + subjectTrashIds.length + examTrashIds.length;

      if (!totalTrashCount) {
        return 0;
      }

      for (const studentId of studentTrashIds) {
        const saveResult = await dataService.permanentlyDeleteStudent(app.getRawData(), studentId);
        assertRemoteWriteSucceeded(saveResult, 'permanently delete student');
      }
      for (const classId of classTrashIds) {
        await dataService.permanentlyDeleteClass(classId);
      }
      for (const subjectId of subjectTrashIds) {
        const saveResult = await dataService.permanentlyDeleteSubject(app.getRawData(), subjectId);
        assertRemoteWriteSucceeded(saveResult, 'permanently delete subject');
      }
      for (const examId of examTrashIds) {
        const saveResult = await dataService.permanentlyDeleteExam(app.getRawData(), examId);
        assertRemoteWriteSucceeded(saveResult, 'permanently delete exam');
      }

      app.state.studentTrash = [];
      app.state.classTrash = [];
      app.state.subjectTrash = [];
      app.state.examTrash = [];
      return totalTrashCount;
    });
  };

  app.updateStudent = async function (studentId, studentData) {
    return enqueueStateWrite(async () => {
      try {
        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        const normalizedStudentData = normalizeStudentUpdate(studentData);
        const index = nextStudents.findIndex(s => s.id === studentId);
        if (index !== -1) {
          nextStudents[index] = { ...nextStudents[index], ...normalizedStudentData };
        }

        const saveResult = await dataService.updateStudent(app.getRawData(), studentId, normalizedStudentData);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'update student');
        return nextStudents[index];
      } catch (error) {
        console.error('Failed to update student:', error);
        throw error;
      }
    });
  };

  app.deleteStudent = async function (studentId) {
    return enqueueStateWrite(async () => {
      try {
        const existingStudent = deepClone(app.state.students || []).find(s => s.id === studentId);
        if (!existingStudent) {
          throw new Error('Student not found or already deleted');
        }

        const nextStudents = deepClone(app.state.students || []).filter(s => s.id !== studentId);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);

        const saveResult = await dataService.deleteStudent(app.getRawData(), studentId);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'delete student');

        const deletedEntry = saveResult?.trashEntry || {
          id: studentId,
          name: existingStudent.name || 'Student',
          deletedAt: new Date().toISOString()
        };

        app.state.studentTrash = sortTrashEntriesNewestFirst([
          deletedEntry,
          ...deepClone(app.state.studentTrash || []).filter(entry => entry?.id !== studentId)
        ]);

        await logTrackedActivity('student_deleted', studentId, 'student', {
          classId: app.state.currentClassId,
          className: app.state.currentClassName,
          ownerId: app.getCurrentClassOwnerId(),
          ownerName: app.getCurrentClassOwnerName(),
          targetLabel: existingStudent.name || deletedEntry.name || 'Student'
        });

        await app.refreshDashboardStudentCount();

        return deletedEntry;
      } catch (error) {
        console.error('Failed to delete student:', error);
        throw error;
      }
    });
  };

  app.restoreStudent = async function (studentId) {
    return enqueueStateWrite(async () => {
      try {
        const trashEntry = deepClone(app.state.studentTrash || []).find(s => s.id === studentId);
        if (!trashEntry) {
          throw new Error('Student is not in trash');
        }

        const saveResult = await dataService.restoreStudent(app.getRawData(), studentId);
        assertRemoteWriteSucceeded(saveResult, 'restore student');

        await app.load();
        app.state.studentTrash = deepClone(app.state.studentTrash || []).filter(entry => entry?.id !== studentId);
        return true;
      } catch (error) {
        console.error('Failed to restore student:', error);
        throw error;
      }
    });
  };

  app.permanentlyDeleteStudent = async function (studentId) {
    return enqueueStateWrite(async () => {
      try {
        const trashEntry = deepClone(app.state.studentTrash || []).find(s => s.id === studentId);
        if (!trashEntry) {
          throw new Error('Student is not in trash');
        }

        const saveResult = await dataService.permanentlyDeleteStudent(app.getRawData(), studentId);
        assertRemoteWriteSucceeded(saveResult, 'permanently delete student');

        app.state.studentTrash = deepClone(app.state.studentTrash || []).filter(entry => entry?.id !== studentId);
        return true;
      } catch (error) {
        console.error('Failed to permanently delete student:', error);
        throw error;
      }
    });
  };

  // CRUD operations for exams
  app.addExam = async function (examData) {
    return enqueueStateWrite(async () => {
      try {
        const classContext = ensureResolvedClassContext('add exam');
        const title = normalizeLabel(examData.title || examData.name);
        if (!title) throw new Error('Exam title is required');
        const newExam = {
          id: app.utils.uuid(),
          title,
          name: title,
          date: examData.date || new Date().toISOString(),
          classId: classContext.classId,
          ownerId: classContext.ownerId,
          userId: classContext.ownerId
        };

        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        nextExams.push(newExam);

        const saveResult = await dataService.updateExams(app.getRawData(), nextExams);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'update exams');
        return newExam;
      } catch (error) {
        console.error('Failed to add exam:', error);
        throw error;
      }
    });
  };

  app.updateExam = async function (examId, examData) {
    return enqueueStateWrite(async () => {
      try {
        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        const index = nextExams.findIndex(e => e.id === examId);
        if (index !== -1) {
          const current = nextExams[index];
          const nextTitle = normalizeLabel(examData.title || examData.name || current.title || current.name);
          nextExams[index] = { ...current, ...examData, title: nextTitle, name: nextTitle };
        }

        const saveResult = await dataService.saveAllData(composeRawData(nextStudents, nextSubjects, nextExams));
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'save exam changes');
        await logTrackedActivity('exam_updated', examId, 'exam', {
          classId: app.state.currentClassId
        });
        return nextExams[index];
      } catch (error) {
        console.error('Failed to update exam:', error);
        throw error;
      }
    });
  };

  app.deleteExam = async function (examId) {
    return enqueueStateWrite(async () => {
      try {
        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);

        const exam = nextExams.find(e => e.id === examId);
        const examTitle = exam?.title || exam?.name;
        const filteredExams = nextExams.filter(e => e.id !== examId);

        const saveResult = await dataService.deleteExam(composeRawData(nextStudents, nextSubjects, filteredExams), {
          id: examId,
          title: examTitle
        });
        syncRuntimeAndCache(nextStudents, nextSubjects, filteredExams, saveResult, 'delete exam');

        const deletedEntry = saveResult?.trashEntry || {
          id: examId,
          name: examTitle || 'Exam',
          deletedAt: new Date().toISOString()
        };

        app.state.examTrash = sortTrashEntriesNewestFirst([
          deletedEntry,
          ...deepClone(app.state.examTrash || []).filter(entry => entry?.id !== examId)
        ]);

        return deletedEntry;
      } catch (error) {
        console.error('Failed to delete exam:', error);
        throw error;
      }
    });
  };

  // CRUD operations for subjects
  app.addSubject = async function (subjectData) {
    return enqueueStateWrite(async () => {
      try {
        const classContext = ensureResolvedClassContext('add subject');
        const name = normalizeLabel(subjectData.name);
        if (!name) throw new Error('Subject name is required');
        const newSubject = {
          id: app.utils.uuid(),
          name,
          classId: classContext.classId,
          ownerId: classContext.ownerId,
          userId: classContext.ownerId
        };

        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        nextSubjects.push(newSubject);

        const saveResult = await dataService.updateSubjects(app.getRawData(), nextSubjects);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'update subjects');
        await logTrackedActivity('subject_created', newSubject.id, 'subject', {
          classId: classContext.classId,
          ownerId: classContext.ownerId,
          className: classContext.className,
          ownerName: classContext.ownerName
        });
        return newSubject;
      } catch (error) {
        console.error('Failed to add subject:', error);
        throw error;
      }
    });
  };

  app.updateSubject = async function (subjectId, subjectData) {
    return enqueueStateWrite(async () => {
      try {
        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        const index = nextSubjects.findIndex(s => s.id === subjectId);
        if (index !== -1) {
          const current = nextSubjects[index];
          const nextName = normalizeLabel(subjectData.name || current.name);
          nextSubjects[index] = { ...current, ...subjectData, name: nextName };
        }

        const saveResult = await dataService.saveAllData(composeRawData(nextStudents, nextSubjects, nextExams));
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'save subject changes');
        return nextSubjects[index];
      } catch (error) {
        console.error('Failed to update subject:', error);
        throw error;
      }
    });
  };

  app.deleteSubject = async function (subjectId) {
    return enqueueStateWrite(async () => {
      try {
        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);

        const subject = nextSubjects.find(s => s.id === subjectId);
        const subjectName = subject?.name;
        const filteredSubjects = nextSubjects.filter(s => s.id !== subjectId);

        const saveResult = await dataService.deleteSubject(composeRawData(nextStudents, filteredSubjects, nextExams), {
          id: subjectId,
          name: subjectName
        });
        syncRuntimeAndCache(nextStudents, filteredSubjects, nextExams, saveResult, 'delete subject');

        const deletedEntry = saveResult?.trashEntry || {
          id: subjectId,
          name: subjectName || 'Subject',
          deletedAt: new Date().toISOString()
        };

        app.state.subjectTrash = sortTrashEntriesNewestFirst([
          deletedEntry,
          ...deepClone(app.state.subjectTrash || []).filter(entry => entry?.id !== subjectId)
        ]);

        return deletedEntry;
      } catch (error) {
        console.error('Failed to delete subject:', error);
        throw error;
      }
    });
  };

  app.restoreExam = async function (examId) {
    return enqueueStateWrite(async () => {
      try {
        const trashEntry = deepClone(app.state.examTrash || []).find(e => e.id === examId);
        if (!trashEntry) {
          throw new Error('Exam is not in trash');
        }

        const saveResult = await dataService.restoreExam(app.getRawData(), examId);
        assertRemoteWriteSucceeded(saveResult, 'restore exam');

        await app.load();
        app.state.examTrash = deepClone(app.state.examTrash || []).filter(entry => entry?.id !== examId);
        return true;
      } catch (error) {
        console.error('Failed to restore exam:', error);
        throw error;
      }
    });
  };

  app.restoreSubject = async function (subjectId) {
    return enqueueStateWrite(async () => {
      try {
        const trashEntry = deepClone(app.state.subjectTrash || []).find(s => s.id === subjectId);
        if (!trashEntry) {
          throw new Error('Subject is not in trash');
        }

        const saveResult = await dataService.restoreSubject(app.getRawData(), subjectId);
        assertRemoteWriteSucceeded(saveResult, 'restore subject');

        await app.load();
        app.state.subjectTrash = deepClone(app.state.subjectTrash || []).filter(entry => entry?.id !== subjectId);
        return true;
      } catch (error) {
        console.error('Failed to restore subject:', error);
        throw error;
      }
    });
  };

  app.permanentlyDeleteExam = async function (examId) {
    return enqueueStateWrite(async () => {
      try {
        const trashEntry = deepClone(app.state.examTrash || []).find(e => e.id === examId);
        if (!trashEntry) {
          throw new Error('Exam is not in trash');
        }

        const saveResult = await dataService.permanentlyDeleteExam(app.getRawData(), examId);
        assertRemoteWriteSucceeded(saveResult, 'permanently delete exam');

        app.state.examTrash = deepClone(app.state.examTrash || []).filter(entry => entry?.id !== examId);
        return true;
      } catch (error) {
        console.error('Failed to permanently delete exam:', error);
        throw error;
      }
    });
  };

  app.permanentlyDeleteSubject = async function (subjectId) {
    return enqueueStateWrite(async () => {
      try {
        const trashEntry = deepClone(app.state.subjectTrash || []).find(s => s.id === subjectId);
        if (!trashEntry) {
          throw new Error('Subject is not in trash');
        }

        const saveResult = await dataService.permanentlyDeleteSubject(app.getRawData(), subjectId);
        assertRemoteWriteSucceeded(saveResult, 'permanently delete subject');

        app.state.subjectTrash = deepClone(app.state.subjectTrash || []).filter(entry => entry?.id !== subjectId);
        return true;
      } catch (error) {
        console.error('Failed to permanently delete subject:', error);
        throw error;
      }
    });
  };

  // Score operations
  app.saveScore = async function (scoreData) {
    return enqueueStateWrite(async () => {
      try {
        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);

        const student = nextStudents.find(s => s.id === scoreData.studentId);
        const exam = nextExams.find(e => e.id === scoreData.examId);
        const subjectId = String(
          scoreData.subjectId
          || app.analytics?.getSubjectId?.(scoreData.subject)
          || scoreData.subject
          || ''
        ).trim();
        if (!student || !exam || !subjectId) {
          throw new Error('Invalid score payload');
        }

        if (!student.scores || typeof student.scores !== 'object') {
          student.scores = {};
        }
        if (!student.scores[subjectId] || typeof student.scores[subjectId] !== 'object') {
          student.scores[subjectId] = {};
        }
        student.scores[subjectId][exam.id] = app.normalizeScore(scoreData.score);

        const saveResult = await dataService.saveScores(composeRawData(nextStudents, nextSubjects, nextExams), student.id, student.scores);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'save scores');
        return { ...scoreData, subjectId };
      } catch (error) {
        console.error('Failed to save score:', error);
        throw error;
      }
    });
  };

  // Get scores for a specific student and exam
  app.getScoresForStudent = async function (studentId, examId) {
    try {
      const scores = (app.state.scores || []).filter(score => {
        if (score.studentId !== studentId) return false;
        if (examId && score.examId !== examId) return false;
        return true;
      });
      return scores;
    } catch (error) {
      console.error('Failed to get scores:', error);
      throw error;
    }
  };

  // Theme management (still uses localStorage for UI preferences)
  app.applyTheme = function (t) {
    app.state.theme = String(t || app.state.theme || 'light').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
    const isDarkMode = app.state.theme === 'dark';

    document.body.classList.toggle('dark', isDarkMode);
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('light-mode', !isDarkMode);

    if (app.dom && app.dom.themeToggle) {
      app.dom.themeToggle.innerHTML = isDarkMode ? '☀' : '🌙';
      app.dom.themeToggle.title = isDarkMode ? 'Light Mode' : 'Dark Mode';
    }

    const systemThemeButton = (app.dom && app.dom.systemThemeToggleBtn)
      || document.getElementById('system-theme-toggle-btn');
    if (systemThemeButton) {
      const labelNode = systemThemeButton.querySelector('.system-tools-label');
      const nextLabel = isDarkMode ? 'Light Mode' : 'Dark Mode';
      if (labelNode) {
        labelNode.textContent = nextLabel;
      }
      systemThemeButton.title = nextLabel;
    }

    if (app.ui && typeof app.ui.renderClassSummary === 'function') {
      app.ui.renderClassSummary();
    }
    if (app.charts && typeof app.charts.renderStudentChart === 'function' && app.dom?.chartStudentSelect) {
      app.charts.renderStudentChart(app.dom.chartStudentSelect.value || '');
    }

    // Save theme preference to localStorage (UI preference, not data)
    localStorage.setItem('theme', app.state.theme);
  };

  // Load theme from localStorage on startup
  app.loadTheme = function () {
    const savedTheme = localStorage.getItem('theme') || 'light';
    app.applyTheme(savedTheme);
  };

  // Backup/Restore operations
  app.exportData = async function () {
    try {
      const exportData = {
        students: app.state.students,
        exams: app.state.exams,
        subjects: app.state.subjects,
        scores: app.state.scores,
        exportedAt: new Date().toISOString()
      };
      return exportData;
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  };

  app.importData = async function (importData) {
    return enqueueStateWrite(async () => {
      try {
        if (!app.state.isRoleResolved) {
          throw new Error('Permissions are still loading');
        }

        if (!app.canCurrentRoleWrite()) {
          throw new Error('Admin read-only mode: cannot import data');
        }

        app.state.isLoading = true;

        const migrated = app.migrateToRawData(importData);
        const saveResult = await dataService.saveAllData(migrated);
        assertRemoteWriteSucceeded(saveResult, 'import data');
        app.applyRawData(migrated);
        app.writeCachedData(migrated);
        return true;
      } catch (error) {
        console.error('Failed to import data:', error);
        throw error;
      } finally {
        app.state.isLoading = false;
      }
    });
  };

  // Utilities used across modules
  app.utils = {
    uuid: () => 'st_' + Math.random().toString(36).substr(2, 9),
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  };

  // Initialize theme on load
  app.loadTheme();

})(window.TrackerApp);

// Export for module usage
export default window.TrackerApp;
