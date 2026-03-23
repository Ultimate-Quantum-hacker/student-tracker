/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — state.js
   Manages global application state with Firestore backend.
   ═══════════════════════════════════════════════ */

import { 
  getStudents, 
  addStudent, 
  updateStudent, 
  deleteStudent,
  getExams,
  addExam,
  updateExam,
  deleteExam,
  getSubjects,
  addSubject,
  updateSubject,
  deleteSubject,
  getScores,
  saveScore
} from '../services/db.js';

window.TrackerApp = window.TrackerApp || {};

(function (app) {
  'use strict';

  // State Variables
  app.state = {
    students: [],
    exams: [],
    subjects: [],
    scores: [],
    lastBackup: null,
    theme: 'light',
    notesId: null,
    editingId: null,
    deletingId: null,
    searchTerm: '',
    isLoading: false,
    error: null
  };

  const STORAGE_KEY = 'studentAppData';
  const LEGACY_DEFAULT_SUBJECTS = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies', 'Computing'];
  const LEGACY_DEFAULT_EXAMS = ['Mock 1'];

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

  app.saveToStorage = function (data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  app.loadFromStorage = function () {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  };

  app.getRawData = function () {
    const subjectLabels = (app.state.subjects || []).map(s => normalizeLabel(s.name)).filter(Boolean);
    const examLabels = (app.state.exams || []).map(e => normalizeLabel(e.title || e.name)).filter(Boolean);

    return {
      students: (app.state.students || []).map(student => ({
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

  // Persistence Methods - Now async with Firestore
  app.save = async function () {
    app.saveToStorage(app.getRawData());
  };

  app.load = async function () {
    try {
      app.state.isLoading = true;
      app.state.error = null;

      const localData = app.loadFromStorage();
      if (localData) {
        const migrated = app.migrateToRawData(localData);
        app.applyRawData(migrated);
        return;
      }

      const [students, exams, subjects, scores] = await Promise.all([
        getStudents(),
        getExams(),
        getSubjects(),
        getScores()
      ]);

      const migrated = app.migrateToRawData({ students, exams, subjects, scores });
      app.applyRawData(migrated);
      await app.save();
      
    } catch (error) {
      console.error('Failed to load data from Firestore:', error);
      app.state.error = 'Failed to load data. Please check your internet connection.';
      throw error;
    } finally {
      app.state.isLoading = false;
    }
  };

  // CRUD operations for students
  app.addStudent = async function (studentData) {
    try {
      const newStudent = {
        id: app.utils.uuid(),
        name: normalizeLabel(studentData.name),
        class: studentData.class || '',
        notes: studentData.notes || '',
        scores: studentData.scores && typeof studentData.scores === 'object' ? studentData.scores : {}
      };
      app.state.students.push(newStudent);
      await app.save();
      return newStudent;
    } catch (error) {
      console.error('Failed to add student:', error);
      throw error;
    }
  };

  app.updateStudent = async function (studentId, studentData) {
    try {
      const index = app.state.students.findIndex(s => s.id === studentId);
      if (index !== -1) {
        app.state.students[index] = { ...app.state.students[index], ...studentData };
      }
      await app.save();
      return app.state.students[index];
    } catch (error) {
      console.error('Failed to update student:', error);
      throw error;
    }
  };

  app.deleteStudent = async function (studentId) {
    try {
      app.state.students = app.state.students.filter(s => s.id !== studentId);
      app.state.scores = app.state.scores.filter(score => score.studentId !== studentId);
      await app.save();
      return true;
    } catch (error) {
      console.error('Failed to delete student:', error);
      throw error;
    }
  };

  // CRUD operations for exams
  app.addExam = async function (examData) {
    try {
      const title = normalizeLabel(examData.title || examData.name);
      if (!title) throw new Error('Exam title is required');
      const newExam = {
        id: app.utils.uuid(),
        title,
        name: title,
        date: examData.date || new Date().toISOString()
      };
      app.state.exams.push(newExam);
      await app.save();
      return newExam;
    } catch (error) {
      console.error('Failed to add exam:', error);
      throw error;
    }
  };

  app.updateExam = async function (examId, examData) {
    try {
      const index = app.state.exams.findIndex(e => e.id === examId);
      if (index !== -1) {
        const current = app.state.exams[index];
        const prevTitle = current.title || current.name;
        const nextTitle = normalizeLabel(examData.title || examData.name || prevTitle);
        app.state.exams[index] = { ...current, ...examData, title: nextTitle, name: nextTitle };

        if (prevTitle !== nextTitle) {
          app.state.students.forEach(student => {
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
      await app.save();
      return app.state.exams[index];
    } catch (error) {
      console.error('Failed to update exam:', error);
      throw error;
    }
  };

  app.deleteExam = async function (examId) {
    try {
      const exam = app.state.exams.find(e => e.id === examId);
      const examTitle = exam?.title || exam?.name;
      app.state.exams = app.state.exams.filter(e => e.id !== examId);
      app.state.scores = app.state.scores.filter(score => score.examId !== examId);

      if (examTitle) {
        app.state.students.forEach(student => {
          Object.keys(student.scores || {}).forEach(subject => {
            if (student.scores[subject]) {
              delete student.scores[subject][examTitle];
            }
          });
        });
      }

      await app.save();
      return true;
    } catch (error) {
      console.error('Failed to delete exam:', error);
      throw error;
    }
  };

  // CRUD operations for subjects
  app.addSubject = async function (subjectData) {
    try {
      const name = normalizeLabel(subjectData.name);
      if (!name) throw new Error('Subject name is required');
      const newSubject = { id: app.utils.uuid(), name };
      app.state.subjects.push(newSubject);
      await app.save();
      return newSubject;
    } catch (error) {
      console.error('Failed to add subject:', error);
      throw error;
    }
  };

  app.updateSubject = async function (subjectId, subjectData) {
    try {
      const index = app.state.subjects.findIndex(s => s.id === subjectId);
      if (index !== -1) {
        const current = app.state.subjects[index];
        const prevName = current.name;
        const nextName = normalizeLabel(subjectData.name || prevName);
        app.state.subjects[index] = { ...current, ...subjectData, name: nextName };

        if (prevName !== nextName) {
          app.state.students.forEach(student => {
            if (student.scores?.[prevName]) {
              student.scores[nextName] = student.scores[prevName];
              delete student.scores[prevName];
            }
          });
        }
      }
      await app.save();
      return app.state.subjects[index];
    } catch (error) {
      console.error('Failed to update subject:', error);
      throw error;
    }
  };

  app.deleteSubject = async function (subjectId) {
    try {
      const subject = app.state.subjects.find(s => s.id === subjectId);
      const subjectName = subject?.name;
      app.state.subjects = app.state.subjects.filter(s => s.id !== subjectId);
      app.state.scores = app.state.scores.filter(score => score.subject !== subjectName);

      if (subjectName) {
        app.state.students.forEach(student => {
          if (student.scores?.[subjectName]) {
            delete student.scores[subjectName];
          }
        });
      }

      await app.save();
      return true;
    } catch (error) {
      console.error('Failed to delete subject:', error);
      throw error;
    }
  };

  // Score operations
  app.saveScore = async function (scoreData) {
    try {
      const student = app.state.students.find(s => s.id === scoreData.studentId);
      const exam = app.state.exams.find(e => e.id === scoreData.examId);
      if (!student || !exam || !scoreData.subject) {
        throw new Error('Invalid score payload');
      }

      const examLabel = exam.title || exam.name;
      if (!student.scores[scoreData.subject]) {
        student.scores[scoreData.subject] = {};
      }
      student.scores[scoreData.subject][examLabel] = app.normalizeScore(scoreData.score);

      await app.save();
      return scoreData;
    } catch (error) {
      console.error('Failed to save score:', error);
      throw error;
    }
  };

  // Get scores for a specific student and exam
  app.getScoresForStudent = async function (studentId, examId) {
    try {
      const scores = await getScores(studentId, examId);
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

  // Backup/Restore operations (now export/import from Firestore)
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
    try {
      app.state.isLoading = true;

      const migrated = app.migrateToRawData(importData);
      app.applyRawData(migrated);
      await app.save();
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    } finally {
      app.state.isLoading = false;
    }
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
