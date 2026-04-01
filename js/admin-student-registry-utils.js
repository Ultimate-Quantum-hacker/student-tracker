import {
  escapeHtml,
  normalizeDisplayText,
  normalizeText
} from './admin-display-utils.js';

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

const buildAdminStudentsFilterOptionMarkup = (options = [], {
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

export const buildAdminStudentsFilterOptionsState = (classMap = new Map(), students = [], {
  previousClass = '',
  previousTeacher = ''
} = {}) => {
  const classEntries = new Map();
  const teacherEntries = new Map();

  const registerEntry = ({
    classKey = '',
    className = '',
    ownerId = '',
    teacherName = ''
  } = {}) => {
    const normalizedClassKey = normalizeDisplayText(classKey, '');
    const normalizedClassName = normalizeDisplayText(className, 'Unnamed Class');
    const normalizedOwnerId = normalizeDisplayText(ownerId, '');
    const normalizedTeacherName = normalizeDisplayText(teacherName, 'Unknown Teacher');

    if (normalizedClassKey && normalizedOwnerId && !classEntries.has(normalizedClassKey)) {
      classEntries.set(normalizedClassKey, {
        value: normalizedClassKey,
        className: normalizedClassName,
        ownerId: normalizedOwnerId,
        teacherName: normalizedTeacherName
      });
    }

    if (normalizedOwnerId && !teacherEntries.has(normalizedOwnerId)) {
      teacherEntries.set(normalizedOwnerId, {
        value: normalizedOwnerId,
        label: normalizedTeacherName
      });
    }
  };

  if (classMap instanceof Map) {
    classMap.forEach((classInfo, classKey) => {
      registerEntry({
        classKey,
        className: classInfo?.name,
        ownerId: classInfo?.ownerId,
        teacherName: classInfo?.ownerName
      });
    });
  }

  const normalizedStudents = Array.isArray(students) ? students : [];
  normalizedStudents.forEach((student) => {
    registerEntry({
      classKey: student?.classKey,
      className: student?.className,
      ownerId: student?.ownerId,
      teacherName: student?.teacherName
    });
  });

  const classNameCounts = new Map();
  classEntries.forEach((entry) => {
    const nameKey = String(entry.className || '').toLowerCase();
    classNameCounts.set(nameKey, (classNameCounts.get(nameKey) || 0) + 1);
  });

  const sortedClassOptions = Array.from(classEntries.values())
    .sort((a, b) => {
      const classCompare = String(a.className || '').localeCompare(String(b.className || ''), undefined, { sensitivity: 'base', numeric: true });
      if (classCompare !== 0) return classCompare;
      return String(a.teacherName || '').localeCompare(String(b.teacherName || ''), undefined, { sensitivity: 'base', numeric: true });
    })
    .map((entry) => {
      const duplicateCount = classNameCounts.get(String(entry.className || '').toLowerCase()) || 0;
      return {
        value: entry.value,
        label: duplicateCount > 1 ? `${entry.className} — ${entry.teacherName}` : entry.className
      };
    });

  const sortedTeacherOptions = Array.from(teacherEntries.values())
    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base', numeric: true }));

  const normalizedPreviousClass = normalizeText(previousClass);
  const normalizedPreviousTeacher = normalizeText(previousTeacher);

  return {
    classOptionMarkup: buildAdminStudentsFilterOptionMarkup(sortedClassOptions, {
      emptyLabel: 'All classes'
    }),
    classSelectedValue: classEntries.has(normalizedPreviousClass) ? normalizedPreviousClass : '',
    classDisabled: classEntries.size === 0,
    teacherOptionMarkup: buildAdminStudentsFilterOptionMarkup(sortedTeacherOptions, {
      emptyLabel: 'All teachers'
    }),
    teacherSelectedValue: teacherEntries.has(normalizedPreviousTeacher) ? normalizedPreviousTeacher : '',
    teacherDisabled: teacherEntries.size === 0
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

export const getFilteredAdminStudentsRegistry = (students = [], {
  searchTerm = '',
  selectedClass = '',
  selectedTeacher = ''
} = {}) => {
  const normalizedStudents = Array.isArray(students) ? students : [];
  const normalizedSearchTerm = normalizeText(searchTerm).toLowerCase();
  const normalizedSelectedClass = normalizeText(selectedClass);
  const normalizedSelectedTeacher = normalizeText(selectedTeacher);

  const searchedStudents = normalizedSearchTerm
    ? normalizedStudents.filter((student) => {
      return [student?.name, student?.className, student?.teacherName]
        .some((value) => String(value || '').toLowerCase().includes(normalizedSearchTerm));
    })
    : normalizedStudents.slice();

  const filteredStudents = searchedStudents.filter((student) => {
    const matchesClass = !normalizedSelectedClass || student?.classKey === normalizedSelectedClass;
    const matchesTeacher = !normalizedSelectedTeacher || student?.ownerId === normalizedSelectedTeacher;
    return matchesClass && matchesTeacher;
  });

  return sortAdminStudentsRegistry(filteredStudents);
};

export const groupAdminStudentsRegistry = (students = []) => {
  const classNameCounts = new Map();
  students.forEach((student) => {
    const classLabel = normalizeDisplayText(student.className, 'Unknown Class');
    const nameKey = classLabel.toLowerCase();
    classNameCounts.set(nameKey, (classNameCounts.get(nameKey) || 0) + 1);
  });

  const groups = [];
  students.forEach((student) => {
    const classLabel = normalizeDisplayText(student.className, 'Unknown Class');
    const teacherLabel = normalizeDisplayText(student.teacherName, 'Unknown Teacher');
    const classKey = normalizeDisplayText(student.classKey, `${classLabel.toLowerCase()}::${teacherLabel.toLowerCase()}`);
    const duplicateCount = classNameCounts.get(classLabel.toLowerCase()) || 0;
    const groupLabel = duplicateCount > 1 ? `${classLabel} — ${teacherLabel}` : classLabel;
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.key !== classKey) {
      groups.push({
        key: classKey,
        label: groupLabel,
        students: [student]
      });
      return;
    }

    lastGroup.students.push(student);
  });

  return groups;
};

export const getAdminStudentsPagination = (groups = [], {
  requestedPage = 1,
  pageSize = 50
} = {}) => {
  const normalizedPageSize = Math.max(1, Number.parseInt(pageSize, 10) || 1);
  const totalItems = Array.isArray(groups)
    ? groups.reduce((count, group) => count + (Array.isArray(group?.students) ? group.students.length : 0), 0)
    : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedPageSize));
  const normalizedRequestedPage = Math.max(1, Number.parseInt(requestedPage, 10) || 1);
  const currentPage = totalItems ? Math.min(normalizedRequestedPage, totalPages) : 1;
  const startIndex = totalItems ? (currentPage - 1) * normalizedPageSize : 0;
  const endIndex = Math.min(startIndex + normalizedPageSize, totalItems);

  const pageGroups = [];
  let studentCursor = 0;
  groups.forEach((group) => {
    const groupStudents = Array.isArray(group?.students) ? group.students : [];
    const nextCursor = studentCursor + groupStudents.length;

    if (nextCursor <= startIndex || studentCursor >= endIndex) {
      studentCursor = nextCursor;
      return;
    }

    const sliceStart = Math.max(0, startIndex - studentCursor);
    const sliceEnd = Math.min(groupStudents.length, endIndex - studentCursor);
    const slicedStudents = groupStudents.slice(sliceStart, sliceEnd);
    if (slicedStudents.length) {
      pageGroups.push({
        key: group?.key || `${pageGroups.length}`,
        label: normalizeDisplayText(group?.label, 'Unknown Class'),
        students: slicedStudents
      });
    }

    studentCursor = nextCursor;
  });

  return {
    groups: pageGroups,
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    endIndex
  };
};
