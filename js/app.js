/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — app.js
   Main application bootstrap and initialization.
   ═══════════════════════════════════════════════ */

// Import all modules
import './firebase.js';
import { initializeDefaultData } from '../services/db.js';
import state from './state.js';
import analytics from './analytics.js';
import students from './students.js';
import charts from './charts.js';
import heatmap from './heatmap.js';
import exportModule from './export.js';
import ui from './ui.js';
import sidebar from './sidebar.js';

// Create main app object
const app = {
  _initialized: false,
  
  // Attach modules
  state: state.state,
  analytics: analytics,
  students: students,
  charts: charts,
  heatmap: heatmap,
  export: exportModule,
  ui: ui,
  sidebar: sidebar,
  
  // Copy utility functions
  utils: state.utils,
  
  // Copy CRUD functions
  addStudent: state.addStudent,
  updateStudent: state.updateStudent,
  deleteStudent: state.deleteStudent,
  addExam: state.addExam,
  updateExam: state.updateExam,
  deleteExam: state.deleteExam,
  addSubject: state.addSubject,
  updateSubject: state.updateSubject,
  deleteSubject: state.deleteSubject,
  
  // Copy other functions
  load: state.load,
  applyTheme: state.applyTheme,
  loadTheme: state.loadTheme,
  
  // Initialize app
  Init: async function () {
    if (this._initialized) return;
    this._initialized = true;
    console.log("TrackerApp Initializing...");
    
    try {
      // Show loading state
      showLoadingState();
      
      // Initialize default data
      await initializeDefaultData();
      
      // Load data from Firestore
      await this.load();
      
      // UI Setup
      this.ui.initDOM();
      this.applyTheme();
      this.ui.bindEvents();
      
      // Hide loading state and render UI with data
      hideLoadingState();
      this.ui.refreshUI();
      
      console.log("TrackerApp Ready.");
    } catch (error) {
      console.error("TrackerApp initialization failed:", error);
      hideLoadingState();
      showErrorState(error.message);
    }
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

// Assign to global for backward compatibility
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
