/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — students.js
   Handles all student data mutations with Firestore.
   ═══════════════════════════════════════════════ */

import app from './state.js';
import { auth } from './firebase.js';

const resolveApp = (runtimeApp) => runtimeApp || app;
const resolveUi = (runtimeUi, runtimeApp) => runtimeUi || runtimeApp?.ui;
const isReadOnlyRoleContext = (appRef) => typeof appRef?.isReadOnlyRoleContext === 'function' && appRef.isReadOnlyRoleContext();
const getReadOnlyMessage = (appRef) => {
  const label = typeof appRef?.getCurrentClassOwnerName === 'function'
    ? String(appRef.getCurrentClassOwnerName() || '').trim()
    : '';
  const target = label || 'selected class';
  return `Viewing class as admin (Read-only mode): ${target}. This action is disabled.`;
};
const ensureWritable = (appRef, uiRef) => {
  if (!isReadOnlyRoleContext(appRef)) {
    return true;
  }

  uiRef?.showToast?.(getReadOnlyMessage(appRef));
  return false;
};
const isReadOnlyError = (error) => String(error?.code || '').trim().toLowerCase() === 'app/read-only-admin';

const students = {
  addStudent: async function (name, runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return false;

    const n = name.trim();
    if (!n) {
      uiRef?.showToast?.('Enter a student name first');
      return false;
    }
    
    try {
      await appRef.addStudent({ name: n, class: '', notes: '', scores: {} });
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student added');
      return true;
    } catch (error) {
      console.error('Failed to add student:', error);
      uiRef?.showToast?.('Failed to add student');
      return false;
    }
  },

  deleteStudent: function (uid, runtimeApp) {
    const appRef = resolveApp(runtimeApp);
    if (!ensureWritable(appRef, appRef?.ui)) return;

    const s = appRef.state.students.find(x => x.id === uid);
    if (!s) return;
    console.log('Deleting student:', uid);
    console.log('User:', auth?.currentUser?.uid || 'unknown');
    appRef.state.deletingId = uid;
    if (appRef.dom.deleteConfirmMsg) {
      appRef.dom.deleteConfirmMsg.textContent = `Delete ${s.name}? This will move the student to Trash and remove active score entry from the current class.`;
    }
    appRef.dom.deleteModal?.classList.add('active');
  },

  confirmDelete: async function (runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return;

    const uid = appRef.state.deletingId;
    if (!uid) return;
    const student = appRef.state.students.find(x => x.id === uid);
    const studentName = student?.name || 'Student';
    
    try {
      console.log('Deleting student:', uid);
      console.log('User:', auth?.currentUser?.uid || 'unknown');
      const deletedEntry = await appRef.deleteStudent(uid);
      appRef.state.deletingId = null;
      appRef.dom.deleteModal?.classList.remove('active');
      uiRef?.refreshUI?.();
      uiRef?.showUndoDeleteToast?.(deletedEntry?.id || uid, deletedEntry?.name || studentName);
    } catch (error) {
      console.error('Failed to delete student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to delete student');
    }
  },

  restoreStudent: async function (uid, runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return false;

    const normalizedId = String(uid || '').trim();
    if (!normalizedId) return false;

    try {
      await appRef.restoreStudent(normalizedId);
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student restored');
      return true;
    } catch (error) {
      console.error('Failed to restore student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to restore student');
      return false;
    }
  },

  permanentlyDeleteStudent: async function (uid, runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return false;

    const normalizedId = String(uid || '').trim();
    if (!normalizedId) return false;

    try {
      await appRef.permanentlyDeleteStudent(normalizedId);
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student permanently deleted');
      return true;
    } catch (error) {
      console.error('Failed to permanently delete student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to delete student');
      return false;
    }
  },

  startEdit: function (uid, runtimeApp) {
    const appRef = resolveApp(runtimeApp);
    if (!ensureWritable(appRef, appRef?.ui)) return;

    const s = appRef.state.students.find(x => x.id === uid);
    if (!s) return;
    console.log('Editing student:', uid);
    console.log('User:', auth?.currentUser?.uid || 'unknown');
    appRef.state.editingId = uid;
    if (appRef.dom.editInput) {
      appRef.dom.editInput.value = s.name;
      appRef.dom.editInput.focus();
      appRef.dom.editInput.select();
    }
    appRef.dom.editModal?.classList.add('active');
  },

  saveEdit: async function (runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return;

    const uid = appRef.state.editingId;
    if (!uid) return;
    
    const newName = appRef.dom.editInput.value.trim();
    if (!newName) {
      uiRef?.showToast?.('Student name cannot be empty');
      return;
    }
    
    try {
      console.log('Editing student:', uid);
      console.log('User:', auth?.currentUser?.uid || 'unknown');
      await appRef.updateStudent(uid, { name: newName });
      appRef.state.editingId = null;
      appRef.dom.editModal?.classList.remove('active');
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student updated');
    } catch (error) {
      console.error('Failed to update student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to update student');
    }
  },

  bulkImport: function (csv, app, ui) {
    if (!ensureWritable(app, ui)) return;

    const lines = csv.trim().split('\n');
    const newStudents = [];
    
    lines.forEach(line => {
      const parts = line.split(',').map(p => p.trim());
      if (parts[0]) {
        newStudents.push({
          name: parts[0],
          class: parts[1] || '',
          notes: parts[2] || ''
        });
      }
    });
    
    if (newStudents.length === 0) {
      ui.showToast('No valid students found');
      return;
    }
    
    if (!window.confirm(`Import ${newStudents.length} students into the active class?`)) {
      return;
    }

    this.importStudents(newStudents, app, ui);
  },

  importStudents: async function (studentsData, app, ui) {
    if (!ensureWritable(app, ui)) return;

    try {
      if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
        app.snapshots.saveSnapshot('Auto Backup Before Bulk Student Import');
      }
      for (const studentData of studentsData) {
        await app.addStudent({ ...studentData, scores: {} });
      }
      ui.refreshUI();
      ui.showToast(`${studentsData.length} students imported`);
    } catch (error) {
      console.error('Failed to import students:', error);
      ui.showToast(isReadOnlyError(error) ? getReadOnlyMessage(app) : 'Failed to import students');
    }
  },

  saveScores: async function (studentId, examId, scores, app, ui) {
    if (!ensureWritable(app, ui)) return;

    try {
      const exam = app.state.exams.find(e => e.id === examId);
      const examLabel = exam?.title || exam?.name || '';
      const student = app.state.students.find(s => s.id === studentId);

      if (!student || !examLabel) {
        ui.showToast('Select student and exam first');
        return;
      }

      const nextScores = JSON.parse(JSON.stringify(student.scores || {}));

      for (const [subject, score] of Object.entries(scores)) {
        if (!nextScores[subject] || typeof nextScores[subject] !== 'object') {
          nextScores[subject] = {};
        }
        nextScores[subject][examLabel] = app.analytics.normalizeScore(score);
      }

      await app.updateStudent(student.id, { scores: nextScores });
      ui.refreshUI();
      ui.showToast('Scores saved');
    } catch (error) {
      console.error('Failed to save scores:', error);
      ui.showToast(isReadOnlyError(error) ? getReadOnlyMessage(app) : 'Failed to save scores');
    }
  },

  saveBulkScores: async function (examId, inputs, app, ui) {
    if (!ensureWritable(app, ui)) return;

    try {
      const exam = app.state.exams.find(e => e.id === examId);
      const examLabel = exam?.title || exam?.name || '';

      if (!examLabel) {
        ui.showToast('Select an exam first');
        return;
      }

      if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
        app.snapshots.saveSnapshot('Auto Backup Before Bulk Score Save');
      }

      const changedStudents = new Map();
      inputs.forEach(input => {
        const studentId = input.dataset.sid;
        const subject = input.dataset.sub;
        const score = app.analytics.normalizeScore(input.value);
        
        if (studentId && subject) {
          const stateStudent = app.state.students.find(s => s.id === studentId);
          if (!stateStudent) return;

          if (!changedStudents.has(studentId)) {
            changedStudents.set(studentId, {
              id: studentId,
              scores: JSON.parse(JSON.stringify(stateStudent.scores || {}))
            });
          }

          const studentDraft = changedStudents.get(studentId);
          if (!studentDraft.scores[subject] || typeof studentDraft.scores[subject] !== 'object') {
            studentDraft.scores[subject] = {};
          }
          studentDraft.scores[subject][examLabel] = score;
        }
      });

      await Promise.all(Array.from(changedStudents.values()).map(student => app.updateStudent(student.id, { scores: student.scores })));
      ui.refreshUI();
      ui.showToast("Class scores saved");
    } catch (error) {
      console.error('Failed to save bulk scores:', error);
      ui.showToast(isReadOnlyError(error) ? getReadOnlyMessage(app) : 'Failed to save some scores');
    }
  }
};

app.students = students;

// Export students module
export default students;
