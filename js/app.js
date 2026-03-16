/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — app.js
   Main bootstrap file.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

  app.Init = function () {
    if (app._initialized) return;
    app._initialized = true;
    console.log("TrackerApp Initializing...");
    
    // Initial Load
    app.load();
    
    // UI Setup
    app.ui.initDOM();
    app.applyTheme();
    app.ui.bindEvents();
    
    // Initial Render
    app.ui.refreshUI();
    
    console.log("TrackerApp Ready.");
  };

  // Run on DOM load
  document.addEventListener('DOMContentLoaded', app.Init);

})(window.TrackerApp);
