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
      // Show loading state
      showLoadingState();
      
      // UI Setup first (but don't render data yet)
      app.ui.initDOM();
      app.applyTheme();
      app.ui.bindEvents();
      
      // Load data from Firestore
      await app.load();
      
      // Hide loading state and render UI with data
      hideLoadingState();
      app.ui.refreshUI();
      
      console.log("TrackerApp Ready.");
    } catch (error) {
      console.error("TrackerApp initialization failed:", error);
      hideLoadingState();
      showErrorState(error.message);
    }
  };

  function showLoadingState() {
    // Show splash screen with loading message
    const splash = document.getElementById('app-splash');
    if (splash) {
      splash.style.display = 'flex';
      splash.style.opacity = '1';
      const splashText = splash.querySelector('p');
      if (splashText) {
        splashText.textContent = 'Loading data from Firestore...';
      }
    }
    
    // Disable UI interactions
    document.body.style.pointerEvents = 'none';
  }

  function hideLoadingState() {
    // Hide splash screen
    const splash = document.getElementById('app-splash');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 220ms ease-out';
      setTimeout(function () {
        if (splash && splash.parentNode) {
          splash.parentNode.removeChild(splash);
        }
      }, 260);
    }
    
    // Enable UI interactions
    document.body.style.pointerEvents = '';
  }

  function showErrorState(errorMessage) {
    // Show error toast
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = `Failed to load data: ${errorMessage}. Please check your internet connection and refresh.`;
      toast.classList.add('show', 'error');
      setTimeout(() => {
        toast.classList.remove('show', 'error');
      }, 8000);
    }
    
    // Try to render UI with empty state
    if (app.ui && app.ui.refreshUI) {
      app.ui.refreshUI();
    }
  }

  // Run on DOM load
  document.addEventListener('DOMContentLoaded', app.Init);

})(window.TrackerApp);
