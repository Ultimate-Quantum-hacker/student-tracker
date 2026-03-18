/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — app.js
   Main application bootstrap and initialization.
   ═══════════════════════════════════════════════ */

import './firebase.js';
import { initializeDefaultData } from '../services/db.js';
import app from './state.js';
import './analytics.js';
import './students.js';
import './charts.js';
import './heatmap.js';
import './export.js';
import './ui.js';
import './sidebar.js';

app._initialized = app._initialized || false;

app.Init = async function () {
  if (app._initialized) return;
  app._initialized = true;
  console.log("TrackerApp Initializing...");

  try {
    showLoadingState();
    await initializeDefaultData();
    await app.load();

    app.ui.initDOM();
    app.applyTheme();
    app.ui.bindEvents();

    hideLoadingState();
    app.ui.refreshUI();

    console.log("TrackerApp Ready.");
  } catch (error) {
    console.error("TrackerApp initialization failed:", error);
    hideLoadingState();
    showErrorState(error.message);
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
  console.log('TrackerApp Initializing...');
  
  try {
    await app.Init();
    console.log('TrackerApp Ready.');
  } catch (error) {
    console.error('TrackerApp initialization failed:', error);
    showErrorState(error.message);
  }
});
