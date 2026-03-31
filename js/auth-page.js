import {
  waitForInitialAuthState,
  registerUser,
  loginUser,
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
  button.dataset.loading = isLoading ? 'true' : 'false';
  button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  button.textContent = isLoading ? 'Please wait...' : defaultLabel;
};

const setError = (errorEl, message) => {
  if (!errorEl) return;
  errorEl.textContent = message || '';
};

const getMode = () => document.body?.dataset?.authMode === 'signup' ? 'signup' : 'login';

const syncPasswordToggleState = (toggle, passwordInput) => {
  if (!toggle || !passwordInput) return;
  const isVisible = passwordInput.type === 'text';
  const label = isVisible ? 'Hide password' : 'Show password';
  const iconEl = toggle.querySelector('.auth-password-toggle-icon');
  const textEl = toggle.querySelector('.auth-password-toggle-text');

  toggle.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
  toggle.setAttribute('aria-label', label);

  if (iconEl) {
    iconEl.textContent = isVisible ? '🙈' : '👁';
  }

  if (textEl) {
    textEl.textContent = isVisible ? 'Hide' : 'Show';
  }
};

const initPasswordToggle = () => {
  const toggle = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('login-password');

  if (!toggle || !passwordInput) {
    return;
  }

  syncPasswordToggleState(toggle, passwordInput);

  toggle.addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    syncPasswordToggleState(toggle, passwordInput);
  });
};

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
      redirectToDashboard();
      return;
    }
  } catch (error) {
    console.error('Unable to resolve initial authentication state:', error);
  }

  initPasswordToggle();

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
