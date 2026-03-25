/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — state.js
   Manages global application state with Firestore sync + cache fallback.
   ═══════════════════════════════════════════════ */

import * as dataService from '../services/db.js';

window.TrackerApp = window.TrackerApp || {};

(function (app) {
  'use strict';

  // State Variables
  app.state = {
    classes: [],
    currentClassId: '',
    currentClassName: 'My Class',
    students: [],
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
    selectedPerformanceCategory: 'strong'
  };

  const OFFLINE_CACHE_MESSAGE = 'Offline mode: using cached data';
  const OFFLINE_GRACE_PERIOD_MS = 3000;
  const CURRENT_CLASS_STORAGE_KEY = 'currentClassId';
  const LEGACY_DEFAULT_SUBJECTS = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies', 'Computing'];
  const LEGACY_DEFAULT_EXAMS = ['Mock 1'];
  let stateWriteChain = Promise.resolve();
  let hasShownOfflineToast = false;

  const normalizeClassStorageId = (value) => String(value || '').trim();

  const persistCurrentClassId = (classId) => {
    const normalizedClassId = normalizeClassStorageId(classId);
    if (typeof localStorage !== 'undefined') {
      if (normalizedClassId) {
        localStorage.setItem(CURRENT_CLASS_STORAGE_KEY, normalizedClassId);
      } else {
        localStorage.removeItem(CURRENT_CLASS_STORAGE_KEY);
      }
    }

    if (typeof sessionStorage !== 'undefined') {
      if (normalizedClassId) {
        sessionStorage.setItem(CURRENT_CLASS_STORAGE_KEY, normalizedClassId);
      } else {
        sessionStorage.removeItem(CURRENT_CLASS_STORAGE_KEY);
      }
    }
  };

  const readPersistedCurrentClassId = () => {
    const localValue = typeof localStorage !== 'undefined'
      ? normalizeClassStorageId(localStorage.getItem(CURRENT_CLASS_STORAGE_KEY))
      : '';
    if (localValue) {
      return localValue;
    }

    return typeof sessionStorage !== 'undefined'
      ? normalizeClassStorageId(sessionStorage.getItem(CURRENT_CLASS_STORAGE_KEY))
      : '';
  };

  app.state.currentClassId = readPersistedCurrentClassId();

  const createDefaultRawData = () => ({
    students: [],
    subjects: [],
    exams: []
  });

  const normalizeLabel = (value) => String(value || '').trim();
  const createId = (prefix, name, index) => {
    const base = normalizeLabel(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${prefix}_${base || index + 1}`;
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

  const enqueueStateWrite = (task) => {
    stateWriteChain = stateWriteChain.then(task, task);
    return stateWriteChain;
  };

  const deepClone = (value) => JSON.parse(JSON.stringify(value));

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
    const subjectLabels = (subjects || []).map(s => normalizeLabel(s.name)).filter(Boolean);
    const examLabels = (exams || []).map(e => normalizeLabel(e.title || e.name)).filter(Boolean);

    return {
      students: (students || []).map(student => ({
        id: student.id,
        name: student.name,
        notes: student.notes || '',
        class: student.class || '',
        scores: { ...(student.scores || {}) }
      })),
      subjects: subjectLabels,
      exams: examLabels
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
          const score = student.scores?.[subject.name]?.[exam.title];
          if (score !== '' && score !== undefined && score !== null && !isNaN(score)) {
            app.state.scores.push({
              id: `${student.id}_${exam.id}_${subject.id}`,
              studentId: student.id,
              examId: exam.id,
              subject: subject.name,
              score: Number(score)
            });
          }
        });
      });
    });
  };

  app.applyRawData = function (rawData) {
    const data = rawData || createDefaultRawData();
    const subjectLabels = (data.subjects || []).map(normalizeLabel).filter(Boolean);
    const examLabels = (data.exams || []).map(normalizeLabel).filter(Boolean);

    app.state.subjects = subjectLabels.map((name, idx) => ({ id: createId('sub', name, idx), name }));
    app.state.exams = examLabels.map((title, idx) => ({ id: createId('exam', title, idx), title, name: title }));

    app.state.students = (data.students || []).map((student, idx) => ({
      id: student.id || createId('st', student.name || `student-${idx + 1}`, idx),
      name: normalizeLabel(student.name) || `Student ${idx + 1}`,
      notes: student.notes || '',
      class: student.class || '',
      scores: student.scores && typeof student.scores === 'object' ? student.scores : {}
    }));

    rebuildRuntimeScores();
  };

  app.migrateToRawData = function (legacyData) {
    if (!legacyData || typeof legacyData !== 'object') {
      return createDefaultRawData();
    }

    const subjects = (legacyData.subjects || []).map(s => normalizeLabel(s?.name || s)).filter(Boolean);
    const exams = (legacyData.exams || []).map(e => normalizeLabel(e?.title || e?.name || e)).filter(Boolean);
    const subjectIdToName = new Map((legacyData.subjects || []).map(s => [s?.id, normalizeLabel(s?.name)]));
    const examIdToTitle = new Map((legacyData.exams || []).map(e => [e?.id, normalizeLabel(e?.title || e?.name)]));

    const students = (legacyData.students || []).map((student, idx) => {
      const rawStudent = {
        id: student.id || createId('st', student.name || `student-${idx + 1}`, idx),
        name: normalizeLabel(student.name),
        notes: student.notes || '',
        class: student.class || '',
        scores: {}
      };

      const sourceScores = student.scores || {};
      const maybeRaw = Object.keys(sourceScores).every(subjectKey => {
        const val = sourceScores[subjectKey];
        return val && typeof val === 'object' && !Array.isArray(val);
      });

      if (maybeRaw) {
        Object.entries(sourceScores).forEach(([subject, examMap]) => {
          const subjectLabel = normalizeLabel(subjectIdToName.get(subject) || subject);
          if (!subjectLabel) return;
          rawStudent.scores[subjectLabel] = rawStudent.scores[subjectLabel] || {};
          Object.entries(examMap || {}).forEach(([exam, value]) => {
            const examLabel = normalizeLabel(examIdToTitle.get(exam) || exam);
            if (!examLabel) return;
            rawStudent.scores[subjectLabel][examLabel] = app.normalizeScore(value);
          });
        });
      }

      return rawStudent;
    });

    (legacyData.scores || []).forEach(score => {
      const student = students.find(s => s.id === score.studentId);
      if (!student) return;
      const subjectLabel = normalizeLabel(score.subjectId ? subjectIdToName.get(score.subjectId) : score.subject);
      const examLabel = normalizeLabel(examIdToTitle.get(score.examId));
      if (!subjectLabel || !examLabel) return;
      if (!student.scores[subjectLabel]) {
        student.scores[subjectLabel] = {};
      }
      student.scores[subjectLabel][examLabel] = app.normalizeScore(score.score);
    });

    const normalizedSubjects = subjects.length ? subjects : createDefaultRawData().subjects;
    const normalizedExams = exams.length ? exams : createDefaultRawData().exams;

    if (!hasAnyRawScores(students) && isLegacySeedTemplate(normalizedSubjects, normalizedExams)) {
      return {
        students,
        subjects: [],
        exams: []
      };
    }

    return {
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

      if (!app.state.currentClassId) {
        app.state.currentClassId = readPersistedCurrentClassId();
      }

      if (typeof dataService.setCurrentClassId === 'function' && app.state.currentClassId) {
        dataService.setCurrentClassId(app.state.currentClassId);
      }

      const remoteResult = await dataService.fetchAllData();
      const nextClasses = Array.isArray(remoteResult?.classes) ? remoteResult.classes : [];
      const nextClassId = String(remoteResult?.currentClassId || '').trim();
      const nextClassName = String(remoteResult?.currentClassName || '').trim() || 'My Class';
      app.state.classes = nextClasses;
      app.state.currentClassId = nextClassId;
      app.state.currentClassName = nextClassName;
      persistCurrentClassId(nextClassId);

      console.log('Current Class ID:', nextClassId || '(none)');
      console.log('User ID:', app.state.authUser?.uid || '(none)');

      if (typeof dataService.setCurrentClassId === 'function' && nextClassId) {
        dataService.setCurrentClassId(nextClassId);
      }

      const remoteData = app.migrateToRawData(remoteResult?.data || createDefaultRawData());
      app.applyRawData(remoteData);
      app.writeCachedData(remoteData, nextClassId);

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

      const fallbackCache = app.readCachedData();
      if (fallbackCache?.data) {
        const fallbackClassId = String(fallbackCache.classId || app.state.currentClassId || '').trim();
        if (fallbackClassId) {
          app.state.currentClassId = fallbackClassId;
          persistCurrentClassId(fallbackClassId);
          if (typeof dataService.setCurrentClassId === 'function') {
            dataService.setCurrentClassId(fallbackClassId);
          }
        }
        app.applyRawData(app.migrateToRawData(fallbackCache.data));
      } else {
        const fallback = createDefaultRawData();
        app.applyRawData(fallback);
        app.writeCachedData(fallback);
      }
    } finally {
      app.state.isLoading = false;
    }
  };

  const applyRuntimeCollections = (students, subjects, exams) => {
    app.state.students = students;
    app.state.subjects = subjects;
    app.state.exams = exams;
    rebuildRuntimeScores();
  };

  const syncRuntimeAndCache = (students, subjects, exams, saveResult, operationLabel = 'save data') => {
    assertRemoteWriteSucceeded(saveResult, operationLabel);
    if (saveResult?.classId) {
      app.state.currentClassId = String(saveResult.classId || '').trim();
      persistCurrentClassId(app.state.currentClassId);
      if (typeof dataService.setCurrentClassId === 'function' && app.state.currentClassId) {
        dataService.setCurrentClassId(app.state.currentClassId);
      }
    }
    applyRuntimeCollections(students, subjects, exams);
    app.writeCachedData(composeRawData(students, subjects, exams));
  };

  app.createClass = async function (className) {
    return enqueueStateWrite(async () => {
      const nextName = normalizeLabel(className) || 'My Class';
      const result = await dataService.createClass(nextName);
      app.state.classes = Array.isArray(result?.classes) ? result.classes : app.state.classes;
      app.state.currentClassId = String(result?.currentClassId || '').trim();
      app.state.currentClassName = String(result?.currentClassName || nextName).trim() || nextName;
      persistCurrentClassId(app.state.currentClassId);

      console.log('Current Class ID:', app.state.currentClassId || '(none)');
      console.log('User ID:', app.state.authUser?.uid || '(none)');

      if (typeof dataService.setCurrentClassId === 'function' && app.state.currentClassId) {
        dataService.setCurrentClassId(app.state.currentClassId);
      }

      await app.load();
      return result?.class || null;
    });
  };

  app.switchClass = async function (classId) {
    return enqueueStateWrite(async () => {
      const nextClassId = normalizeLabel(classId);
      if (!nextClassId) {
        throw new Error('Class id is required');
      }

      if (nextClassId === app.state.currentClassId) {
        return true;
      }

      app.state.currentClassId = nextClassId;
      const activeClass = (app.state.classes || []).find(entry => entry.id === nextClassId);
      app.state.currentClassName = activeClass?.name || app.state.currentClassName || 'My Class';
      persistCurrentClassId(nextClassId);

      console.log('Current Class ID:', nextClassId || '(none)');
      console.log('User ID:', app.state.authUser?.uid || '(none)');

      applyRuntimeCollections([], [], []);

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(nextClassId);
      }

      await app.load();
      return true;
    });
  };

  app.deleteClass = async function (classId) {
    return enqueueStateWrite(async () => {
      const targetClassId = normalizeLabel(classId || app.state.currentClassId);
      if (!targetClassId) {
        throw new Error('Class id is required');
      }

      const result = await dataService.deleteClass(targetClassId);
      app.state.classes = Array.isArray(result?.classes) ? result.classes : [];
      app.state.currentClassId = String(result?.currentClassId || '').trim();
      app.state.currentClassName = String(result?.currentClassName || '').trim() || 'My Class';
      persistCurrentClassId(app.state.currentClassId);

      console.log('Current Class ID:', app.state.currentClassId || '(none)');
      console.log('User ID:', app.state.authUser?.uid || '(none)');

      if (typeof dataService.setCurrentClassId === 'function' && app.state.currentClassId) {
        dataService.setCurrentClassId(app.state.currentClassId);
      }

      await app.load();
      return true;
    });
  };

  // CRUD operations for students
  app.addStudent = async function (studentData) {
    return enqueueStateWrite(async () => {
      try {
        const newStudent = {
          id: app.utils.uuid(),
          name: normalizeLabel(studentData.name),
          class: studentData.class || '',
          notes: studentData.notes || '',
          scores: studentData.scores && typeof studentData.scores === 'object' ? studentData.scores : {}
        };

        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        nextStudents.push(newStudent);

        const saveResult = await dataService.saveStudent(app.getRawData(), newStudent);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'save student');
        return newStudent;
      } catch (error) {
        console.error('Failed to add student:', error);
        throw error;
      }
    });
  };

  app.updateStudent = async function (studentId, studentData) {
    return enqueueStateWrite(async () => {
      try {
        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        const index = nextStudents.findIndex(s => s.id === studentId);
        if (index !== -1) {
          nextStudents[index] = { ...nextStudents[index], ...studentData };
        }

        const saveResult = await dataService.updateStudent(app.getRawData(), studentId, studentData);
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
        const nextStudents = deepClone(app.state.students || []).filter(s => s.id !== studentId);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);

        const saveResult = await dataService.deleteStudent(app.getRawData(), studentId);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'delete student');
        return true;
      } catch (error) {
        console.error('Failed to delete student:', error);
        throw error;
      }
    });
  };

  // CRUD operations for exams
  app.addExam = async function (examData) {
    return enqueueStateWrite(async () => {
      try {
        const title = normalizeLabel(examData.title || examData.name);
        if (!title) throw new Error('Exam title is required');
        const newExam = {
          id: app.utils.uuid(),
          title,
          name: title,
          date: examData.date || new Date().toISOString()
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
          const prevTitle = current.title || current.name;
          const nextTitle = normalizeLabel(examData.title || examData.name || prevTitle);
          nextExams[index] = { ...current, ...examData, title: nextTitle, name: nextTitle };

          if (prevTitle !== nextTitle) {
            nextStudents.forEach(student => {
              Object.keys(student.scores || {}).forEach(subject => {
                const examScores = student.scores[subject] || {};
                if (Object.prototype.hasOwnProperty.call(examScores, prevTitle)) {
                  examScores[nextTitle] = examScores[prevTitle];
                  delete examScores[prevTitle];
                }
              });
            });
          }
        }

        const saveResult = await dataService.saveAllData(composeRawData(nextStudents, nextSubjects, nextExams));
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'save exam changes');
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

        if (examTitle) {
          nextStudents.forEach(student => {
            Object.keys(student.scores || {}).forEach(subject => {
              if (student.scores[subject]) {
                delete student.scores[subject][examTitle];
              }
            });
          });
        }

        const saveResult = await dataService.saveAllData(composeRawData(nextStudents, nextSubjects, filteredExams));
        syncRuntimeAndCache(nextStudents, nextSubjects, filteredExams, saveResult, 'delete exam');
        return true;
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
        const name = normalizeLabel(subjectData.name);
        if (!name) throw new Error('Subject name is required');
        const newSubject = { id: app.utils.uuid(), name };

        const nextStudents = deepClone(app.state.students || []);
        const nextSubjects = deepClone(app.state.subjects || []);
        const nextExams = deepClone(app.state.exams || []);
        nextSubjects.push(newSubject);

        const saveResult = await dataService.updateSubjects(app.getRawData(), nextSubjects);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'update subjects');
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
          const prevName = current.name;
          const nextName = normalizeLabel(subjectData.name || prevName);
          nextSubjects[index] = { ...current, ...subjectData, name: nextName };

          if (prevName !== nextName) {
            nextStudents.forEach(student => {
              if (student.scores?.[prevName]) {
                student.scores[nextName] = student.scores[prevName];
                delete student.scores[prevName];
              }
            });
          }
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

        if (subjectName) {
          nextStudents.forEach(student => {
            if (student.scores?.[subjectName]) {
              delete student.scores[subjectName];
            }
          });
        }

        const saveResult = await dataService.saveAllData(composeRawData(nextStudents, filteredSubjects, nextExams));
        syncRuntimeAndCache(nextStudents, filteredSubjects, nextExams, saveResult, 'delete subject');
        return true;
      } catch (error) {
        console.error('Failed to delete subject:', error);
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
        if (!student || !exam || !scoreData.subject) {
          throw new Error('Invalid score payload');
        }

        const examLabel = exam.title || exam.name;
        if (!student.scores[scoreData.subject]) {
          student.scores[scoreData.subject] = {};
        }
        student.scores[scoreData.subject][examLabel] = app.normalizeScore(scoreData.score);

        const saveResult = await dataService.saveScores(app.getRawData(), student.id, student.scores);
        syncRuntimeAndCache(nextStudents, nextSubjects, nextExams, saveResult, 'save scores');
        return scoreData;
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
    app.state.theme = t || app.state.theme;
    document.body.className = app.state.theme === 'dark' ? 'dark-mode' : 'light-mode';
    if (app.dom && app.dom.themeToggle) {
      app.dom.themeToggle.innerHTML = app.state.theme === 'dark' ? '☀' : '🌙';
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
