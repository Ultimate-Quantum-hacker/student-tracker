import {
  escapeHtml,
  formatRoleLabel,
  normalizeText
} from './admin-display-utils.js';
import {
  formatClassDisplayLabel,
  getEntryClassFilterKey
} from './admin-activity-utils.js';

const buildSelectOptionsMarkup = (options = [], {
  emptyLabel = 'All options'
} = {}) => {
  const optionMarkup = [`<option value="">${escapeHtml(emptyLabel)}</option>`];
  const normalizedOptions = Array.isArray(options) ? options : [];
  normalizedOptions.forEach((option) => {
    const value = normalizeText(option?.value || '');
    if (!value) {
      return;
    }

    optionMarkup.push(`<option value="${escapeHtml(value)}">${escapeHtml(option?.label || '')}</option>`);
  });
  return optionMarkup.join('');
};

export const buildActivityClassFilterState = (entries = [], {
  previousSelection = ''
} = {}) => {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const classOptions = new Map();
  normalizedEntries.forEach((entry) => {
    const classKey = getEntryClassFilterKey(entry);
    if (!classKey || classOptions.has(classKey)) {
      return;
    }

    classOptions.set(classKey, formatClassDisplayLabel(entry));
  });

  const sortedOptions = Array.from(classOptions.entries())
    .sort((a, b) => String(a[1] || '').localeCompare(String(b[1] || '')))
    .map(([value, label]) => ({ value, label }));

  const normalizedPreviousSelection = normalizeText(previousSelection);
  return {
    optionMarkup: buildSelectOptionsMarkup(sortedOptions, {
      emptyLabel: 'All classes'
    }),
    selectedValue: classOptions.has(normalizedPreviousSelection) ? normalizedPreviousSelection : ''
  };
};

export const buildActivityUserFilterState = (users = [], {
  previousSelection = ''
} = {}) => {
  const normalizedUsers = Array.isArray(users) ? users : [];
  const availableUserIds = new Set();
  const userOptions = [];

  normalizedUsers.forEach((record) => {
    const uid = normalizeText(record?.uid || '');
    if (!uid) {
      return;
    }

    availableUserIds.add(uid);
    userOptions.push({
      value: uid,
      label: `${record?.name || record?.email || 'Unknown user'} (${formatRoleLabel(record?.role)})`
    });
  });

  const normalizedPreviousSelection = normalizeText(previousSelection);
  return {
    optionMarkup: buildSelectOptionsMarkup(userOptions, {
      emptyLabel: 'All users'
    }),
    selectedValue: availableUserIds.has(normalizedPreviousSelection) ? normalizedPreviousSelection : ''
  };
};

export const buildActivityLogsQueryState = ({
  userId = '',
  classKey = '',
  action = '',
  sort = 'desc'
} = {}) => {
  const normalizedUserId = normalizeText(userId);
  const normalizedClassKey = normalizeText(classKey);
  const normalizedAction = normalizeText(action).toLowerCase();
  const normalizedSort = normalizeText(sort).toLowerCase() === 'asc' ? 'asc' : 'desc';

  return {
    selectedUserId: normalizedUserId,
    selectedClassKey: normalizedClassKey,
    selectedAction: normalizedAction,
    selectedSort: normalizedSort,
    activityLogsCacheKey: buildActivityLogsCacheKey({
      userId: normalizedUserId,
      sort: normalizedSort
    })
  };
};

export const buildActivityLogsCacheKey = ({ userId = '', sort = 'desc' } = {}) => {
  const normalizedUserId = normalizeText(userId);
  const normalizedSort = normalizeText(sort).toLowerCase() === 'asc' ? 'asc' : 'desc';
  return `${normalizedUserId}::${normalizedSort}`;
};
