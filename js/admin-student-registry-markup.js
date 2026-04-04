import {
  buildStudentIdentityMarkup,
  buildStackedTextMarkup,
  escapeHtml,
  normalizeDisplayText
} from './admin-display-utils.js';

const normalizePositiveInteger = (value, fallback = 1) => {
  const normalizedFallback = Math.max(1, Number.parseInt(fallback, 10) || 1);
  return Math.max(1, Number.parseInt(value, 10) || normalizedFallback);
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
      <button
        class="btn btn-danger admin-student-delete-btn"
        type="button"
        data-admin-student-delete="true"
        data-owner-id="${escapeHtml(ownerId)}"
        data-student-id="${escapeHtml(studentId)}"
        data-student-name="${escapeHtml(studentName)}"
        aria-label="${escapeHtml(buttonTitle)}"
        title="${escapeHtml(buttonTitle)}"
        ${isDisabled ? 'disabled' : ''}
      >Delete</button>
    </div>
  `;
};

const buildAdminStudentsEmptyStateMarkup = ({
  columnCount = 4,
  icon = '🎓',
  title = 'No student records found.',
  detail = 'There are no active student entries to display in the registry right now.'
} = {}) => {
  const normalizedColumnCount = normalizePositiveInteger(columnCount, 4);
  return `<tr><td colspan="${normalizedColumnCount}" class="empty-row"><div class="smart-empty admin-students-empty"><span>${escapeHtml(icon)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></td></tr>`;
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
      ${shouldRenderClassGroup ? `<tr class="admin-students-group-row admin-students-group-row-skeleton" aria-hidden="true"><td colspan="${normalizedColumnCount}"><div class="admin-students-skeleton admin-students-skeleton-group"></div></td></tr>` : ''}
      <tr class="admin-students-row-skeleton" aria-hidden="true">
        <td>
          <div class="admin-students-skeleton-stack">
            <div class="admin-students-skeleton admin-students-skeleton-title"></div>
            <div class="admin-students-skeleton admin-students-skeleton-copy"></div>
          </div>
        </td>
        <td>
          <div class="admin-students-skeleton-stack">
            <div class="admin-students-skeleton admin-students-skeleton-title"></div>
            <div class="admin-students-skeleton admin-students-skeleton-copy"></div>
          </div>
        </td>
        <td>
          <div class="admin-students-skeleton-stack">
            <div class="admin-students-skeleton admin-students-skeleton-title"></div>
            <div class="admin-students-skeleton admin-students-skeleton-copy"></div>
          </div>
        </td>
        <td>
          <div class="admin-students-row-actions">
            <div class="admin-students-skeleton admin-students-skeleton-action"></div>
          </div>
        </td>
      </tr>
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
    return hasActiveCriteria
      ? buildAdminStudentsEmptyStateMarkup({
          columnCount: normalizedColumnCount,
          icon: '🔎',
          title: 'No students match your filters.',
          detail: 'Try adjusting the search, class, or teacher filters.'
        })
      : buildAdminStudentsEmptyStateMarkup({
          columnCount: normalizedColumnCount,
          icon: '🎓',
          title: 'No student records found.',
          detail: 'The global registry does not have any active student entries to show yet.'
        });
  }

  let studentNumber = Math.max(0, Number(startIndex) || 0);
  return groups.map((group) => {
    const groupLabel = normalizeDisplayText(group?.label, 'Unknown Class');
    const rows = (Array.isArray(group?.students) ? group.students : []).map((student) => {
      studentNumber += 1;
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
    }).join('');

    return `<tr class="admin-students-group-row"><td colspan="${normalizedColumnCount}">${escapeHtml(groupLabel)}</td></tr>${rows}`;
  }).join('');
};
