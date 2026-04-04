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
  normalizeUserRole,
  shouldBlockForEmailVerification
} from './auth.js';
import {
  consumeAppToastNotice,
  storeAuthPageNotice
} from './auth-notices.js';

app._initialized = app._initialized || false;
let authSubscriptionCleanup = null;
let hasReceivedInitialAuthSubscription = false;
let isManualSignOutInProgress = false;

const LOGIN_PAGE_PATH = '/login.html';
const VERIFY_EMAIL_PAGE_PATH = '/verify-email.html';

const redirectToLogin = (notice = null) => {
  if (notice?.message) {
    storeAuthPageNotice(notice.message, notice.tone || 'info');
  }
  if (window.location.pathname.endsWith(LOGIN_PAGE_PATH)) return;
  window.location.replace(LOGIN_PAGE_PATH);
};

const redirectToVerification = (notice = null) => {
  if (notice?.message) {
    storeAuthPageNotice(notice.message, notice.tone || 'info');
  }
  if (window.location.pathname.endsWith(VERIFY_EMAIL_PAGE_PATH)) return;
  window.location.replace(VERIFY_EMAIL_PAGE_PATH);
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
  const resolvedProfile = {
    ...profile,
    role: normalizedRole,
    emailVerified: Boolean(profile?.emailVerified ?? authUser?.emailVerified)
  };
  app.setCurrentUserRole(normalizedRole, { resolved: true });

  if (app.state.authUser?.uid && app.state.authUser.uid === authUser?.uid) {
    app.state.authUser = {
      ...app.state.authUser,
      name: String(resolvedProfile?.name || app.state.authUser?.name || '').trim(),
      email: String(resolvedProfile?.email || app.state.authUser?.email || '').trim(),
      role: normalizedRole,
      emailVerified: resolvedProfile.emailVerified,
      createdAt: resolvedProfile?.createdAt || app.state.authUser?.createdAt || null,
      updatedAt: resolvedProfile?.updatedAt || app.state.authUser?.updatedAt || null
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

  return resolvedProfile;
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
      emailVerified: Boolean(authUser.emailVerified ?? existingAuthUser?.emailVerified),
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
    redirectToLogin({
      message: 'Authentication is unavailable right now. Check your configuration and sign in again.',
      tone: 'error'
    });
    return false;
  }

  try {
    const authUser = await waitForInitialAuthState();
    if (!authUser) {
      redirectToLogin({
        message: 'Please sign in to continue to the dashboard.',
        tone: 'info'
      });
      return false;
    }

    setAuthUserState(authUser);
    const resolvedProfile = await setResolvedUserRole(authUser);
    if (shouldBlockForEmailVerification(resolvedProfile, resolvedProfile?.role)) {
      redirectToVerification({
        message: 'Verify your email to continue to the dashboard.',
        tone: 'info'
      });
      return false;
    }
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
    redirectToLogin({
      message: 'We could not restore your session. Sign in again to continue.',
      tone: 'info'
    });
    return false;
  }
};

const handleAuthUserChange = async (authUser) => {
  const previousUid = app.state.authUser?.uid || '';

  if (!authUser) {
    const redirectNotice = isManualSignOutInProgress
      ? {
        message: 'You signed out successfully.',
        tone: 'info'
      }
      : {
        message: previousUid
          ? 'Your session ended. Sign in again to continue.'
          : 'Please sign in to continue to the dashboard.',
        tone: 'info'
      };
    isManualSignOutInProgress = false;
    setAuthUserState(null);
    clearLoadedDataForLogout();
    redirectToLogin(redirectNotice);
    return;
  }

  setAuthUserState(authUser);
  const resolvedProfile = await setResolvedUserRole(authUser);
  if (shouldBlockForEmailVerification(resolvedProfile, resolvedProfile?.role)) {
    redirectToVerification({
      message: 'Verify your email to continue to the dashboard.',
      tone: 'info'
    });
    return;
  }
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
      isManualSignOutInProgress = true;
      await logoutUser();
      setAuthUserState(null);
      clearLoadedDataForLogout();
      redirectToLogin({
        message: 'You signed out successfully.',
        tone: 'info'
      });
    } catch (error) {
      console.error('Logout failed:', error);
      isManualSignOutInProgress = false;
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

    const launchNotice = consumeAppToastNotice();
    if (app.state?.error && ui.showToast) {
      ui.showToast(app.state.error);
    } else if (launchNotice?.message && ui.showToast) {
      ui.showToast(launchNotice.message, {
        duration: launchNotice.tone === 'success' ? 2800 : 2200
      });
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
