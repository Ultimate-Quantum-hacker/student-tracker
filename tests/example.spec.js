import { test, expect } from '@playwright/test';

const FIREBASE_APP_STUB = `
export const initializeApp = (config = {}) => ({ config });
`;

const FIRESTORE_STUB = `
const cloneValue = (value = {}) => JSON.parse(JSON.stringify(value));
const ensureDocStore = () => {
  if (!globalThis.__TEST_FIRESTORE_DOCS__ || typeof globalThis.__TEST_FIRESTORE_DOCS__ !== 'object') {
    globalThis.__TEST_FIRESTORE_DOCS__ = {};
  }
  return globalThis.__TEST_FIRESTORE_DOCS__;
};
const resolveDocPath = (target = {}) => Array.isArray(target?.args) ? target.args.slice(1).join('/') : '';

export const getFirestore = () => ({});
export const collection = (...args) => ({ type: 'collection', args });
export const collectionGroup = (...args) => ({ type: 'collectionGroup', args });
export const doc = (...args) => ({ type: 'doc', args });
export const addDoc = async () => ({ id: 'mock-doc-id' });
export const getDoc = async (target) => {
  const store = ensureDocStore();
  const path = resolveDocPath(target);
  const value = path ? store[path] : null;
  return {
    exists: () => Boolean(value),
    data: () => (value ? cloneValue(value) : {})
  };
};
export const getDocs = async () => ({ docs: [], empty: true, forEach: () => {} });
export const setDoc = async (target, value = {}, options = {}) => {
  const store = ensureDocStore();
  const path = resolveDocPath(target);
  if (!path) {
    return;
  }

  const nextValue = cloneValue(value);
  store[path] = options?.merge ? { ...(store[path] || {}), ...nextValue } : nextValue;
};
export const updateDoc = async (target, value = {}) => {
  const store = ensureDocStore();
  const path = resolveDocPath(target);
  if (!path) {
    return;
  }

  store[path] = { ...(store[path] || {}), ...cloneValue(value) };
};
export const deleteDoc = async () => {};
export const query = (...args) => ({ type: 'query', args });
export const where = (...args) => ({ type: 'where', args });
export const orderBy = (...args) => ({ type: 'orderBy', args });
export const limit = (...args) => ({ type: 'limit', args });

export const onSnapshot = (_target, nextOrOptions, next) => {
  const callback = typeof nextOrOptions === 'function' ? nextOrOptions : next;
  Promise.resolve().then(() => {
    if (typeof callback === 'function') {
      callback({ docs: [], empty: true, forEach: () => {} });
    }
  });
  return () => {};
};
export const serverTimestamp = () => new Date().toISOString();
`;

const FIREBASE_AUTH_STUB = `
const createUser = (overrides = {}) => ({
  uid: overrides.uid || 'mock-user-id',
  email: overrides.email || 'teacher@example.com',
  displayName: overrides.displayName || overrides.name || 'Mock User',
  emailVerified: Boolean(overrides.emailVerified),
  metadata: {
    creationTime: overrides.creationTime || new Date().toISOString(),
    lastSignInTime: overrides.lastSignInTime || new Date().toISOString()
  }
});

const resolveInitialUser = () => {
  const seededUser = globalThis.__TEST_AUTH_USER__;
  return seededUser ? createUser(seededUser) : null;
};

const authState = {
  currentUser: resolveInitialUser()
};

export const browserLocalPersistence = {};

export const getAuth = () => authState;

export const onAuthStateChanged = (_auth, next, error) => {
  Promise.resolve().then(() => {
    try {
      if (typeof next === 'function') {
        next(authState.currentUser);
      }
    } catch (callbackError) {
      if (typeof error === 'function') {
        error(callbackError);
      }
    }
  });
  return () => {};
};

export const createUserWithEmailAndPassword = async (_auth, email) => {
  const seededUser = globalThis.__TEST_AUTH_USER__ || {};
  authState.currentUser = createUser({ ...seededUser, email, emailVerified: false });
  globalThis.__TEST_AUTH_USER__ = { ...authState.currentUser };
  return { user: authState.currentUser };
};

export const signInWithEmailAndPassword = async (_auth, email) => {
  const seededUser = globalThis.__TEST_AUTH_USER__ || {};
  authState.currentUser = createUser({ ...seededUser, email, emailVerified: Boolean(seededUser.emailVerified) });
  globalThis.__TEST_AUTH_USER__ = { ...authState.currentUser };
  return { user: authState.currentUser };
};

export const signOut = async () => {
  authState.currentUser = null;
  globalThis.__TEST_AUTH_USER__ = null;
};

export const setPersistence = async (auth) => auth;

export const updateProfile = async (user, profile = {}) => {
  if (user && typeof profile.displayName === 'string') {
    user.displayName = profile.displayName;
  }
  if (authState.currentUser) {
    globalThis.__TEST_AUTH_USER__ = {
      ...authState.currentUser,
      displayName: authState.currentUser.displayName
    };
  }
};

export const sendPasswordResetEmail = async (_auth, email) => {
  globalThis.__TEST_LAST_PASSWORD_RESET_EMAIL__ = email;
};
export const sendEmailVerification = async (user) => {
  globalThis.__TEST_LAST_VERIFICATION_EMAIL__ = user?.email || '';
};
export const reload = async () => {
  const seededUser = globalThis.__TEST_AUTH_USER__;
  if (seededUser) {
    authState.currentUser = createUser(seededUser);
  }
};
`;

const EXTERNAL_LIBRARY_STUB = `
window.XLSX = window.XLSX || {};
window.html2pdf = window.html2pdf || function () {
  return {
    from() { return this; },
    set() { return this; },
    save() { return Promise.resolve(); },
    outputPdf() { return Promise.resolve(''); }
  };
};
`;

const stubExternalDependencies = async (page) => {
  await page.route('https://fonts.googleapis.com/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: ''
    });
  });

  await page.route('https://fonts.gstatic.com/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      body: ''
    });
  });

  await page.route('https://www.gstatic.com/firebasejs/**/firebase-app.js', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: FIREBASE_APP_STUB
    });
  });

  await page.route('https://www.gstatic.com/firebasejs/**/firebase-firestore.js', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: FIRESTORE_STUB
    });
  });

  await page.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: FIREBASE_AUTH_STUB
    });
  });

  await page.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: EXTERNAL_LIBRARY_STUB
    });
  });

  await page.route('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: EXTERNAL_LIBRARY_STUB
    });
  });
};

const configureTestSession = async (page, { authUser = null, firestoreDocs = {} } = {}) => {
  await page.addInitScript(({ authUser: seededAuthUser, firestoreDocs: seededFirestoreDocs }) => {
    window.__TEST_AUTH_USER__ = seededAuthUser;
    window.__TEST_FIRESTORE_DOCS__ = seededFirestoreDocs;
    window.__TEST_LAST_PASSWORD_RESET_EMAIL__ = '';
    window.__TEST_LAST_VERIFICATION_EMAIL__ = '';
  }, { authUser, firestoreDocs });
};

test.beforeEach(async ({ page }) => {
  await stubExternalDependencies(page);
});

test.describe('JHS Mock Exam Tracker', () => {

  test('index route redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/login\.html/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('#auth-error')).toHaveText('Please sign in to continue to the dashboard.');
  });

  test('verify-email route redirects unauthenticated users to login with context', async ({ page }) => {
    await page.goto('http://localhost:3000/verify-email.html', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/login\.html/);
    await expect(page.locator('#auth-error')).toHaveText('Sign in to continue to the verification screen.');
  });

  test('login page renders expected auth controls', async ({ page }) => {
    await page.goto('http://localhost:3000/login.html', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel('Email')).toBeVisible();

    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create account/ })).toBeVisible();
  });

  test('signup page renders expected auth controls', async ({ page }) => {
    await page.goto('http://localhost:3000/signup.html', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel(/^Password$/)).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Already have an account\?/ })).toBeVisible();
  });

  test('login page sends password reset email with success feedback', async ({ page }) => {
    await page.goto('http://localhost:3000/login.html', { waitUntil: 'domcontentloaded' });

    await page.getByLabel('Email').fill('teacher@example.com');
    await page.getByRole('button', { name: 'Forgot password?' }).click();

    await expect(page.locator('#auth-error')).toHaveText('If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.');
    await expect.poll(async () => page.evaluate(() => window.__TEST_LAST_PASSWORD_RESET_EMAIL__)).toBe('teacher@example.com');
  });

  test('login route redirects signed-in unverified teachers to verify-email', async ({ page }) => {
    await configureTestSession(page, {
      authUser: {
        uid: 'teacher-auth-1',
        email: 'teacher@example.com',
        name: 'Teacher Example',
        emailVerified: false
      },
      firestoreDocs: {
        'users/teacher-auth-1': {
          uid: 'teacher-auth-1',
          role: 'teacher',
          name: 'Teacher Example',
          email: 'teacher@example.com',
          emailVerified: false
        }
      }
    });

    await page.goto('http://localhost:3000/login.html', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/verify-email\.html/);
    await expect(page.locator('#auth-error')).toHaveText('This account still needs email verification before dashboard access.');
    await expect(page.locator('#verify-email-address')).toHaveText('teacher@example.com');
  });

  test('verify-email page renders signed-in unverified teacher context and actions', async ({ page }) => {
    await configureTestSession(page, {
      authUser: {
        uid: 'teacher-auth-2',
        email: 'teacher-two@example.com',
        name: 'Teacher Two',
        emailVerified: false
      },
      firestoreDocs: {
        'users/teacher-auth-2': {
          uid: 'teacher-auth-2',
          role: 'teacher',
          name: 'Teacher Two',
          email: 'teacher-two@example.com',
          emailVerified: false
        }
      }
    });

    await page.goto('http://localhost:3000/verify-email.html', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/verify-email\.html/);
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    await expect(page.locator('#verify-email-address')).toHaveText('teacher-two@example.com');
    await expect(page.locator('#verify-email-copy')).toContainText('teacher-two@example.com');
    await expect(page.getByRole('button', { name: "I've verified my email" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible();
    await expect(page.locator('#auth-error')).toHaveText('Verify your email address to continue to the dashboard.');
  });

  test('auth helpers require teacher email verification but exempt privileged roles', async ({ page }) => {
    await page.goto('http://localhost:3000/login.html', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const authModule = await import('/js/auth.js');
      return {
        teacherRequiresVerification: authModule.requiresEmailVerificationForRole('teacher'),
        adminRequiresVerification: authModule.requiresEmailVerificationForRole('admin'),
        developerRequiresVerification: authModule.requiresEmailVerificationForRole('developer'),
        unverifiedTeacherBlocked: authModule.shouldBlockForEmailVerification({ uid: 'teacher-3', role: 'teacher', emailVerified: false }, 'teacher'),
        verifiedTeacherBlocked: authModule.shouldBlockForEmailVerification({ uid: 'teacher-4', role: 'teacher', emailVerified: true }, 'teacher'),
        unverifiedAdminBlocked: authModule.shouldBlockForEmailVerification({ uid: 'admin-1', role: 'admin', emailVerified: false }, 'admin'),
        unverifiedDeveloperBlocked: authModule.shouldBlockForEmailVerification({ uid: 'developer-1', role: 'developer', emailVerified: false }, 'developer')
      };
    });

    expect(result.teacherRequiresVerification).toBe(true);
    expect(result.adminRequiresVerification).toBe(false);
    expect(result.developerRequiresVerification).toBe(false);
    expect(result.unverifiedTeacherBlocked).toBe(true);
    expect(result.verifiedTeacherBlocked).toBe(false);
    expect(result.unverifiedAdminBlocked).toBe(false);
    expect(result.unverifiedDeveloperBlocked).toBe(false);
  });
});