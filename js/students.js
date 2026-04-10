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
import {
  buildSubmissionFeedback,
  formatSubmissionError,
  isReadOnlySubmissionError,
  resolveReadOnlyBlockedReason
} from './submission-feedback.js';

const resolveApp = (runtimeApp) => runtimeApp || app;
const resolveUi = (runtimeUi, runtimeApp) => runtimeUi || runtimeApp?.ui;
const BULK_IMPORT_BATCH_SIZE = 25;
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
const ensureWritable = (appRef, uiRef) => {
  if (!isReadOnlyRoleContext(appRef)) {
    return true;
  }

  uiRef?.showToast?.(resolveReadOnlyBlockedReason({ app: appRef }));
  return false;
};
const normalizeBulkImportInput = (value) => String(value || '').replace(/\r\n?/g, '\n');
const toStudentNameKey = (value) => normalizeStudentName(value).toLocaleLowerCase();
const pluralize = (count, singular, plural = `${singular}s`) => (count === 1 ? singular : plural);
const toImportPayload = (studentData = {}) => ({
  ...studentData,
  scores: {}
});
const normalizeImportedBatchCount = (result, fallbackCount = 0) => {
  if (Array.isArray(result)) {
    return result.length;
  }
  const parsed = Number(result);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return fallbackCount;
};
const chunkStudentEntries = (studentsData = [], chunkSize = BULK_IMPORT_BATCH_SIZE) => {
  const normalizedEntries = Array.isArray(studentsData) ? studentsData : [];
  const normalizedChunkSize = Number.isFinite(Number(chunkSize)) && Number(chunkSize) > 0
    ? Math.max(1, Math.floor(Number(chunkSize)))
    : BULK_IMPORT_BATCH_SIZE;
  const chunks = [];

  for (let index = 0; index < normalizedEntries.length; index += normalizedChunkSize) {
    chunks.push(normalizedEntries.slice(index, index + normalizedChunkSize));
  }

  return chunks;
};
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
  return isReadOnlySubmissionError(error)
    || code === 'app/missing-class-context'
    || code === 'app/missing-class-id'
    || code === 'app/missing-class-owner-context'
    || code === 'app/missing-owner-id'
    || code === 'app/class-not-found'
    || code === 'app/invalid-owner'
    || code === 'invalid_class_context';
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
const buildBulkImportConfirmationDetails = (summary) => {
  const details = [];

  if (summary.duplicateRows.length) {
    details.push(`${summary.duplicateRows.length} duplicate ${pluralize(summary.duplicateRows.length, 'row')} will be skipped`);
  }
  if (summary.invalidRows.length) {
    details.push(`${summary.invalidRows.length} invalid ${pluralize(summary.invalidRows.length, 'row')} will be skipped`);
  }
  if (summary.existingNameMatches.length) {
    details.push(`${summary.existingNameMatches.length} existing-name ${pluralize(summary.existingNameMatches.length, 'match', 'matches')} will still be added`);
  }

  return details;
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
const buildSubmissionErrorMessage = (error, fallbackMessage, appRef) => {
  return formatSubmissionError(error, {
    app: appRef,
    fallbackMessage
  });
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
      const feedback = buildSubmissionFeedback({ successMessage: 'Student added' });
      uiRef?.showToast?.(feedback.message);
      return true;
    } catch (error) {
      console.error('Failed to add student:', error);
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to add student',
        app: appRef
      });
      uiRef?.showToast?.(feedback.message);
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
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to delete student',
        app: appRef
      });
      uiRef?.showToast?.(feedback.message);
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
      const feedback = buildSubmissionFeedback({ successMessage: 'Student restored' });
      uiRef?.showToast?.(feedback.message);
      return true;
    } catch (error) {
      console.error('Failed to restore student:', error);
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to restore student',
        app: appRef
      });
      uiRef?.showToast?.(feedback.message);
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
      const feedback = buildSubmissionFeedback({ successMessage: 'Student permanently deleted' });
      uiRef?.showToast?.(feedback.message);
      return true;
    } catch (error) {
      console.error('Failed to permanently delete student:', error);
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to delete student',
        app: appRef
      });
      uiRef?.showToast?.(feedback.message);
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
      const feedback = buildSubmissionFeedback({ successMessage: 'Student updated' });
      uiRef?.showToast?.(feedback.message);
    } catch (error) {
      console.error('Failed to update student:', error);
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to update student',
        app: appRef
      });
      uiRef?.showToast?.(feedback.message);
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

    const didConfirm = typeof ui?.requestConfirmation === 'function'
      ? await ui.requestConfirmation({
        title: 'Confirm Bulk Student Import',
        message: `Import ${importPlan.newStudents.length} ${pluralize(importPlan.newStudents.length, 'student')} into the active class?`,
        details: buildBulkImportConfirmationDetails(importPlan),
        confirmLabel: 'Import Students'
      })
      : window.confirm(buildBulkImportConfirmationMessage(importPlan));

    if (!didConfirm) {
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
      const importChunks = chunkStudentEntries(studentsData);

      outerLoop:
      for (const chunk of importChunks) {
        const preparedChunk = chunk.map((studentData) => toImportPayload(studentData));
        const canBatchImport = typeof app?.addBulkStudents === 'function';

        if (canBatchImport) {
          try {
            const batchResult = await app.addBulkStudents(preparedChunk, { skipActivityLog: true });
            importResult.importedCount += normalizeImportedBatchCount(batchResult, preparedChunk.length);
            continue;
          } catch (batchError) {
            console.error('Failed to import student batch:', batchError);
            if (shouldStopBulkImport(batchError)) {
              importResult.failedRows.push({
                name: String(chunk[0]?.name || '').trim(),
                message: buildSubmissionErrorMessage(batchError, 'Failed to import student', app)
              });
              importResult.stoppedEarly = true;
              break;
            }
          }
        }

        for (const studentData of chunk) {
          try {
            await app.addStudent(toImportPayload(studentData), { skipActivityLog: true });
            importResult.importedCount += 1;
          } catch (error) {
            console.error('Failed to import student:', error);
            importResult.failedRows.push({
              name: String(studentData?.name || '').trim(),
              message: buildSubmissionErrorMessage(error, 'Failed to import student', app)
            });

            if (shouldStopBulkImport(error)) {
              importResult.stoppedEarly = true;
              break outerLoop;
            }
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
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to import students',
        app
      });
      ui.showToast(feedback.message);
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
      const feedback = buildSubmissionFeedback({ successMessage: 'Scores saved' });
      ui.showToast(feedback.message);
    } catch (error) {
      console.error('Failed to save scores:', error);
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to save scores',
        app
      });
      ui.showToast(feedback.message);
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

      const changedStudents = new Map();
      const studentLookup = new Map((app.state.students || []).map((student) => [String(student?.id || '').trim(), student]));
      inputs.forEach(input => {
        const studentId = input.dataset.sid;
        const subjectId = resolveSubjectScoreKey(app, input.dataset.sub || '');
        const score = app.analytics.normalizeScore(input.value);

        if (studentId && subjectId) {
          const stateStudent = studentLookup.get(String(studentId || '').trim());
          if (!stateStudent) return;

          const currentExamScores = stateStudent?.scores?.[subjectId];
          const hasCurrentScore = Boolean(
            currentExamScores
            && typeof currentExamScores === 'object'
            && Object.prototype.hasOwnProperty.call(currentExamScores, exam.id)
          );
          const currentScore = hasCurrentScore ? app.analytics.normalizeScore(currentExamScores[exam.id]) : null;
          if (hasCurrentScore && currentScore === score) {
            return;
          }

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

      if (!changedStudents.size) {
        ui.showToast('No score changes to save');
        return;
      }

      if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
        app.snapshots.saveSnapshot('Auto Backup Before Bulk Score Save');
      }

      await app.saveBulkStudentScores(Array.from(changedStudents.values()));
      ui.refreshUI();
      const feedback = buildSubmissionFeedback({ successMessage: 'Class scores saved' });
      ui.showToast(feedback.message);
    } catch (error) {
      console.error('Failed to save bulk scores:', error);
      const feedback = buildSubmissionFeedback({
        error,
        fallbackMessage: 'Failed to save some scores',
        app
      });
      ui.showToast(feedback.message);
    }
  }
};

app.students = students;

// Export students module
export default students;
