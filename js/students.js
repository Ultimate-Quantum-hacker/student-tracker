/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — students.js
   Handles all student data mutations with Firestore.
   ═══════════════════════════════════════════════ */

import app from './state.js';
import {
  normalizeStudentName,
  isValidStudentName,
  STUDENT_NAME_VALIDATION_MESSAGE
} from './student-name-utils.js';

const resolveApp = (runtimeApp) => runtimeApp || app;
const resolveUi = (runtimeUi, runtimeApp) => runtimeUi || runtimeApp?.ui;
const resolveSubjectScoreKey = (appRef, subjectIdentity) => {
  const normalizedIdentity = String(subjectIdentity || '').trim();
  if (!normalizedIdentity) {
    return '';
  }

  const analyticsSubjectId = String(appRef?.analytics?.getSubjectId?.(subjectIdentity) || '').trim();
  if (analyticsSubjectId) {
    return analyticsSubjectId;
  }

  const subjectMatch = Array.isArray(appRef?.state?.subjects)
    ? appRef.state.subjects.find((subject) => {
      const subjectId = String(subject?.id || '').trim();
      const subjectName = String(subject?.name || subject || '').trim().toLowerCase();
      return normalizedIdentity === subjectId || normalizedIdentity.toLowerCase() === subjectName;
    })
    : null;

  return String(subjectMatch?.id || normalizedIdentity).trim();
};
const isReadOnlyRoleContext = (appRef) => typeof appRef?.isReadOnlyRoleContext === 'function' && appRef.isReadOnlyRoleContext();
const getReadOnlyMessage = (appRef) => {
  const label = typeof appRef?.getCurrentClassOwnerName === 'function'
    ? String(appRef.getCurrentClassOwnerName() || '').trim()
    : '';
  const target = label || 'selected class';
  return `Viewing class as admin (Read-only mode): ${target}. This action is disabled.`;
};
const ensureWritable = (appRef, uiRef) => {
  if (!isReadOnlyRoleContext(appRef)) {
    return true;
  }

  uiRef?.showToast?.(getReadOnlyMessage(appRef));
  return false;
};
const isReadOnlyError = (error) => String(error?.code || '').trim().toLowerCase() === 'app/read-only-admin';
const resolveClassContextErrorMessage = (error, fallback = 'Failed to add student') => {
  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || '').trim();
  if (code === 'app/missing-class-context' || code === 'app/missing-class-id') {
    return 'Select a class before adding a student.';
  }
  if (code === 'app/missing-class-owner-context' || code === 'app/missing-owner-id') {
    return 'Class owner context is missing. Re-select the class and try again.';
  }
  if (code === 'app/class-not-found') {
    return 'Selected class no longer exists. Refresh classes and try again.';
  }
  if (code === 'app/invalid-owner') {
    return 'Selected class owner is invalid. Re-select the class and try again.';
  }
  if (message) {
    return message;
  }
  return fallback;
};

const normalizeBulkImportInput = (value) => String(value || '').replace(/\r\n?/g, '\n');
const toStudentNameKey = (value) => normalizeStudentName(value).toLocaleLowerCase();
const pluralize = (count, singular, plural = `${singular}s`) => (count === 1 ? singular : plural);
const splitBulkImportLine = (line) => {
  const rawLine = String(line || '');
  const delimiter = rawLine.includes('\t') ? '\t' : ',';
  return {
    delimiter,
    parts: rawLine.split(delimiter).map((part) => part.trim())
  };
};
const isBulkImportHeaderRow = (parts = []) => {
  const normalizedParts = parts.map((part) => String(part || '').trim().toLowerCase());
  const firstCell = normalizedParts[0] || '';
  const secondCell = normalizedParts[1] || '';
  const thirdCell = normalizedParts[2] || '';
  const remainingCellsAreEmpty = normalizedParts.slice(3).every((cell) => !cell);

  const matchesFirstCell = firstCell === 'name' || firstCell === 'student' || firstCell === 'student name';
  const matchesSecondCell = !secondCell || secondCell === 'class' || secondCell === 'class name';
  const matchesThirdCell = !thirdCell || thirdCell === 'notes' || thirdCell === 'note' || thirdCell === 'comment' || thirdCell === 'comments';

  return matchesFirstCell && matchesSecondCell && matchesThirdCell && remainingCellsAreEmpty;
};
const shouldStopBulkImport = (error) => {
  const code = String(error?.code || '').trim().toLowerCase();
  return isReadOnlyError(error)
    || code === 'app/missing-class-context'
    || code === 'app/missing-class-id'
    || code === 'app/missing-class-owner-context'
    || code === 'app/missing-owner-id'
    || code === 'app/class-not-found'
    || code === 'app/invalid-owner';
};
const parseBulkImportCsv = (csv, appRef) => {
  const lines = normalizeBulkImportInput(csv).split('\n');
  const newStudents = [];
  const invalidRows = [];
  const duplicateRows = [];
  const existingNameMatches = [];
  const existingStudentNames = new Set(
    (appRef?.state?.students || [])
      .map((student) => toStudentNameKey(student?.name))
      .filter(Boolean)
  );
  const seenRowKeys = new Set();
  let hasHandledFirstNonEmptyRow = false;

  lines.forEach((line, index) => {
    const trimmedLine = String(line || '').trim();
    if (!trimmedLine) {
      return;
    }

    const { delimiter, parts } = splitBulkImportLine(line);
    if (!hasHandledFirstNonEmptyRow) {
      hasHandledFirstNonEmptyRow = true;
      if (isBulkImportHeaderRow(parts)) {
        return;
      }
    }

    const normalizedName = normalizeStudentName(parts[0]);
    if (!normalizedName) {
      return;
    }
    if (!isValidStudentName(normalizedName)) {
      invalidRows.push({ rowNumber: index + 1, value: parts[0] || '' });
      return;
    }

    const normalizedClass = parts[1] || '';
    const normalizedNotes = parts.slice(2).join(delimiter).trim();
    const rowKey = JSON.stringify([
      toStudentNameKey(normalizedName),
      normalizedClass.toLowerCase(),
      normalizedNotes.toLowerCase()
    ]);

    if (seenRowKeys.has(rowKey)) {
      duplicateRows.push({ rowNumber: index + 1, name: normalizedName });
      return;
    }

    seenRowKeys.add(rowKey);
    if (existingStudentNames.has(toStudentNameKey(normalizedName))) {
      existingNameMatches.push({ rowNumber: index + 1, name: normalizedName });
    }

    newStudents.push({
      name: normalizedName,
      class: normalizedClass,
      notes: normalizedNotes
    });
  });

  return {
    newStudents,
    invalidRows,
    duplicateRows,
    existingNameMatches
  };
};
const buildBulkImportConfirmationMessage = (summary) => {
  const messageLines = [`Import ${summary.newStudents.length} ${pluralize(summary.newStudents.length, 'student')} into the active class?`];
  const notices = [];

  if (summary.duplicateRows.length) {
    notices.push(`${summary.duplicateRows.length} duplicate ${pluralize(summary.duplicateRows.length, 'row')} will be skipped`);
  }
  if (summary.invalidRows.length) {
    notices.push(`${summary.invalidRows.length} invalid ${pluralize(summary.invalidRows.length, 'row')} will be skipped`);
  }
  if (summary.existingNameMatches.length) {
    notices.push(`${summary.existingNameMatches.length} existing-name ${pluralize(summary.existingNameMatches.length, 'match', 'matches')} will still be added`);
  }

  if (notices.length) {
    messageLines.push('', ...notices.map((notice) => `- ${notice}`));
  }

  return messageLines.join('\n');
};
const buildBulkImportEmptyMessage = (summary) => {
  if (summary.invalidRows.length && !summary.duplicateRows.length) {
    return STUDENT_NAME_VALIDATION_MESSAGE;
  }

  const reasons = [];
  if (summary.duplicateRows.length) {
    reasons.push(`${summary.duplicateRows.length} duplicate ${pluralize(summary.duplicateRows.length, 'row')} skipped`);
  }
  if (summary.invalidRows.length) {
    reasons.push(`${summary.invalidRows.length} invalid ${pluralize(summary.invalidRows.length, 'row')} skipped`);
  }

  return reasons.length
    ? `No importable students found. ${reasons.join('. ')}.`
    : 'No valid students found';
};
const buildBulkImportResultMessage = (preflightSummary, importResult) => {
  const parts = [];

  if (importResult.importedCount) {
    parts.push(`${importResult.importedCount} ${pluralize(importResult.importedCount, 'student')} imported`);
  } else {
    parts.push('No students imported');
  }
  if (preflightSummary.duplicateRows.length) {
    parts.push(`${preflightSummary.duplicateRows.length} duplicate ${pluralize(preflightSummary.duplicateRows.length, 'row')} skipped`);
  }
  if (preflightSummary.invalidRows.length) {
    parts.push(`${preflightSummary.invalidRows.length} invalid ${pluralize(preflightSummary.invalidRows.length, 'row')} skipped`);
  }
  if (preflightSummary.existingNameMatches.length) {
    parts.push(`${preflightSummary.existingNameMatches.length} existing-name ${pluralize(preflightSummary.existingNameMatches.length, 'match', 'matches')} added separately`);
  }
  if (importResult.failedRows.length) {
    const failureNames = importResult.failedRows
      .slice(0, 2)
      .map((entry) => String(entry?.name || '').trim())
      .filter(Boolean);
    const failureSuffix = importResult.failedRows.length > failureNames.length ? ', …' : '';
    parts.push(
      failureNames.length
        ? `${importResult.failedRows.length} ${pluralize(importResult.failedRows.length, 'row')} failed (${failureNames.join(', ')}${failureSuffix})`
        : `${importResult.failedRows.length} ${pluralize(importResult.failedRows.length, 'row')} failed`
    );
  }
  if (importResult.stoppedEarly) {
    parts.push('Import stopped after a blocking error');
  }

  return `${parts.join('. ')}.`;
};

const students = {
  addStudent: async function (name, runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return false;

    const n = normalizeStudentName(name);
    if (!n) {
      uiRef?.showToast?.('Enter a student name first');
      return false;
    }
    if (!isValidStudentName(n)) {
      uiRef?.showToast?.(STUDENT_NAME_VALIDATION_MESSAGE);
      return false;
    }

    try {
      await appRef.addStudent({ name: n, class: '', notes: '', scores: {} });
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student added');
      return true;
    } catch (error) {
      console.error('Failed to add student:', error);
      uiRef?.showToast?.(resolveClassContextErrorMessage(error, 'Failed to add student'));
      return false;
    }
  },

  deleteStudent: function (uid, runtimeApp) {
    const appRef = resolveApp(runtimeApp);
    if (!ensureWritable(appRef, appRef?.ui)) return;

    const s = appRef.state.students.find(x => x.id === uid);
    if (!s) return;
    console.log('Deleting student:', uid);
    console.log('Class Owner:', appRef.getCurrentClassOwnerId?.() || 'unknown');
    appRef.state.deletingId = uid;
    if (appRef.dom.deleteConfirmMsg) {
      appRef.dom.deleteConfirmMsg.textContent = `Delete ${s.name}? This will move the student to Trash and remove active score entry from the current class.`;
    }
    appRef.dom.deleteModal?.classList.add('active');
  },

  confirmDelete: async function (runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return;

    const uid = appRef.state.deletingId;
    if (!uid) return;
    const student = appRef.state.students.find(x => x.id === uid);
    const studentName = student?.name || 'Student';

    try {
      console.log('Deleting student:', uid);
      console.log('Class Owner:', appRef.getCurrentClassOwnerId?.() || 'unknown');
      const deletedEntry = await appRef.deleteStudent(uid);
      appRef.state.deletingId = null;
      appRef.dom.deleteModal?.classList.remove('active');
      uiRef?.refreshUI?.();
      uiRef?.showUndoDeleteToast?.(deletedEntry?.id || uid, deletedEntry?.name || studentName);
    } catch (error) {
      console.error('Failed to delete student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to delete student');
    }
  },

  restoreStudent: async function (uid, runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return false;

    const normalizedId = String(uid || '').trim();
    if (!normalizedId) return false;

    try {
      await appRef.restoreStudent(normalizedId);
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student restored');
      return true;
    } catch (error) {
      console.error('Failed to restore student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to restore student');
      return false;
    }
  },

  permanentlyDeleteStudent: async function (uid, runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return false;

    const normalizedId = String(uid || '').trim();
    if (!normalizedId) return false;

    try {
      await appRef.permanentlyDeleteStudent(normalizedId);
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student permanently deleted');
      return true;
    } catch (error) {
      console.error('Failed to permanently delete student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to delete student');
      return false;
    }
  },

  startEdit: function (uid, runtimeApp) {
    const appRef = resolveApp(runtimeApp);
    if (!ensureWritable(appRef, appRef?.ui)) return;

    const s = appRef.state.students.find(x => x.id === uid);
    if (!s) return;
    console.log('Editing student:', uid);
    appRef.state.editingId = uid;
    if (appRef.dom.editInput) {
      appRef.dom.editInput.value = s.name;
      appRef.dom.editInput.focus();
      appRef.dom.editInput.select();
    }
    appRef.dom.editModal?.classList.add('active');
  },

  saveEdit: async function (runtimeApp, runtimeUi) {
    const appRef = resolveApp(runtimeApp);
    const uiRef = resolveUi(runtimeUi, appRef);
    if (!ensureWritable(appRef, uiRef)) return;

    const uid = appRef.state.editingId;
    if (!uid) return;

    const newName = normalizeStudentName(appRef.dom.editInput.value);
    if (!newName) {
      uiRef?.showToast?.('Student name cannot be empty');
      return;
    }
    if (!isValidStudentName(newName)) {
      uiRef?.showToast?.(STUDENT_NAME_VALIDATION_MESSAGE);
      return;
    }
    if (appRef.dom.editInput) {
      appRef.dom.editInput.value = newName;
    }

    try {
      console.log('Editing student:', uid);
      await appRef.updateStudent(uid, { name: newName });
      appRef.state.editingId = null;
      appRef.dom.editModal?.classList.remove('active');
      uiRef?.refreshUI?.();
      uiRef?.showToast?.('Student updated');
    } catch (error) {
      console.error('Failed to update student:', error);
      uiRef?.showToast?.(isReadOnlyError(error) ? getReadOnlyMessage(appRef) : 'Failed to update student');
    }
  },

  getBulkImportPreview: function (csv, app) {
    const importPlan = parseBulkImportCsv(csv, app);
    const hasContent = normalizeBulkImportInput(csv)
      .split('\n')
      .some((line) => Boolean(String(line || '').trim()));

    return {
      hasContent,
      importableCount: importPlan.newStudents.length,
      invalidRowCount: importPlan.invalidRows.length,
      duplicateRowCount: importPlan.duplicateRows.length,
      existingNameMatchCount: importPlan.existingNameMatches.length
    };
  },

  bulkImport: async function (csv, app, ui) {
    if (!ensureWritable(app, ui)) return false;

    const importPlan = parseBulkImportCsv(csv, app);

    if (importPlan.newStudents.length === 0) {
      ui.showToast(buildBulkImportEmptyMessage(importPlan));
      return false;
    }

    if (!window.confirm(buildBulkImportConfirmationMessage(importPlan))) {
      return false;
    }

    const runImport = () => this.importStudents(importPlan.newStudents, app, ui);
    const importResult = typeof ui?.withLoader === 'function'
      ? await ui.withLoader(runImport, { message: 'Importing students...' })
      : await runImport();

    if (importResult === false) {
      return false;
    }

    ui.showToast(buildBulkImportResultMessage(importPlan, importResult), {
      duration: importResult.failedRows.length ? 5000 : 3200
    });
    return importResult;
  },

  importStudents: async function (studentsData, app, ui) {
    if (!ensureWritable(app, ui)) return false;

    const importResult = {
      importedCount: 0,
      failedRows: [],
      stoppedEarly: false
    };

    try {
      if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
        try {
          app.snapshots.saveSnapshot('Auto Backup Before Bulk Student Import');
        } catch (snapshotError) {
          console.error('Failed to create pre-import snapshot:', snapshotError);
        }
      }
      for (const studentData of studentsData) {
        try {
          await app.addStudent({ ...studentData, scores: {} }, { skipActivityLog: true });
          importResult.importedCount += 1;
        } catch (error) {
          console.error('Failed to import student:', error);
          importResult.failedRows.push({
            name: String(studentData?.name || '').trim(),
            message: isReadOnlyError(error)
              ? getReadOnlyMessage(app)
              : resolveClassContextErrorMessage(error, String(error?.message || 'Failed to import student'))
          });

          if (shouldStopBulkImport(error)) {
            importResult.stoppedEarly = true;
            break;
          }
        }
      }
      if (importResult.importedCount) {
        if (app?.state && Array.isArray(app.state.students)) {
          app.state.dashboardStudentCount = app.state.students.length;
        }
        ui.refreshUI();
      }
      return importResult;
    } catch (error) {
      console.error('Failed to import students:', error);
      ui.showToast(isReadOnlyError(error) ? getReadOnlyMessage(app) : resolveClassContextErrorMessage(error, String(error?.message || 'Failed to import students')));
      return false;
    }
  },

  saveScores: async function (studentId, examId, scores, app, ui) {
    if (!ensureWritable(app, ui)) return;

    try {
      const exam = app.state.exams.find(e => e.id === examId);
      const student = app.state.students.find(s => s.id === studentId);

      if (!student || !exam?.id) {
        ui.showToast('Select student and exam first');
        return;
      }

      const nextScores = JSON.parse(JSON.stringify(student.scores || {}));

      for (const [subject, score] of Object.entries(scores)) {
        const subjectId = resolveSubjectScoreKey(app, subject);
        if (!subjectId) {
          continue;
        }
        if (!nextScores[subjectId] || typeof nextScores[subjectId] !== 'object') {
          nextScores[subjectId] = {};
        }
        nextScores[subjectId][exam.id] = app.analytics.normalizeScore(score);
      }

      await app.updateStudent(student.id, { scores: nextScores });
      ui.refreshUI();
      ui.showToast('Scores saved');
    } catch (error) {
      console.error('Failed to save scores:', error);
      ui.showToast(isReadOnlyError(error) ? getReadOnlyMessage(app) : 'Failed to save scores');
    }
  },

  saveBulkScores: async function (examId, inputs, app, ui) {
    if (!ensureWritable(app, ui)) return;

    try {
      const exam = app.state.exams.find(e => e.id === examId);

      if (!exam?.id) {
        ui.showToast('Select an exam first');
        return;
      }

      if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
        app.snapshots.saveSnapshot('Auto Backup Before Bulk Score Save');
      }

      const changedStudents = new Map();
      inputs.forEach(input => {
        const studentId = input.dataset.sid;
        const subjectId = resolveSubjectScoreKey(app, input.dataset.sub || '');
        const score = app.analytics.normalizeScore(input.value);

        if (studentId && subjectId) {
          const stateStudent = app.state.students.find(s => s.id === studentId);
          if (!stateStudent) return;

          if (!changedStudents.has(studentId)) {
            changedStudents.set(studentId, {
              id: studentId,
              scores: JSON.parse(JSON.stringify(stateStudent.scores || {}))
            });
          }

          const studentDraft = changedStudents.get(studentId);
          if (!studentDraft.scores[subjectId] || typeof studentDraft.scores[subjectId] !== 'object') {
            studentDraft.scores[subjectId] = {};
          }
          studentDraft.scores[subjectId][exam.id] = score;
        }
      });

      await Promise.all(Array.from(changedStudents.values()).map(student => app.updateStudent(student.id, { scores: student.scores })));
      ui.refreshUI();
      ui.showToast("Class scores saved");
    } catch (error) {
      console.error('Failed to save bulk scores:', error);
      ui.showToast(isReadOnlyError(error) ? getReadOnlyMessage(app) : 'Failed to save some scores');
    }
  }
};

app.students = students;

// Export students module
export default students;
