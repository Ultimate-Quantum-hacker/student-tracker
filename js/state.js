/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — state.js
   Manages global application state.
   ═══════════════════════════════════════════════ */

window.TrackerApp = window.TrackerApp || {};

(function (app) {
  'use strict';

  // State Variables
  app.state = {
    students: [],
    mocks: [],
    subjects: [],
    lastBackup: null,
    theme: 'light',
    notesId: null,
    editingId: null,
    deletingId: null,
    searchTerm: '',
    storageKey: 'mockTracker_vFinal'
  };

  // Persistence Methods
  app.save = function () {
    const data = {
      students: app.state.students,
      mocks: app.state.mocks,
      subjects: app.state.subjects,
      lastBackup: app.state.lastBackup,
      theme: app.state.theme
    };
    localStorage.setItem(app.state.storageKey, JSON.stringify(data));
  };

  app.load = function () {
    const raw = localStorage.getItem(app.state.storageKey);
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        console.error('Failed parsing saved state:', err);
        data = {};
      }
    }
    app.state.students = Array.isArray(data.students) ? data.students : [];
    
    if (Array.isArray(data.mocks) && data.mocks.length > 0) {
      app.state.mocks = data.mocks;
    } else {
      app.state.mocks = [{id: app.utils.uuid(), name: 'Mock 1'}];
    }

    if (Array.isArray(data.subjects) && data.subjects.length > 0) {
      app.state.subjects = data.subjects;
    } else {
      app.state.subjects = [
        {id: app.utils.uuid(), name: 'English Language'},
        {id: app.utils.uuid(), name: 'Mathematics'},
        {id: app.utils.uuid(), name: 'Integrated Science'},
        {id: app.utils.uuid(), name: 'Social Studies'},
        {id: app.utils.uuid(), name: 'Computing'}
      ];
    }

    app.state.lastBackup = data.lastBackup || null;
    app.state.theme = data.theme || 'light';
  };

  app.applyTheme = function (t) {
    app.state.theme = t || app.state.theme;
    document.body.className = app.state.theme === 'dark' ? 'dark-mode' : '';
    if (app.dom && app.dom.themeToggle) {
      app.dom.themeToggle.innerHTML = app.state.theme === 'dark' ? '☀' : '🌙';
    }
  };

  // Utilities used across modules
  app.utils = {
    uuid: () => 'st_' + Math.random().toString(36).substr(2, 9),
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  };

})(window.TrackerApp);
