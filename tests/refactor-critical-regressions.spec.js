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

  test('new teacher root metadata writes bootstrap a compliant user profile before class writes', async () => {
    const dbSource = readWorkspaceFile('services/db.js');
    const rulesSource = readWorkspaceFile('firestore.rules');

    expect(rulesSource).toContain('function ownerCanCreateOwnUserDoc(userId) {');
    expect(rulesSource).toContain("request.resource.data.role == 'teacher'");
    expect(rulesSource).toContain("'createdAt'");
    expect(dbSource).toContain('const buildUserRootBootstrapPayload = (userId) => {');
    expect(dbSource).toContain("role: 'teacher'");
    expect(dbSource).toContain('const ensureUserRootProfileDocument = async (userId) => {');
    expect(dbSource).toContain("if (getCurrentUserRoleContext() !== 'teacher') {");
    expect(dbSource).toContain('await setDoc(userRootRef, bootstrapPayload, { merge: true });');
    expect(dbSource).toContain('const mergeUserRootMetadata = async (userId, patch = {}) => {');
    expect(dbSource).toContain('await ensureUserRootProfileDocument(normalizedUserId);');
    expect(dbSource).toContain('export const createClass = async (className) => {');
    expect(dbSource).toContain('await mergeUserRootMetadata(userId, {');
    expect(dbSource).toContain('[ALLOW_EMPTY_CLASS_CATALOG_FIELD]: false');
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

  test('bulk import summarizes duplicate and invalid rows before importing unique students', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const students = studentsModule.default || app.students;
      const toasts = [];
      const confirmMessages = [];
      const addedPayloads = [];
      const snapshotNames = [];
      let refreshCount = 0;
      const originalConfirm = window.confirm;

      window.confirm = (message) => {
        confirmMessages.push(String(message || ''));
        return true;
      };

      try {
        app.state.students = [
          { id: 'student_existing_1', name: 'Existing Student' }
        ];
        app.snapshots = {
          saveSnapshot: (name) => {
            snapshotNames.push(String(name || ''));
            return { id: 'snapshot_bulk_import' };
          }
        };
        app.addStudent = async (payload) => {
          addedPayloads.push(payload);
          return { id: `student_${addedPayloads.length}`, ...payload };
        };

        const ui = {
          showToast: (message) => {
            toasts.push(String(message || ''));
          },
          refreshUI: () => {
            refreshCount += 1;
          },
          withLoader: async (callback) => callback()
        };

        const importResult = await students.bulkImport('Alice\nAlice\nExisting Student\nBad123\nBob,,Has,comma', app, ui);

        return {
          importResult,
          toasts,
          confirmMessages,
          addedPayloads,
          snapshotNames,
          refreshCount
        };
      } finally {
        window.confirm = originalConfirm;
      }
    });

    expect(result.importResult).toMatchObject({
      importedCount: 3,
      failedRows: [],
      stoppedEarly: false
    });
    expect(result.confirmMessages[0]).toContain('Import 3 students into the active class?');
    expect(result.confirmMessages[0]).toContain('1 duplicate row will be skipped');
    expect(result.confirmMessages[0]).toContain('1 invalid row will be skipped');
    expect(result.confirmMessages[0]).toContain('1 existing-name match will still be added');
    expect(result.addedPayloads).toEqual([
      { name: 'Alice', class: '', notes: '', scores: {} },
      { name: 'Existing Student', class: '', notes: '', scores: {} },
      { name: 'Bob', class: '', notes: 'Has,comma', scores: {} }
    ]);
    expect(result.snapshotNames).toEqual(['Auto Backup Before Bulk Student Import']);
    expect(result.refreshCount).toBe(1);
    expect(result.toasts[result.toasts.length - 1]).toContain('3 students imported');
    expect(result.toasts[result.toasts.length - 1]).toContain('1 duplicate row skipped');
    expect(result.toasts[result.toasts.length - 1]).toContain('1 invalid row skipped');
    expect(result.toasts[result.toasts.length - 1]).toContain('1 existing-name match added separately');
  });

  test('bulk import reports partial failures while continuing remaining rows', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const students = studentsModule.default || app.students;
      const toasts = [];
      const addedPayloads = [];
      let refreshCount = 0;
      const originalConfirm = window.confirm;

      window.confirm = () => true;

      try {
        app.state.students = [];
        app.snapshots = {
          saveSnapshot: () => ({ id: 'snapshot_bulk_import_partial' })
        };
        app.addStudent = async (payload) => {
          if (payload.name === 'Broken Row') {
            throw new Error('Network down');
          }
          addedPayloads.push(payload);
          return { id: `student_${addedPayloads.length}`, ...payload };
        };

        const ui = {
          showToast: (message) => {
            toasts.push(String(message || ''));
          },
          refreshUI: () => {
            refreshCount += 1;
          },
          withLoader: async (callback) => callback()
        };

        const importResult = await students.bulkImport('Alpha\nBroken Row\nGamma', app, ui);

        return {
          importResult,
          toasts,
          addedPayloads,
          refreshCount
        };
      } finally {
        window.confirm = originalConfirm;
      }
    });

    expect(result.importResult).toMatchObject({
      importedCount: 2,
      stoppedEarly: false
    });
    expect(result.importResult.failedRows).toHaveLength(1);
    expect(result.importResult.failedRows[0]).toMatchObject({
      name: 'Broken Row',
      message: 'Network down'
    });
    expect(result.addedPayloads).toEqual([
      { name: 'Alpha', class: '', notes: '', scores: {} },
      { name: 'Gamma', class: '', notes: '', scores: {} }
    ]);
    expect(result.refreshCount).toBe(1);
    expect(result.toasts[result.toasts.length - 1]).toContain('2 students imported');
    expect(result.toasts[result.toasts.length - 1]).toContain('1 row failed (Broken Row)');
  });

  test('bulk import modal preview summarizes pasted rows and disables confirm when nothing is importable', async ({ page }) => {
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
        <button id="bulk-import-btn" type="button">Bulk Add</button>
        <div id="bulk-import-modal" class="modal-overlay"><div class="modal"><textarea id="bulk-import-textarea"></textarea><p id="bulk-import-summary"></p><button id="bulk-import-cancel-btn" type="button">Cancel</button><button id="bulk-import-confirm-btn" type="button">Add All</button></div></div>
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
      app.state.students = [
        { id: 'student_existing_1', name: 'Existing Student' }
      ];
      app.syncDataContext();

      const openButton = document.getElementById('bulk-import-btn');
      const textarea = document.getElementById('bulk-import-textarea');
      const summary = document.getElementById('bulk-import-summary');
      const confirmButton = document.getElementById('bulk-import-confirm-btn');

      openButton.click();
      const initialSummary = summary.textContent;
      const initialDisabled = Boolean(confirmButton.disabled);

      textarea.value = 'Alice\nAlice\nExisting Student\nBad123';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const populatedSummary = summary.textContent;
      const populatedDisabled = Boolean(confirmButton.disabled);

      textarea.value = 'Bad123';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      return {
        initialSummary,
        initialDisabled,
        populatedSummary,
        populatedDisabled,
        invalidOnlySummary: summary.textContent,
        invalidOnlyDisabled: Boolean(confirmButton.disabled)
      };
    });

    expect(result.initialSummary).toBe('Paste names to preview the import summary.');
    expect(result.initialDisabled).toBe(true);
    expect(result.populatedSummary).toContain('2 students ready to import');
    expect(result.populatedSummary).toContain('1 duplicate row will be skipped');
    expect(result.populatedSummary).toContain('1 invalid row will be skipped');
    expect(result.populatedSummary).toContain('1 existing-name match will still be added');
    expect(result.populatedDisabled).toBe(false);
    expect(result.invalidOnlySummary).toContain('No importable students found');
    expect(result.invalidOnlySummary).toContain('1 invalid row will be skipped');
    expect(result.invalidOnlyDisabled).toBe(true);
  });

  test('bulk import accepts tab-separated spreadsheet rows with a header row', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const students = studentsModule.default || app.students;
      const confirmMessages = [];
      const addedPayloads = [];
      const originalConfirm = window.confirm;

      window.confirm = (message) => {
        confirmMessages.push(String(message || ''));
        return true;
      };

      try {
        app.state.students = [];
        app.snapshots = {
          saveSnapshot: () => ({ id: 'snapshot_bulk_import_spreadsheet' })
        };
        app.addStudent = async (payload) => {
          addedPayloads.push(payload);
          return { id: `student_${addedPayloads.length}`, ...payload };
        };

        const ui = {
          showToast: () => {},
          refreshUI: () => {},
          withLoader: async (callback) => callback()
        };

        const importResult = await students.bulkImport('Name\tClass\tNotes\nAda\tA1\tTop performer\nBen\tA1\tNeeds support', app, ui);

        return {
          importResult,
          confirmMessages,
          addedPayloads
        };
      } finally {
        window.confirm = originalConfirm;
      }
    });

    expect(result.importResult).toMatchObject({
      importedCount: 2,
      failedRows: [],
      stoppedEarly: false
    });
    expect(result.confirmMessages[0]).toContain('Import 2 students into the active class?');
    expect(result.addedPayloads).toEqual([
      { name: 'Ada', class: 'A1', notes: 'Top performer', scores: {} },
      { name: 'Ben', class: 'A1', notes: 'Needs support', scores: {} }
    ]);
  });

  test('bulk import file loading fills the modal and refreshes the preview summary', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;
      const students = studentsModule.default || app.students;
      const toasts = [];

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
        <button id="bulk-import-btn" type="button">Bulk Add</button>
        <div id="bulk-import-modal" class="modal-overlay"><div class="modal"><input id="bulk-import-file-input" type="file"><textarea id="bulk-import-textarea"></textarea><p id="bulk-import-summary"></p><button id="bulk-import-cancel-btn" type="button">Cancel</button><button id="bulk-import-confirm-btn" type="button">Add All</button></div></div>
        <div id="mockList"></div>
        <div id="subjectList"></div>
      `;

      app.students = students;
      ui.init();
      ui.bindEvents();
      ui.showToast = (message) => {
        toasts.push(String(message || ''));
      };

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.isLoading = false;
      app.state.classes = [
        { id: 'class_teacher', name: 'Teacher Class', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' }
      ];
      app.state.currentClassId = 'class_teacher';
      app.state.currentClassOwnerId = 'owner_teacher';
      app.state.students = [];
      app.syncDataContext();

      const input = document.getElementById('bulk-import-file-input');
      const textarea = document.getElementById('bulk-import-textarea');
      const summary = document.getElementById('bulk-import-summary');
      const confirmButton = document.getElementById('bulk-import-confirm-btn');
      const file = {
        name: 'students.tsv',
        text: async () => 'Name\tClass\tNotes\nAma\tA1\tExcellent\nKojo\tA1\tImproving'
      };
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file]
      });

      await input.onchange();

      return {
        textareaValue: textarea.value,
        summary: summary.textContent,
        confirmDisabled: Boolean(confirmButton.disabled),
        toasts
      };
    });

    expect(result.textareaValue).toContain('Ama\tA1\tExcellent');
    expect(result.summary).toContain('2 students ready to import');
    expect(result.confirmDisabled).toBe(false);
    expect(result.toasts[result.toasts.length - 1]).toBe('Loaded students.tsv');
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

    expect(result.submittedPayload?.name).toBe('Science');
  });

  test('student roster empty states provide setup, search recovery, and read-only guidance', async ({ page }) => {
    const uiSource = readWorkspaceFile('js/ui.js');

    expect(uiSource).toContain("title: 'No students match your search.'");
    expect(uiSource).toContain("message: 'Try a different name or clear the roster search to see every student.'");
    expect(uiSource).toContain("title: 'No students added yet.'");
    expect(uiSource).toContain("message: 'Use Add Student or Bulk Import to build this class roster.'");
    expect(uiSource).toContain("title: 'No students available in this class.'");

    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      document.body.innerHTML = `
        <div id="student-count"></div>
        <div id="student-list"></div>
      `;

      app.dom.studentCount = document.getElementById('student-count');
      app.dom.studentList = document.getElementById('student-list');

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.students = [];
      app.state.studentRosterSearchTerm = '';
      ui.renderStudentChips();

      const teacherEmptyText = app.dom.studentList.textContent.replace(/\s+/g, ' ').trim();
      const teacherCountText = app.dom.studentCount.textContent;

      app.state.students = [{ id: 'student_1', name: 'Ama Mensah' }];
      app.state.studentRosterSearchTerm = 'zzz';
      ui.renderStudentChips();

      const searchEmptyText = app.dom.studentList.textContent.replace(/\s+/g, ' ').trim();
      const searchCountText = app.dom.studentCount.textContent;

      app.setCurrentUserRole('admin', { resolved: true });
      app.state.currentClassName = 'Admin View Class';
      app.getCurrentClassOwnerName = () => 'Owner Example';
      app.state.students = [];
      app.state.studentRosterSearchTerm = '';
      ui.renderStudentChips();

      const readOnlyEmptyText = app.dom.studentList.textContent.replace(/\s+/g, ' ').trim();

      return {
        teacherEmptyText,
        teacherCountText,
        searchEmptyText,
        searchCountText,
        readOnlyEmptyText
      };
    });

    expect(result.teacherCountText).toBe('0 Students');
    expect(result.teacherEmptyText).toContain('No students added yet.');
    expect(result.teacherEmptyText).toContain('Use Add Student or Bulk Import to build this class roster.');

    expect(result.searchCountText).toBe('0 of 1 Student');
    expect(result.searchEmptyText).toContain('No students match your search.');
    expect(result.searchEmptyText).toContain('Try a different name or clear the roster search to see every student.');

    expect(result.readOnlyEmptyText).toContain('No students available in this class.');
    expect(result.readOnlyEmptyText).toContain('Admin cannot modify data (Read-only mode): Admin View Class - Owner Example.');
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

  test('performance analysis actions launch supported notes and report workflows', async ({ page }) => {
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
        <select id="performance-category-select"></select>
        <div id="performance-category-counts"></div>
        <div id="performance-filtered-list"></div>
        <div id="performance-intervention-needed-list"></div>
        <div id="notes-modal" class="modal-overlay"><div class="modal"><h3 id="notes-modal-title"></h3><textarea id="notes-textarea"></textarea><button id="notes-save-btn" type="button">Save</button><button id="notes-cancel-btn" type="button">Cancel</button></div></div>
        <div id="report-modal" class="modal-overlay"><button id="report-close-btn" type="button">Close</button><button id="report-print-btn" type="button">Print</button><button id="report-export-pdf-btn" type="button">Export PDF</button><button id="report-export-all-pdf-btn" type="button">Export All</button><span id="report-export-status"></span><div id="report-card-container"></div></div>
      `;

      ui.init();
      ui.bindEvents();

      app.setCurrentUserRole('teacher', { resolved: true });
      app.state.isLoading = false;
      app.state.selectedPerformanceCategory = 'borderline';
      app.state.classes = [
        { id: 'class_teacher', name: 'Teacher Class', ownerId: 'owner_teacher', ownerName: 'Teacher Owner' }
      ];
      app.state.currentClassId = 'class_teacher';
      app.state.currentClassOwnerId = 'owner_teacher';
      app.state.currentClassName = 'Teacher Class';
      app.state.students = [
        { id: 'student_borderline', name: 'Borderline Student', notes: '', scores: {} },
        { id: 'student_risk', name: 'Risk Student', notes: 'Check homework completion', scores: {} }
      ];
      app.state.subjects = [
        { id: 'subject_math', name: 'Math' },
        { id: 'subject_english', name: 'English' }
      ];
      app.state.exams = [
        { id: 'exam_1', title: 'Mock 1', name: 'Mock 1' }
      ];
      app.syncDataContext();
      app.heatmap = {
        renderHeatmap() {}
      };
      app.analytics = {
        ...(app.analytics || {}),
        getPerformanceCategories() {
          return [
            { key: 'strong', label: 'Strong' },
            { key: 'good', label: 'Good' },
            { key: 'average', label: 'Average' },
            { key: 'borderline', label: 'Borderline' },
            { key: 'at-risk', label: 'At Risk' }
          ];
        },
        groupStudentsByStatus() {
          return {
            latestExam: 'Mock 1',
            groups: {
              strong: [],
              good: [],
              average: [],
              borderline: [
                { id: 'student_borderline', name: 'Borderline Student', average: 49.4 }
              ],
              'at-risk': [
                { id: 'student_risk', name: 'Risk Student', average: 35.2 }
              ]
            }
          };
        },
        getWeakestSubject(student) {
          return student?.id === 'student_risk' ? 'Math' : 'English';
        },
        calcAverages(student) {
          if (student?.id === 'student_risk') {
            return { Math: 35, English: 36 };
          }
          return { Math: 52, English: 47 };
        },
        getStudentOverallAverage(student) {
          return student?.id === 'student_risk' ? 35.2 : 49.4;
        },
        getLastTwoExams() {
          return { previousExam: null, latestExam: 'Mock 1' };
        },
        getTotal(student) {
          return student?.id === 'student_risk' ? 35.2 : 49.4;
        },
        getStudentStatus(student) {
          return student?.id === 'student_risk' ? 'at-risk' : 'borderline';
        },
        getScore(student, subject) {
          if (student?.id === 'student_risk') {
            return subject?.name === 'Math' ? 35 : 36;
          }
          return subject?.name === 'Math' ? 52 : 47;
        }
      };

      ui.renderPerformanceAnalysisPanel();

      const filteredListText = document.getElementById('performance-filtered-list')?.textContent || '';
      const interventionListText = document.getElementById('performance-intervention-needed-list')?.textContent || '';

      const interventionNotesButton = document.querySelector('#performance-intervention-needed-list [data-student-action="notes"]');
      interventionNotesButton?.click();
      const notesState = {
        notesId: app.state.notesId,
        modalActive: document.getElementById('notes-modal')?.classList.contains('active') || false,
        title: document.getElementById('notes-modal-title')?.textContent || '',
        value: document.getElementById('notes-textarea')?.value || '',
        label: interventionNotesButton?.textContent?.trim() || ''
      };

      document.getElementById('notes-modal')?.classList.remove('active');

      const filteredReportButton = document.querySelector('#performance-filtered-list [data-student-action="report"]');
      filteredReportButton?.click();
      const reportState = {
        modalActive: document.getElementById('report-modal')?.classList.contains('active') || false,
        text: document.getElementById('report-card-container')?.textContent || ''
      };

      return {
        filteredListText,
        interventionListText,
        notesState,
        reportState
      };
    });

    expect(result.filteredListText).toContain('Borderline Student');
    expect(result.filteredListText).toContain('Weakest: English');
    expect(result.filteredListText).toContain('View Report');
    expect(result.interventionListText).toContain('Risk Student');
    expect(result.interventionListText).toContain('Support note ready');
    expect(result.notesState.label).toBe('Update Support Note');
    expect(result.notesState.notesId).toBe('student_risk');
    expect(result.notesState.modalActive).toBe(true);
    expect(result.notesState.title).toBe('Risk Student');
    expect(result.notesState.value).toBe('Check homework completion');
    expect(result.reportState.modalActive).toBe(true);
    expect(result.reportState.text).toContain('Borderline Student');
    expect(result.reportState.text).toContain('Teacher Notes');
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

test('bulk delete class modal shows polished selection state and prevents deleting all active classes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const [stateModule, uiModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/ui.js')
    ]);

    const app = stateModule.default || window.TrackerApp;
    const ui = uiModule.default || app.ui;

    document.body.innerHTML = `
      <div id="toast"></div>
      <div class="modal-overlay" id="bulk-class-delete-modal">
        <div class="modal bulk-class-delete-modal">
          <div class="bulk-class-delete-header">
            <div class="bulk-class-delete-heading">
              <span class="bulk-class-delete-kicker">Class cleanup</span>
              <h3>Delete Classes</h3>
            </div>
            <span class="bulk-class-delete-chip">Moves to Trash</span>
          </div>
          <p class="bulk-class-delete-note">Select the classes you want to move to Trash. You can restore them later from Trash.</p>
          <div class="bulk-class-delete-status-panel">
            <p id="bulk-class-delete-summary" class="bulk-class-delete-summary"></p>
            <p id="bulk-class-delete-hint" class="bulk-class-delete-hint"></p>
          </div>
          <div class="bulk-class-delete-toolbar">
            <button type="button" id="bulk-class-delete-select-all-btn">Select All</button>
            <button type="button" id="bulk-class-delete-clear-btn">Clear</button>
          </div>
          <div id="bulk-class-delete-list" class="bulk-class-delete-list"></div>
          <div class="modal-actions bulk-class-delete-actions">
            <button id="bulk-class-delete-cancel-btn">Cancel</button>
            <button id="bulk-class-delete-confirm-btn">Delete Selected</button>
          </div>
        </div>
      </div>
    `;

    ui.init();

    app.setCurrentUserRole('teacher', { resolved: true });
    app.state.isLoading = false;
    app.state.allowEmptyClassCatalog = false;
    app.state.classes = [
      { id: 'class_alpha', name: 'Alpha Class', ownerId: 'teacher_owner', ownerName: 'Mike' },
      { id: 'class_beta', name: 'Beta Class', ownerId: 'teacher_owner', ownerName: 'Mike' },
      { id: 'class_gamma', name: 'Gamma Class', ownerId: 'teacher_owner', ownerName: 'Mike' }
    ];
    app.state.currentClassId = 'class_beta';
    app.state.currentClassOwnerId = 'teacher_owner';
    app.syncDataContext();

    ui.openBulkClassDeleteModal();

    const currentItem = document.querySelector('.bulk-class-delete-item.is-current');
    const initialState = {
      modalActive: document.getElementById('bulk-class-delete-modal')?.classList.contains('active') || false,
      summary: document.getElementById('bulk-class-delete-summary')?.textContent || '',
      hint: document.getElementById('bulk-class-delete-hint')?.textContent || '',
      confirmDisabled: Boolean(document.getElementById('bulk-class-delete-confirm-btn')?.disabled),
      selectAllDisabled: Boolean(document.getElementById('bulk-class-delete-select-all-btn')?.disabled),
      clearDisabled: Boolean(document.getElementById('bulk-class-delete-clear-btn')?.disabled),
      cardCount: document.querySelectorAll('.bulk-class-delete-item').length,
      selectedCount: document.querySelectorAll('.bulk-class-delete-item.is-selected').length,
      currentClasses: currentItem?.className || '',
      currentBadges: Array.from(currentItem?.querySelectorAll('.bulk-class-delete-badge') || []).map(node => node.textContent || ''),
      currentMeta: currentItem?.querySelector('.bulk-class-delete-item-meta')?.textContent || '',
      currentOwner: currentItem?.querySelector('.bulk-class-delete-item-owner')?.textContent || '',
      currentAvatar: currentItem?.querySelector('.bulk-class-delete-item-avatar')?.textContent || ''
    };

    ui.bulkClassDeleteSelection = ['class_alpha', 'class_beta', 'class_gamma'];
    ui.renderBulkClassDeleteModal();

    return {
      initialState,
      afterSelectAll: {
        summary: document.getElementById('bulk-class-delete-summary')?.textContent || '',
        hint: document.getElementById('bulk-class-delete-hint')?.textContent || '',
        confirmDisabled: Boolean(document.getElementById('bulk-class-delete-confirm-btn')?.disabled),
        selectAllDisabled: Boolean(document.getElementById('bulk-class-delete-select-all-btn')?.disabled),
        clearDisabled: Boolean(document.getElementById('bulk-class-delete-clear-btn')?.disabled),
        selectedCount: document.querySelectorAll('.bulk-class-delete-item.is-selected').length
      }
    };
  });

  expect(result.initialState.modalActive).toBe(true);
  expect(result.initialState.summary).toBe('1 of 3 classes selected');
  expect(result.initialState.hint).toBe('The current class is selected. Another class will become active after deletion.');
  expect(result.initialState.confirmDisabled).toBe(false);
  expect(result.initialState.selectAllDisabled).toBe(false);
  expect(result.initialState.clearDisabled).toBe(false);
  expect(result.initialState.cardCount).toBe(3);
  expect(result.initialState.selectedCount).toBe(1);
  expect(result.initialState.currentClasses).toContain('is-current');
  expect(result.initialState.currentClasses).toContain('is-selected');
  expect(result.initialState.currentBadges).toContain('Current');
  expect(result.initialState.currentBadges).toContain('Selected');
  expect(result.initialState.currentMeta).toBe('Currently active class');
  expect(result.initialState.currentOwner).toBe('Teacher: Mike');
  expect(result.initialState.currentAvatar).toBe('BC');

  expect(result.afterSelectAll.summary).toBe('3 of 3 classes selected (all)');
  expect(result.afterSelectAll.hint).toBe('Keep at least one class active. Clear one selection before deleting.');
  expect(result.afterSelectAll.confirmDisabled).toBe(true);
  expect(result.afterSelectAll.selectAllDisabled).toBe(true);
  expect(result.afterSelectAll.clearDisabled).toBe(false);
  expect(result.afterSelectAll.selectedCount).toBe(3);
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

  test('workflow tools follow the teacher admin developer capability matrix', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, uiModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/ui.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const ui = uiModule.default || app.ui;

      const renderRoleDom = () => {
        document.body.innerHTML = `
          <div id="toast"></div>
          <div id="auth-role-badge"></div>
          <div class="global-class-switcher"></div>
          <button id="create-class-btn" type="button"></button>
          <button id="delete-class-btn" type="button"></button>
          <div id="backupStatus"></div>
          <div id="system-tools-backup-status"><span id="system-tools-backup-status-text"></span></div>
          <button id="backup-btn" type="button"></button>
          <button id="restore-btn" type="button"></button>
          <input id="restore-input" type="file">
          <button id="create-snapshot-btn" type="button"></button>
          <button id="snapshot-manager-btn" type="button"></button>
          <button id="reset-btn" type="button"></button>
          <button id="system-create-restore-point-btn" type="button"></button>
          <button id="system-restore-points-btn" type="button"></button>
          <button id="system-export-data-btn" type="button"></button>
          <button id="system-import-data-btn" type="button"></button>
          <button id="system-reset-btn" type="button"></button>
          <button id="export-csv-btn" type="button"></button>
          <button id="export-excel-btn" type="button"></button>
          <button id="report-export-pdf-btn" type="button"></button>
          <button id="report-export-all-pdf-btn" type="button"></button>
          <button id="admin-dashboard-btn" type="button"></button>
        `;
        ui.initDOM();
      };

      const snapshotRole = (role) => {
        renderRoleDom();
        app.state.authUser = { uid: `${role}_uid` };
        app.setCurrentUserRole(role, { resolved: true });
        ui.updateRoleBasedUIAccess();

        return {
          role,
          headerBackupStatus: Boolean(document.getElementById('backupStatus')),
          sidebarBackupStatus: Boolean(document.getElementById('system-tools-backup-status')),
          backup: Boolean(document.getElementById('backup-btn')),
          restore: Boolean(document.getElementById('restore-btn')),
          restoreInput: Boolean(document.getElementById('restore-input')),
          restorePoints: Boolean(document.getElementById('create-snapshot-btn')) && Boolean(document.getElementById('snapshot-manager-btn')),
          reset: Boolean(document.getElementById('reset-btn')),
          systemExport: Boolean(document.getElementById('system-export-data-btn')),
          systemImport: Boolean(document.getElementById('system-import-data-btn')),
          systemRestorePoints: Boolean(document.getElementById('system-create-restore-point-btn')) && Boolean(document.getElementById('system-restore-points-btn')),
          systemReset: Boolean(document.getElementById('system-reset-btn')),
          resultsExport: Boolean(document.getElementById('export-csv-btn')) && Boolean(document.getElementById('export-excel-btn')),
          reportExport: Boolean(document.getElementById('report-export-pdf-btn')) && Boolean(document.getElementById('report-export-all-pdf-btn')),
          adminPanel: Boolean(document.getElementById('admin-dashboard-btn'))
        };
      };

      return {
        teacher: snapshotRole('teacher'),
        admin: snapshotRole('admin'),
        developer: snapshotRole('developer')
      };
    });

    expect(result.teacher).toEqual({
      role: 'teacher',
      headerBackupStatus: true,
      sidebarBackupStatus: true,
      backup: true,
      restore: true,
      restoreInput: true,
      restorePoints: true,
      reset: true,
      systemExport: true,
      systemImport: true,
      systemRestorePoints: true,
      systemReset: true,
      resultsExport: true,
      reportExport: true,
      adminPanel: false
    });

    expect(result.admin).toEqual({
      role: 'admin',
      headerBackupStatus: true,
      sidebarBackupStatus: true,
      backup: true,
      restore: false,
      restoreInput: false,
      restorePoints: false,
      reset: false,
      systemExport: true,
      systemImport: false,
      systemRestorePoints: false,
      systemReset: false,
      resultsExport: true,
      reportExport: true,
      adminPanel: true
    });

    expect(result.developer).toEqual({
      role: 'developer',
      headerBackupStatus: true,
      sidebarBackupStatus: true,
      backup: true,
      restore: true,
      restoreInput: true,
      restorePoints: true,
      reset: true,
      systemExport: true,
      systemImport: true,
      systemRestorePoints: true,
      systemReset: true,
      resultsExport: true,
      reportExport: true,
      adminPanel: true
    });
  });

  test('admin destructive panel actions stay developer-only while admins keep read access', async ({ page }) => {
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
      const [adminUserUtils, registryUtils, registryMarkup, firebaseModule, dbModule] = await Promise.all([
        import('/js/admin-user-utils.js'),
        import('/js/admin-student-registry-utils.js'),
        import('/js/admin-student-registry-markup.js'),
        import('/js/firebase.js'),
        import('/services/db.js')
      ]);

      const registryGroups = [{
        label: 'Class A',
        students: [{
          name: 'Student One',
          ownerId: 'teacher_1',
          studentId: 'student_1',
          className: 'Class A',
          teacherName: 'Teacher One'
        }]
      }];

      firebaseModule.auth.currentUser = {
        uid: 'admin_policy_uid',
        email: 'admin@example.com',
        displayName: 'Admin Policy'
      };

      dbModule.setCurrentUserRoleContext('admin');

      let deleteError = null;
      let clearError = null;

      try {
        await dbModule.deleteAdminRegistryStudent({
          ownerId: 'teacher_1',
          studentId: 'student_1',
          studentName: 'Student One'
        });
      } catch (error) {
        deleteError = {
          code: String(error?.code || ''),
          message: String(error?.message || '')
        };
      }

      try {
        await dbModule.clearActivityLogs();
      } catch (error) {
        clearError = {
          code: String(error?.code || ''),
          message: String(error?.message || '')
        };
      }

      return {
        adminCanDeleteRegistry: adminUserUtils.canDeleteAdminRegistryStudents('admin'),
        adminCanClearLogs: adminUserUtils.canClearAdminActivityLogs('admin'),
        developerCanDeleteRegistry: adminUserUtils.canDeleteAdminRegistryStudents('developer'),
        developerCanClearLogs: adminUserUtils.canClearAdminActivityLogs('developer'),
        adminDeleteRequestState: registryUtils.buildAdminRegistryStudentDeleteRequestState({
          ownerId: 'teacher_1',
          studentId: 'student_1',
          studentName: 'Student One',
          canDelete: adminUserUtils.canDeleteAdminRegistryStudents('admin')
        }),
        developerDeleteRequestState: registryUtils.buildAdminRegistryStudentDeleteRequestState({
          ownerId: 'teacher_1',
          studentId: 'student_1',
          studentName: 'Student One',
          canDelete: adminUserUtils.canDeleteAdminRegistryStudents('developer')
        }),
        adminRegistryMarkup: registryMarkup.buildAdminStudentsTableMarkup(registryGroups, {
          startIndex: 0,
          hasActiveCriteria: false,
          canDelete: adminUserUtils.canDeleteAdminRegistryStudents('admin'),
          columnCount: 4
        }),
        developerRegistryMarkup: registryMarkup.buildAdminStudentsTableMarkup(registryGroups, {
          startIndex: 0,
          hasActiveCriteria: false,
          canDelete: adminUserUtils.canDeleteAdminRegistryStudents('developer'),
          columnCount: 4
        }),
        deleteError,
        clearError
      };
    });

    expect(result.adminCanDeleteRegistry).toBe(false);
    expect(result.adminCanClearLogs).toBe(false);
    expect(result.developerCanDeleteRegistry).toBe(true);
    expect(result.developerCanClearLogs).toBe(true);

    expect(result.adminDeleteRequestState.canSubmitDelete).toBe(false);
    expect(result.adminDeleteRequestState.statusMessage).toContain('Only developers can delete registry students.');
    expect(result.developerDeleteRequestState.canSubmitDelete).toBe(true);

    expect(result.adminRegistryMarkup).toContain('Only developers can delete registry students.');
    expect(result.adminRegistryMarkup).toContain('disabled');
    expect(result.developerRegistryMarkup).toContain('Delete Student One from the registry');
    expect(result.developerRegistryMarkup).not.toContain('Only developers can delete registry students.');

    expect(result.deleteError?.code).toBe('READ_ONLY_MODE');
    expect(result.deleteError?.message).toContain('Only developers can delete student records from the registry');
    expect(result.clearError?.code).toBe('READ_ONLY_MODE');
    expect(result.clearError?.message).toContain('Only developers can clear activity logs');
  });

  test('admin user directory presents read-only copy while developer role management stays explicit', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const adminUserUtils = await import('/js/admin-user-utils.js');
      const sampleTeacher = {
        uid: 'teacher_directory_1',
        role: 'teacher',
        emailVerified: true,
        email: 'teacher-directory@example.com'
      };

      return {
        adminPolicyLabel: adminUserUtils.getAdminUserRolePolicyLabel(sampleTeacher, { currentRole: 'admin' }),
        developerPolicyLabel: adminUserUtils.getAdminUserRolePolicyLabel(sampleTeacher, { currentRole: 'developer' })
      };
    });

    const adminSource = readWorkspaceFile('admin.html');
    const adminJsSource = readWorkspaceFile('js/admin.js');

    expect(result.adminPolicyLabel).toBe('Role changes require a developer');
    expect(result.developerPolicyLabel).toBe('Role can be updated by a developer');

    expect(adminSource).toContain('Review users, search global records, and monitor live system activity, with developer-only management controls where allowed.');
    expect(adminSource).toContain('Search and review workspace users, with developer-only role management where policy allows.');
    expect(adminSource).not.toContain('Manage users, search global records, and monitor live system activity from a polished SaaS control center.');
    expect(adminSource).not.toContain('Search, review, and manage workspace user roles with a consistent admin workflow.');

    expect(adminJsSource).toContain("if (canManageAdminRoles(state.currentRole)) {");
    expect(adminJsSource).toContain("roleWrap.appendChild(roleSelectShell);");
    expect(adminJsSource).toContain("actionWrap.innerHTML = buildTableHelperTextMarkup('Developer-only role changes');");
    expect(adminJsSource).not.toContain("actionWrap.innerHTML = buildTableHelperTextMarkup('View only');");
  });

  test('admin panel access summary explains read-only admins while registry copy stays shared', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const adminUserUtils = await import('/js/admin-user-utils.js');

      return {
        adminSummary: adminUserUtils.getAdminPanelAccessSummary('admin'),
        developerSummary: adminUserUtils.getAdminPanelAccessSummary('developer')
      };
    });

    const adminSource = readWorkspaceFile('admin.html');
    const adminJsSource = readWorkspaceFile('js/admin.js');

    expect(result.adminSummary).toContain('Read-only admin mode: review users, search, registry, and activity history.');
    expect(result.adminSummary).toContain('A developer is required for role changes and destructive admin actions.');
    expect(result.developerSummary).toContain('Developer mode: review admin data and manage roles, registry cleanup, and activity-log maintenance where needed.');

    expect(adminSource).toContain('id="panel-access-summary"');
    expect(adminSource).toContain('Access summary: loading…');
    expect(adminSource).toContain('Review all loaded student records across classes in one shared registry view.');
    expect(adminSource).not.toContain('Review all loaded student records across classes in one read-only admin view.');

    expect(adminJsSource).toContain("panelAccessSummary: document.getElementById('panel-access-summary')");
    expect(adminJsSource).toContain('dom.panelAccessSummary.textContent = getAdminPanelAccessSummary(state.currentRole);');
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
    const stateContextSource = readWorkspaceFile('js/state-context.js');
    const rulesSource = readWorkspaceFile('firestore.rules');
    const hardcodedDeveloperSource = [authSource, appSource, uiRoleSource, adminSource, dbSource, stateSource, stateContextSource, rulesSource].join('\n');

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
    expect(stateSource).toContain('Object.assign(app, createStateContextApi(app, dataService));');
    expect(stateContextSource).toContain('canCurrentRoleWrite() {');
    expect(stateContextSource).toContain("console.log('CAN WRITE:', app.state.currentUserRole !== ROLE_ADMIN);");
    expect(stateContextSource).toContain("export const getAuthenticatedOwnerFallback = (state = {}) => String(state.authUser?.uid || '').trim();");
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
    const stateContextSource = readWorkspaceFile('js/state-context.js');
    const uiSource = readWorkspaceFile('js/ui.js');

    expect(stateContextSource).toContain('export const resolveValidatedClassContext = (classes = [], classId = \'\', ownerId = \'\') => {');
    expect(stateContextSource).toContain('isFallback: Boolean(!selectedClass && (normalizedClassId || normalizedOwnerId))');
    expect(stateSource).toContain('Persisted class selection was stale/invalid; selection has been reset to a valid class context.');
    expect(stateSource).toContain('app.state.dashboardStudentCount = null;');
    expect(uiSource).toContain('data-owner-id="${app.utils.esc(ownerId)}"');
    expect(uiSource).toContain('await this.switchToClass(nextClassId, nextOwnerId);');
  });

  test('audit log and number rendering sanitize malformed values', async () => {
    const adminDisplayUtilsSource = readWorkspaceFile('js/admin-display-utils.js');
    const uiSource = readWorkspaceFile('js/ui.js');
    const dbSource = readWorkspaceFile('services/db.js');

    expect(adminDisplayUtilsSource).toContain("normalized === '[object Object]'");
    expect(adminDisplayUtilsSource).toContain("lower === 'nan'");
    expect(adminDisplayUtilsSource).toContain('export const normalizeCount = (value) => {');
    expect(uiSource).toContain('toFiniteNumber: function (value) {');
    expect(uiSource).toContain("formatFixedOrFallback: function (value, decimals = 1, fallback = '—') {");
    expect(dbSource).toContain('const normalizeLogScalar = (value, fallback = \'\') => {');
    expect(dbSource).toContain('const timestampIso = getActivityLogTimestampIso(payload);');
  });

  test('admin activity logs support text search with filter-aware empty feedback', async ({ page }) => {
    const adminSource = readWorkspaceFile('admin.html');
    const adminJsSource = readWorkspaceFile('js/admin.js');
    const activityFilterSource = readWorkspaceFile('js/admin-activity-filter-utils.js');
    const activityUtilsSource = readWorkspaceFile('js/admin-activity-utils.js');

    expect(adminSource).toContain('id="activity-search-input"');
    expect(adminJsSource).toContain("searchTerm: dom.activitySearchInput?.value || ''");
    expect(adminJsSource).toContain("debounceAdminTask('activitySearchDebounceTimer'");
    expect(activityFilterSource).toContain('const buildActivitySearchHaystack = (entry = {}) => {');
    expect(activityUtilsSource).toContain("statusMessage: 'No activity logs match the current filters.'");

    const result = await page.evaluate(async () => {
      const activityFilterModule = await import('/js/admin-activity-filter-utils.js');
      const activityUtilsModule = await import('/js/admin-activity-utils.js');
      const entries = [
        {
          action: 'student_added',
          targetLabel: 'Ama Mensah',
          userEmail: 'teacher1@example.com',
          className: 'Math A',
          ownerName: 'Teacher One',
          classId: 'class_a',
          ownerId: 'owner_1',
          dataOwnerUserId: 'owner_1'
        },
        {
          action: 'student_deleted',
          targetLabel: 'Kojo Owusu',
          userEmail: 'teacher2@example.com',
          className: 'Science B',
          ownerName: 'Teacher Two',
          classId: 'class_b',
          ownerId: 'owner_2',
          dataOwnerUserId: 'owner_2'
        }
      ];

      const targetFiltered = activityFilterModule.filterAdminActivityEntries(entries, {
        searchTerm: 'ama'
      });
      const classFiltered = activityFilterModule.filterAdminActivityEntries(entries, {
        searchTerm: 'science b',
        selectedClassKey: 'owner_2::class_b'
      });
      const userFiltered = activityFilterModule.filterAdminActivityEntries(entries, {
        searchTerm: 'teacher2@example.com'
      });
      const noMatchFeedback = activityUtilsModule.buildActivityLogsLoadFeedbackState({
        visibleCount: 0,
        hasActiveFilters: true
      });

      return {
        targetFilteredCount: targetFiltered.filteredEntries.length,
        targetClassOptionCount: targetFiltered.entriesForClassFilter.length,
        classFilteredCount: classFiltered.filteredEntries.length,
        classFilteredAction: classFiltered.filteredEntries[0]?.action || '',
        userFilteredCount: userFiltered.filteredEntries.length,
        noMatchStatus: noMatchFeedback.statusMessage,
        noMatchType: noMatchFeedback.statusType
      };
    });

    expect(result.targetFilteredCount).toBe(1);
    expect(result.targetClassOptionCount).toBe(1);
    expect(result.classFilteredCount).toBe(1);
    expect(result.classFilteredAction).toBe('student_deleted');
    expect(result.userFilteredCount).toBe(1);
    expect(result.noMatchStatus).toBe('No activity logs match the current filters.');
    expect(result.noMatchType).toBe('warning');
  });

  test('admin activity logs expose history depth controls with normalized cache-aware query state', async ({ page }) => {
    const adminSource = readWorkspaceFile('admin.html');
    const adminJsSource = readWorkspaceFile('js/admin.js');
    const activityFilterSource = readWorkspaceFile('js/admin-activity-filter-utils.js');

    expect(adminSource).toContain('id="activity-limit-filter"');
    expect(adminSource).toContain('<option value="50">Recent 50</option>');
    expect(adminSource).toContain('<option value="100">Recent 100</option>');
    expect(adminSource).toContain('<option value="250" selected>Recent 250</option>');
    expect(adminJsSource).toContain("activityLimitFilter: document.getElementById('activity-limit-filter')");
    expect(adminJsSource).toContain("maxEntries: dom.activityLimitFilter?.value || String(ADMIN_ACTIVITY_LOG_FETCH_LIMIT)");
    expect(adminJsSource).toContain('maxEntries: selectedLimit');
    expect(activityFilterSource).toContain('const ACTIVITY_LOG_LIMIT_OPTIONS = [50, 100, 250];');
    expect(activityFilterSource).toContain('return `${normalizedUserId}::${normalizedSort}::${normalizedLimit}`;');

    const result = await page.evaluate(async () => {
      const activityFilterModule = await import('/js/admin-activity-filter-utils.js');
      const defaultQuery = activityFilterModule.buildActivityLogsQueryState();
      const recentQuery = activityFilterModule.buildActivityLogsQueryState({
        maxEntries: '50'
      });
      const invalidLimitQuery = activityFilterModule.buildActivityLogsQueryState({
        maxEntries: '500'
      });
      const scopedQuery = activityFilterModule.buildActivityLogsQueryState({
        userId: ' owner_1 ',
        sort: 'asc',
        maxEntries: '100'
      });

      return {
        defaultLimit: defaultQuery.selectedLimit,
        defaultCacheKey: defaultQuery.activityLogsCacheKey,
        recentLimit: recentQuery.selectedLimit,
        recentHasActiveFilters: recentQuery.hasActiveFilters,
        recentCacheKey: recentQuery.activityLogsCacheKey,
        invalidLimit: invalidLimitQuery.selectedLimit,
        scopedCacheKey: scopedQuery.activityLogsCacheKey
      };
    });

    expect(result.defaultLimit).toBe(250);
    expect(result.defaultCacheKey).toBe('::desc::250');
    expect(result.recentLimit).toBe(50);
    expect(result.recentHasActiveFilters).toBe(true);
    expect(result.recentCacheKey).toBe('::desc::50');
    expect(result.invalidLimit).toBe(250);
    expect(result.scopedCacheKey).toBe('owner_1::asc::100');
  });

  test('admin activity log clear filters reset all criteria and shared active-filter state', async ({ page }) => {
    const adminSource = readWorkspaceFile('admin.html');
    const adminJsSource = readWorkspaceFile('js/admin.js');
    const activityFilterSource = readWorkspaceFile('js/admin-activity-filter-utils.js');

    expect(adminSource).toContain('id="clear-activity-filters-btn"');
    expect(adminSource).toContain('id="activity-limit-filter"');
    expect(adminJsSource).toContain('const updateActivityFilterControls = () => {');
    expect(adminJsSource).toContain("dom.clearActivityFiltersBtn?.addEventListener('click', async () => {");
    expect(adminJsSource).toContain("dom.activitySearchInput.value = '';");
    expect(adminJsSource).toContain("dom.activityUserFilter.value = '';");
    expect(adminJsSource).toContain("dom.activityClassFilter.value = '';");
    expect(adminJsSource).toContain("dom.activityActionFilter.value = '';");
    expect(adminJsSource).toContain("dom.activitySortFilter.value = 'desc';");
    expect(adminJsSource).toContain("dom.activityLimitFilter.value = String(ADMIN_ACTIVITY_LOG_FETCH_LIMIT);");
    expect(adminJsSource).toContain('updateActivityFilterControls();');
    expect(adminJsSource).toContain('await loadActivityLogs();');
    expect(activityFilterSource).toContain("hasActiveFilters: Boolean(normalizedUserId || normalizedClassKey || normalizedAction || normalizedSearchTerm || normalizedSort !== 'desc' || normalizedLimit !== DEFAULT_ACTIVITY_LOG_LIMIT)");

    const result = await page.evaluate(async () => {
      const activityFilterModule = await import('/js/admin-activity-filter-utils.js');
      const inactiveQuery = activityFilterModule.buildActivityLogsQueryState();
      const searchQuery = activityFilterModule.buildActivityLogsQueryState({
        searchTerm: '  Ama  '
      });
      const userQuery = activityFilterModule.buildActivityLogsQueryState({
        userId: ' teacher_1 '
      });
      const sortQuery = activityFilterModule.buildActivityLogsQueryState({
        sort: 'asc'
      });
      const limitQuery = activityFilterModule.buildActivityLogsQueryState({
        maxEntries: '50'
      });
      const resetQuery = activityFilterModule.buildActivityLogsQueryState({
        searchTerm: '',
        userId: '',
        classKey: '',
        action: '',
        sort: 'desc',
        maxEntries: '250'
      });

      return {
        inactiveHasActiveFilters: inactiveQuery.hasActiveFilters,
        searchHasActiveFilters: searchQuery.hasActiveFilters,
        normalizedSearchTerm: searchQuery.selectedSearchTerm,
        userHasActiveFilters: userQuery.hasActiveFilters,
        normalizedUserId: userQuery.selectedUserId,
        sortHasActiveFilters: sortQuery.hasActiveFilters,
        normalizedSort: sortQuery.selectedSort,
        limitHasActiveFilters: limitQuery.hasActiveFilters,
        normalizedLimit: limitQuery.selectedLimit,
        resetHasActiveFilters: resetQuery.hasActiveFilters,
        resetSort: resetQuery.selectedSort,
        resetLimit: resetQuery.selectedLimit
      };
    });

    expect(result.inactiveHasActiveFilters).toBe(false);
    expect(result.searchHasActiveFilters).toBe(true);
    expect(result.normalizedSearchTerm).toBe('ama');
    expect(result.userHasActiveFilters).toBe(true);
    expect(result.normalizedUserId).toBe('teacher_1');
    expect(result.sortHasActiveFilters).toBe(true);
    expect(result.normalizedSort).toBe('asc');
    expect(result.limitHasActiveFilters).toBe(true);
    expect(result.normalizedLimit).toBe(50);
    expect(result.resetHasActiveFilters).toBe(false);
    expect(result.resetSort).toBe('desc');
    expect(result.resetLimit).toBe(250);
  });

  test('admin student registry global reads flow through the service layer', async () => {
    const adminSource = readWorkspaceFile('js/admin.js');
    const dbSource = readWorkspaceFile('services/db.js');

    expect(dbSource).toContain('export const fetchClassCatalog = async () => {');
    expect(dbSource).toContain('export const fetchGlobalStudentSearchIndex = async () => {');
    expect(adminSource).toContain('return fetchGlobalStudentSearchIndex();');
    expect(adminSource).toContain('const catalog = await fetchClassCatalog();');
    expect(adminSource).toContain('isFirebaseConfigured: Boolean(isFirebaseConfigured)');
    expect(adminSource).not.toContain("collectionGroup(db, 'students')");
    expect(adminSource).not.toContain("collectionGroup(db, 'classes')");
    expect(adminSource).not.toContain('getDocs(collectionGroup(db,');
  });

  test('chart rendering stays native and theme changes refresh chart surfaces', async () => {
    const chartsSource = readWorkspaceFile('js/charts.js');
    const stateSource = readWorkspaceFile('js/state.js');

    expect(chartsSource).toContain("mountNode.dataset.renderer = 'native-svg';");
    expect(chartsSource).toContain("canvas.dataset.renderer = 'native-canvas';");
    expect(chartsSource).toContain('const setStudentChartEmptyState = (isEmpty = true) => {');
    expect(chartsSource).not.toContain("import React from 'https://esm.sh/react@18';");
    expect(chartsSource).not.toContain("} from 'https://esm.sh/recharts@2.12.7';");
    expect(chartsSource).not.toContain('createRoot(');
    expect(stateSource).toContain("if (app.ui && typeof app.ui.renderClassSummary === 'function') {");
    expect(stateSource).toContain("app.charts.renderStudentChart(app.dom.chartStudentSelect.value || '');");
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
    const dbSource = readWorkspaceFile('services/db.js');
    const rulesSource = readWorkspaceFile('firestore.rules');

    expect(dbSource).not.toContain('classMigrationCompletedAt:');
    expect(rulesSource).not.toContain("'classMigrationCompletedAt'");

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
        migrationUpdatedAt: userRootSnapshot.data().classMigrationUpdatedAt,
        hasMigrationCompletedAt: Object.prototype.hasOwnProperty.call(userRootSnapshot.data() || {}, 'classMigrationCompletedAt'),
        migratedScores: migratedStudentSnapshot.data().scores || {},
        fetchedScores: fetchResult.data.students[0]?.scores || {}
      };
    });

    expect(result.currentClassId).toBe('class_migration');
    expect(result.fetchSchemaVersion).toBe(2);
    expect(result.classDataSchemaVersion).toBe(2);
    expect(result.migrationStatus).toBe('completed');
    expect(result.migrationComplete).toBe(true);
    expect(result.migrationUpdatedAt).toBeTruthy();
    expect(result.hasMigrationCompletedAt).toBe(false);
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
