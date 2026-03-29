import {
  waitForInitialAuthState,
  registerUser,
  loginUser,
  resolveUserRole,
  formatAuthError,
  isAuthAvailable
} from './auth.js';

const DASHBOARD_PATH = '/index.html';

const redirectToDashboard = () => {
  if (window.location.pathname.endsWith(DASHBOARD_PATH)) return;
  window.location.replace(DASHBOARD_PATH);
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
};

const setLoadingState = (button, isLoading, defaultLabel) => {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Please wait...' : defaultLabel;
};

const setError = (errorEl, message) => {
  if (!errorEl) return;
  errorEl.textContent = message || '';
};

const getMode = () => document.body?.dataset?.authMode === 'signup' ? 'signup' : 'login';

const validatePayload = (mode, payload) => {
  if (!isValidEmail(payload.email)) {
    return 'Please enter a valid email address.';
  }

  if (!payload.password || payload.password.length < 6) {
    return 'Password must be at least 6 characters.';
  }

  if (mode === 'signup') {
    if (!String(payload.name || '').trim()) {
      return 'Please enter your name.';
    }

    if (payload.password !== payload.confirmPassword) {
      return 'Passwords do not match.';
    }
  }

  return '';
};

const handleAuthSubmit = async (mode, form, errorEl, submitBtn, defaultLabel) => {
  const formData = new FormData(form);
  const payload = {
    name: String(formData.get('name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || ''),
    confirmPassword: String(formData.get('confirmPassword') || '')
  };

  const validationError = validatePayload(mode, payload);
  if (validationError) {
    setError(errorEl, validationError);
    return;
  }

  setError(errorEl, '');
  setLoadingState(submitBtn, true, defaultLabel);

  try {
    if (mode === 'signup') {
      await registerUser(payload);
    } else {
      await loginUser(payload);
    }

    redirectToDashboard();
  } catch (error) {
    console.error('Authentication action failed:', error);
    setError(errorEl, formatAuthError(error));
    setLoadingState(submitBtn, false, defaultLabel);
  }
};

const initAuthPage = async () => {
  const mode = getMode();
  const form = document.getElementById(mode === 'signup' ? 'signup-form' : 'login-form');
  const errorEl = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');
  const defaultLabel = submitBtn?.textContent || 'Submit';

  if (!form || !submitBtn) {
    return;
  }

  if (!isAuthAvailable()) {
    setError(errorEl, 'Authentication is unavailable. Check Firebase configuration and refresh.');
    submitBtn.disabled = true;
    return;
  }

  try {
    const authUser = await waitForInitialAuthState();
    if (authUser) {
      await resolveUserRole(authUser);
      redirectToDashboard();
      return;
    }
  } catch (error) {
    console.error('Unable to resolve initial authentication state:', error);
    setError(errorEl, formatAuthError(error));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleAuthSubmit(mode, form, errorEl, submitBtn, defaultLabel);
  });
};

document.addEventListener('DOMContentLoaded', () => {
  initAuthPage().catch((error) => {
    console.error('Auth page failed to initialize:', error);
  });
});
