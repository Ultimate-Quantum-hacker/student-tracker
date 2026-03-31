import { normalizeText, normalizeDisplayText } from './admin-display-utils.js';

export const getActionTone = (action = '') => {
  const normalized = normalizeText(action).toLowerCase();
  if (normalized.includes('delete') || normalized.includes('removed')) {
    return { className: 'activity-delete', verb: 'deleted' };
  }
  if (normalized.includes('update') || normalized.includes('edited') || normalized.includes('changed')) {
    return { className: 'activity-update', verb: 'updated' };
  }
  return { className: 'activity-add', verb: 'added' };
};

export const getEntryClassFilterKey = (entry = {}) => {
  const classId = normalizeText(entry.classId || '');
  const ownerId = normalizeText(entry.ownerId || entry.dataOwnerUserId || '');
  if (!classId) {
    return '';
  }
  return `${ownerId}::${classId}`;
};

export const formatClassDisplayLabel = (entry = {}) => {
  const className = normalizeDisplayText(entry.className || '', '');
  const classId = normalizeDisplayText(entry.classId || '', '');
  const ownerName = normalizeDisplayText(entry.ownerName || '', '');
  const baseClassLabel = className || classId || 'Unknown class';

  if (ownerName) {
    return `${baseClassLabel} — ${ownerName}`;
  }
  return baseClassLabel;
};

export const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const formatDateLabel = (value) => {
  const parsed = toDateValue(value);
  if (!parsed) return 'Unknown date';
  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const getActionIcon = (toneClass = '') => {
  if (toneClass === 'activity-delete') return '−';
  if (toneClass === 'activity-update') return '↻';
  return '+';
};

export const getDateGroupKey = (timestamp) => {
  const dateValue = toDateValue(timestamp);
  if (!dateValue) return 'earlier';

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(start);
  yesterdayStart.setDate(start.getDate() - 1);

  if (dateValue >= start) return 'today';
  if (dateValue >= yesterdayStart) return 'yesterday';
  return 'earlier';
};

export const getDateGroupLabel = (key) => {
  if (key === 'today') return 'Today';
  if (key === 'yesterday') return 'Yesterday';
  return 'Earlier';
};
