const AUTH_PAGE_NOTICE_KEY = 'authPageNotice';
const APP_TOAST_NOTICE_KEY = 'appToastNotice';

const getSessionStorageRef = () => {
  try {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }

    return sessionStorage;
  } catch {
    return null;
  }
};

const normalizeTone = (tone) => String(tone || 'info').trim() || 'info';

const storeNotice = (storageKey, message, tone = 'info') => {
  const storage = getSessionStorageRef();
  if (!storage) {
    return;
  }

  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    storage.removeItem(storageKey);
    return;
  }

  storage.setItem(storageKey, JSON.stringify({
    message: normalizedMessage,
    tone: normalizeTone(tone)
  }));
};

const parseStoredNotice = (stored) => {
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    const message = String(parsed?.message || '').trim();
    if (!message) {
      return null;
    }

    return {
      message,
      tone: normalizeTone(parsed?.tone)
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

const consumeNotice = (storageKey) => {
  const storage = getSessionStorageRef();
  if (!storage) {
    return null;
  }

  const stored = storage.getItem(storageKey);
  if (!stored) {
    return null;
  }

  storage.removeItem(storageKey);

  return parseStoredNotice(stored);
};

const peekNotice = (storageKey) => {
  const storage = getSessionStorageRef();
  if (!storage) {
    return null;
  }

  return parseStoredNotice(storage.getItem(storageKey));
};

export const storeAuthPageNotice = (message, tone = 'info') => {
  storeNotice(AUTH_PAGE_NOTICE_KEY, message, tone);
};

export const consumeAuthPageNotice = () => consumeNotice(AUTH_PAGE_NOTICE_KEY);
export const peekAuthPageNotice = () => peekNotice(AUTH_PAGE_NOTICE_KEY);

export const storeAppToastNotice = (message, tone = 'info') => {
  storeNotice(APP_TOAST_NOTICE_KEY, message, tone);
};

export const consumeAppToastNotice = () => consumeNotice(APP_TOAST_NOTICE_KEY);
