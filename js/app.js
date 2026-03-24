/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — app.js
   Main application bootstrap and initialization.
   ═══════════════════════════════════════════════ */

import './firebase.js';
import app from './state.js';
import './analytics.js';
import './students.js';
import './charts.js';
import './heatmap.js';
import './export.js';
import './snapshots.js';
import ui from './ui.js';
import './sidebar.js';

app._initialized = app._initialized || false;

app.init = async function () {
  if (app._initialized) return;
  app._initialized = true;
  console.log("Initializing state...");

  try {
    showLoadingState();
    await app.load();
    hideLoadingState();
  } catch (error) {
    console.error("State initialization failed:", error);
    hideLoadingState();
    throw error;
  }
};

// Loading state functions
function showLoadingState() {
  const splash = document.getElementById('app-splash');
  if (splash) splash.style.display = 'flex';
}

function hideLoadingState() {
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
    }, 300);
    
    // Enable UI interactions
    document.body.style.pointerEvents = '';
  }
}

function showErrorState(errorMessage) {
  // Show error toast
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `Failed to load data: ${errorMessage}. Please check your internet connection and refresh.`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5000);
  }
}

// Ensure global alias exists for inline handlers in HTML
window.TrackerApp = app;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('App starting...');

  try {
    if (app.init) {
      await app.init();
    }
    console.log('State initialized');

    if (ui.init) {
      ui.init();
    }
    console.log('UI initialized');

    if (ui.bindEvents) {
      ui.bindEvents();
    }
    console.log('Events bound successfully');

    if (app.state?.error && ui.showToast) {
      ui.showToast(app.state.error);
    }

    if (ui.refreshUI) {
      ui.refreshUI();
    }
  } catch (error) {
    console.error('Initialization failed:', error);
    showErrorState(error.message);
  }
});
