export const MESSAGE_SUBJECT_MAX_LENGTH = 140;
export const MESSAGE_BODY_MAX_LENGTH = 5000;

const normalizeLength = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

export const getMessageCharacterLength = (value = '') => {
  return String(value || '').length;
};

export const getRemainingCharacterCount = (value = '', maxLength = MESSAGE_BODY_MAX_LENGTH) => {
  const normalizedMaxLength = normalizeLength(maxLength);
  return Math.max(0, normalizedMaxLength - getMessageCharacterLength(value));
};

export const formatCharacterCounter = (value = '', maxLength = MESSAGE_BODY_MAX_LENGTH, { includeRemaining = true } = {}) => {
  const normalizedMaxLength = normalizeLength(maxLength);
  const currentLength = getMessageCharacterLength(value);
  const segments = [`${currentLength} / ${normalizedMaxLength} characters`];

  if (includeRemaining) {
    segments.push(`${getRemainingCharacterCount(value, normalizedMaxLength)} remaining`);
  }

  return segments.join(' · ');
};
