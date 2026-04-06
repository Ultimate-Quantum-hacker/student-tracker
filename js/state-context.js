const CURRENT_CLASS_STORAGE_KEY = 'currentClassId';
const CURRENT_CLASS_OWNER_STORAGE_KEY = 'currentClassOwnerId';
export const ROLE_TEACHER = 'teacher';
export const ROLE_LEGACY_USER = 'user';
export const ROLE_ADMIN = 'admin';
export const ROLE_DEVELOPER = 'developer';
const ALLOWED_ROLES = [ROLE_TEACHER, ROLE_ADMIN, ROLE_DEVELOPER, ROLE_LEGACY_USER];

export const normalizeClassStorageId = (value) => String(value || '').trim();

export const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === ROLE_LEGACY_USER) {
    return ROLE_TEACHER;
  }
  return ALLOWED_ROLES.includes(normalized) ? normalized : ROLE_TEACHER;
};

export const resolveCurrentClassEntry = (state = {}) => {
  const currentClassId = String(state.currentClassId || '').trim();
  const currentOwnerId = String(state.currentClassOwnerId || '').trim();
  const classes = Array.isArray(state.classes) ? state.classes : [];
  if (!currentClassId || !classes.length) {
    return null;
  }

  const ownerAwareMatch = classes.find((entry) => {
    const entryClassId = String(entry?.id || '').trim();
    const entryOwnerId = String(entry?.ownerId || '').trim();
    if (entryClassId !== currentClassId) {
      return false;
    }
    if (!currentOwnerId) {
      return true;
    }
    return entryOwnerId === currentOwnerId;
  });

  if (ownerAwareMatch) {
    return ownerAwareMatch;
  }

  return classes.find((entry) => String(entry?.id || '').trim() === currentClassId) || null;
};

export const getAuthenticatedOwnerFallback = (state = {}) => String(state.authUser?.uid || '').trim();

export const persistCurrentClassContext = (classId, ownerId = '') => {
  const normalizedClassId = normalizeClassStorageId(classId);
  const normalizedOwnerId = normalizeClassStorageId(ownerId);
  if (typeof localStorage !== 'undefined') {
    if (normalizedClassId) {
      localStorage.setItem(CURRENT_CLASS_STORAGE_KEY, normalizedClassId);
    } else {
      localStorage.removeItem(CURRENT_CLASS_STORAGE_KEY);
    }

    if (normalizedOwnerId) {
      localStorage.setItem(CURRENT_CLASS_OWNER_STORAGE_KEY, normalizedOwnerId);
    } else {
      localStorage.removeItem(CURRENT_CLASS_OWNER_STORAGE_KEY);
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    if (normalizedClassId) {
      sessionStorage.setItem(CURRENT_CLASS_STORAGE_KEY, normalizedClassId);
    } else {
      sessionStorage.removeItem(CURRENT_CLASS_STORAGE_KEY);
    }

    if (normalizedOwnerId) {
      sessionStorage.setItem(CURRENT_CLASS_OWNER_STORAGE_KEY, normalizedOwnerId);
    } else {
      sessionStorage.removeItem(CURRENT_CLASS_OWNER_STORAGE_KEY);
    }
  }
};

export const readPersistedCurrentClassContext = () => {
  const localValue = typeof localStorage !== 'undefined'
    ? normalizeClassStorageId(localStorage.getItem(CURRENT_CLASS_STORAGE_KEY))
    : '';
  const localOwner = typeof localStorage !== 'undefined'
    ? normalizeClassStorageId(localStorage.getItem(CURRENT_CLASS_OWNER_STORAGE_KEY))
    : '';
  if (localValue) {
    return {
      classId: localValue,
      ownerId: localOwner
    };
  }

  const sessionClassId = typeof sessionStorage !== 'undefined'
    ? normalizeClassStorageId(sessionStorage.getItem(CURRENT_CLASS_STORAGE_KEY))
    : '';
  const sessionOwnerId = typeof sessionStorage !== 'undefined'
    ? normalizeClassStorageId(sessionStorage.getItem(CURRENT_CLASS_OWNER_STORAGE_KEY))
    : '';

  return {
    classId: sessionClassId,
    ownerId: sessionOwnerId
  };
};

export const resolveValidatedClassContext = (classes = [], classId = '', ownerId = '') => {
  const normalizedClassId = normalizeClassStorageId(classId);
  const normalizedOwnerId = normalizeClassStorageId(ownerId);
  const normalizedClasses = Array.isArray(classes)
    ? classes.filter((entry) => normalizeClassStorageId(entry?.id))
    : [];

  if (!normalizedClasses.length) {
    return {
      classId: '',
      className: 'My Class',
      ownerId: '',
      ownerName: 'Teacher',
      isFallback: Boolean(normalizedClassId || normalizedOwnerId)
    };
  }

  const selectedClass = normalizedClasses.find((entry) => {
    const entryClassId = normalizeClassStorageId(entry?.id);
    const entryOwnerId = normalizeClassStorageId(entry?.ownerId);
    if (!entryClassId || entryClassId !== normalizedClassId) {
      return false;
    }
    if (!normalizedOwnerId) {
      return true;
    }
    return entryOwnerId === normalizedOwnerId;
  });

  const fallbackClass = normalizedClasses[0] || null;
  const activeClass = selectedClass || fallbackClass;

  return {
    classId: normalizeClassStorageId(activeClass?.id),
    className: String(activeClass?.name || '').trim() || 'My Class',
    ownerId: normalizeClassStorageId(activeClass?.ownerId),
    ownerName: String(activeClass?.ownerName || '').trim() || 'Teacher',
    isFallback: Boolean(!selectedClass && (normalizedClassId || normalizedOwnerId))
  };
};

export const normalizeClassCatalogEntries = (classes = []) => {
  if (!Array.isArray(classes)) {
    return [];
  }

  return classes
    .map((entry) => {
      const id = normalizeClassStorageId(entry?.id);
      const ownerId = normalizeClassStorageId(entry?.ownerId);
      const name = String(entry?.name || '').trim() || 'My Class';
      const ownerName = String(entry?.ownerName || '').trim() || 'Teacher';
      if (!id || !ownerId || !name) {
        return null;
      }

      return {
        ...(entry || {}),
        id,
        ownerId,
        name,
        ownerName
      };
    })
    .filter(Boolean);
};

export const createStateContextApi = (app, dataService) => {
  const api = {
    getCurrentUserRole() {
      return normalizeRole(app.state.currentUserRole);
    },

    setCurrentUserRole(role, { resolved = true } = {}) {
      app.state.currentUserRole = normalizeRole(role);
      app.state.isRoleResolved = Boolean(resolved);
      if (typeof dataService.setCurrentUserRoleContext === 'function') {
        dataService.setCurrentUserRoleContext(app.state.currentUserRole);
      }
      console.log('ROLE:', app.state.currentUserRole);
      console.log('CAN WRITE:', app.state.currentUserRole !== ROLE_ADMIN);
    },

    getCurrentClassOwnerId() {
      const classEntry = resolveCurrentClassEntry(app.state);
      const ownerId = String(classEntry?.ownerId || '').trim();
      if (ownerId) {
        app.state.currentClassOwnerId = ownerId;
        return ownerId;
      }
      const fallbackOwnerId = String(app.state.currentClassOwnerId || '').trim() || getAuthenticatedOwnerFallback(app.state);
      if (fallbackOwnerId) {
        app.state.currentClassOwnerId = fallbackOwnerId;
      }
      return fallbackOwnerId;
    },

    getCurrentClassOwnerName() {
      const classEntry = resolveCurrentClassEntry(app.state);
      const ownerName = String(classEntry?.ownerName || '').trim();
      if (ownerName) {
        app.state.currentClassOwnerName = ownerName;
        return ownerName;
      }

      return String(app.state.currentClassOwnerName || '').trim() || 'Teacher';
    },

    setCurrentClassOwnerContext() {
      const ownerId = api.getCurrentClassOwnerId();
      const ownerName = api.getCurrentClassOwnerName();
      if (typeof dataService.setCurrentClassOwnerContext === 'function') {
        dataService.setCurrentClassOwnerContext(ownerId, ownerName);
      }
      return { ownerId, ownerName };
    },

    syncDataContext() {
      const classEntry = resolveCurrentClassEntry(app.state);
      app.state.currentClassOwnerId = String(classEntry?.ownerId || app.state.currentClassOwnerId || getAuthenticatedOwnerFallback(app.state) || '').trim();
      app.state.currentClassOwnerName = String(classEntry?.ownerName || app.state.currentClassOwnerName || '').trim() || 'Teacher';

      if (typeof dataService.setCurrentClassId === 'function') {
        dataService.setCurrentClassId(app.state.currentClassId || '');
      }
      api.setCurrentClassOwnerContext();
      persistCurrentClassContext(app.state.currentClassId, app.state.currentClassOwnerId);
    },

    getEffectiveUserId() {
      return api.getCurrentClassOwnerId();
    },

    canCurrentRoleWrite() {
      return api.getCurrentUserRole() !== ROLE_ADMIN;
    },

    isReadOnlyRoleContext() {
      return Boolean(app.state.isRoleResolved) && !api.canCurrentRoleWrite();
    },

    clearCurrentUserRole() {
      app.state.currentUserRole = ROLE_TEACHER;
      app.state.isRoleResolved = false;
    },

    isTeacherRole() {
      return api.getCurrentUserRole() === ROLE_TEACHER;
    },

    isAdminRole() {
      return api.getCurrentUserRole() === ROLE_ADMIN;
    },

    isDeveloperRole() {
      return api.getCurrentUserRole() === ROLE_DEVELOPER;
    }
  };

  return api;
};
