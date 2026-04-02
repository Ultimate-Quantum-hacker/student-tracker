import {
  formatTargetIdentifier,
  normalizeText,
  normalizeDisplayText
} from './admin-display-utils.js';

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

const getFirstDisplayText = (record = {}, keys = []) => {
  const fieldNames = Array.isArray(keys) ? keys : [];
  for (const key of fieldNames) {
    const value = normalizeDisplayText(record?.[key] || '', '');
    if (value) {
      return value;
    }
  }
  return '';
};

const findActivityStudentMatch = ({
  studentId = '',
  ownerId = '',
  classId = ''
} = {}, candidates = [], {
  idKeys = [],
  ownerKeys = [],
  classKeys = []
} = {}) => {
  if (!studentId) {
    return null;
  }

  const normalizedCandidates = Array.isArray(candidates) ? candidates : [];
  const normalizedIdKeys = Array.isArray(idKeys) ? idKeys : [];
  const normalizedOwnerKeys = Array.isArray(ownerKeys) ? ownerKeys : [];
  const normalizedClassKeys = Array.isArray(classKeys) ? classKeys : [];

  return normalizedCandidates.find((candidate) => {
    const candidateId = getFirstDisplayText(candidate, normalizedIdKeys);
    if (!candidateId || candidateId !== studentId) {
      return false;
    }

    const candidateOwnerId = getFirstDisplayText(candidate, normalizedOwnerKeys);
    if (ownerId && candidateOwnerId && candidateOwnerId !== ownerId) {
      return false;
    }

    const candidateClassId = getFirstDisplayText(candidate, normalizedClassKeys);
    if (classId && candidateClassId && candidateClassId !== classId) {
      return false;
    }

    return true;
  }) || null;
};

export const resolveLegacyActivityStudentName = (entry = {}, {
  globalSearchIndex = [],
  adminStudentsRegistry = []
} = {}) => {
  const targetType = normalizeDisplayText(entry.targetType || '', '').toLowerCase();
  const action = normalizeDisplayText(entry.action || '', '').toLowerCase();
  if (targetType && targetType !== 'student' && !action.includes('student')) {
    return '';
  }

  const studentId = normalizeDisplayText(entry.studentId || entry.targetId || '', '');
  if (!studentId) {
    return '';
  }

  const studentContext = {
    studentId,
    ownerId: normalizeDisplayText(entry.ownerId || entry.dataOwnerUserId || '', ''),
    classId: normalizeDisplayText(entry.classId || '', '')
  };

  const searchMatch = findActivityStudentMatch(studentContext, globalSearchIndex, {
    idKeys: ['id'],
    ownerKeys: ['userId', 'ownerId'],
    classKeys: ['classId']
  });
  const searchName = getFirstDisplayText(searchMatch, ['name']);
  if (searchName) {
    return searchName;
  }

  const registryMatch = findActivityStudentMatch(studentContext, adminStudentsRegistry, {
    idKeys: ['studentId', 'id'],
    ownerKeys: ['ownerId'],
    classKeys: ['classId']
  });
  return getFirstDisplayText(registryMatch, ['studentName', 'name']);
};

export const formatActivityTargetLabel = (entry = {}, {
  globalSearchIndex = [],
  adminStudentsRegistry = []
} = {}) => {
  const targetType = normalizeDisplayText(entry.targetType || 'record', 'record').toLowerCase();
  const resolvedStudentName = resolveLegacyActivityStudentName(entry, {
    globalSearchIndex,
    adminStudentsRegistry
  });
  const targetLabel = normalizeDisplayText(entry.targetLabel || entry.studentName || resolvedStudentName || '', '');
  const targetId = formatTargetIdentifier(entry.targetId || '');
  const readableType = targetType
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'record';

  if (targetLabel) return `${readableType}: ${targetLabel}`;
  if (!targetId) return readableType;
  return `${readableType}: ${targetId}`;
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

export const buildActivityLogsClearFeedbackState = ({
  clearedCount = 0
} = {}) => {
  const normalizedClearedCount = Math.max(0, Number.parseInt(clearedCount, 10) || 0);
  if (normalizedClearedCount > 0) {
    return {
      statusMessage: `Cleared ${normalizedClearedCount} log entr${normalizedClearedCount === 1 ? 'y' : 'ies'}.`,
      statusType: 'success',
      toastMessage: 'Activity logs cleared',
      toastType: 'success'
    };
  }

  return {
    statusMessage: 'No activity logs to clear.',
    statusType: 'warning',
    toastMessage: 'No activity logs to clear',
    toastType: 'warning'
  };
};

export const buildActivityLogsClearRequestState = () => {
  return {
    confirmationMessage: 'Clear all activity logs? This permanently removes the current log history.',
    confirmLabel: 'Clear Logs',
    dangerous: true,
    canceledStatusMessage: 'Log clear canceled.',
    canceledStatusType: 'warning',
    progressStatusMessage: 'Clearing activity logs...'
  };
};
