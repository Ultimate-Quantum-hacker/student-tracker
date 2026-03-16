/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — students.js
   Handles all student data mutations.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

  app.students = {
    addStudent: function (name) {
      const n = name.trim();
      if (!n) return;
      app.state.students.push({ id: app.utils.uuid(), name: n, notes: '', scores: {} });
      app.save();
      app.ui.refreshUI();
      app.ui.showToast(`Added ${n}`);
    },

    deleteStudent: function (uid) {
      const s = app.state.students.find(x => x.id === uid);
      if (!s) return;
      app.state.deletingId = uid;
      if (app.dom.deleteConfirmMsg) app.dom.deleteConfirmMsg.textContent = `Delete "${s.name}"?`;
      app.dom.deleteModal.classList.add('active');
    },

    confirmDelete: function () {
      app.state.students = app.state.students.filter(x => x.id !== app.state.deletingId);
      app.dom.deleteModal.classList.remove('active');
      app.save();
      app.ui.refreshUI();
      app.ui.showToast("Deleted");
    },

    startEdit: function (uid) {
      const s = app.state.students.find(x => x.id === uid);
      if (!s) return;
      app.state.editingId = uid;
      app.dom.editInput.value = s.name;
      app.dom.editModal.classList.add('active');
    },

    saveEdit: function () {
      const s = app.state.students.find(x => x.id === app.state.editingId);
      if (s && app.dom.editInput.value.trim()) {
        s.name = app.dom.editInput.value.trim();
        app.save();
        app.ui.refreshUI();
      }
      app.dom.editModal.classList.remove('active');
    },

    bulkImport: function (text) {
      const names = text.split('\n');
      let count = 0;
      names.forEach(n => {
        if (n.trim()) {
          app.state.students.push({ id: app.utils.uuid(), name: n.trim(), notes: '', scores: {} });
          count++;
        }
      });
      app.save();
      app.ui.refreshUI();
      return count;
    },

    saveScores: function (studentId, mockId, scoresData) {
      const s = app.state.students.find(x => x.id === studentId);
      if (s) {
        if (!s.scores[mockId]) s.scores[mockId] = {};
        Object.assign(s.scores[mockId], scoresData);
        app.save();
        app.ui.refreshUI();
        app.ui.showToast("Saved Scores");
      }
    },

    saveBulkScores: function (mockId, inputs) {
      inputs.forEach(i => {
        const s = app.state.students.find(x => x.id === i.dataset.sid);
        if (s) {
          if (!s.scores[mockId]) s.scores[mockId] = {};
          s.scores[mockId][i.dataset.sub] = i.value !== '' ? app.utils.clamp(parseInt(i.value), 0, 100) : null;
        }
      });
      app.save();
      app.ui.refreshUI();
      app.ui.showToast("Class scores saved");
    }
  };

})(window.TrackerApp);
