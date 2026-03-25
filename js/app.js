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
import {
  waitForInitialAuthState,
  subscribeAuthState,
  logoutUser,
  formatAuthError,
  isAuthAvailable
} from './auth.js';

app._initialized = app._initialized || false;
let authSubscriptionCleanup = null;

const LOGIN_PAGE_PATH = '/login.html';

const redirectToLogin = () => {
  if (window.location.pathname.endsWith(LOGIN_PAGE_PATH)) return;
  window.location.replace(LOGIN_PAGE_PATH);
};

const setAuthUserState = (authUser) => {
  app.state.authUser = authUser
    ? {
      uid: authUser.uid,
      name: authUser.name || '',
      email: authUser.email || ''
    }
    : null;

  const authUserEmailEl = document.getElementById('auth-user-email');
  if (authUserEmailEl) {
    authUserEmailEl.textContent = app.state.authUser?.email || '';
  }
};

const ensureAuthenticatedSession = async () => {
  if (!isAuthAvailable()) {
    console.error('Authentication service unavailable. Redirecting to login.');
    redirectToLogin();
    return false;
  }

  try {
    const authUser = await waitForInitialAuthState();
    if (!authUser) {
      redirectToLogin();
      return false;
    }

    setAuthUserState(authUser);
    return true;
  } catch (error) {
    console.error('Failed to resolve authentication state:', error);
    redirectToLogin();
    return false;
  }
};

const ensureLogoutButton = () => {
  if (document.getElementById('auth-logout-btn')) return;

  const headerControls = document.querySelector('.header-controls');
  if (!headerControls) return;

  const authControl = document.createElement('div');
  authControl.className = 'auth-session-control';

  const email = document.createElement('span');
  email.id = 'auth-user-email';
  email.className = 'backup-status';
  email.textContent = app.state.authUser?.email || '';

  const button = document.createElement('button');
  button.id = 'auth-logout-btn';
  button.type = 'button';
  button.className = 'btn btn-secondary btn-sm';
  button.textContent = 'Logout';

  button.addEventListener('click', async () => {
    const previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Signing out...';

    try {
      await logoutUser();
      setAuthUserState(null);
      redirectToLogin();
    } catch (error) {
      console.error('Logout failed:', error);
      if (ui.showToast) {
        ui.showToast(formatAuthError(error));
      }
      button.disabled = false;
      button.textContent = previousLabel;
    }
  });

  authControl.appendChild(email);
  authControl.appendChild(button);
  headerControls.appendChild(authControl);
};

const bindAuthStateWatcher = () => {
  if (authSubscriptionCleanup) {
    authSubscriptionCleanup();
    authSubscriptionCleanup = null;
  }

  authSubscriptionCleanup = subscribeAuthState((authUser) => {
    if (!authUser) {
      setAuthUserState(null);
      redirectToLogin();
      return;
    }

    setAuthUserState(authUser);
  });
};

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
    const isAuthenticated = await ensureAuthenticatedSession();
    if (!isAuthenticated) {
      return;
    }

    ensureLogoutButton();
    bindAuthStateWatcher();

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
