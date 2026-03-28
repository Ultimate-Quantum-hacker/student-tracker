import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';

const readWorkspaceFile = (relativePath) => {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
};

test.describe('Class refactor critical regressions', () => {
  test.beforeEach(async ({ page }) => {
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

  test('teacher write flows retain writable class-scoped context', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const [stateModule, studentsModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/students.js')
      ]);

      const app = stateModule.default || window.TrackerApp;
      const students = studentsModule.default || app.students;
      const calls = [];

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
      app.updateStudent = async () => {
        calls.push('saveMarks');
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
        classId: app.state.currentClassId,
        ownerId: app.getCurrentClassOwnerId(),
        readOnly: app.isReadOnlyRoleContext()
      };
    });

    expect(result.readOnly).toBe(false);
    expect(result.classId).toBe('class_teacher_scope');
    expect(result.ownerId).toBe('owner_teacher_scope');
    expect(result.calls).toEqual(['addStudent', 'addSubject', 'addExam', 'saveMarks']);
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
    const dbSource = readWorkspaceFile('services/db.js');

    expect(dbSource).toContain('const getRawDataCounts = (rawData) =>');
    expect(dbSource).toContain('const countsMismatchBeforeSync = !hasMatchingRawDataCounts(legacyCounts, classCountsBeforeSync);');
    expect(dbSource).toContain('if (hasLegacyData && countsMismatchBeforeSync) {');
    expect(dbSource).toContain('await writeModularData(classOwnerId, classId, legacyRawData);');
    expect(dbSource).toContain('Migration verification mismatch');
    expect(dbSource).toContain("await updateMigrationState(userId, 'failed', {");
    expect(dbSource).toContain('classMigrationError: String(error?.message || \'Migration failed\').slice(0, 500)');
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

  test('scoring classification boundaries remain unchanged', async ({ page }) => {
    const result = await page.evaluate(() => {
      return Promise.all([import('/js/state.js'), import('/js/analytics.js')]).then(([stateModule, analyticsModule]) => {
      const app = stateModule.default || window.TrackerApp;
      const analytics = analyticsModule.default || app.analytics;

      app.state.subjects = ['Math', 'English'];
      app.state.exams = [{ id: 'mock-1', title: 'Mock 1' }];

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
        categories: analytics.getPerformanceCategories()
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
  });
});
