/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — app.js
   Main bootstrap file with async initialization.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

  app.Init = async function () {
    if (app._initialized) return;
    app._initialized = true;
    console.log("TrackerApp Initializing...");
    
    try {
      // Initial Load - Now async
      await app.load();
      
      // UI Setup
      app.ui.initDOM();
      app.applyTheme();
      app.ui.bindEvents();
      
      // Initial Render
      app.ui.refreshUI();
      
      console.log("TrackerApp Ready.");
    } catch (error) {
      console.error("TrackerApp initialization failed:", error);
      // Show error to user
      if (app.dom && app.dom.toast) {
        app.dom.toast.textContent = 'Failed to initialize app. Please check your internet connection.';
        app.dom.toast.classList.add('show');
        setTimeout(() => {
          app.dom.toast.classList.remove('show');
        }, 5000);
      }
    }
  };

  // Run on DOM load
  document.addEventListener('DOMContentLoaded', app.Init);

})(window.TrackerApp);
