import {
  waitForInitialAuthState,
  registerUser,
  loginUser,
  requestPasswordReset,
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
  const loadingLabel = String(button.dataset.loadingLabel || 'Please wait...');
  button.textContent = isLoading ? loadingLabel : defaultLabel;
};

const setFeedback = (errorEl, message, tone = 'error') => {
  if (!errorEl) return;
  const normalizedMessage = String(message || '');
  errorEl.textContent = normalizedMessage;
  if (normalizedMessage) {
    errorEl.dataset.tone = tone;
  } else {
    errorEl.removeAttribute('data-tone');
  }
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
    setFeedback(errorEl, validationError);
    return;
  }

  submitBtn.dataset.loadingLabel = mode === 'signup' ? 'Creating account...' : 'Signing in...';
  setFeedback(errorEl, '');
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
    setFeedback(errorEl, formatAuthError(error));
    setLoadingState(submitBtn, false, defaultLabel);
  }
};

const handlePasswordResetRequest = async (form, errorEl, resetBtn, defaultLabel) => {
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();

  if (!isValidEmail(email)) {
    setFeedback(errorEl, 'Enter your email above to receive a reset link.');
    document.getElementById('login-email')?.focus();
    return;
  }

  resetBtn.dataset.loadingLabel = 'Sending reset link...';
  setFeedback(errorEl, '');
  setLoadingState(resetBtn, true, defaultLabel);

  try {
    await requestPasswordReset(email);
    setFeedback(errorEl, 'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.', 'success');
  } catch (error) {
    console.error('Password reset failed:', error);
    setFeedback(errorEl, formatAuthError(error));
  } finally {
    setLoadingState(resetBtn, false, defaultLabel);
  }
};

const initAuthPage = async () => {
  const mode = getMode();
  const form = document.getElementById(mode === 'signup' ? 'signup-form' : 'login-form');
  const errorEl = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');
  const defaultLabel = submitBtn?.textContent || 'Submit';
  const forgotPasswordBtn = document.getElementById('forgot-password-btn');
  const forgotPasswordDefaultLabel = forgotPasswordBtn?.textContent || 'Forgot password?';

  if (!form || !submitBtn) {
    return;
  }

  if (!isAuthAvailable()) {
    setFeedback(errorEl, 'Authentication is unavailable. Check Firebase configuration and refresh.');
    submitBtn.disabled = true;
    if (forgotPasswordBtn) {
      forgotPasswordBtn.disabled = true;
    }
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

  form.addEventListener('input', () => {
    if (errorEl?.textContent) {
      setFeedback(errorEl, '');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleAuthSubmit(mode, form, errorEl, submitBtn, defaultLabel);
  });

  if (mode === 'login' && forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', async () => {
      await handlePasswordResetRequest(form, errorEl, forgotPasswordBtn, forgotPasswordDefaultLabel);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initAuthPage().catch((error) => {
    console.error('Auth page failed to initialize:', error);
  });
});
