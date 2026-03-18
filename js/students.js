/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — students.js
   Handles all student data mutations with Firestore.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const students = {
  addStudent: async function (name) {
    const n = name.trim();
    if (!n) return;
    
    try {
      const newStudent = await app.addStudent({ name: n, class: '', notes: '' });
      app.ui.refreshUI();
      app.ui.showToast(`Added ${n}`);
    } catch (error) {
      console.error('Failed to add student:', error);
      app.ui.showToast('Failed to add student');
      }
    },

    deleteStudent: function (uid) {
      const s = app.state.students.find(x => x.id === uid);
      if (!s) return;
      app.state.deletingId = uid;
      if (app.dom.deleteConfirmMsg) app.dom.deleteConfirmMsg.textContent = `Delete "${s.name}"?`;
      app.dom.deleteModal.classList.add('active');
    },

    confirmDelete: async function () {
      try {
        await app.deleteStudent(app.state.deletingId);
        app.dom.deleteModal.classList.remove('active');
        app.ui.refreshUI();
        app.ui.showToast("Deleted");
      } catch (error) {
        console.error('Failed to delete student:', error);
        app.ui.showToast('Failed to delete student');
      }
    },

    startEdit: function (uid) {
      const s = app.state.students.find(x => x.id === uid);
      if (!s) return;
      app.state.editingId = uid;
      app.dom.editInput.value = s.name;
      app.dom.editModal.classList.add('active');
    },

    saveEdit: async function () {
      const s = app.state.students.find(x => x.id === app.state.editingId);
      if (s && app.dom.editInput.value.trim()) {
        try {
          await app.updateStudent(app.state.editingId, { name: app.dom.editInput.value.trim() });
          app.ui.refreshUI();
        } catch (error) {
          console.error('Failed to update student:', error);
          app.ui.showToast('Failed to update student');
        }
      }
      app.dom.editModal.classList.remove('active');
    },

    bulkImport: async function (text) {
      const names = text.split('\n');
      let count = 0;
      
      try {
        for (const n of names) {
          if (n.trim()) {
            await app.addStudent({ name: n.trim(), class: '', notes: '' });
            count++;
          }
        }
        app.ui.refreshUI();
        app.ui.showToast(`Added ${count} students`);
        return count;
      } catch (error) {
        console.error('Failed to bulk import students:', error);
        app.ui.showToast('Failed to import some students');
        return count;
      }
    },

    saveScores: async function (studentId, examId, scoresData) {
      try {
        const s = app.state.students.find(x => x.id === studentId);
        if (!s) return;

        // Save each score individually
        for (const [subject, score] of Object.entries(scoresData)) {
          const scoreValue = Number.isFinite(Number(score)) ? app.utils.clamp(Number(score), 0, 100) : null;
          if (scoreValue !== null) {
            await app.saveScore({
              studentId: studentId,
              examId: examId,
              subject: subject,
              score: scoreValue
            });
          }
        }
        
        app.ui.refreshUI();
        app.ui.showToast("Saved Scores");
      } catch (error) {
        console.error('Failed to save scores:', error);
        app.ui.showToast('Failed to save scores');
      }
    },

    saveBulkScores: async function (examId, inputs) {
      try {
        const scorePromises = [];
        
        inputs.forEach(i => {
          const studentId = i.dataset.sid;
          const subject = i.dataset.sub;
          const scoreValue = i.value !== '' ? app.utils.clamp(parseInt(i.value), 0, 100) : null;
          
          if (studentId && subject && scoreValue !== null) {
            scorePromises.push(
              app.saveScore({
                studentId: studentId,
                examId: examId,
                subject: subject,
                score: scoreValue
              })
            );
          }
        });
        
        await Promise.all(scorePromises);
        app.ui.refreshUI();
        app.ui.showToast("Class scores saved");
      } catch (error) {
        console.error('Failed to save bulk scores:', error);
        app.ui.showToast('Failed to save some scores');
      }
    }
  };

// Export students module and assign to global app
app.students = students;
export default students;
