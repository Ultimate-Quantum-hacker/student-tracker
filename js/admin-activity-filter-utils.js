import {
  escapeHtml,
  formatRoleLabel,
  normalizeText
} from './admin-display-utils.js';
import {
  formatClassDisplayLabel,
  getEntryClassFilterKey
} from './admin-activity-utils.js';
import { getVisibleAdminActivityEntries } from './admin-user-utils.js';

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

export const buildVisibleActivityClassFilterState = (entries = [], users = [], {
  currentRole = '',
  previousSelection = ''
} = {}) => {
  const visibleEntries = getVisibleAdminActivityEntries(entries, users, {
    currentRole
  });
  return buildActivityClassFilterState(visibleEntries, {
    previousSelection
  });
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

const ACTIVITY_LOG_LIMIT_OPTIONS = [50, 100, 250];
const DEFAULT_ACTIVITY_LOG_LIMIT = 250;

const normalizeActivityLogLimit = (value) => {
  const parsedLimit = Number.parseInt(value, 10);
  return ACTIVITY_LOG_LIMIT_OPTIONS.includes(parsedLimit) ? parsedLimit : DEFAULT_ACTIVITY_LOG_LIMIT;
};

export const buildActivityLogsQueryState = ({
  userId = '',
  classKey = '',
  action = '',
  searchTerm = '',
  sort = 'desc',
  maxEntries = DEFAULT_ACTIVITY_LOG_LIMIT
} = {}) => {
  const normalizedUserId = normalizeText(userId);
  const normalizedClassKey = normalizeText(classKey);
  const normalizedAction = normalizeText(action).toLowerCase();
  const normalizedSearchTerm = normalizeText(searchTerm).toLowerCase();
  const normalizedSort = normalizeText(sort).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const normalizedLimit = normalizeActivityLogLimit(maxEntries);

  return {
    selectedUserId: normalizedUserId,
    selectedClassKey: normalizedClassKey,
    selectedAction: normalizedAction,
    selectedSearchTerm: normalizedSearchTerm,
    selectedSort: normalizedSort,
    selectedLimit: normalizedLimit,
    hasActiveFilters: Boolean(normalizedUserId || normalizedClassKey || normalizedAction || normalizedSearchTerm || normalizedSort !== 'desc' || normalizedLimit !== DEFAULT_ACTIVITY_LOG_LIMIT),
    activityLogsCacheKey: buildActivityLogsCacheKey({
      userId: normalizedUserId,
      sort: normalizedSort,
      maxEntries: normalizedLimit
    })
  };
};

const buildActivitySearchHaystack = (entry = {}) => {
  return [
    String(entry?.action || '').replace(/[_-]+/g, ' '),
    entry?.targetLabel,
    entry?.studentName,
    entry?.targetType,
    entry?.targetId,
    entry?.userName,
    entry?.userDisplayName,
    entry?.userEmail,
    entry?.userId,
    entry?.ownerName,
    entry?.className,
    entry?.classId,
    formatClassDisplayLabel(entry)
  ].map((value) => normalizeText(value).toLowerCase()).join(' ');
};

export const filterAdminActivityEntries = (entries = [], {
  selectedAction = '',
  selectedClassKey = '',
  searchTerm = ''
} = {}) => {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const normalizedSelectedAction = normalizeText(selectedAction).toLowerCase();
  const normalizedSelectedClassKey = normalizeText(selectedClassKey);
  const normalizedSearchTerm = normalizeText(searchTerm).toLowerCase();

  const entriesForClassFilter = normalizedEntries.filter((entry) => {
    const matchesAction = !normalizedSelectedAction || String(entry?.action || '').trim().toLowerCase() === normalizedSelectedAction;
    const matchesSearch = !normalizedSearchTerm || buildActivitySearchHaystack(entry).includes(normalizedSearchTerm);
    return matchesAction && matchesSearch;
  });

  const filteredEntries = normalizedSelectedClassKey
    ? entriesForClassFilter.filter((entry) => getEntryClassFilterKey(entry) === normalizedSelectedClassKey)
    : entriesForClassFilter;

  return {
    entriesForClassFilter,
    filteredEntries
  };
};

export const buildActivityLogsCacheKey = ({ userId = '', sort = 'desc', maxEntries = DEFAULT_ACTIVITY_LOG_LIMIT } = {}) => {
  const normalizedUserId = normalizeText(userId);
  const normalizedSort = normalizeText(sort).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const normalizedLimit = normalizeActivityLogLimit(maxEntries);
  return `${normalizedUserId}::${normalizedSort}::${normalizedLimit}`;
};
