/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — students.js
   Handles all student data mutations with Firestore.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const students = {
  addStudent: async function (name, app, ui) {
    const n = name.trim();
    if (!n) return;
    
    try {
      await app.addStudent({ name: n, class: '', notes: '', scores: {} });
      ui.refreshUI();
      ui.showToast(`Added ${n}`);
    } catch (error) {
      console.error('Failed to add student:', error);
      ui.showToast('Failed to add student');
    }
  },

  deleteStudent: function (uid, app, ui) {
    const s = app.state.students.find(x => x.id === uid);
    if (!s) return;
    app.state.deletingId = uid;
    if (app.dom.deleteConfirmMsg) app.dom.deleteConfirmMsg.textContent = `Delete "${s.name}"?`;
    app.dom.deleteModal.classList.add('active');
  },

  confirmDelete: async function (app, ui) {
    const uid = app.state.deletingId;
    if (!uid) return;
    
    try {
      await app.deleteStudent(uid);
      app.state.deletingId = null;
      app.dom.deleteModal.classList.remove('active');
      ui.refreshUI();
      ui.showToast('Student deleted');
    } catch (error) {
      console.error('Failed to delete student:', error);
      ui.showToast('Failed to delete student');
    }
  },

  startEdit: function (uid, app, ui) {
    const s = app.state.students.find(x => x.id === uid);
    if (!s) return;
    app.state.editingId = uid;
    if (app.dom.editInput) app.dom.editInput.value = s.name;
    app.dom.editModal.classList.add('active');
    if (app.dom.editInput) app.dom.editInput.focus();
  },

  saveEdit: async function (app, ui) {
    const uid = app.state.editingId;
    if (!uid) return;
    
    const newName = app.dom.editInput.value.trim();
    if (!newName) return;
    
    try {
      await app.updateStudent(uid, { name: newName });
      app.state.editingId = null;
      app.dom.editModal.classList.remove('active');
      ui.refreshUI();
      ui.showToast('Student updated');
    } catch (error) {
      console.error('Failed to update student:', error);
      ui.showToast('Failed to update student');
    }
  },

  bulkImport: function (csv, app, ui) {
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
    
    this.importStudents(newStudents, app, ui);
  },

  importStudents: async function (studentsData, app, ui) {
    try {
      for (const studentData of studentsData) {
        await app.addStudent({ ...studentData, scores: {} });
      }
      ui.refreshUI();
      ui.showToast(`${studentsData.length} students imported`);
    } catch (error) {
      console.error('Failed to import students:', error);
      ui.showToast('Failed to import students');
    }
  },

  saveScores: async function (studentId, examId, scores, app, ui) {
    try {
      const exam = app.state.exams.find(e => e.id === examId);
      const examLabel = exam?.title || exam?.name || '';
      const student = app.state.students.find(s => s.id === studentId);

      if (!student || !examLabel) {
        ui.showToast('Select student and exam first');
        return;
      }

      if (!student.scores || typeof student.scores !== 'object') {
        student.scores = {};
      }

      for (const [subject, score] of Object.entries(scores)) {
        if (!student.scores[subject] || typeof student.scores[subject] !== 'object') {
          student.scores[subject] = {};
        }
        student.scores[subject][examLabel] = app.analytics.normalizeScore(score);
      }

      await app.updateStudent(student.id, { scores: student.scores });
      await app.save();
      ui.refreshUI();
      ui.showToast('Scores saved');
    } catch (error) {
      console.error('Failed to save scores:', error);
      ui.showToast('Failed to save scores');
    }
  },

  saveBulkScores: async function (examId, inputs, app, ui) {
    try {
      const exam = app.state.exams.find(e => e.id === examId);
      const examLabel = exam?.title || exam?.name || '';

      if (!examLabel) {
        ui.showToast('Select an exam first');
        return;
      }

      const changedStudents = new Map();
      inputs.forEach(input => {
        const studentId = input.dataset.sid;
        const subject = input.dataset.sub;
        const score = app.analytics.normalizeScore(input.value);
        
        if (studentId && subject) {
          const student = app.state.students.find(s => s.id === studentId);
          if (!student) return;
          if (!student.scores || typeof student.scores !== 'object') {
            student.scores = {};
          }
          if (!student.scores[subject] || typeof student.scores[subject] !== 'object') {
            student.scores[subject] = {};
          }
          student.scores[subject][examLabel] = score;
          changedStudents.set(student.id, student);
        }
      });

      await Promise.all(Array.from(changedStudents.values()).map(student => app.updateStudent(student.id, { scores: student.scores })));
      await app.save();
      ui.refreshUI();
      ui.showToast("Class scores saved");
    } catch (error) {
      console.error('Failed to save bulk scores:', error);
      ui.showToast('Failed to save some scores');
    }
  }
};

app.students = students;

// Export students module
export default students;
