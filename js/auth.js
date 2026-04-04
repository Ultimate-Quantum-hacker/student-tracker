import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  isFirebaseConfigured,
  authReadyPromise,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from './firebase.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeName = (name) => String(name || '').trim();
const ROLE_TEACHER = 'teacher';
const LEGACY_ROLE_USER = 'user';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const USER_ROLES = [ROLE_TEACHER, ROLE_ADMIN, ROLE_DEVELOPER, LEGACY_ROLE_USER];
const DEFAULT_USER_ROLE = ROLE_TEACHER;
const INITIAL_AUTH_STATE_TIMEOUT_MS = 10000;
const PROFILE_RESOLUTION_TIMEOUT_MS = 10000;
const PROFILE_NAME_MAX_LENGTH = 80;

const createTimeoutError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export const normalizeUserRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === LEGACY_ROLE_USER) {
    return ROLE_TEACHER;
  }
  return USER_ROLES.includes(normalized) ? normalized : DEFAULT_USER_ROLE;
};

const normalizeProfileName = (name) => normalizeName(String(name || '').slice(0, PROFILE_NAME_MAX_LENGTH));

const normalizeProfileRecord = (profile = {}, fallback = {}) => ({
  uid: String(profile?.uid || fallback?.uid || '').trim(),
  role: normalizeUserRole(profile?.role || fallback?.role),
  name: normalizeProfileName(profile?.name ?? fallback?.name),
  email: normalizeEmail(profile?.email ?? fallback?.email),
  createdAt: profile?.createdAt ?? fallback?.createdAt ?? null,
  updatedAt: profile?.updatedAt ?? fallback?.updatedAt ?? null
});

const getUserProfileRef = (uid) => doc(db, 'users', String(uid || '').trim());

const resolveProfileRole = (_authUser, existingRole = '') => {
  const normalizedExistingRole = normalizeUserRole(existingRole);
  if (normalizedExistingRole === ROLE_ADMIN) {
    return ROLE_ADMIN;
  }
  if (normalizedExistingRole === ROLE_DEVELOPER) {
    return ROLE_DEVELOPER;
  }

  return ROLE_TEACHER;
};

const sanitizeProfilePayload = (authUser, existingRole = '') => ({
  uid: String(authUser?.uid || '').trim(),
  role: resolveProfileRole(authUser, existingRole),
  name: normalizeProfileName(authUser?.name),
  email: normalizeEmail(authUser?.email),
  createdAt: serverTimestamp()
});

const ensureUserProfileDocument = async (authUser) => {
  const uid = String(authUser?.uid || '').trim();
  const normalizedEmail = normalizeEmail(authUser?.email || auth?.currentUser?.email);

  console.log('Logged in email:', normalizedEmail || '(none)');

  if (!uid || !isFirebaseConfigured || !db) {
    const fallbackRole = resolveProfileRole(authUser);
    console.log('Firestore role:', undefined);
    console.log('Assigned role:', fallbackRole);
    console.log('Final role:', fallbackRole);
    return {
      uid,
      role: fallbackRole,
      name: normalizeProfileName(authUser?.name),
      email: normalizedEmail,
      updatedAt: null
    };
  }

  const profileRef = getUserProfileRef(uid);
  const profileSnapshot = await withTimeout(
    () => getDoc(profileRef),
    PROFILE_RESOLUTION_TIMEOUT_MS,
    'auth/profile-timeout',
    'Timed out while loading your account profile.'
  );

  if (!profileSnapshot.exists()) {
    const payload = sanitizeProfilePayload({
      uid,
      name: normalizeProfileName(authUser?.name),
      email: normalizedEmail
    });
    await withTimeout(
      () => setDoc(profileRef, payload, { merge: true }),
      PROFILE_RESOLUTION_TIMEOUT_MS,
      'auth/profile-timeout',
      'Timed out while saving your account profile.'
    );
    console.log('Firestore role:', undefined);
    console.log('Assigned role:', payload.role);
    console.log('Final role:', payload.role);
    return {
      uid,
      role: payload.role,
      name: payload.name,
      email: payload.email,
      updatedAt: null
    };
  }

  const data = profileSnapshot.data() || {};
  console.log('Firestore role:', data.role);
  const normalizedName = normalizeProfileName(data.name || authUser?.name);
  const profileEmail = normalizeEmail(data.email || '');
  const resolvedEmailForProfile = normalizedEmail || profileEmail;
  const resolvedRole = resolveProfileRole(
    {
      uid,
      name: normalizedName,
      email: resolvedEmailForProfile
    },
    data.role
  );

  const patch = {};
  if (String(data.uid || '').trim() !== uid) {
    patch.uid = uid;
  }
  if (normalizeProfileName(data.name) !== normalizedName) {
    patch.name = normalizedName;
  }
  if (normalizeEmail(data.email) !== resolvedEmailForProfile) {
    patch.email = resolvedEmailForProfile;
  }
  if (String(data.role || '').trim().toLowerCase() !== resolvedRole) {
    patch.role = resolvedRole;
  }

  if (Object.keys(patch).length) {
    await withTimeout(
      () => setDoc(profileRef, patch, { merge: true }),
      PROFILE_RESOLUTION_TIMEOUT_MS,
      'auth/profile-timeout',
      'Timed out while updating your account profile.'
    );
  }

  console.log('Assigned role:', resolvedRole);
  console.log('Final role:', resolvedRole);

  return {
    uid,
    role: resolvedRole,
    name: normalizedName,
    email: resolvedEmailForProfile,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
};

export const resolveUserAccountProfile = async (authUser) => {
  try {
    const profile = await ensureUserProfileDocument(authUser);
    return normalizeProfileRecord(profile, authUser);
  } catch (error) {
    console.error('Failed to resolve user account profile. Falling back to auth payload:', error);
    return normalizeProfileRecord({ role: DEFAULT_USER_ROLE }, authUser);
  }
};

export const resolveUserRole = async (authUser) => {
  const profile = await resolveUserAccountProfile(authUser);
  return normalizeUserRole(profile?.role);
};

export const isDeveloperRole = (role) => normalizeUserRole(role) === 'developer';
export const isAdminRole = (role) => normalizeUserRole(role) === 'admin';

const toAuthUser = (user) => {
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.displayName || '',
    email: user.email || ''
  };
};

export const isAuthAvailable = () => Boolean(auth);

export const updateCurrentUserProfile = async ({ name }) => {
  if (!auth?.currentUser) {
    throw new Error('You must be signed in to update your profile.');
  }

  const uid = String(auth.currentUser.uid || '').trim();
  const normalizedName = normalizeProfileName(name);
  const normalizedEmail = normalizeEmail(auth.currentUser.email || '');

  if (!normalizedName) {
    throw new Error('Please enter your name before saving.');
  }

  await withTimeout(
    () => updateProfile(auth.currentUser, { displayName: normalizedName }),
    PROFILE_RESOLUTION_TIMEOUT_MS,
    'auth/profile-timeout',
    'Timed out while updating your account profile.'
  );

  if (uid && isFirebaseConfigured && db) {
    await withTimeout(
      () => setDoc(
        getUserProfileRef(uid),
        {
          uid,
          name: normalizedName,
          email: normalizedEmail,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      ),
      PROFILE_RESOLUTION_TIMEOUT_MS,
      'auth/profile-timeout',
      'Timed out while saving your account profile.'
    );
  }

  return resolveUserAccountProfile({
    uid,
    name: normalizedName,
    email: normalizedEmail
  });
};

export const formatAuthError = (error) => {
  const code = String(error?.code || '').toLowerCase();

  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('missing-password')) return 'Please enter your password.';
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (code.includes('email-already-in-use')) return 'This email is already in use.';
  if (code.includes('user-not-found')) return 'No account found for this email.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Invalid email or password.';
  if (code.includes('permission-denied')) return 'Access denied. You don\'t have permission.';
  if (code.includes('network-request-failed')) return 'Network error. Please check your internet connection.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';

  return error?.message || 'Authentication failed. Please try again.';
};

export const waitForInitialAuthState = async ({ timeoutMs = INITIAL_AUTH_STATE_TIMEOUT_MS } = {}) => {
  await withTimeout(
    authReadyPromise,
    timeoutMs,
    'auth/persistence-timeout',
    'Timed out while initializing authentication.'
  );

  if (!auth) {
    return null;
  }

  if (auth.currentUser) {
    return toAuthUser(auth.currentUser);
  }

  const normalizedTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : INITIAL_AUTH_STATE_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    let unsubscribe = null;
    let shouldCleanupAfterSubscribe = false;

    const cleanup = () => {
      if (typeof unsubscribe === 'function') {
        const activeUnsubscribe = unsubscribe;
        unsubscribe = null;
        activeUnsubscribe();
        return;
      }
      shouldCleanupAfterSubscribe = true;
    };

    const finish = (resolver, value) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      cleanup();
      resolver(value);
    };

    timeoutId = globalThis.setTimeout(() => {
      const fallbackUser = auth.currentUser ? toAuthUser(auth.currentUser) : null;
      if (fallbackUser) {
        finish(resolve, fallbackUser);
        return;
      }
      finish(reject, createTimeoutError('auth/state-timeout', 'Timed out while resolving your sign-in state.'));
    }, normalizedTimeoutMs);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        finish(resolve, toAuthUser(user));
      },
      (error) => {
        finish(reject, error);
      }
    );

    if (shouldCleanupAfterSubscribe) {
      cleanup();
    }
  });
};

export const subscribeAuthState = (callback) => {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    callback(toAuthUser(user));
  });
};

export const registerUser = async ({ name, email, password }) => {
  if (!auth) {
    throw new Error('Authentication service is unavailable.');
  }

  const credential = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);

  if (credential?.user && String(name || '').trim()) {
    await updateProfile(credential.user, { displayName: String(name).trim() });
  }

  const nextAuthUser = toAuthUser(credential.user);
  try {
    await ensureUserProfileDocument(nextAuthUser);
  } catch (error) {
    console.error('Failed to initialize user profile during signup:', error);
  }
  return nextAuthUser;
};

export const loginUser = async ({ email, password }) => {
  if (!auth) {
    throw new Error('Authentication service is unavailable.');
  }

  const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  const nextAuthUser = toAuthUser(credential.user);
  try {
    await ensureUserProfileDocument(nextAuthUser);
  } catch (error) {
    console.error('Failed to initialize user profile during login:', error);
  }
  return nextAuthUser;
};

export const requestPasswordReset = async (email) => {
  if (!auth) {
    throw new Error('Authentication service is unavailable.');
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Please enter your email address first.');
  }

  try {
    await sendPasswordResetEmail(auth, normalizedEmail);
  } catch (error) {
    const code = String(error?.code || '').toLowerCase();
    if (code.includes('user-not-found')) {
      return;
    }
    throw error;
  }
};

export const logoutUser = async () => {
  if (!auth) return;
  await signOut(auth);
};
