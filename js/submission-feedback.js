const READ_ONLY_ERROR_CODES = new Set([
  'app/read-only-admin',
  'read_only_mode'
]);

const MISSING_CLASS_ERROR_CODES = new Set([
  'app/missing-class-context',
  'app/missing-class-id',
  'missing_class_id'
]);

const MISSING_OWNER_ERROR_CODES = new Set([
  'app/missing-class-owner-context',
  'app/missing-owner-id',
  'missing_owner_id'
]);

const CLASS_NOT_FOUND_ERROR_CODES = new Set([
  'app/class-not-found',
  'class_not_found',
  'invalid_class_context'
]);

const INVALID_OWNER_ERROR_CODES = new Set([
  'app/invalid-owner',
  'invalid_owner'
]);

const getErrorCode = (error) => String(error?.code || '').trim().toLowerCase();
const getErrorMessage = (error) => String(error?.message || '').trim();
const normalizeLabel = (value) => String(value || '').trim();
const isNavigatorOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const formatReadOnlyContextLabel = ({ app = null, className = '', ownerName = '' } = {}) => {
  const resolvedClassName = normalizeLabel(className)
    || normalizeLabel(app?.state?.currentClassName);
  const resolvedOwnerName = normalizeLabel(ownerName)
    || (typeof app?.getCurrentClassOwnerName === 'function'
      ? normalizeLabel(app.getCurrentClassOwnerName())
      : '');

  return [resolvedClassName, resolvedOwnerName].filter(Boolean).join(' - ');
};

export const formatAuthSubmissionError = (error, fallbackMessage = 'Authentication failed. Please try again.') => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('missing-password')) return 'Please enter your password.';
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (code.includes('email-already-in-use')) return 'This email is already in use.';
  if (code.includes('user-not-found')) return 'No account found for this email.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Invalid email or password.';
  if (code.includes('permission-denied')) return 'Access denied. You do not have permission.';
  if (isNavigatorOffline()) return 'You appear to be offline. Reconnect and try again.';
  if (code.includes('network-request-failed')) return 'Network error. Please check your internet connection.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  if (code.includes('requires-recent-login') || code.includes('credential-too-old-login-again')) {
    return 'For security, sign in again and retry this action.';
  }
  if (code.includes('unavailable') || message.toLowerCase().includes('firebase unavailable')) {
    return 'Authentication is unavailable right now. Try again in a moment.';
  }

  return message || fallbackMessage;
};

export const isReadOnlySubmissionError = (error) => {
  return READ_ONLY_ERROR_CODES.has(getErrorCode(error));
};

export const resolveReadOnlyBlockedReason = ({ app = null, className = '', ownerName = '' } = {}) => {
  const contextLabel = formatReadOnlyContextLabel({ app, className, ownerName });
  if (contextLabel) {
    return `Admin cannot modify data in read-only mode for ${contextLabel}.`;
  }
  return 'Admin cannot modify data in read-only mode.';
};

export const resolveMissingClassBlockedReason = () => {
  return 'Select or create a class to enable this action.';
};

export const resolveClassContextSubmissionError = (error, fallbackMessage = 'Please select a class and try again.') => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  if (MISSING_CLASS_ERROR_CODES.has(code)) {
    return 'Select a class before continuing.';
  }
  if (MISSING_OWNER_ERROR_CODES.has(code)) {
    return 'Class owner context is missing. Re-select the class and try again.';
  }
  if (CLASS_NOT_FOUND_ERROR_CODES.has(code)) {
    return 'Selected class no longer exists. Refresh classes and try again.';
  }
  if (INVALID_OWNER_ERROR_CODES.has(code)) {
    return 'Selected class owner is invalid. Re-select the class and try again.';
  }

  return message || fallbackMessage;
};

export const formatSubmissionError = (
  error,
  {
    app = null,
    fallbackMessage = 'Request failed. Please try again.',
    auth = false
  } = {}
) => {
  if (auth) {
    return formatAuthSubmissionError(error, fallbackMessage);
  }

  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  if (isReadOnlySubmissionError(error)) {
    return resolveReadOnlyBlockedReason({ app });
  }
  if (
    MISSING_CLASS_ERROR_CODES.has(code)
    || MISSING_OWNER_ERROR_CODES.has(code)
    || CLASS_NOT_FOUND_ERROR_CODES.has(code)
    || INVALID_OWNER_ERROR_CODES.has(code)
  ) {
    return resolveClassContextSubmissionError(error, fallbackMessage);
  }
  if (isNavigatorOffline()) {
    return 'You appear to be offline. Reconnect and try again.';
  }
  if (
    code.includes('permission-denied')
    || code === 'permission'
    || message.toLowerCase().includes('permission denied')
  ) {
    return 'You do not have permission to complete this action.';
  }
  if (
    code.includes('network-request-failed')
    || code === 'network'
    || code === 'network_offline'
    || message.toLowerCase().includes('failed to fetch')
    || message.toLowerCase().includes('network')
  ) {
    return 'Network error. Check your connection and try again.';
  }
  if (
    code.includes('unavailable')
    || code === 'config'
    || message.toLowerCase().includes('firebase unavailable')
    || message.toLowerCase().includes('service is unavailable')
  ) {
    return 'Service is unavailable right now. Try again in a moment.';
  }
  if (code.startsWith('auth/')) {
    return formatAuthSubmissionError(error, fallbackMessage);
  }

  return message || fallbackMessage;
};

export const buildSubmissionFeedback = ({
  error = null,
  successMessage = '',
  fallbackMessage = 'Request failed. Please try again.',
  app = null,
  auth = false
} = {}) => {
  if (error) {
    return {
      tone: 'error',
      message: formatSubmissionError(error, {
        app,
        fallbackMessage,
        auth
      })
    };
  }

  return {
    tone: 'success',
    message: normalizeLabel(successMessage)
  };
};
