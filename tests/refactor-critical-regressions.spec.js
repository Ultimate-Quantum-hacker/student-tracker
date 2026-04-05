import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';

const FIREBASE_APP_STUB = `
export const initializeApp = (config = {}) => ({ config });
`;

const FIRESTORE_STUB = `
const cloneValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const normalizeSegments = (segments = []) => {
  return segments.flatMap((segment) => {
    if (!segment) {
      return [];
    }
    if (segment.type === 'collection' || segment.type === 'doc') {
      return Array.isArray(segment.path) ? segment.path : [];
    }
    if (typeof segment === 'string') {
      return [segment];
    }
    return [];
  }).map((segment) => String(segment || '').trim()).filter(Boolean);
};
const pathKey = (segments = []) => normalizeSegments(segments).join('/');
const docIdFromPath = (segments = []) => {
  const normalized = normalizeSegments(segments);
  return normalized[normalized.length - 1] || '';
};
const getCollectionPath = (segments = []) => normalizeSegments(segments).slice(0, -1);
const getCollectionIdFromDocPath = (segments = []) => {
  const collectionPath = getCollectionPath(segments);
  return collectionPath[collectionPath.length - 1] || '';
};
const matchesCollectionPath = (docPath = [], collectionPath = []) => {
  const normalizedDocPath = normalizeSegments(docPath);
  const normalizedCollectionPath = normalizeSegments(collectionPath);
  if (normalizedDocPath.length !== normalizedCollectionPath.length + 1) {
    return false;
  }
  return normalizedCollectionPath.every((segment, index) => normalizedDocPath[index] === segment);
};
const buildCollectionRef = (segments = []) => ({
  type: 'collection',
  path: normalizeSegments(segments)
});
const buildDocRef = (segments = []) => ({
  type: 'doc',
  path: normalizeSegments(segments),
  id: docIdFromPath(segments)
});
const store = globalThis.__firestoreStore || (globalThis.__firestoreStore = new Map());
const buildDocSnapshot = (ref, data) => ({
  id: ref.id || docIdFromPath(ref.path),
  ref,
  exists: () => data !== undefined,
  data: () => cloneValue(data === undefined ? {} : data)
});
const buildQuerySnapshot = (entries = []) => {
  const docs = entries.map(({ ref, data }) => buildDocSnapshot(ref, data));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach(callback) {
      docs.forEach((entry) => callback(entry));
    }
  };
};
const getFieldValue = (data = {}, fieldPath = '') => {
  return String(fieldPath || '').split('.').reduce((value, key) => {
    if (value && typeof value === 'object') {
      return value[key];
    }
    return undefined;
  }, data);
};
const compareValues = (left, right, direction = 'asc') => {
  if (left === right) {
    return 0;
  }
  if (left === undefined || left === null) {
    return direction === 'desc' ? 1 : -1;
  }
  if (right === undefined || right === null) {
    return direction === 'desc' ? -1 : 1;
  }
  if (left < right) {
    return direction === 'desc' ? 1 : -1;
  }
  return direction === 'desc' ? -1 : 1;
};
const applyConstraint = (entries = [], constraint = null) => {
  if (!constraint || typeof constraint !== 'object') {
    return entries;
  }
  if (constraint.type === 'where') {
    const [fieldPath, op, expected] = constraint.args || [];
    if (op === '==') {
      return entries.filter(({ data }) => getFieldValue(data, fieldPath) === expected);
    }
    return entries;
  }
  if (constraint.type === 'orderBy') {
    const [fieldPath, direction = 'asc'] = constraint.args || [];
    return [...entries].sort((left, right) => compareValues(
      getFieldValue(left.data, fieldPath),
      getFieldValue(right.data, fieldPath),
      direction
    ));
  }
  if (constraint.type === 'limit') {
    const [maxItems] = constraint.args || [];
    return entries.slice(0, Math.max(Number(maxItems) || 0, 0));
  }
  return entries;
};
const resolveEntries = (target) => {
  if (!target) {
    return [];
  }
  if (target.type === 'query') {
    return (target.constraints || []).reduce((entries, constraint) => applyConstraint(entries, constraint), resolveEntries(target.target));
  }
  if (target.type === 'collectionGroup') {
    const collectionId = String(target.collectionId || '').trim();
    return Array.from(store.entries())
      .map(([key, data]) => ({ ref: buildDocRef(key.split('/')), data: cloneValue(data) }))
      .filter(({ ref }) => getCollectionIdFromDocPath(ref.path) === collectionId);
  }
  if (target.type === 'collection') {
    const collectionPath = normalizeSegments(target.path);
    return Array.from(store.entries())
      .map(([key, data]) => ({ ref: buildDocRef(key.split('/')), data: cloneValue(data) }))
      .filter(({ ref }) => matchesCollectionPath(ref.path, collectionPath));
  }
  if (target.type === 'doc') {
    const key = pathKey(target.path);
    return store.has(key)
      ? [{ ref: buildDocRef(target.path), data: cloneValue(store.get(key)) }]
      : [];
  }
  return [];
};
export const getFirestore = () => ({});
export const collection = (...args) => buildCollectionRef(args);
export const collectionGroup = (...args) => ({
  type: 'collectionGroup',
  collectionId: String(args[args.length - 1] || '').trim()
});
export const doc = (...args) => buildDocRef(args);
export const addDoc = async (collectionRef, data = {}) => {
  const id = 'mock-doc-' + Math.random().toString(36).slice(2, 10);
  const ref = doc(collectionRef, id);
  await setDoc(ref, data, { merge: false });
  return { id, ...ref };
};
export const getDoc = async (ref) => {
  const key = pathKey(ref?.path || []);
  return buildDocSnapshot(buildDocRef(ref?.path || []), store.get(key));
};
export const getDocs = async (target) => buildQuerySnapshot(resolveEntries(target));
export const setDoc = async (ref, data = {}, options = {}) => {
  const key = pathKey(ref?.path || []);
  const existing = store.get(key) || {};
  const next = options?.merge ? { ...existing, ...cloneValue(data || {}) } : cloneValue(data || {});
  store.set(key, next);
};
export const updateDoc = async (ref, patch = {}) => {
  const key = pathKey(ref?.path || []);
  const existing = store.get(key) || {};
  store.set(key, { ...existing, ...cloneValue(patch || {}) });
};
export const deleteDoc = async (ref) => {
  store.delete(pathKey(ref?.path || []));
};
export const query = (target, ...constraints) => ({ type: 'query', target, constraints });
export const where = (...args) => ({ type: 'where', args });
export const orderBy = (...args) => ({ type: 'orderBy', args });
export const limit = (...args) => ({ type: 'limit', args });
export const onSnapshot = (target, nextOrOptions, next) => {
  const callback = typeof nextOrOptions === 'function' ? nextOrOptions : next;
  Promise.resolve().then(async () => {
    if (typeof callback !== 'function') {
      return;
    }
    if (target?.type === 'doc') {
      callback(await getDoc(target));
      return;
    }
    callback(await getDocs(target));
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

const readWorkspaceFile = (relativePath) => {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
};

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

test.describe('Class refactor critical regressions', () => {
  test.beforeEach(async ({ page }) => {
    await stubExternalDependencies(page);
    await page.goto(APP_URL);
  });

  test('class switch persists owner-aware context', async ({ page }) => {
    const result = await page.evaluate(() => {
      return import('/js/state.js').then((stateModule) => {
        const app = stateModule.default || window.TrackerApp;
      app.state.classes = [
        { id: 'class_alpha', name: 'Alpha', ownerId: 'owner_alpha', ownerName: 'Alpha Teacher' },
        { id: 'class_beta', name: 'Beta', ownerId: 'owner_beta', ownerName: 'Beta Teacher' }
      ];

      app.state.currentClassId = 'class_alpha';
      app.syncDataContext();
      app.state.currentClassId = 'class_beta';
      app.syncDataContext();

      return {
        persistedClassId: localStorage.getItem('currentClassId') || '',
        persistedOwnerId: localStorage.getItem('currentClassOwnerId') || '',
        effectiveUserId: app.getEffectiveUserId(),
        ownerId: app.getCurrentClassOwnerId(),
        ownerName: app.getCurrentClassOwnerName()
      };
      });
    });

    expect(result.persistedClassId).toBe('class_beta');
    expect(result.persistedOwnerId).toBe('owner_beta');
    expect(result.effectiveUserId).toBe('owner_beta');
    expect(result.ownerId).toBe('owner_beta');
    expect(result.ownerName).toBe('Beta Teacher');
  });

  test('authenticated user becomes owner fallback when class owner context is empty', async ({ page }) => {
    const result = await page.evaluate(() => {
      return import('/js/state.js').then((stateModule) => {
        const app = stateModule.default || window.TrackerApp;

        app.state.authUser = {
          uid: 'teacher_auth_uid',
          email: 'teacher@example.com'
        };
        app.state.classes = [];
        app.state.currentClassId = '';
        app.state.currentClassOwnerId = '';
        app.syncDataContext();

        return {
          ownerId: app.getCurrentClassOwnerId(),
          effectiveUserId: app.getEffectiveUserId()
        };
      });
    });

    expect(result.ownerId).toBe('teacher_auth_uid');
    expect(result.effectiveUserId).toBe('teacher_auth_uid');
  });

  test('admin read-only role blocks writes', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const stateModule = await import('/js/state.js');
      const app = stateModule.default || window.TrackerApp;
      app.setCurrentUserRole('admin', { resolved: true });
      app.state.classes = [
        { id: 'class_admin_view', name: 'Admin View', ownerId: 'owner_admin_view', ownerName: 'Owner Admin' }
      ];
      app.state.currentClassId = 'class_admin_view';
      app.syncDataContext();

      try {
        await app.addStudent({ name: 'Should Fail', class: '', notes: '', scores: {} });
        return { allowed: true, code: '' };
      } catch (error) {
        return {
          allowed: false,
          code: String(error?.code || ''),
          message: String(error?.message || '')
        };
      } finally {
        app.setCurrentUserRole('teacher', { resolved: true });
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('app/read-only-admin');
    expect(result.message.toLowerCase()).toContain('read-only');
  });

  test('teacher and developer share writable role logic while admin stays read-only', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      const snapshotRole = (role) => {
        app.setCurrentUserRole(role, { resolved: true });
        return {
          role,
          stateCanWrite: app.canCurrentRoleWrite(),
          stateReadOnly: app.isReadOnlyRoleContext(),
          uiCanWrite: ui.canCurrentRoleWrite(),
          uiReadOnly: ui.isReadOnlyRoleContext()
        };
      };

      return {
        teacher: snapshotRole('teacher'),
        developer: snapshotRole('developer'),
        admin: snapshotRole('admin')
      };
    });

    expect(result.teacher.stateCanWrite).toBe(true);
    expect(result.teacher.stateReadOnly).toBe(false);
    expect(result.teacher.uiCanWrite).toBe(true);
    expect(result.teacher.uiReadOnly).toBe(false);

    expect(result.developer.stateCanWrite).toBe(true);
    expect(result.developer.stateReadOnly).toBe(false);
    expect(result.developer.uiCanWrite).toBe(true);
    expect(result.developer.uiReadOnly).toBe(false);

    expect(result.teacher).toEqual({
      role: 'teacher',
      stateCanWrite: true,
      stateReadOnly: false,
      uiCanWrite: true,
      uiReadOnly: false
    });
    expect(result.developer).toEqual({
      role: 'developer',
      stateCanWrite: true,
      stateReadOnly: false,
      uiCanWrite: true,
      uiReadOnly: false
    });
    expect(result.admin).toEqual({
      role: 'admin',
      stateCanWrite: false,
      stateReadOnly: true,
      uiCanWrite: false,
      uiReadOnly: true
    });
  });

  test('teacher write flows retain writable class-scoped context', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const students = studentsModule.default || app.students;
      const calls = [];
      let savedStudentPatch = null;

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.classes = [
        { id: 'class_teacher_scope', name: 'Teacher Class', ownerId: 'owner_teacher_scope', ownerName: 'Teacher Scope' }
      ];
      app.state.currentClassId = 'class_teacher_scope';
      app.syncDataContext();

      app.addStudent = async () => {
        calls.push('addStudent');
        return { id: 'student_1' };
      };
      app.addSubject = async () => {
        calls.push('addSubject');
        return { id: 'subject_1' };
      };
      app.addExam = async () => {
        calls.push('addExam');
        return { id: 'exam_1' };
      };
      app.updateStudent = async (_studentId, patch) => {
        calls.push('saveMarks');
        savedStudentPatch = JSON.parse(JSON.stringify(patch || {}));
        return { id: 'student_1' };
      };

      app.state.students = [{ id: 'student_1', name: 'Student One', scores: {} }];
      app.state.subjects = [{ id: 'subject_1', name: 'Math' }];
      app.state.exams = [{ id: 'exam_1', title: 'Mock 1', name: 'Mock 1' }];
      app.analytics = {
        ...(app.analytics || {}),
        normalizeScore(value) {
          return Number(value);
        }
      };

      const uiStub = {
        refreshUI() {},
        showToast() {}
      };

      await students.addStudent('Student One', app, uiStub);
      await app.addSubject({ name: 'Science' });
      await app.addExam({ title: 'Mock 2', date: new Date().toISOString() });
      await students.saveScores('student_1', 'exam_1', { Math: 78 }, app, uiStub);

      return {
        calls,
        savedStudentPatch,
        hasLegacyScoreKey: Object.prototype.hasOwnProperty.call(savedStudentPatch?.scores || {}, 'Math'),
        classId: app.state.currentClassId,
        ownerId: app.getCurrentClassOwnerId(),
        readOnly: app.isReadOnlyRoleContext()
      };
    });

    expect(result.readOnly).toBe(false);
    expect(result.classId).toBe('class_teacher_scope');
    expect(result.ownerId).toBe('owner_teacher_scope');
    expect(result.calls).toEqual(['addStudent', 'addSubject', 'addExam', 'saveMarks']);
    expect(result.savedStudentPatch?.scores).toEqual({ subject_1: { exam_1: 78 } });
    expect(result.hasLegacyScoreKey).toBe(false);
  });

  test('teacher score entry UI emits subject id keyed payloads', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;
      const students = studentsModule.default || app.students;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <select id="score-student-select"></select>
        <select id="scoreMockSelect"></select>
        <div id="dynamicSubjectFields"></div>
        <button id="save-scores-btn" type="button">Save</button>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      app.students = students;
      ui.init();
      ui.bindEvents();
      ui.withLoader = async (task) => task();

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_teacher', name: 'Teacher Class', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' }
      ];
      app.state.currentClassId = 'class_teacher';
      app.state.currentClassOwnerId = 'owner_teacher';
      app.state.currentClassName = 'Teacher Class';
      app.state.students = [{ id: 'student_1', name: 'Student One', scores: {} }];
      app.state.subjects = [{ id: 'subject_math', name: 'Math' }];
      app.state.exams = [{ id: 'exam_mock_1', title: 'Mock 1', name: 'Mock 1' }];
      app.analytics = {
        ...(app.analytics || {}),
        getScore() {
          return '';
        }
      };
      app.syncDataContext();

      let captured = null;
      let hasLegacyKey = false;
      app.students.saveScores = async (studentId, examId, scores) => {
        captured = {
          studentId,
          examId,
          scores: JSON.parse(JSON.stringify(scores || {}))
        };
        hasLegacyKey = Object.prototype.hasOwnProperty.call(scores || {}, 'Math');
        return { id: studentId };
      };

      ui.refreshUI();
      const scoreStudentSelect = document.getElementById('score-student-select');
      const scoreMockSelect = document.getElementById('scoreMockSelect');
      scoreStudentSelect.value = 'student_1';
      scoreMockSelect.value = 'exam_mock_1';
      ui.loadScoreFields();

      const input = document.querySelector('#dynamicSubjectFields input');
      const subjectDataset = input?.dataset.subjectId || '';
      input.value = '78';

      document.getElementById('save-scores-btn').click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        captured,
        hasLegacyKey,
        subjectDataset
      };
    });

    expect(result.subjectDataset).toBe('subject_math');
    expect(result.hasLegacyKey).toBe(false);
    expect(result.captured).toEqual({
      studentId: 'student_1',
      examId: 'exam_mock_1',
      scores: { subject_math: 78 }
    });
  });

  test('teacher can add student end-to-end via UI submit', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;
      const students = studentsModule.default || app.students;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <form id="add-student-form"><input id="student-name-input" /><button type="submit">Add</button></form>
        <form id="addMockForm"><input id="mockNameInput" /><button type="submit">Add Exam</button></form>
        <form id="addSubjectForm"><input id="subjectNameInput" /><button type="submit">Add Subject</button></form>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      app.students = students;
      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_teacher', name: 'Teacher Class', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' }
      ];
      app.state.currentClassId = 'class_teacher';
      app.state.currentClassOwnerId = 'owner_teacher';
      app.state.currentClassName = 'Teacher Class';
      app.syncDataContext();

      let submittedPayload = null;
      app.addStudent = async (payload) => {
        submittedPayload = payload;
        return { id: 'student_ui_1' };
      };

      ui.refreshUI();
      const form = document.getElementById('add-student-form');
      const nameInput = document.getElementById('student-name-input');
      nameInput.value = 'Student UI One';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        submittedPayload,
        toast: document.getElementById('toast')?.textContent || ''
      };
    });

    expect(result.submittedPayload).toMatchObject({
      name: 'Student UI One',
      class: '',
      notes: ''
    });
    expect(result.toast).toContain('Student added');
  });

  test('teacher can add subject end-to-end via UI submit', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <form id="add-student-form"><input id="student-name-input" /><button type="submit">Add</button></form>
        <form id="addMockForm"><input id="mockNameInput" /><button type="submit">Add Exam</button></form>
        <form id="addSubjectForm"><input id="subjectNameInput" /><button type="submit">Add Subject</button></form>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_teacher', name: 'Teacher Class', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' }
      ];
      app.state.currentClassId = 'class_teacher';
      app.state.currentClassOwnerId = 'owner_teacher';
      app.syncDataContext();

      let submittedPayload = null;
      app.addSubject = async (payload) => {
        submittedPayload = payload;
        return { id: 'subject_ui_1', ...payload };
      };

      ui.refreshUI();
      const form = document.getElementById('addSubjectForm');
      const input = document.getElementById('subjectNameInput');
      input.value = 'Science';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        submittedPayload
      };
    });

    expect(result.submittedPayload).toEqual({ name: 'Science' });
  });

  test('teacher can add exam end-to-end via UI submit', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <form id="add-student-form"><input id="student-name-input" /><button type="submit">Add</button></form>
        <form id="addMockForm"><input id="mockNameInput" /><button type="submit">Add Exam</button></form>
        <form id="addSubjectForm"><input id="subjectNameInput" /><button type="submit">Add Subject</button></form>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_teacher', name: 'Teacher Class', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' }
      ];
      app.state.currentClassId = 'class_teacher';
      app.state.currentClassOwnerId = 'owner_teacher';
      app.syncDataContext();

      let submittedPayload = null;
      app.addExam = async (payload) => {
        submittedPayload = payload;
        return { id: 'exam_ui_1', ...payload };
      };

      ui.refreshUI();
      const form = document.getElementById('addMockForm');
      const input = document.getElementById('mockNameInput');
      input.value = 'Mock UI 1';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        submittedPayload
      };
    });

    expect(result.submittedPayload?.title).toBe('Mock UI 1');
    expect(result.submittedPayload?.date).toBeTruthy();
  });

  test('teacher class controls stay enabled after switching classes', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <form id="add-student-form"><input id="student-name-input" /><button type="submit">Add</button></form>
        <form id="addMockForm"><input id="mockNameInput" /><button type="submit">Add Exam</button></form>
        <form id="addSubjectForm"><input id="subjectNameInput" /><button type="submit">Add Subject</button></form>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_one', name: 'Class One', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' },
        { id: 'class_two', name: 'Class Two', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' }
      ];
      app.state.currentClassId = 'class_one';
      app.state.currentClassOwnerId = 'owner_teacher';
      app.syncDataContext();

      app.load = async () => {};

      ui.refreshUI();
      await ui.switchToClass('class_two', 'owner_teacher');

      return {
        currentClassId: app.state.currentClassId,
        createDisabled: Boolean(document.getElementById('create-class-btn')?.disabled),
        deleteDisabled: Boolean(document.getElementById('delete-class-btn')?.disabled)
      };
    });

    expect(result.currentClassId).toBe('class_two');
    expect(result.createDisabled).toBe(false);
    expect(result.deleteDisabled).toBe(false);
  });

  test('admin dropdown renders when valid classes exist', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <form id="add-student-form"><input id="student-name-input" /><button type="submit">Add</button></form>
        <form id="addMockForm"><input id="mockNameInput" /><button type="submit">Add Exam</button></form>
        <form id="addSubjectForm"><input id="subjectNameInput" /><button type="submit">Add Subject</button></form>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('admin', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_a', name: 'Class A', ownerId: 'owner_a', ownerName: 'Teacher A' },
        { id: 'class_b', name: 'Class B', ownerId: 'owner_b', ownerName: 'Teacher B' }
      ];
      app.state.currentClassId = 'class_a';
      app.state.currentClassOwnerId = 'owner_a';
      app.syncDataContext();

      ui.refreshUI();
      ui.applyReadOnlyRoleState();

      const switcher = document.querySelector('.global-class-switcher');
      const menuItems = document.querySelectorAll('#class-dropdown-menu .class-dropdown-item[data-class-id]');
      const createClassBtn = document.getElementById('create-class-btn');
      const deleteClassBtn = document.getElementById('delete-class-btn');

      return {
        switcherHidden: Boolean(switcher?.hidden),
        switcherDisplay: switcher?.style?.display || '',
        toggleDisabled: Boolean(document.getElementById('class-dropdown-toggle')?.disabled),
        menuCount: menuItems.length,
        createBtnVisible: createClassBtn?.hidden === false,
        deleteBtnVisible: deleteClassBtn?.hidden === false,
        createBtnDisabled: Boolean(createClassBtn?.disabled),
        deleteBtnDisabled: Boolean(deleteClassBtn?.disabled),
        createBtnTitle: createClassBtn?.getAttribute('title') || '',
        deleteBtnTitle: deleteClassBtn?.getAttribute('title') || '',
        dropdownLabel: document.getElementById('class-dropdown-value')?.textContent || ''
      };
    });

    expect(result.switcherHidden).toBe(false);
    expect(result.switcherDisplay).toBe('');
    expect(result.toggleDisabled).toBe(false);
    expect(result.menuCount).toBe(2);
    expect(result.createBtnVisible).toBe(true);
    expect(result.deleteBtnVisible).toBe(true);
    expect(result.createBtnDisabled).toBe(true);
    expect(result.deleteBtnDisabled).toBe(true);
    expect(result.createBtnTitle).toContain('Admin cannot modify data');
    expect(result.deleteBtnTitle).toContain('Admin cannot modify data');
    expect(result.dropdownLabel).toContain('Teacher:');
  });

  test('admin can change class and load corresponding data', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <form id="add-student-form"><input id="student-name-input" /><button type="submit">Add</button></form>
        <form id="addMockForm"><input id="mockNameInput" /><button type="submit">Add Exam</button></form>
        <form id="addSubjectForm"><input id="subjectNameInput" /><button type="submit">Add Subject</button></form>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('admin', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_shared', name: 'Class One', ownerId: 'owner_one', ownerName: 'Teacher One' },
        { id: 'class_shared', name: 'Class Two', ownerId: 'owner_two', ownerName: 'Teacher Two' }
      ];
      app.state.currentClassId = 'class_shared';
      app.state.currentClassOwnerId = 'owner_one';
      app.syncDataContext();

      const loadCalls = [];
      app.load = async () => {
        loadCalls.push({
          classId: app.state.currentClassId,
          ownerId: app.getCurrentClassOwnerId()
        });
      };

      ui.refreshUI();

      const target = document.querySelector('#class-dropdown-menu .class-dropdown-item[data-owner-id="owner_two"]');
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        classId: app.state.currentClassId,
        ownerId: app.getCurrentClassOwnerId(),
        loadCalls
      };
    });

    expect(result.classId).toBe('class_shared');
    expect(result.ownerId).toBe('owner_two');
    expect(result.loadCalls).toEqual([{ classId: 'class_shared', ownerId: 'owner_two' }]);
  });

  test('admin write remains blocked in UI submit path', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;
      const students = studentsModule.default || app.students;

      document.body.innerHTML = `
        <div id="toast"></div>
        <div class="global-class-switcher"><div class="class-switcher-main">
          <button id="class-prev-btn" type="button"></button>
          <div id="class-dropdown" class="class-dropdown">
            <button id="class-dropdown-toggle" type="button"><span id="class-dropdown-value"></span></button>
            <div id="class-dropdown-menu" class="class-dropdown-menu"></div>
          </div>
          <button id="class-next-btn" type="button"></button>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
        </div><p id="class-name-display"></p></div>
        <div id="admin-readonly-banner" hidden><span id="admin-readonly-label"></span></div>
        <div id="empty-msg"></div>
        <form id="add-student-form"><input id="student-name-input" /><button type="submit">Add</button></form>
        <form id="addMockForm"><input id="mockNameInput" /><button type="submit">Add Exam</button></form>
        <form id="addSubjectForm"><input id="subjectNameInput" /><button type="submit">Add Subject</button></form>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      app.students = students;
      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('admin', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_admin', name: 'Admin Class', ownerId: 'owner_admin', ownerName: 'Teacher Admin' }
      ];
      app.state.currentClassId = 'class_admin';
      app.state.currentClassOwnerId = 'owner_admin';
      app.syncDataContext();

      let addStudentCalls = 0;
      app.addStudent = async () => {
        addStudentCalls += 1;
        return { id: 'should_not_happen' };
      };

      ui.refreshUI();
      const form = document.getElementById('add-student-form');
      const nameInput = document.getElementById('student-name-input');
      nameInput.value = 'Blocked Admin Student';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        addStudentCalls,
        readOnly: app.isReadOnlyRoleContext(),
        bannerVisible: document.getElementById('admin-readonly-banner')?.hidden === false
      };
    });

    expect(result.addStudentCalls).toBe(0);
    expect(result.readOnly).toBe(true);
    expect(result.bannerVisible).toBe(true);
  });

  test('admin class switch keeps owner-aware read context', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const stateModule = await import('/js/state.js');
      const app = stateModule.default || window.TrackerApp;

      app.setCurrentUserRole('admin', { resolved: true });
      app.state.classes = [
        { id: 'shared_class_id', name: 'Class A', ownerId: 'owner_a', ownerName: 'Teacher A' },
        { id: 'shared_class_id', name: 'Class B', ownerId: 'owner_b', ownerName: 'Teacher B' }
      ];
      app.state.currentClassId = 'shared_class_id';
      app.state.currentClassOwnerId = 'owner_a';
      app.syncDataContext();

      const loadCalls = [];
      app.load = async () => {
        loadCalls.push({
          classId: app.state.currentClassId,
          ownerId: app.getCurrentClassOwnerId()
        });
      };

      await app.switchClass('shared_class_id', 'owner_b');

      return {
        classId: app.state.currentClassId,
        ownerId: app.getCurrentClassOwnerId(),
        readOnly: app.isReadOnlyRoleContext(),
        loadCalls
      };
    });

    expect(result.readOnly).toBe(true);
    expect(result.classId).toBe('shared_class_id');
    expect(result.ownerId).toBe('owner_b');
    expect(result.loadCalls).toHaveLength(1);
    expect(result.loadCalls[0]).toEqual({ classId: 'shared_class_id', ownerId: 'owner_b' });
  });

  test('migration path verifies count mismatch and fails safely', async () => {
    const authSource = readWorkspaceFile('js/auth.js');
    const appSource = readWorkspaceFile('js/app.js');
    const uiRoleSource = readWorkspaceFile('js/ui.js');
    const adminSource = readWorkspaceFile('js/admin.js');
    const dbSource = readWorkspaceFile('services/db.js');
    const stateSource = readWorkspaceFile('js/state.js');
    const rulesSource = readWorkspaceFile('firestore.rules');
    const hardcodedDeveloperSource = [authSource, appSource, uiRoleSource, adminSource, dbSource, rulesSource].join('\n');

    expect(dbSource).toContain('const getRawDataCounts = (rawData) =>');
    expect(dbSource).toContain("if (classifyFirebaseError(error) === 'permission') {");
    expect(dbSource).toContain('Skipping legacy root data read during class migration due to permissions:');
    expect(dbSource).toContain('const countsMismatchBeforeSync = !hasMatchingRawDataCounts(legacyCounts, classCountsBeforeSync);');
    expect(dbSource).toContain('if (hasLegacyData && countsMismatchBeforeSync) {');
    expect(dbSource).toContain('await writeModularData(classOwnerId, classId, legacyRawData);');
    expect(dbSource).toContain('Migration verification mismatch');
    expect(dbSource).toContain("await updateMigrationState(userId, 'failed', {");
    expect(dbSource).toContain('classMigrationError: String(error?.message || \'Migration failed\').slice(0, 500)');
    expect(dbSource).toContain('const findClassEntryBySelection = (classes = [], classId = \'\', ownerId = \'\') => {');
    expect(dbSource).toContain('const activeClass = findClassEntryBySelection(classes, classId, currentClassOwnerId || persistedSelection.ownerId || \'\') || null;');
    expect(dbSource).toContain('const classesSnapshot = await getDocs(collectionGroup(db, CLASSES_SUBCOLLECTION));');
    expect(dbSource).toContain("const canRoleWrite = (role = getCurrentUserRoleContext()) => {");
    expect(dbSource).toContain("console.log('ROLE:', role);");
    expect(dbSource).toContain("console.log('CAN WRITE:', canRoleWrite(role));");
    expect(dbSource).toContain('await ensureDefaultClassDocument(authUserId);');
    expect(dbSource).toContain('return normalizeUserId(currentClassOwnerId) || getAuthenticatedUserId();');
    expect(dbSource).toContain("assertAdminOrDeveloperRole('read activity logs');");
    expect(dbSource).toContain("if (userRole === 'admin' || userRole === 'developer') {");
    expect(stateSource).toContain('app.canCurrentRoleWrite = function () {');
    expect(stateSource).toContain("console.log('CAN WRITE:', app.state.currentUserRole !== ROLE_ADMIN);");
    expect(stateSource).toContain("const getAuthenticatedOwnerFallback = () => String(app.state.authUser?.uid || '').trim();");
    expect(rulesSource).toContain('function isSignedIn() {');
    expect(rulesSource).toContain('function isOwner(userId) {');
    expect(rulesSource).toContain('function requesterRole() {');
    expect(rulesSource).toContain('function canReadOwnerScopedData(userId) {');
    expect(rulesSource).toContain('function ownerCanCreateOwnUserDoc(userId) {');
    expect(rulesSource).toContain('match /users/{userId}/students/{docId} {');
    expect(rulesSource).toContain('match /users/{userId}/subjects/{docId} {');
    expect(rulesSource).toContain('match /users/{userId}/exams/{docId} {');
    expect(rulesSource).toContain('match /users/{userId}/classes/{classId}/{collection}/{docId} {');
    expect(rulesSource).toContain('match /{path=**}/classes/{classId} {');
    expect(rulesSource).toContain('allow read: if canReadOwnerScopedData(userId);');
    expect(rulesSource).toContain('allow read: if isPrivilegedUser();');
    expect(rulesSource).toContain('match /activityLogs/{logId} {');
    expect(rulesSource).toContain('allow create: if isSignedIn();');
    expect(rulesSource).toContain('allow read, delete: if isPrivilegedUser();');
    expect(rulesSource).toContain('get(/databases/$(database)/documents/users/$(request.auth.uid))');
    expect(hardcodedDeveloperSource).not.toContain('pokumike2@gmail.com');
    expect(hardcodedDeveloperSource).not.toContain('isDeveloperAccountEmail');
    expect(hardcodedDeveloperSource).not.toContain('isDeveloperAccountEmailValue');
  });

  test('stale deleted class selection has validated fallback path', async () => {
    const stateSource = readWorkspaceFile('js/state.js');
    const uiSource = readWorkspaceFile('js/ui.js');

    expect(stateSource).toContain('const resolveValidatedClassContext = (classes = [], classId = \'\', ownerId = \'\') => {');
    expect(stateSource).toContain('isFallback: Boolean(!selectedClass && (normalizedClassId || normalizedOwnerId))');
    expect(stateSource).toContain('Persisted class selection was stale/invalid; selection has been reset to a valid class context.');
    expect(stateSource).toContain('app.state.dashboardStudentCount = null;');
    expect(uiSource).toContain('data-owner-id="${app.utils.esc(ownerId)}"');
    expect(uiSource).toContain('await this.switchToClass(nextClassId, nextOwnerId);');
  });

  test('audit log and number rendering sanitize malformed values', async () => {
    const adminSource = readWorkspaceFile('js/admin.js');
    const uiSource = readWorkspaceFile('js/ui.js');
    const dbSource = readWorkspaceFile('services/db.js');

    expect(adminSource).toContain("normalized === '[object Object]'");
    expect(adminSource).toContain("lower === 'nan'");
    expect(adminSource).toContain('const normalizeCount = (value) => {');
    expect(uiSource).toContain('toFiniteNumber: function (value) {');
    expect(uiSource).toContain("formatFixedOrFallback: function (value, decimals = 1, fallback = '—') {");
    expect(dbSource).toContain('const normalizeLogScalar = (value, fallback = \'\') => {');
    expect(dbSource).toContain('const normalizeLogTimestamp = (payload = {}) => {');
  });

  test('dark mode readability overrides cover key admin and dashboard surfaces', async () => {
    const adminCss = readWorkspaceFile('css/admin.css');
    const enhancedCss = readWorkspaceFile('css/enhanced.css');

    expect(adminCss).toContain('body.dark .activity-group-row td');
    expect(adminCss).toContain('body.dark .admin-modal-card');
    expect(adminCss).toContain('body.dark .admin-toast.error');
    expect(enhancedCss).toContain('body.dark-mode .class-dropdown-toggle');
    expect(enhancedCss).toContain('body.dark-mode .risk-pill');
    expect(enhancedCss).toContain('body.dark-mode .modal-content');
  });

  test('privileged-role onboarding policy keeps developer manual and admin promotion verified-only', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const adminUserUtils = await import('/js/admin-user-utils.js');
      const {
        canRenderAdminRoleChangeControl,
        getAdminUserRolePolicyLabel,
        buildAdminUserRoleUpdateState
      } = adminUserUtils;

      const unverifiedTeacher = {
        uid: 'teacher_unverified',
        role: 'teacher',
        emailVerified: false,
        email: 'teacher-unverified@example.com'
      };
      const verifiedTeacher = {
        uid: 'teacher_verified',
        role: 'teacher',
        emailVerified: true,
        email: 'teacher-verified@example.com'
      };
      const developerRecord = {
        uid: 'developer_user',
        role: 'developer',
        emailVerified: true,
        email: 'developer@example.com'
      };

      return {
        unverifiedTeacherCanRender: canRenderAdminRoleChangeControl(unverifiedTeacher, { currentRole: 'developer' }),
        unverifiedTeacherPolicy: getAdminUserRolePolicyLabel(unverifiedTeacher, { currentRole: 'developer' }),
        unverifiedTeacherUpdate: buildAdminUserRoleUpdateState(unverifiedTeacher, {
          nextRole: 'admin',
          updatableRoles: ['teacher', 'admin']
        }),
        verifiedTeacherCanRender: canRenderAdminRoleChangeControl(verifiedTeacher, { currentRole: 'developer' }),
        verifiedTeacherUpdate: buildAdminUserRoleUpdateState(verifiedTeacher, {
          nextRole: 'admin',
          updatableRoles: ['teacher', 'admin']
        }),
        developerCanRender: canRenderAdminRoleChangeControl(developerRecord, { currentRole: 'developer' }),
        developerPolicy: getAdminUserRolePolicyLabel(developerRecord, { currentRole: 'developer' }),
        developerUpdate: buildAdminUserRoleUpdateState(developerRecord, {
          nextRole: 'admin',
          updatableRoles: ['teacher', 'admin']
        })
      };
    });

    const dbSource = readWorkspaceFile('services/db.js');
    const rulesSource = readWorkspaceFile('firestore.rules');
    const authSource = readWorkspaceFile('js/auth.js');

    expect(result.unverifiedTeacherCanRender).toBe(false);
    expect(result.unverifiedTeacherPolicy).toContain('Verify this teacher account before admin promotion');
    expect(result.unverifiedTeacherUpdate.canUpdate).toBe(false);
    expect(result.unverifiedTeacherUpdate.statusMessage).toContain('Verify this teacher email');

    expect(result.verifiedTeacherCanRender).toBe(true);
    expect(result.verifiedTeacherUpdate.canUpdate).toBe(true);
    expect(result.verifiedTeacherUpdate.normalizedNextRole).toBe('admin');

    expect(result.developerCanRender).toBe(false);
    expect(result.developerPolicy).toContain('Developer onboarding is manual outside the app');
    expect(result.developerUpdate.canUpdate).toBe(false);
    expect(result.developerUpdate.statusMessage).toContain('Developer onboarding is manual');

    expect(authSource).toContain('emailVerified: Boolean(auth?.currentUser?.emailVerified ?? authUser?.emailVerified),');
    expect(dbSource).toContain('PRIVILEGED_ROLE_POLICY');
    expect(dbSource).toContain('buildPrivilegedRoleUpdatePolicyState');
    expect(dbSource).toContain('Privileged roles can only be assigned to existing signed-in teacher accounts.');
    expect(dbSource).toContain('Only verified teacher accounts can be promoted to admin.');
    expect(dbSource).toContain("Developer onboarding is manual and cannot be changed in the admin panel.");
    expect(dbSource).toContain("await logActivity('user_role_updated', normalizedUid, 'record', {");
    expect(rulesSource).toContain('function developerCanManageUserRole(userId) {');
    expect(rulesSource).toContain("request.resource.data.emailVerified == request.auth.token.email_verified");
    expect(rulesSource).toContain("allow create: if ownerCanCreateOwnUserDoc(userId);");
    expect(rulesSource).toContain("request.resource.data.role != 'admin'");
    expect(rulesSource).toContain("resource.data.emailVerified == true");
  });

  test('applyRawData migrates legacy score maps to subject and exam ids', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const stateModule = await import('/js/state.js');
      const app = stateModule.default || window.TrackerApp;

      app.applyRawData({
        students: [{
          id: 'student_legacy_1',
          name: 'Legacy Student',
          scores: {
            Math: { 'Mock 1': 88 },
            English: { 'Mock 1': 76 }
          }
        }],
        subjects: [
          { id: 'subject_math', name: 'Math' },
          { id: 'subject_english', name: 'English' }
        ],
        exams: [
          { id: 'exam_mock_1', title: 'Mock 1', name: 'Mock 1' }
        ]
      });

      const student = app.state.students[0] || {};
      const scores = student.scores || {};
      return {
        scores,
        hasLegacySubjectKey: Object.prototype.hasOwnProperty.call(scores, 'Math'),
        hasLegacyExamKey: Object.prototype.hasOwnProperty.call(scores.subject_math || {}, 'Mock 1')
      };
    });

    expect(result.hasLegacySubjectKey).toBe(false);
    expect(result.hasLegacyExamKey).toBe(false);
    expect(result.scores).toEqual({
      subject_math: { exam_mock_1: 88 },
      subject_english: { exam_mock_1: 76 }
    });
  });

  test('service student write paths normalize label keyed scores to ids before persistence', async ({ page }) => {
    await page.addInitScript(() => {
      window.__FIREBASE_CONFIG__ = {
        apiKey: 'test-api-key',
        authDomain: 'test-project.firebaseapp.com',
        projectId: 'test-project',
        storageBucket: 'test-project.appspot.com',
        messagingSenderId: '1234567890',
        appId: '1:1234567890:web:test'
      };
    });
    await page.goto(APP_URL);

    const result = await page.evaluate(async () => {
      const [firebaseModule, dbModule] = await Promise.all([
        import('/js/firebase.js'),
        import('/services/db.js')
      ]);

      globalThis.__firestoreStore?.clear?.();
      localStorage.clear();
      sessionStorage.clear();

      firebaseModule.auth.currentUser = {
        uid: 'owner_service',
        email: 'teacher@example.com',
        displayName: 'Teacher Service'
      };

      dbModule.setCurrentUserRoleContext('teacher');
      dbModule.setCurrentClassId('class_service');
      dbModule.setCurrentClassOwnerContext('owner_service', 'Teacher Service');

      const updatedAt = new Date().toISOString();
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_service'),
        { userId: 'owner_service', activeClassId: 'class_service', updatedAt },
        { merge: true }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_service', 'classes', 'class_service'),
        {
          id: 'class_service',
          name: 'Service Class',
          userId: 'owner_service',
          ownerId: 'owner_service',
          ownerName: 'Teacher Service',
          updatedAt,
          deleted: false
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_service', 'classes', 'class_service', 'students', 'student_1'),
        {
          id: 'student_1',
          name: 'Student One',
          notes: '',
          class: '',
          scores: {},
          deleted: false,
          deletedAt: null,
          order: 0,
          userId: 'owner_service',
          ownerId: 'owner_service',
          classId: 'class_service',
          updatedAt
        },
        { merge: false }
      );

      const rawData = {
        students: [{ id: 'student_1', name: 'Student One', scores: {} }],
        subjects: [{ id: 'subject_math', name: 'Math' }],
        exams: [{ id: 'exam_mock_1', title: 'Mock 1', name: 'Mock 1' }]
      };

      const saveStudentResult = await dbModule.saveStudent(rawData, {
        id: 'student_2',
        name: 'Student Two',
        scores: { Math: { 'Mock 1': 91 } }
      });
      const studentTwoAfterSaveStudentSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_service', 'classes', 'class_service', 'students', 'student_2')
      );
      const updateStudentResult = await dbModule.updateStudent(rawData, 'student_1', {
        scores: { Math: { 'Mock 1': 82 } }
      });
      const saveScoresResult = await dbModule.saveScores(rawData, 'student_1', {
        Math: { 'Mock 1': 84 }
      });

      const studentOneSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_service', 'classes', 'class_service', 'students', 'student_1')
      );
      const classSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_service', 'classes', 'class_service')
      );

      const saveStudentScores = saveStudentResult.data.students.find((student) => student.id === 'student_2')?.scores || {};
      const updateStudentScores = updateStudentResult.data.students.find((student) => student.id === 'student_1')?.scores || {};
      const saveScoresData = saveScoresResult.data.students.find((student) => student.id === 'student_1')?.scores || {};
      const storedStudentOne = studentOneSnapshot.data().scores || {};
      const storedStudentTwoAfterSaveStudent = studentTwoAfterSaveStudentSnapshot.data().scores || {};

      return {
        saveStudentRemote: saveStudentResult.remoteSaved,
        updateStudentRemote: updateStudentResult.remoteSaved,
        saveScoresRemote: saveScoresResult.remoteSaved,
        saveStudentSchemaVersion: saveStudentResult.data.schemaVersion,
        saveScoresSchemaVersion: saveScoresResult.data.schemaVersion,
        classDataSchemaVersion: classSnapshot.data().dataSchemaVersion,
        saveStudentScores,
        updateStudentScores,
        saveScoresData,
        storedStudentOne,
        storedStudentTwoAfterSaveStudent,
        legacyFlags: {
          saveStudent: Object.prototype.hasOwnProperty.call(saveStudentScores, 'Math'),
          updateStudent: Object.prototype.hasOwnProperty.call(updateStudentScores, 'Math'),
          saveScores: Object.prototype.hasOwnProperty.call(saveScoresData, 'Math'),
          storedStudentOne: Object.prototype.hasOwnProperty.call(storedStudentOne, 'Math'),
          storedStudentTwoAfterSaveStudent: Object.prototype.hasOwnProperty.call(storedStudentTwoAfterSaveStudent, 'Math')
        }
      };
    });

    expect(result.saveStudentRemote).toBe(true);
    expect(result.updateStudentRemote).toBe(true);
    expect(result.saveScoresRemote).toBe(true);
    expect(result.saveStudentSchemaVersion).toBe(2);
    expect(result.saveScoresSchemaVersion).toBe(2);
    expect(result.classDataSchemaVersion).toBe(2);
    expect(result.saveStudentScores).toEqual({ subject_math: { exam_mock_1: 91 } });
    expect(result.updateStudentScores).toEqual({ subject_math: { exam_mock_1: 82 } });
    expect(result.saveScoresData).toEqual({ subject_math: { exam_mock_1: 84 } });
    expect(result.storedStudentOne).toEqual({ subject_math: { exam_mock_1: 84 } });
    expect(result.storedStudentTwoAfterSaveStudent).toEqual({ subject_math: { exam_mock_1: 91 } });
    expect(result.legacyFlags).toEqual({
      saveStudent: false,
      updateStudent: false,
      saveScores: false,
      storedStudentOne: false,
      storedStudentTwoAfterSaveStudent: false
    });
  });

  test('fetchAllData migrates legacy root data into class scope with schema markers', async ({ page }) => {
    await page.addInitScript(() => {
      window.__FIREBASE_CONFIG__ = {
        apiKey: 'test-api-key',
        authDomain: 'test-project.firebaseapp.com',
        projectId: 'test-project',
        storageBucket: 'test-project.appspot.com',
        messagingSenderId: '1234567890',
        appId: '1:1234567890:web:test'
      };
    });
    await page.goto(APP_URL);

    const result = await page.evaluate(async () => {
      const [firebaseModule, dbModule] = await Promise.all([
        import('/js/firebase.js'),
        import('/services/db.js')
      ]);

      globalThis.__firestoreStore?.clear?.();
      localStorage.clear();
      sessionStorage.clear();

      firebaseModule.auth.currentUser = {
        uid: 'owner_migration',
        email: 'teacher@example.com',
        displayName: 'Teacher Migration'
      };

      dbModule.setCurrentUserRoleContext('teacher');
      dbModule.setCurrentClassId('class_migration');
      dbModule.setCurrentClassOwnerContext('owner_migration', 'Teacher Migration');

      const updatedAt = new Date().toISOString();
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration'),
        {
          uid: 'owner_migration',
          userId: 'owner_migration',
          activeClassId: 'class_migration',
          updatedAt
        },
        { merge: true }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration', 'classes', 'class_migration'),
        {
          id: 'class_migration',
          name: 'Migration Class',
          createdAt: updatedAt,
          updatedAt,
          deleted: false,
          deletedAt: null,
          userId: 'owner_migration',
          ownerId: 'owner_migration',
          ownerName: 'Teacher Migration'
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration', 'students', 'student_legacy_1'),
        {
          id: 'student_legacy_1',
          name: 'Legacy Student',
          notes: '',
          class: 'Migration Class',
          scores: {
            Math: { 'Mock 1': 73 }
          },
          deleted: false,
          deletedAt: null,
          updatedAt,
          userId: 'owner_migration'
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration', 'subjects', 'subject_math'),
        {
          id: 'subject_math',
          name: 'Math',
          deleted: false,
          deletedAt: null,
          updatedAt,
          userId: 'owner_migration'
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration', 'exams', 'exam_mock_1'),
        {
          id: 'exam_mock_1',
          title: 'Mock 1',
          name: 'Mock 1',
          deleted: false,
          deletedAt: null,
          updatedAt,
          userId: 'owner_migration'
        },
        { merge: false }
      );

      const fetchResult = await dbModule.fetchAllData();
      const migratedStudentSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration', 'classes', 'class_migration', 'students', 'student_legacy_1')
      );
      const classSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration', 'classes', 'class_migration')
      );
      const userRootSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_migration')
      );

      return {
        currentClassId: fetchResult.currentClassId,
        fetchSchemaVersion: fetchResult.data.schemaVersion,
        classDataSchemaVersion: classSnapshot.data().dataSchemaVersion,
        migrationStatus: userRootSnapshot.data().classMigrationStatus,
        migrationComplete: userRootSnapshot.data().classMigrationComplete,
        migratedScores: migratedStudentSnapshot.data().scores || {},
        fetchedScores: fetchResult.data.students[0]?.scores || {}
      };
    });

    expect(result.currentClassId).toBe('class_migration');
    expect(result.fetchSchemaVersion).toBe(2);
    expect(result.classDataSchemaVersion).toBe(2);
    expect(result.migrationStatus).toBe('completed');
    expect(result.migrationComplete).toBe(true);
    expect(result.migratedScores).toEqual({ subject_math: { exam_mock_1: 73 } });
    expect(result.fetchedScores).toEqual({ subject_math: { exam_mock_1: 73 } });
  });

  test('fetchAllData automatically purges expired trash entries during live reads', async ({ page }) => {
    await page.addInitScript(() => {
      window.__FIREBASE_CONFIG__ = {
        apiKey: 'test-api-key',
        authDomain: 'test-project.firebaseapp.com',
        projectId: 'test-project',
        storageBucket: 'test-project.appspot.com',
        messagingSenderId: '1234567890',
        appId: '1:1234567890:web:test'
      };
    });
    await page.goto(APP_URL);

    const result = await page.evaluate(async () => {
      const [firebaseModule, dbModule] = await Promise.all([
        import('/js/firebase.js'),
        import('/services/db.js')
      ]);

      globalThis.__firestoreStore?.clear?.();
      localStorage.clear();
      sessionStorage.clear();

      firebaseModule.auth.currentUser = {
        uid: 'owner_cleanup',
        email: 'teacher@example.com',
        displayName: 'Teacher Cleanup'
      };

      dbModule.setCurrentUserRoleContext('teacher');
      dbModule.setCurrentClassId('class_cleanup_active');
      dbModule.setCurrentClassOwnerContext('owner_cleanup', 'Teacher Cleanup');

      const now = Date.now();
      const updatedAt = new Date(now).toISOString();
      const expiredDeletedAt = new Date(now - (5 * 24 * 60 * 60 * 1000)).toISOString();
      const freshDeletedAt = new Date(now - (24 * 60 * 60 * 1000)).toISOString();

      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup'),
        {
          userId: 'owner_cleanup',
          activeClassId: 'class_cleanup_active',
          updatedAt
        },
        { merge: true }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active'),
        {
          id: 'class_cleanup_active',
          name: 'Cleanup Active Class',
          createdAt: updatedAt,
          updatedAt,
          deleted: false,
          deletedAt: null,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          ownerName: 'Teacher Cleanup'
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_expired'),
        {
          id: 'class_cleanup_expired',
          name: 'Cleanup Expired Class',
          createdAt: updatedAt,
          updatedAt,
          deleted: true,
          deletedAt: expiredDeletedAt,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          ownerName: 'Teacher Cleanup'
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_fresh'),
        {
          id: 'class_cleanup_fresh',
          name: 'Cleanup Fresh Class',
          createdAt: updatedAt,
          updatedAt,
          deleted: true,
          deletedAt: freshDeletedAt,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          ownerName: 'Teacher Cleanup'
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'students', 'student_active'),
        {
          id: 'student_active',
          name: 'Student Active',
          notes: '',
          class: '',
          scores: {},
          deleted: false,
          deletedAt: null,
          order: 0,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'students', 'student_expired'),
        {
          id: 'student_expired',
          name: 'Student Expired',
          notes: '',
          class: '',
          scores: {},
          deleted: true,
          deletedAt: expiredDeletedAt,
          order: 1,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'students', 'student_fresh'),
        {
          id: 'student_fresh',
          name: 'Student Fresh',
          notes: '',
          class: '',
          scores: {},
          deleted: true,
          deletedAt: freshDeletedAt,
          order: 2,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'subjects', 'subject_active'),
        {
          id: 'subject_active',
          name: 'Subject Active',
          deleted: false,
          deletedAt: null,
          order: 0,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'subjects', 'subject_expired'),
        {
          id: 'subject_expired',
          name: 'Subject Expired',
          deleted: true,
          deletedAt: expiredDeletedAt,
          order: 1,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'subjects', 'subject_fresh'),
        {
          id: 'subject_fresh',
          name: 'Subject Fresh',
          deleted: true,
          deletedAt: freshDeletedAt,
          order: 2,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'exams', 'exam_active'),
        {
          id: 'exam_active',
          title: 'Exam Active',
          name: 'Exam Active',
          deleted: false,
          deletedAt: null,
          order: 0,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'exams', 'exam_expired'),
        {
          id: 'exam_expired',
          title: 'Exam Expired',
          name: 'Exam Expired',
          deleted: true,
          deletedAt: expiredDeletedAt,
          order: 1,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );
      await firebaseModule.setDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'exams', 'exam_fresh'),
        {
          id: 'exam_fresh',
          title: 'Exam Fresh',
          name: 'Exam Fresh',
          deleted: true,
          deletedAt: freshDeletedAt,
          order: 2,
          userId: 'owner_cleanup',
          ownerId: 'owner_cleanup',
          classId: 'class_cleanup_active',
          updatedAt
        },
        { merge: false }
      );

      const fetchResult = await dbModule.fetchAllData();

      const activeClassSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active')
      );
      const expiredStudentSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'students', 'student_expired')
      );
      const freshStudentSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'students', 'student_fresh')
      );
      const expiredSubjectSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'subjects', 'subject_expired')
      );
      const freshSubjectSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'subjects', 'subject_fresh')
      );
      const expiredExamSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'exams', 'exam_expired')
      );
      const freshExamSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_active', 'exams', 'exam_fresh')
      );
      const expiredClassSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_expired')
      );
      const freshClassSnapshot = await firebaseModule.getDoc(
        firebaseModule.doc(firebaseModule.db, 'users', 'owner_cleanup', 'classes', 'class_cleanup_fresh')
      );

      return {
        currentClassId: fetchResult.currentClassId,
        studentIds: fetchResult.data.students.map((student) => student.id),
        subjectIds: fetchResult.data.subjects.map((subject) => subject.id),
        examIds: fetchResult.data.exams.map((exam) => exam.id),
        trashStudents: fetchResult.trashStudents.map((entry) => entry.id),
        trashSubjects: fetchResult.trashSubjects.map((entry) => entry.id),
        trashExams: fetchResult.trashExams.map((entry) => entry.id),
        trashClasses: fetchResult.trashClasses.map((entry) => entry.id),
        activeClassSchemaVersion: activeClassSnapshot.data().dataSchemaVersion,
        expiredStudentExists: expiredStudentSnapshot.exists(),
        freshStudentExists: freshStudentSnapshot.exists(),
        expiredSubjectExists: expiredSubjectSnapshot.exists(),
        freshSubjectExists: freshSubjectSnapshot.exists(),
        expiredExamExists: expiredExamSnapshot.exists(),
        freshExamExists: freshExamSnapshot.exists(),
        expiredClassExists: expiredClassSnapshot.exists(),
        freshClassExists: freshClassSnapshot.exists()
      };
    });

    expect(result.currentClassId).toBe('class_cleanup_active');
    expect(result.studentIds).toEqual(['student_active']);
    expect(result.subjectIds).toEqual(['subject_active']);
    expect(result.examIds).toEqual(['exam_active']);
    expect(result.trashStudents).toEqual(['student_fresh']);
    expect(result.trashSubjects).toEqual(['subject_fresh']);
    expect(result.trashExams).toEqual(['exam_fresh']);
    expect(result.trashClasses).toEqual(['class_cleanup_fresh']);
    expect(result.activeClassSchemaVersion).toBe(2);
    expect(result.expiredStudentExists).toBe(false);
    expect(result.freshStudentExists).toBe(true);
    expect(result.expiredSubjectExists).toBe(false);
    expect(result.freshSubjectExists).toBe(true);
    expect(result.expiredExamExists).toBe(false);
    expect(result.freshExamExists).toBe(true);
    expect(result.expiredClassExists).toBe(false);
    expect(result.freshClassExists).toBe(true);
  });

  test('fetchActivityLogs purges expired activity logs and trims retained history to 250 entries', async ({ page }) => {
    await page.addInitScript(() => {
      window.__FIREBASE_CONFIG__ = {
        apiKey: 'test-api-key',
        authDomain: 'test-project.firebaseapp.com',
        projectId: 'test-project',
        storageBucket: 'test-project.appspot.com',
        messagingSenderId: '1234567890',
        appId: '1:1234567890:web:test'
      };
    });
    await page.goto(APP_URL);

    const result = await page.evaluate(async () => {
      const [firebaseModule, dbModule] = await Promise.all([
        import('/js/firebase.js'),
        import('/services/db.js')
      ]);

      globalThis.__firestoreStore?.clear?.();
      localStorage.clear();
      sessionStorage.clear();

      firebaseModule.auth.currentUser = {
        uid: 'admin_activity_logs',
        email: 'admin@example.com',
        displayName: 'Admin Activity Logs'
      };

      dbModule.setCurrentUserRoleContext('admin');

      const now = Date.now();
      const recentEntries = Array.from({ length: 253 }, (_entry, index) => {
        const id = `recent_${String(index).padStart(3, '0')}`;
        return {
          id,
          timestamp: new Date(now - (index * 60 * 1000)).toISOString(),
          createdAt: new Date(now - (index * 60 * 1000)).toISOString(),
          action: 'updated_record',
          targetId: id,
          targetType: 'record',
          targetLabel: `Recent ${index}`,
          userId: 'admin_activity_logs',
          userEmail: 'admin@example.com',
          userRole: 'admin',
          dataOwnerUserId: 'owner_recent',
          classId: 'class_recent',
          className: 'Recent Class',
          ownerId: 'owner_recent',
          ownerName: 'Owner Recent',
          logVersion: 2
        };
      });
      const expiredEntries = Array.from({ length: 2 }, (_entry, index) => {
        const id = `expired_${index + 1}`;
        return {
          id,
          timestamp: new Date(now - ((95 + index) * 24 * 60 * 60 * 1000)).toISOString(),
          createdAt: new Date(now - ((95 + index) * 24 * 60 * 60 * 1000)).toISOString(),
          action: 'deleted_record',
          targetId: id,
          targetType: 'record',
          targetLabel: `Expired ${index + 1}`,
          userId: 'admin_activity_logs',
          userEmail: 'admin@example.com',
          userRole: 'admin',
          dataOwnerUserId: 'owner_expired',
          classId: 'class_expired',
          className: 'Expired Class',
          ownerId: 'owner_expired',
          ownerName: 'Owner Expired',
          logVersion: 2
        };
      });

      await Promise.all([
        ...recentEntries.map((entry) => {
          const { id, ...payload } = entry;
          return firebaseModule.setDoc(
            firebaseModule.doc(firebaseModule.db, 'activityLogs', id),
            payload,
            { merge: false }
          );
        }),
        ...expiredEntries.map((entry) => {
          const { id, ...payload } = entry;
          return firebaseModule.setDoc(
            firebaseModule.doc(firebaseModule.db, 'activityLogs', id),
            payload,
            { merge: false }
          );
        })
      ]);

      const beforeCount = Array.from(globalThis.__firestoreStore?.keys?.() || [])
        .filter((key) => key.startsWith('activityLogs/'))
        .length;

      const logs = await dbModule.fetchActivityLogs({ maxEntries: 250 });

      const storeKeys = Array.from(globalThis.__firestoreStore?.keys?.() || [])
        .filter((key) => key.startsWith('activityLogs/'));
      const store = globalThis.__firestoreStore;

      return {
        beforeCount,
        fetchedCount: logs.length,
        firstLogId: logs[0]?.id || '',
        lastLogId: logs[logs.length - 1]?.id || '',
        hasExpiredInFetch: logs.some((entry) => entry.id === 'expired_1' || entry.id === 'expired_2'),
        hasOverflowInFetch: logs.some((entry) => ['recent_250', 'recent_251', 'recent_252'].includes(entry.id)),
        retainedCount: storeKeys.length,
        retainedNewestExists: store?.has?.('activityLogs/recent_000') || false,
        retainedBoundaryExists: store?.has?.('activityLogs/recent_249') || false,
        removedExpired: [
          !(store?.has?.('activityLogs/expired_1') || false),
          !(store?.has?.('activityLogs/expired_2') || false)
        ],
        removedOverflow: [
          !(store?.has?.('activityLogs/recent_250') || false),
          !(store?.has?.('activityLogs/recent_251') || false),
          !(store?.has?.('activityLogs/recent_252') || false)
        ]
      };
    });

    expect(result.beforeCount).toBe(255);
    expect(result.fetchedCount).toBe(250);
    expect(result.firstLogId).toBe('recent_000');
    expect(result.lastLogId).toBe('recent_249');
    expect(result.hasExpiredInFetch).toBe(false);
    expect(result.hasOverflowInFetch).toBe(false);
    expect(result.retainedCount).toBe(250);
    expect(result.retainedNewestExists).toBe(true);
    expect(result.retainedBoundaryExists).toBe(true);
    expect(result.removedExpired).toEqual([true, true]);
    expect(result.removedOverflow).toEqual([true, true, true]);
  });

  test('scoring classification boundaries remain unchanged', async ({ page }) => {
    const result = await page.evaluate(() => {
      return Promise.all([import('/js/state.js'), import('/js/analytics.js')]).then(([stateModule, analyticsModule]) => {
      const app = stateModule.default || window.TrackerApp;
      const analytics = analyticsModule.default || app.analytics;

      app.state.subjects = [
        { id: 'subject_math', name: 'Math' },
        { id: 'subject_english', name: 'English' }
      ];
      app.state.exams = [{ id: 'mock-1', title: 'Mock 1', name: 'Mock 1' }];

      const exam = app.state.exams[0];
      const student = (math, english) => ({
        id: `${math}-${english}`,
        name: 'Student',
        scores: {
          Math: { 'Mock 1': math },
          English: { 'Mock 1': english }
        }
      });

      const statuses = {
        strong: analytics.getStudentStatus(student(85, 85), exam),
        good: analytics.getStudentStatus(student(72, 72), exam),
        average: analytics.getStudentStatus(student(64, 64), exam),
        borderline: analytics.getStudentStatus(student(50, 50), exam),
        atRisk: analytics.getStudentStatus(student(35, 35), exam),
        noData: analytics.getStudentStatus({ id: 'none', name: 'No Data', scores: {} }, exam),
        incomplete: analytics.getStudentStatus({
          id: 'partial',
          name: 'Partial',
          scores: { Math: { 'Mock 1': 80 } }
        }, exam)
      };

      return {
        statuses,
        categories: analytics.getPerformanceCategories(),
        resolvedScores: {
          math: analytics.getScore(student(85, 85), app.state.subjects[0], exam),
          english: analytics.getScore(student(85, 85), app.state.subjects[1], exam)
        }
      };
      });
    });

    expect(result.categories).toEqual([
      { key: 'strong', label: 'Strong', min: 80, max: 100 },
      { key: 'good', label: 'Good', min: 70, max: 79 },
      { key: 'average', label: 'Average', min: 60, max: 69 },
      { key: 'borderline', label: 'Borderline', min: 41, max: 59 },
      { key: 'at-risk', label: 'At Risk', min: 0, max: 40 }
    ]);

    expect(result.statuses).toEqual({
      strong: 'strong',
      good: 'good',
      average: 'average',
      borderline: 'borderline',
      atRisk: 'at-risk',
      noData: 'no-data',
      incomplete: 'incomplete'
    });
    expect(result.resolvedScores).toEqual({
      math: 85,
      english: 85
    });
  });
});
