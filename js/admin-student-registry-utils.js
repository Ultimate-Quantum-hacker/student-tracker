import { normalizeDisplayText } from './admin-display-utils.js';

export const parseAdminRegistryStudentPath = (path = '') => {
  const segments = String(path || '').split('/').filter(Boolean);
  const isLegacyRootScoped = segments.length === 4
    && segments[0] === 'users'
    && segments[2] === 'students';
  const isClassScoped = segments.length === 6
    && segments[0] === 'users'
    && segments[2] === 'classes'
    && segments[4] === 'students';
  const isSupportedPath = isLegacyRootScoped || isClassScoped;

  return {
    ownerId: normalizeDisplayText(isSupportedPath ? segments[1] : '', ''),
    classId: isClassScoped ? normalizeDisplayText(segments[3], '') : '',
    studentDocId: normalizeDisplayText(
      isLegacyRootScoped
        ? segments[3]
        : isClassScoped
          ? segments[5]
          : '',
      ''
    ),
    isClassScoped,
    isSupportedPath
  };
};

export const buildAdminRegistryStudentIdentityKey = (ownerId = '', studentId = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedStudentId = normalizeDisplayText(studentId, '');
  if (!normalizedOwnerId || !normalizedStudentId) {
    return '';
  }

  return `${normalizedOwnerId}::${normalizedStudentId}`;
};

export const pickPreferredAdminRegistryStudentRecord = (current = null, candidate = null) => {
  if (!candidate) {
    return current;
  }

  if (!current) {
    return candidate;
  }

  if (candidate.isClassScoped && !current.isClassScoped) {
    return candidate;
  }

  if (current.isClassScoped && !candidate.isClassScoped) {
    return current;
  }

  if (!current.classId && candidate.classId) {
    return candidate;
  }

  if (!current.className && candidate.className) {
    return candidate;
  }

  return current;
};

export const buildAdminRegistryClassKey = (ownerId = '', classId = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassId = normalizeDisplayText(classId, '');
  if (!normalizedOwnerId || !normalizedClassId) {
    return '';
  }

  return `${normalizedOwnerId}::${normalizedClassId}`;
};

export const buildAdminRegistryFallbackClassKey = (ownerId = '', className = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassName = normalizeDisplayText(className, '').toLowerCase();
  if (!normalizedOwnerId || !normalizedClassName) {
    return '';
  }

  return `${normalizedOwnerId}::fallback::${normalizedClassName}`;
};

export const resolveAdminRegistryClassInfoByName = (classMap = new Map(), ownerId = '', className = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassName = normalizeDisplayText(className, '').toLowerCase();
  if (!(classMap instanceof Map) || !normalizedOwnerId || !normalizedClassName) {
    return {
      classKey: '',
      classInfo: null
    };
  }

  for (const [classKey, classInfo] of classMap.entries()) {
    if (normalizeDisplayText(classInfo?.ownerId, '') !== normalizedOwnerId) {
      continue;
    }

    if (normalizeDisplayText(classInfo?.name, '').toLowerCase() !== normalizedClassName) {
      continue;
    }

    return {
      classKey,
      classInfo
    };
  }

  return {
    classKey: '',
    classInfo: null
  };
};

export const getAdminRegistryOwnerClasses = (classMap = new Map(), ownerId = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  if (!(classMap instanceof Map) || !normalizedOwnerId) {
    return [];
  }

  const matches = [];
  for (const [classKey, classInfo] of classMap.entries()) {
    if (normalizeDisplayText(classInfo?.ownerId, '') !== normalizedOwnerId) {
      continue;
    }

    matches.push({
      classKey,
      classInfo
    });
  }

  return matches;
};

export const resolveAdminRegistryClassInfo = (classMap = new Map(), ownerId = '', classId = '', className = '') => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedClassId = normalizeDisplayText(classId, '');
  const normalizedClassName = normalizeDisplayText(className, '');
  if (!(classMap instanceof Map) || !normalizedOwnerId) {
    return {
      classKey: '',
      classInfo: null
    };
  }

  const directClassKey = buildAdminRegistryClassKey(normalizedOwnerId, normalizedClassId);
  const directClassInfo = classMap.get(directClassKey) || null;
  if (directClassInfo) {
    return {
      classKey: directClassKey,
      classInfo: directClassInfo
    };
  }

  const candidateNames = [normalizedClassName, normalizedClassId].filter(Boolean);
  for (const candidateName of candidateNames) {
    const resolvedByName = resolveAdminRegistryClassInfoByName(classMap, normalizedOwnerId, candidateName);
    if (resolvedByName.classInfo) {
      return resolvedByName;
    }
  }

  const ownerClasses = getAdminRegistryOwnerClasses(classMap, normalizedOwnerId);
  if (ownerClasses.length === 1) {
    return ownerClasses[0];
  }

  return {
    classKey: '',
    classInfo: null
  };
};

export const sortAdminStudentsRegistry = (students = []) => {
  const sortedStudents = [...students];
  sortedStudents.sort((a, b) => {
    const classCompare = String(a.className || '').localeCompare(String(b.className || ''), undefined, { sensitivity: 'base', numeric: true });
    if (classCompare !== 0) return classCompare;
    const teacherCompare = String(a.teacherName || '').localeCompare(String(b.teacherName || ''), undefined, { sensitivity: 'base', numeric: true });
    if (teacherCompare !== 0) return teacherCompare;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
  });
  return sortedStudents;
};
