import {
  waitForInitialAuthState,
  registerUser,
  loginUser,
  requestPasswordReset,
  formatAuthError,
  isAuthAvailable,
  resolveUserAccountProfile,
  shouldBlockForEmailVerification,
  sendCurrentUserVerificationEmail,
  reloadCurrentUserAuthState,
  logoutUser
} from './auth.js';

const LOGIN_PAGE_PATH = '/login.html';
const DASHBOARD_PATH = '/index.html';
const VERIFY_EMAIL_PAGE_PATH = '/verify-email.html';
const AUTH_VERIFICATION_NOTICE_KEY = 'authVerificationNotice';

const redirectToLogin = () => {
  if (window.location.pathname.endsWith(LOGIN_PAGE_PATH)) return;
  window.location.replace(LOGIN_PAGE_PATH);
};

const redirectToDashboard = () => {
  if (window.location.pathname.endsWith(DASHBOARD_PATH)) return;
  window.location.replace(DASHBOARD_PATH);
};

const redirectToVerification = () => {
  if (window.location.pathname.endsWith(VERIFY_EMAIL_PAGE_PATH)) return;
  window.location.replace(VERIFY_EMAIL_PAGE_PATH);
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

const storeVerificationNotice = (message, tone = 'info') => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    sessionStorage.removeItem(AUTH_VERIFICATION_NOTICE_KEY);
    return;
  }

  sessionStorage.setItem(
    AUTH_VERIFICATION_NOTICE_KEY,
    JSON.stringify({ message: normalizedMessage, tone: String(tone || 'info').trim() || 'info' })
  );
};

const consumeVerificationNotice = () => {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  const stored = sessionStorage.getItem(AUTH_VERIFICATION_NOTICE_KEY);
  if (!stored) {
    return null;
  }

  sessionStorage.removeItem(AUTH_VERIFICATION_NOTICE_KEY);

  try {
    const parsed = JSON.parse(stored);
    const message = String(parsed?.message || '').trim();
    if (!message) {
      return null;
    }

    return {
      message,
      tone: String(parsed?.tone || 'info').trim() || 'info'
    };
  } catch {
    const message = String(stored || '').trim();
    if (!message) {
      return null;
    }

    return {
      message,
      tone: 'info'
    };
  }
};

const resolveAuthProfile = async (authUser) => {
  const profile = await resolveUserAccountProfile(authUser);
  return {
    ...profile,
    emailVerified: Boolean(profile?.emailVerified ?? authUser?.emailVerified)
  };
};

const resolveRedirectTarget = async (authUser) => {
  if (!authUser?.uid) {
    return {
      destination: 'login',
      profile: null
    };
  }

  const profile = await resolveAuthProfile(authUser);
  return {
    destination: shouldBlockForEmailVerification(profile, profile?.role) ? 'verify-email' : 'dashboard',
    profile
  };
};

const routeAuthenticatedUser = async (authUser) => {
  const decision = await resolveRedirectTarget(authUser);
  if (decision.destination === 'verify-email') {
    redirectToVerification();
  } else if (decision.destination === 'dashboard') {
    redirectToDashboard();
  }
  return decision;
};

const getMode = () => {
  const mode = String(document.body?.dataset?.authMode || '').trim().toLowerCase();
  if (mode === 'signup') return 'signup';
  if (mode === 'verify-email') return 'verify-email';
  return 'login';
};

const renderVerificationContext = (profile) => {
  const addressEl = document.getElementById('verify-email-address');
  const copyEl = document.getElementById('verify-email-copy');
  const email = String(profile?.email || '').trim();

  if (addressEl) {
    addressEl.textContent = email || 'your email address';
  }

  if (copyEl) {
    copyEl.textContent = email
      ? `Open the verification link sent to ${email}, then return here and confirm below.`
      : 'Open the verification link in your inbox, then return here and confirm below.';
  }
};

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
    const authUser = mode === 'signup'
      ? await registerUser(payload)
      : await loginUser(payload);

    if (mode === 'signup') {
      if (authUser?.verificationEmailSent) {
        storeVerificationNotice(`We sent a verification link to ${payload.email}. Open it to continue.`, 'success');
      } else {
        storeVerificationNotice('Your account was created, but we could not send the verification email yet. Use the resend button on the next screen.', 'info');
      }
    } else {
      storeVerificationNotice('');
    }

    await routeAuthenticatedUser(authUser);
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

const initVerifyEmailPage = async () => {
  const errorEl = document.getElementById('auth-error');
  const resendBtn = document.getElementById('verify-email-resend-btn');
  const refreshBtn = document.getElementById('verify-email-refresh-btn');
  const switchAccountBtn = document.getElementById('verify-email-switch-account-btn');
  const resendDefaultLabel = resendBtn?.textContent || 'Resend verification email';
  const refreshDefaultLabel = refreshBtn?.textContent || 'I\'ve verified my email';
  const switchAccountDefaultLabel = switchAccountBtn?.textContent || 'Use another account';

  if (!resendBtn || !refreshBtn || !switchAccountBtn) {
    return;
  }

  if (!isAuthAvailable()) {
    setFeedback(errorEl, 'Authentication is unavailable. Check Firebase configuration and refresh.');
    resendBtn.disabled = true;
    refreshBtn.disabled = true;
    switchAccountBtn.disabled = true;
    return;
  }

  const authUser = await waitForInitialAuthState();
  if (!authUser) {
    redirectToLogin();
    return;
  }

  const initialDecision = await resolveRedirectTarget(authUser);
  if (initialDecision.destination !== 'verify-email') {
    redirectToDashboard();
    return;
  }

  renderVerificationContext(initialDecision.profile);
  const initialNotice = consumeVerificationNotice();
  if (initialNotice?.message) {
    setFeedback(errorEl, initialNotice.message, initialNotice.tone);
  } else {
    setFeedback(errorEl, 'Verify your email address to continue to the dashboard.', 'info');
  }

  resendBtn.addEventListener('click', async () => {
    resendBtn.dataset.loadingLabel = 'Sending verification email...';
    setFeedback(errorEl, '');
    setLoadingState(resendBtn, true, resendDefaultLabel);

    try {
      const latestAuthUser = await sendCurrentUserVerificationEmail();
      const latestDecision = await resolveRedirectTarget(latestAuthUser);
      renderVerificationContext(latestDecision.profile || initialDecision.profile);

      const recipient = String(latestDecision.profile?.email || initialDecision.profile?.email || '').trim();
      setFeedback(
        errorEl,
        recipient
          ? `A new verification email has been sent to ${recipient}. Check your inbox and spam folder.`
          : 'A new verification email has been sent. Check your inbox and spam folder.',
        'success'
      );
    } catch (error) {
      console.error('Verification email resend failed:', error);
      setFeedback(errorEl, formatAuthError(error));
    } finally {
      setLoadingState(resendBtn, false, resendDefaultLabel);
    }
  });

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.dataset.loadingLabel = 'Checking verification...';
    setFeedback(errorEl, '');
    setLoadingState(refreshBtn, true, refreshDefaultLabel);

    try {
      const refreshedAuthUser = await reloadCurrentUserAuthState();
      const refreshedDecision = await resolveRedirectTarget(refreshedAuthUser);
      if (refreshedDecision.destination === 'dashboard') {
        redirectToDashboard();
        return;
      }

      renderVerificationContext(refreshedDecision.profile || initialDecision.profile);
      setFeedback(
        errorEl,
        'Your email is still unverified. Open the link from your inbox, then come back here and try again.',
        'info'
      );
    } catch (error) {
      console.error('Verification status refresh failed:', error);
      setFeedback(errorEl, formatAuthError(error));
    } finally {
      setLoadingState(refreshBtn, false, refreshDefaultLabel);
    }
  });

  switchAccountBtn.addEventListener('click', async () => {
    switchAccountBtn.disabled = true;
    switchAccountBtn.textContent = 'Signing out...';
    setFeedback(errorEl, '');

    try {
      await logoutUser();
      redirectToLogin();
    } catch (error) {
      console.error('Logout failed:', error);
      setFeedback(errorEl, formatAuthError(error));
      switchAccountBtn.disabled = false;
      switchAccountBtn.textContent = switchAccountDefaultLabel;
    }
  });
};

const initAuthPage = async () => {
  const mode = getMode();
  if (mode === 'verify-email') {
    await initVerifyEmailPage();
    return;
  }

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
      await routeAuthenticatedUser(authUser);
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
