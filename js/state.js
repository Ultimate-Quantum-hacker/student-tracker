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
  saveScore,
  initializeDefaultData
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

  // Persistence Methods - Now async with Firestore
  app.save = async function () {
    // Firestore handles persistence automatically
    // This function is kept for compatibility but no longer does anything
    console.log('Data is automatically persisted to Firestore');
  };

  app.load = async function () {
    try {
      app.state.isLoading = true;
      app.state.error = null;
      
      console.log('Loading data from Firestore...');
      
      // Load all data in parallel
      const [students, exams, subjects, scores] = await Promise.all([
        getStudents(),
        getExams(),
        getSubjects(),
        getScores()
      ]);
      
      // Update state with fetched data
      app.state.students = students || [];
      app.state.exams = exams || [];
      app.state.subjects = subjects || [];
      app.state.scores = scores || [];
      
      console.log('Data loaded from Firestore:', {
        students: app.state.students.length,
        exams: app.state.exams.length,
        subjects: app.state.subjects.length,
        scores: app.state.scores.length
      });
      
      // Initialize default data only if completely empty
      if (app.state.subjects.length === 0) {
        console.log('No subjects found, creating defaults...');
        const defaultSubjects = [
          { name: 'English Language' },
          { name: 'Mathematics' },
          { name: 'Integrated Science' },
          { name: 'Social Studies' },
          { name: 'Computing' }
        ];
        
        for (const subjectData of defaultSubjects) {
          const newSubject = await addSubject(subjectData);
          app.state.subjects.push(newSubject);
        }
      }
      
      if (app.state.exams.length === 0) {
        console.log('No exams found, creating default...');
        const defaultExam = await addExam({ title: 'Mock 1', date: new Date().toISOString() });
        app.state.exams.push(defaultExam);
      }
      
      console.log('Final state after initialization:', {
        students: app.state.students.length,
        exams: app.state.exams.length,
        subjects: app.state.subjects.length,
        scores: app.state.scores.length
      });
      
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
      const newStudent = await addStudent(studentData);
      app.state.students.push(newStudent);
      await app.save(); // For compatibility
      return newStudent;
    } catch (error) {
      console.error('Failed to add student:', error);
      throw error;
    }
  };

  app.updateStudent = async function (studentId, studentData) {
    try {
      const updatedStudent = await updateStudent(studentId, studentData);
      const index = app.state.students.findIndex(s => s.id === studentId);
      if (index !== -1) {
        app.state.students[index] = updatedStudent;
      }
      await app.save(); // For compatibility
      return updatedStudent;
    } catch (error) {
      console.error('Failed to update student:', error);
      throw error;
    }
  };

  app.deleteStudent = async function (studentId) {
    try {
      await deleteStudent(studentId);
      app.state.students = app.state.students.filter(s => s.id !== studentId);
      // Also remove related scores
      app.state.scores = app.state.scores.filter(score => score.studentId !== studentId);
      await app.save(); // For compatibility
      return true;
    } catch (error) {
      console.error('Failed to delete student:', error);
      throw error;
    }
  };

  // CRUD operations for exams
  app.addExam = async function (examData) {
    try {
      const newExam = await addExam(examData);
      app.state.exams.push(newExam);
      await app.save(); // For compatibility
      return newExam;
    } catch (error) {
      console.error('Failed to add exam:', error);
      throw error;
    }
  };

  app.updateExam = async function (examId, examData) {
    try {
      const updatedExam = await updateExam(examId, examData);
      const index = app.state.exams.findIndex(e => e.id === examId);
      if (index !== -1) {
        app.state.exams[index] = updatedExam;
      }
      await app.save(); // For compatibility
      return updatedExam;
    } catch (error) {
      console.error('Failed to update exam:', error);
      throw error;
    }
  };

  app.deleteExam = async function (examId) {
    try {
      await deleteExam(examId);
      app.state.exams = app.state.exams.filter(e => e.id !== examId);
      // Also remove related scores
      app.state.scores = app.state.scores.filter(score => score.examId !== examId);
      await app.save(); // For compatibility
      return true;
    } catch (error) {
      console.error('Failed to delete exam:', error);
      throw error;
    }
  };

  // CRUD operations for subjects
  app.addSubject = async function (subjectData) {
    try {
      const newSubject = await addSubject(subjectData);
      app.state.subjects.push(newSubject);
      await app.save(); // For compatibility
      return newSubject;
    } catch (error) {
      console.error('Failed to add subject:', error);
      throw error;
    }
  };

  app.updateSubject = async function (subjectId, subjectData) {
    try {
      const updatedSubject = await updateSubject(subjectId, subjectData);
      const index = app.state.subjects.findIndex(s => s.id === subjectId);
      if (index !== -1) {
        app.state.subjects[index] = updatedSubject;
      }
      await app.save(); // For compatibility
      return updatedSubject;
    } catch (error) {
      console.error('Failed to update subject:', error);
      throw error;
    }
  };

  app.deleteSubject = async function (subjectId) {
    try {
      await deleteSubject(subjectId);
      app.state.subjects = app.state.subjects.filter(s => s.id !== subjectId);
      // Also remove related scores
      app.state.scores = app.state.scores.filter(score => score.subjectId === subjectId);
      await app.save(); // For compatibility
      return true;
    } catch (error) {
      console.error('Failed to delete subject:', error);
      throw error;
    }
  };

  // Score operations
  app.saveScore = async function (scoreData) {
    try {
      const savedScore = await saveScore(scoreData);
      
      // Update local state
      const existingIndex = app.state.scores.findIndex(s => 
        s.studentId === scoreData.studentId && 
        s.examId === scoreData.examId && 
        s.subject === scoreData.subject
      );
      
      if (existingIndex !== -1) {
        app.state.scores[existingIndex] = savedScore;
      } else {
        app.state.scores.push(savedScore);
      }
      
      await app.save(); // For compatibility
      return savedScore;
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
    document.body.className = app.state.theme === 'dark' ? 'dark-mode' : '';
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
      
      // This would require batch operations in a real implementation
      // For now, we'll update the local state and rely on individual operations
      app.state.students = importData.students || [];
      app.state.exams = importData.exams || [];
      app.state.subjects = importData.subjects || [];
      app.state.scores = importData.scores || [];
      
      await app.save(); // For compatibility
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
