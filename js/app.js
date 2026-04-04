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
  isAuthAvailable,
  resolveUserAccountProfile,
  normalizeUserRole
} from './auth.js';

app._initialized = app._initialized || false;
let authSubscriptionCleanup = null;
let hasReceivedInitialAuthSubscription = false;

const LOGIN_PAGE_PATH = '/login.html';

const redirectToLogin = () => {
  if (window.location.pathname.endsWith(LOGIN_PAGE_PATH)) return;
  window.location.replace(LOGIN_PAGE_PATH);
};

const getAuthUserIdentityLabel = (authUser) => {
  const name = String(authUser?.name || '').trim();
  const email = String(authUser?.email || '').trim();
  return name || email || '';
};

const getAuthUserIdentityInitial = (authUser) => {
  const label = getAuthUserIdentityLabel(authUser);
  return label ? label.charAt(0).toUpperCase() : '?';
};

const syncAuthSessionUi = () => {
  const authUserAvatarEl = document.getElementById('auth-user-avatar');
  if (!authUserAvatarEl) {
    return;
  }

  const identityLabel = getAuthUserIdentityLabel(app.state.authUser);
  const email = String(app.state.authUser?.email || '').trim();
  const tooltip = identityLabel && email && identityLabel !== email
    ? `${identityLabel} (${email})`
    : identityLabel || email || 'User';

  authUserAvatarEl.textContent = getAuthUserIdentityInitial(app.state.authUser);
  authUserAvatarEl.title = tooltip;
  authUserAvatarEl.setAttribute('aria-label', tooltip ? `Signed in as ${tooltip}` : 'Signed in user');
};

app.syncAuthSessionUi = syncAuthSessionUi;

const setResolvedUserRole = async (authUser) => {
  const profile = await resolveUserAccountProfile(authUser);
  const normalizedRole = normalizeUserRole(profile?.role);
  app.setCurrentUserRole(normalizedRole, { resolved: true });

  if (app.state.authUser?.uid && app.state.authUser.uid === authUser?.uid) {
    app.state.authUser = {
      ...app.state.authUser,
      name: String(profile?.name || app.state.authUser?.name || '').trim(),
      email: String(profile?.email || app.state.authUser?.email || '').trim(),
      role: normalizedRole,
      createdAt: profile?.createdAt || app.state.authUser?.createdAt || null,
      updatedAt: profile?.updatedAt || app.state.authUser?.updatedAt || null
    };
  }

  syncAuthSessionUi();
  console.log('Final role:', normalizedRole);

  if (app.ui && typeof app.ui.updateRoleBasedUIAccess === 'function') {
    app.ui.updateRoleBasedUIAccess();
  }
  if (app.ui && typeof app.ui.renderAccountSettings === 'function') {
    app.ui.renderAccountSettings();
  }
};

const setAuthUserState = (authUser) => {
  if (typeof sessionStorage !== 'undefined') {
    if (authUser?.uid) {
      sessionStorage.setItem('currentAuthUid', String(authUser.uid));
    } else {
      sessionStorage.removeItem('currentAuthUid');
    }
  }

  const existingAuthUser = app.state.authUser || null;
  app.state.authUser = authUser
    ? {
      uid: authUser.uid,
      name: authUser.name || existingAuthUser?.name || '',
      email: authUser.email || existingAuthUser?.email || '',
      role: authUser.role || existingAuthUser?.role || '',
      createdAt: authUser.createdAt || existingAuthUser?.createdAt || null,
      updatedAt: authUser.updatedAt || existingAuthUser?.updatedAt || null
    }
    : null;

  syncAuthSessionUi();

  const authRoleBadgeEl = document.getElementById('auth-role-badge');
  if (authRoleBadgeEl && !app.state.authUser?.uid) {
    authRoleBadgeEl.textContent = 'Role: Loading...';
    authRoleBadgeEl.dataset.role = 'pending';
    authRoleBadgeEl.title = 'Resolving access permissions';
  }
};

const clearLoadedDataForLogout = () => {
  const emptyData = { students: [], subjects: [], exams: [] };
  app.state.classes = [];
  app.state.currentClassId = '';
  app.state.currentClassName = 'My Class';
  app.state.currentClassOwnerId = '';
  app.state.currentClassOwnerName = 'Teacher';
  app.state.allowEmptyClassCatalog = false;
  if (typeof app.applyRawData === 'function') {
    app.applyRawData(emptyData);
  } else {
    app.state.students = [];
    app.state.subjects = [];
    app.state.exams = [];
    app.state.scores = [];
  }

  app.state.error = null;
  app.state.isLoading = false;
  app.state.dashboardStudentCount = null;
  if (typeof app.clearCurrentUserRole === 'function') {
    app.clearCurrentUserRole();
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
    await setResolvedUserRole(authUser);
    if (typeof app.syncDataContext === 'function') {
      app.syncDataContext();
    }
    console.log('Auth UID:', String(authUser.uid || '').trim() || '(none)');
    console.log('Role:', app.getCurrentUserRole());
    console.log('Active UID:', app.getEffectiveUserId() || '(none)');
    return true;
  } catch (error) {
    console.error('Failed to resolve authentication state:', error);
    app.setCurrentUserRole('teacher', { resolved: true });
    redirectToLogin();
    return false;
  }
};

const handleAuthUserChange = async (authUser) => {
  const previousUid = app.state.authUser?.uid || '';

  if (!authUser) {
    setAuthUserState(null);
    clearLoadedDataForLogout();
    redirectToLogin();
    return;
  }

  setAuthUserState(authUser);
  await setResolvedUserRole(authUser);
  if (typeof app.syncDataContext === 'function') {
    app.syncDataContext();
  }
  console.log('Auth UID:', String(authUser.uid || '').trim() || '(none)');
  console.log('Role:', app.getCurrentUserRole());
  console.log('Active UID:', app.getEffectiveUserId() || '(none)');

  const nextUid = authUser.uid;
  const hasUserChanged = Boolean(previousUid) && previousUid !== nextUid;
  if (!hasUserChanged) {
    return;
  }

  clearLoadedDataForLogout();
  setAuthUserState(authUser);
  await setResolvedUserRole(authUser);
  if (typeof app.syncDataContext === 'function') {
    app.syncDataContext();
  }

  try {
    await app.load();
    if (ui.refreshUI) {
      ui.refreshUI();
    }
  } catch (error) {
    console.error('Failed to reload user-scoped data after auth change:', error);
  }
};

const ensureLogoutButton = () => {
  if (document.getElementById('auth-logout-btn')) return;

  const headerControls = document.querySelector('.header-controls');
  if (!headerControls) return;

  const authControl = document.createElement('div');
  authControl.className = 'auth-session-control';

  const roleBadge = document.createElement('span');
  roleBadge.id = 'auth-role-badge';
  roleBadge.className = 'auth-role-badge role-pending';
  roleBadge.setAttribute('aria-live', 'polite');
  roleBadge.textContent = 'Role: Loading...';
  roleBadge.dataset.role = 'pending';
  roleBadge.title = 'Resolving access permissions';

  const avatar = document.createElement('div');
  avatar.id = 'auth-user-avatar';
  avatar.className = 'user-avatar';
  avatar.textContent = getAuthUserIdentityInitial(app.state.authUser);
  avatar.title = getAuthUserIdentityLabel(app.state.authUser) || 'User';
  avatar.setAttribute('aria-label', 'Signed in user');

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
      clearLoadedDataForLogout();
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

  authControl.appendChild(avatar);
  authControl.appendChild(roleBadge);
  authControl.appendChild(button);
  headerControls.appendChild(authControl);
  syncAuthSessionUi();
};

const bindAuthStateWatcher = () => {
  if (authSubscriptionCleanup) {
    authSubscriptionCleanup();
    authSubscriptionCleanup = null;
  }

  hasReceivedInitialAuthSubscription = false;

  authSubscriptionCleanup = subscribeAuthState((authUser) => {
    if (!hasReceivedInitialAuthSubscription) {
      hasReceivedInitialAuthSubscription = true;
      const currentUid = String(app.state.authUser?.uid || '').trim();
      const nextUid = String(authUser?.uid || '').trim();
      if (currentUid && currentUid === nextUid) {
        return;
      }
    }

    handleAuthUserChange(authUser).catch((error) => {
      console.error('Auth state handler failed:', error);
    });
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

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('viewingUserId');
  }

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
    if (ui.applyLaunchRoute) {
      ui.applyLaunchRoute();
    }
  } catch (error) {
    console.error('Initialization failed:', error);
    showErrorState(error.message);
  }
});
