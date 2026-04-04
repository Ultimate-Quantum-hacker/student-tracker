import { test, expect } from '@playwright/test';

const FIREBASE_APP_STUB = `
export const initializeApp = (config = {}) => ({ config });
`;

const FIRESTORE_STUB = `
export const getFirestore = () => ({});
export const collection = (...args) => ({ type: 'collection', args });
export const collectionGroup = (...args) => ({ type: 'collectionGroup', args });
export const doc = (...args) => ({ type: 'doc', args });
export const addDoc = async () => ({ id: 'mock-doc-id' });
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const getDocs = async () => ({ docs: [], empty: true, forEach: () => {} });
export const setDoc = async () => {};
export const updateDoc = async () => {};
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
  displayName: overrides.displayName || 'Mock User',
  emailVerified: Boolean(overrides.emailVerified),
  metadata: {
    creationTime: overrides.creationTime || new Date().toISOString(),
    lastSignInTime: overrides.lastSignInTime || new Date().toISOString()
  }
});

const authState = {
  currentUser: null
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
  authState.currentUser = createUser({ email, emailVerified: false });
  return { user: authState.currentUser };
};

export const signInWithEmailAndPassword = async (_auth, email) => {
  authState.currentUser = createUser({ email, emailVerified: false });
  return { user: authState.currentUser };
};

export const signOut = async () => {
  authState.currentUser = null;
};

export const setPersistence = async (auth) => auth;

export const updateProfile = async (user, profile = {}) => {
  if (user && typeof profile.displayName === 'string') {
    user.displayName = profile.displayName;
  }
};

export const sendPasswordResetEmail = async () => {};
export const sendEmailVerification = async () => {};
export const reload = async () => {};
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
});