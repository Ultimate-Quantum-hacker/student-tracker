const STUDENT_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’.\-\s]*$/u;
const STUDENT_NAME_VALIDATION_MESSAGE = 'Student names can contain letters, spaces, apostrophes, hyphens, and periods';

export const normalizeStudentName = (value, fallback = '') => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || fallback;
};

export const isValidStudentName = (value) => {
  const normalized = normalizeStudentName(value);
  return Boolean(normalized) && STUDENT_NAME_PATTERN.test(normalized);
};

export const assertValidStudentName = (value) => {
  const normalized = normalizeStudentName(value);
  if (!normalized) {
    throw new Error('Student name is required');
  }
  if (!isValidStudentName(normalized)) {
    throw new Error(STUDENT_NAME_VALIDATION_MESSAGE);
  }
  return normalized;
};

export { STUDENT_NAME_PATTERN, STUDENT_NAME_VALIDATION_MESSAGE };
