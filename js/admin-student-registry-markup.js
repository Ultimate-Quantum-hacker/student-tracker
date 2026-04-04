import {
  buildEmptyTableRowMarkup,
  buildStudentIdentityMarkup,
  buildStackedTextMarkup,
  escapeHtml,
  normalizeDisplayText
} from './admin-display-utils.js';

const normalizePositiveInteger = (value, fallback = 1) => {
  const normalizedFallback = Math.max(1, Number.parseInt(fallback, 10) || 1);
  return Math.max(1, Number.parseInt(value, 10) || normalizedFallback);
};

const buildAdminStudentsDeleteButtonMarkup = ({
  ownerId = '',
  studentId = '',
  studentName = 'Student',
  buttonTitle = '',
  isDisabled = false
} = {}) => {
  const safeOwnerId = normalizeDisplayText(ownerId, '');
  const safeStudentId = normalizeDisplayText(studentId, '');
  const safeStudentName = normalizeDisplayText(studentName, 'Student');
  const safeButtonTitle = normalizeDisplayText(buttonTitle, 'Delete Student');
  return `
    <button
      class="btn btn-danger admin-student-delete-btn"
      type="button"
      data-admin-student-delete="true"
      data-owner-id="${escapeHtml(safeOwnerId)}"
      data-student-id="${escapeHtml(safeStudentId)}"
      data-student-name="${escapeHtml(safeStudentName)}"
      aria-label="${escapeHtml(safeButtonTitle)}"
      title="${escapeHtml(safeButtonTitle)}"
      ${isDisabled ? 'disabled' : ''}
    >Delete</button>
  `;
};

const buildAdminStudentsActionMarkup = (student = {}, { canDelete = false } = {}) => {
  const ownerId = normalizeDisplayText(student?.ownerId, '');
  const studentId = normalizeDisplayText(student?.studentId, '');
  const studentName = normalizeDisplayText(student?.name, 'Student');
  const deleteEnabled = Boolean(canDelete);
  const isDisabled = !deleteEnabled || !ownerId || !studentId;
  const buttonTitle = !deleteEnabled
    ? 'Only admins and developers can delete registry students.'
    : !ownerId || !studentId
      ? 'This registry row is missing the student identity needed for deletion.'
      : `Delete ${studentName} from the registry`;

  return `
    <div class="table-actions-cell admin-student-row-actions">
      ${buildAdminStudentsDeleteButtonMarkup({
        ownerId,
        studentId,
        studentName,
        buttonTitle,
        isDisabled
      })}
    </div>
  `;
};

const buildAdminStudentsTableRowMarkup = (student = {}, {
  studentNumber = 1,
  canDelete = false
} = {}) => {
  const classLabel = normalizeDisplayText(student?.className, 'Unknown Class');
  return `
    <tr class="fade-in">
      <td>${buildStudentIdentityMarkup({ label: student?.name, avatarLabel: String(studentNumber) })}</td>
      <td>${buildStackedTextMarkup({
        containerClass: 'admin-student-meta',
        primary: classLabel,
        secondary: 'Class assignment'
      })}</td>
      <td>${buildStackedTextMarkup({
        containerClass: 'admin-student-meta',
        primary: student?.teacherName,
        secondary: 'Teacher'
      })}</td>
      <td>${buildAdminStudentsActionMarkup(student, { canDelete })}</td>
    </tr>
  `;
};

const buildAdminStudentsSkeletonGroupRowMarkup = ({
  columnCount = 4
} = {}) => {
  const normalizedColumnCount = normalizePositiveInteger(columnCount, 4);
  return `<tr class="admin-students-group-row admin-students-group-row-skeleton" aria-hidden="true"><td colspan="${normalizedColumnCount}"><div class="admin-students-skeleton admin-students-skeleton-group"></div></td></tr>`;
};

const buildAdminStudentsLabeledGroupRowMarkup = ({
  label = '',
  columnCount = 4
} = {}) => {
  const normalizedColumnCount = normalizePositiveInteger(columnCount, 4);
  const safeLabel = normalizeDisplayText(label, 'Unknown Class');
  return `<tr class="admin-students-group-row"><td colspan="${normalizedColumnCount}">${escapeHtml(safeLabel)}</td></tr>`;
};

const buildAdminStudentsGroupRowMarkup = ({
  label = '',
  columnCount = 4,
  isSkeleton = false
} = {}) => {
  const normalizedColumnCount = normalizePositiveInteger(columnCount, 4);
  if (isSkeleton) {
    return buildAdminStudentsSkeletonGroupRowMarkup({
      columnCount: normalizedColumnCount
    });
  }

  return buildAdminStudentsLabeledGroupRowMarkup({
    label,
    columnCount: normalizedColumnCount
  });
};

const buildAdminStudentsSkeletonStackMarkup = () => {
  return `
    <div class="admin-students-skeleton-stack">
      <div class="admin-students-skeleton admin-students-skeleton-title"></div>
      <div class="admin-students-skeleton admin-students-skeleton-copy"></div>
    </div>
  `;
};

const buildAdminStudentsSkeletonActionMarkup = () => {
  return `
    <div class="admin-students-row-actions">
      <div class="admin-students-skeleton admin-students-skeleton-action"></div>
    </div>
  `;
};

const buildAdminStudentsSkeletonRowMarkup = () => {
  return `
    <tr class="admin-students-row-skeleton" aria-hidden="true">
      <td>${buildAdminStudentsSkeletonStackMarkup()}</td>
      <td>${buildAdminStudentsSkeletonStackMarkup()}</td>
      <td>${buildAdminStudentsSkeletonStackMarkup()}</td>
      <td>${buildAdminStudentsSkeletonActionMarkup()}</td>
    </tr>
  `;
};

const buildAdminStudentsEmptyStateMarkup = ({
  hasActiveCriteria = false,
  columnCount = 4
} = {}) => {
  const normalizedColumnCount = normalizePositiveInteger(columnCount, 4);
  return hasActiveCriteria
    ? buildEmptyTableRowMarkup({
        columnCount: normalizedColumnCount,
        icon: '🔎',
        title: 'No students match your filters.',
        message: 'Try adjusting the search, class, or teacher filters.',
        containerClass: 'smart-empty admin-students-empty'
      })
    : buildEmptyTableRowMarkup({
        columnCount: normalizedColumnCount,
        icon: '🎓',
        title: 'No student records found.',
        message: 'The global registry does not have any active student entries to show yet.',
        containerClass: 'smart-empty admin-students-empty'
      });
};

export const buildAdminStudentsSkeletonMarkup = ({
  rowCount = 6,
  columnCount = 4
} = {}) => {
  const normalizedRowCount = normalizePositiveInteger(rowCount, 6);
  const normalizedColumnCount = normalizePositiveInteger(columnCount, 4);

  return Array.from({ length: normalizedRowCount }, (_, index) => {
    const shouldRenderClassGroup = index === 0 || index % 3 === 0;
    return `
      ${shouldRenderClassGroup ? buildAdminStudentsGroupRowMarkup({
        columnCount: normalizedColumnCount,
        isSkeleton: true
      }) : ''}
      ${buildAdminStudentsSkeletonRowMarkup()}
    `;
  }).join('');
};

export const buildAdminStudentsTableMarkup = (groups = [], {
  startIndex = 0,
  hasActiveCriteria = false,
  canDelete = false,
  columnCount = 4
} = {}) => {
  const normalizedColumnCount = normalizePositiveInteger(columnCount, 4);
  if (!Array.isArray(groups) || !groups.length) {
    return buildAdminStudentsEmptyStateMarkup({
      hasActiveCriteria,
      columnCount: normalizedColumnCount
    });
  }

  let studentNumber = Math.max(0, Number(startIndex) || 0);
  return groups.map((group) => {
    const rows = (Array.isArray(group?.students) ? group.students : []).map((student) => {
      studentNumber += 1;
      return buildAdminStudentsTableRowMarkup(student, {
        studentNumber,
        canDelete
      });
    }).join('');

    return `${buildAdminStudentsGroupRowMarkup({
      label: group?.label,
      columnCount: normalizedColumnCount
    })}${rows}`;
  }).join('');
};
