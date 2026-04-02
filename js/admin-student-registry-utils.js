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

export const removeAdminRegistryStudentEntries = (students = [], {
  ownerId = '',
  studentId = ''
} = {}) => {
  const normalizedStudents = Array.isArray(students) ? students : [];
  const targetKey = buildAdminRegistryStudentIdentityKey(ownerId, studentId);
  if (!targetKey) {
    return {
      nextStudents: normalizedStudents.slice(),
      removedCount: 0
    };
  }

  const nextStudents = normalizedStudents.filter((student) => {
    return buildAdminRegistryStudentIdentityKey(student?.ownerId, student?.studentId) !== targetKey;
  });

  return {
    nextStudents,
    removedCount: normalizedStudents.length - nextStudents.length
  };
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

export const buildAdminRegistryStudentRecords = (entries = []) => {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const dedupedStudents = new Map();

  normalizedEntries.forEach((entry) => {
    const payload = entry?.payload || {};
    if (payload.deleted === true) {
      return;
    }

    const parsedPath = parseAdminRegistryStudentPath(entry?.path);
    if (!parsedPath.isSupportedPath) {
      return;
    }

    const ownerId = normalizeDisplayText(parsedPath.ownerId || payload.ownerId || payload.userId || '', '');
    const classId = normalizeDisplayText(parsedPath.classId || payload.classId || '', '');
    const className = normalizeDisplayText(payload.className || payload.class || '', '');
    const studentId = normalizeDisplayText(payload.id || parsedPath.studentDocId || '', '');
    const identityKey = buildAdminRegistryStudentIdentityKey(ownerId, studentId);
    if (!identityKey) {
      return;
    }

    const candidate = {
      ...payload,
      id: studentId,
      ownerId,
      classId,
      className,
      isClassScoped: Boolean(classId || parsedPath.isClassScoped)
    };

    const current = dedupedStudents.get(identityKey) || null;
    dedupedStudents.set(identityKey, pickPreferredAdminRegistryStudentRecord(current, candidate));
  });

  return Array.from(dedupedStudents.values()).map((student) => {
    const { isClassScoped, ...nextStudent } = student;
    return nextStudent;
  });
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

const findAdminRegistryOwnerRecord = (users = [], ownerId = '') => {
  const normalizedUsers = Array.isArray(users) ? users : [];
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  if (!normalizedOwnerId) {
    return null;
  }

  return normalizedUsers.find((candidate) => {
    return normalizeDisplayText(candidate?.uid, '') === normalizedOwnerId;
  }) || null;
};

export const resolveAdminRegistryTeacherName = (ownerId = '', {
  classInfo = null,
  student = {},
  users = []
} = {}) => {
  const ownerRecord = findAdminRegistryOwnerRecord(users, ownerId);
  return normalizeDisplayText(
    classInfo?.ownerName || student?.ownerName || student?.teacherName || ownerRecord?.name || ownerRecord?.email || '',
    'Unknown Teacher'
  );
};

export const mapAdminRegistryClassRecord = ({
  payload = {},
  path = '',
  fallbackClassId = '',
  users = []
} = {}) => {
  if (payload?.deleted === true) {
    return null;
  }

  const segments = String(path || '').split('/').filter(Boolean);
  const ownerId = normalizeDisplayText(segments[0] === 'users' ? segments[1] : '', '');
  const classId = normalizeDisplayText(segments[2] === 'classes' ? segments[3] : fallbackClassId, '');
  const classKey = buildAdminRegistryClassKey(ownerId, classId);
  if (!classKey) {
    return null;
  }

  return {
    classKey,
    classInfo: {
      name: normalizeDisplayText(payload.name || payload.className || payload.title || '', 'Unnamed Class'),
      ownerId,
      ownerName: resolveAdminRegistryTeacherName(ownerId, {
        student: {
          ownerName: payload.ownerName || payload.teacherName || ''
        },
        users
      })
    }
  };
};

export const mapAdminRegistryStudentRecord = (student = {}, classMap = new Map(), {
  users = []
} = {}) => {
  const ownerId = normalizeDisplayText(student.ownerId || student.userId || '', '');
  const studentClassName = normalizeDisplayText(student.className || student.class || '', '');
  const classId = normalizeDisplayText(student.classId || '', '');
  const resolvedClass = resolveAdminRegistryClassInfo(classMap, ownerId, classId, studentClassName);
  const classKey = resolvedClass.classKey || buildAdminRegistryFallbackClassKey(ownerId, studentClassName || classId);

  return {
    name: normalizeDisplayText(student.name, 'Unnamed'),
    ownerId,
    studentId: normalizeDisplayText(student.id || '', ''),
    classId,
    classKey,
    className: normalizeDisplayText(resolvedClass.classInfo?.name || studentClassName || '', 'Unknown Class'),
    teacherName: resolveAdminRegistryTeacherName(ownerId, {
      classInfo: resolvedClass.classInfo,
      student,
      users
    })
  };
};

export const buildAdminStudentsRegistryRecords = (studentRecords = [], classMap = new Map(), {
  users = [],
  shouldIncludeOwner = () => true
} = {}) => {
  const normalizedStudentRecords = Array.isArray(studentRecords) ? studentRecords : [];
  const includeOwner = typeof shouldIncludeOwner === 'function'
    ? shouldIncludeOwner
    : () => true;

  return normalizedStudentRecords
    .filter((student) => student?.deleted !== true)
    .map((student) => mapAdminRegistryStudentRecord(student, classMap, {
      users
    }))
    .filter((student) => includeOwner(student?.ownerId));
};

export const getVisibleAdminStudentsClassMap = (classMap = new Map(), {
  shouldIncludeOwner = () => true
} = {}) => {
  const visibleClassMap = new Map();
  const includeOwner = typeof shouldIncludeOwner === 'function'
    ? shouldIncludeOwner
    : () => true;

  if (!(classMap instanceof Map)) {
    return visibleClassMap;
  }

  classMap.forEach((classInfo, classKey) => {
    if (!includeOwner(classInfo?.ownerId)) {
      return;
    }

    visibleClassMap.set(classKey, classInfo);
  });

  return visibleClassMap;
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

export const buildAdminStudentsFilterState = ({
  searchText = '',
  selectedClass = '',
  selectedTeacher = ''
} = {}) => {
  const normalizedSearchText = normalizeText(searchText);
  const normalizedSelectedClass = normalizeText(selectedClass);
  const normalizedSelectedTeacher = normalizeText(selectedTeacher);

  return {
    searchText: normalizedSearchText,
    searchTerm: normalizedSearchText.toLowerCase(),
    selectedClass: normalizedSelectedClass,
    selectedTeacher: normalizedSelectedTeacher,
    hasActiveCriteria: Boolean(normalizedSearchText || normalizedSelectedClass || normalizedSelectedTeacher)
  };
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
  const normalizedFilterState = buildAdminStudentsFilterState({
    searchText: searchTerm,
    selectedClass,
    selectedTeacher
  });

  const searchedStudents = normalizedFilterState.searchTerm
    ? normalizedStudents.filter((student) => {
      return [student?.name, student?.className, student?.teacherName]
        .some((value) => String(value || '').toLowerCase().includes(normalizedFilterState.searchTerm));
    })
    : normalizedStudents.slice();

  const filteredStudents = searchedStudents.filter((student) => {
    const matchesClass = !normalizedFilterState.selectedClass || student?.classKey === normalizedFilterState.selectedClass;
    const matchesTeacher = !normalizedFilterState.selectedTeacher || student?.ownerId === normalizedFilterState.selectedTeacher;
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

export const buildAdminStudentsPaginationViewState = ({
  totalItems = 0,
  totalPages = 1,
  currentPage = 1,
  startIndex = 0,
  endIndex = 0,
  isLoading = false
} = {}) => {
  const normalizedTotalItems = Math.max(0, Number.parseInt(totalItems, 10) || 0);
  const normalizedTotalPages = Math.max(1, Number.parseInt(totalPages, 10) || 1);
  const parsedCurrentPage = Number.parseInt(currentPage, 10);
  const normalizedCurrentPage = Math.max(
    1,
    Math.min(Number.isFinite(parsedCurrentPage) ? parsedCurrentPage : 1, normalizedTotalPages)
  );
  const parsedStartIndex = Number.parseInt(startIndex, 10);
  const normalizedStartIndex = normalizedTotalItems
    ? Math.max(0, Number.isFinite(parsedStartIndex) ? parsedStartIndex : 0)
    : 0;
  const parsedEndIndex = Number.parseInt(endIndex, 10);
  const normalizedEndIndex = normalizedTotalItems
    ? Math.max(
      normalizedStartIndex + 1,
      Math.min(normalizedTotalItems, Number.isFinite(parsedEndIndex) ? parsedEndIndex : normalizedTotalItems)
    )
    : 0;

  let summaryText = 'No pages to display.';
  if (isLoading) {
    summaryText = 'Preparing registry pages...';
  } else if (normalizedTotalItems) {
    summaryText = `Showing ${normalizedStartIndex + 1}-${normalizedEndIndex} of ${normalizedTotalItems} student${normalizedTotalItems === 1 ? '' : 's'}.`;
  }

  return {
    shouldShow: Boolean(isLoading || normalizedTotalItems > 0),
    summaryText,
    pageIndicatorText: `Page ${normalizedCurrentPage} of ${normalizedTotalPages}`,
    prevDisabled: Boolean(isLoading || normalizedCurrentPage <= 1 || normalizedTotalItems === 0),
    nextDisabled: Boolean(isLoading || normalizedCurrentPage >= normalizedTotalPages || normalizedTotalItems === 0)
  };
};

export const buildAdminStudentsRegistryViewState = (students = [], filterState = {}, {
  requestedPage = 1,
  pageSize = 50,
  isLoaded = false
} = {}) => {
  const normalizedStudents = Array.isArray(students) ? students : [];
  const normalizedFilterState = buildAdminStudentsFilterState(filterState);
  const filteredStudents = getFilteredAdminStudentsRegistry(normalizedStudents, normalizedFilterState);
  const groupedStudents = groupAdminStudentsRegistry(filteredStudents);
  const pagination = getAdminStudentsPagination(groupedStudents, {
    requestedPage,
    pageSize
  });
  const visibleRange = filteredStudents.length ? `${pagination.startIndex + 1}-${pagination.endIndex}` : '0';

  let statusMessage = '';
  let statusType = '';

  if (isLoaded) {
    if (normalizedStudents.length === 0) {
      statusMessage = 'No active student records were found in the global registry.';
      statusType = 'warning';
    } else if (!filteredStudents.length && normalizedFilterState.hasActiveCriteria) {
      statusMessage = 'No students match your filters.';
      statusType = 'warning';
    } else {
      statusMessage = normalizedFilterState.hasActiveCriteria
        ? `Page ${pagination.currentPage} of ${pagination.totalPages}. Showing ${visibleRange} of ${filteredStudents.length} matching student${filteredStudents.length === 1 ? '' : 's'}.`
        : `Page ${pagination.currentPage} of ${pagination.totalPages}. Showing ${visibleRange} of ${filteredStudents.length} student${filteredStudents.length === 1 ? '' : 's'} in the registry.`;
      statusType = filteredStudents.length ? 'success' : 'warning';
    }
  }

  return {
    filterState: normalizedFilterState,
    pagination,
    statusMessage,
    statusType
  };
};

export const buildAdminRegistryStudentDeleteFeedbackState = ({
  studentName = 'Student',
  deletedCount = 0,
  removedCount = 0
} = {}) => {
  const normalizedStudentName = normalizeDisplayText(studentName, 'Student');
  const normalizedDeletedCount = Math.max(0, Number.parseInt(deletedCount, 10) || 0);
  const normalizedRemovedCount = Math.max(0, Number.parseInt(removedCount, 10) || 0);

  if (normalizedDeletedCount > 0) {
    return {
      statusMessage: `${normalizedStudentName} was removed from the registry.`,
      statusType: 'success',
      toastMessage: 'Student removed from registry',
      toastType: 'success',
      shouldMarkUpdated: true
    };
  }

  if (normalizedRemovedCount > 0) {
    return {
      statusMessage: `${normalizedStudentName} was already cleared, so the registry view was refreshed.`,
      statusType: 'warning',
      toastMessage: 'Registry refreshed',
      toastType: 'warning',
      shouldMarkUpdated: true
    };
  }

  return {
    statusMessage: 'No matching active student records were found for that registry entry.',
    statusType: 'warning',
    toastMessage: 'Student record not found',
    toastType: 'warning',
    shouldMarkUpdated: false
  };
};

export const buildAdminRegistryStudentDeleteRequestState = ({
  ownerId = '',
  studentId = '',
  studentName = '',
  canDelete = false
} = {}) => {
  const normalizedOwnerId = normalizeDisplayText(ownerId, '');
  const normalizedStudentId = normalizeDisplayText(studentId, '');
  const normalizedStudentName = normalizeDisplayText(studentName, 'Student');

  if (!canDelete) {
    return {
      normalizedOwnerId,
      normalizedStudentId,
      normalizedStudentName,
      canSubmitDelete: false,
      statusMessage: 'Only admins and developers can delete registry students.',
      statusType: 'warning',
      toastMessage: 'Student deletion unavailable',
      toastType: 'warning',
      confirmationMessage: ''
    };
  }

  if (!normalizedOwnerId || !normalizedStudentId) {
    return {
      normalizedOwnerId,
      normalizedStudentId,
      normalizedStudentName,
      canSubmitDelete: false,
      statusMessage: 'The selected registry row is missing the student identity needed for deletion.',
      statusType: 'warning',
      toastMessage: 'Student cannot be deleted from registry',
      toastType: 'warning',
      confirmationMessage: ''
    };
  }

  return {
    normalizedOwnerId,
    normalizedStudentId,
    normalizedStudentName,
    canSubmitDelete: true,
    statusMessage: '',
    statusType: '',
    toastMessage: '',
    toastType: '',
    confirmationMessage: `Delete ${normalizedStudentName} from the registry? This moves every matching active student record for that teacher into Trash.`
  };
};
