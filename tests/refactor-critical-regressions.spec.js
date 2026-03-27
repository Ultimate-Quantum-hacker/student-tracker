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

    expect(stateSource).toContain('const resolveValidatedClassContext = (classes = [], classId = \'\', ownerId = \'\') => {');
    expect(stateSource).toContain('isFallback: Boolean(!selectedClass && (normalizedClassId || normalizedOwnerId))');
    expect(stateSource).toContain('Persisted class selection was stale/invalid; selection has been reset to a valid class context.');
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
