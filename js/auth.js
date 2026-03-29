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
  updateProfile
} from './firebase.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeName = (name) => String(name || '').trim();
const DEVELOPER_EMAIL = 'pokumike2@gmail.com';
const ROLE_TEACHER = 'teacher';
const LEGACY_ROLE_USER = 'user';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const USER_ROLES = [ROLE_TEACHER, ROLE_ADMIN, ROLE_DEVELOPER, LEGACY_ROLE_USER];
const DEFAULT_USER_ROLE = ROLE_TEACHER;
const ACCOUNT_STATUS_ACTIVE = 'active';
const ACCOUNT_STATUS_SUSPENDED = 'suspended';
const ACCOUNT_STATUS_DELETED = 'deleted';

export const isDeveloperAccountEmail = (email) => normalizeEmail(email) === DEVELOPER_EMAIL;
export const normalizeAccountStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === ACCOUNT_STATUS_SUSPENDED) return ACCOUNT_STATUS_SUSPENDED;
  if (normalized === ACCOUNT_STATUS_DELETED) return ACCOUNT_STATUS_DELETED;
  return ACCOUNT_STATUS_ACTIVE;
};

export const normalizeUserRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === LEGACY_ROLE_USER) {
    return ROLE_TEACHER;
  }
  return USER_ROLES.includes(normalized) ? normalized : DEFAULT_USER_ROLE;
};

const getUserProfileRef = (uid) => doc(db, 'users', String(uid || '').trim());

const resolveProfileRole = (authUser, existingRole = '') => {
  const resolvedEmail = String(authUser?.email || auth?.currentUser?.email || '').trim();
  if (isDeveloperAccountEmail(resolvedEmail)) {
    return ROLE_DEVELOPER;
  }

  const normalizedExistingRole = normalizeUserRole(existingRole);
  if (normalizedExistingRole === ROLE_ADMIN) {
    return ROLE_ADMIN;
  }

  return ROLE_TEACHER;
};

const sanitizeProfilePayload = (authUser, existingRole = '') => ({
  uid: String(authUser?.uid || '').trim(),
  role: resolveProfileRole(authUser, existingRole),
  name: normalizeName(authUser?.name),
  email: normalizeEmail(authUser?.email),
  accountStatus: ACCOUNT_STATUS_ACTIVE,
  suspendedAt: null,
  deletedAt: null,
  createdAt: serverTimestamp()
});

const createAccountStateError = (status = ACCOUNT_STATUS_SUSPENDED) => {
  const normalizedStatus = normalizeAccountStatus(status);
  const error = new Error(
    normalizedStatus === ACCOUNT_STATUS_DELETED
      ? 'This account has been deleted. Contact an administrator.'
      : 'This account has been suspended. Contact an administrator.'
  );
  error.code = normalizedStatus === ACCOUNT_STATUS_DELETED ? 'auth/account-deleted' : 'auth/account-suspended';
  return error;
};

const isBlockedAccountError = (error) => {
  const code = String(error?.code || '').trim().toLowerCase();
  return code.includes('account-suspended') || code.includes('account-deleted') || code.includes('user-disabled');
};

const assertAccountAccess = async (profile = {}) => {
  const normalizedStatus = normalizeAccountStatus(profile?.accountStatus || (profile?.deletedAt ? ACCOUNT_STATUS_DELETED : ''));
  if (normalizedStatus === ACCOUNT_STATUS_ACTIVE) {
    return normalizedStatus;
  }

  if (auth?.currentUser) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Failed to sign out blocked account:', error);
    }
  }

  throw createAccountStateError(normalizedStatus);
};

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
      name: normalizeName(authUser?.name),
      email: normalizedEmail
    };
  }

  const profileRef = getUserProfileRef(uid);
  const profileSnapshot = await getDoc(profileRef);

  if (!profileSnapshot.exists()) {
    const payload = sanitizeProfilePayload({
      uid,
      name: normalizeName(authUser?.name),
      email: normalizedEmail
    });
    await setDoc(profileRef, payload, { merge: true });
    console.log('Firestore role:', undefined);
    console.log('Assigned role:', payload.role);
    console.log('Final role:', payload.role);
    return {
      uid,
      role: payload.role,
      name: payload.name,
      email: payload.email
    };
  }

  const data = profileSnapshot.data() || {};
  console.log('Firestore role:', data.role);
  const normalizedName = normalizeName(data.name || authUser?.name);
  const profileEmail = normalizeEmail(data.email || '');
  const resolvedEmailForProfile = normalizedEmail || profileEmail;
  const resolvedAccountStatus = normalizeAccountStatus(data.accountStatus || (data.deletedAt ? ACCOUNT_STATUS_DELETED : ''));
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
  if (normalizeName(data.name) !== normalizedName) {
    patch.name = normalizedName;
  }
  if (normalizeEmail(data.email) !== resolvedEmailForProfile) {
    patch.email = resolvedEmailForProfile;
  }
  if (String(data.role || '').trim().toLowerCase() !== resolvedRole) {
    patch.role = resolvedRole;
  }
  if (normalizeAccountStatus(data.accountStatus || (data.deletedAt ? ACCOUNT_STATUS_DELETED : '')) !== resolvedAccountStatus) {
    patch.accountStatus = resolvedAccountStatus;
  }

  await assertAccountAccess({
    uid,
    accountStatus: resolvedAccountStatus,
    deletedAt: data.deletedAt || null
  });

  if (Object.keys(patch).length) {
    await setDoc(profileRef, patch, { merge: true });
  }

  console.log('Assigned role:', resolvedRole);
  console.log('Final role:', resolvedRole);

  return {
    uid,
    role: resolvedRole,
    name: normalizedName,
    email: resolvedEmailForProfile,
    accountStatus: resolvedAccountStatus,
    createdAt: data.createdAt || null
  };
};

export const resolveUserRole = async (authUser) => {
  const resolvedEmail = normalizeEmail(authUser?.email || auth?.currentUser?.email);
  const isDeveloperEmail = isDeveloperAccountEmail(resolvedEmail);

  try {
    const profile = await ensureUserProfileDocument(authUser);
    const normalizedRole = normalizeUserRole(profile?.role);
    if (isDeveloperEmail) {
      return ROLE_DEVELOPER;
    }
    return normalizedRole;
  } catch (error) {
    if (isBlockedAccountError(error)) {
      throw error;
    }
    console.error('Failed to resolve user role. Falling back to teacher:', error);
    if (isDeveloperEmail) {
      console.log('Assigned role:', ROLE_DEVELOPER);
      return ROLE_DEVELOPER;
    }
    return DEFAULT_USER_ROLE;
  }
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

export const formatAuthError = (error) => {
  const code = String(error?.code || '').toLowerCase();

  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('missing-password')) return 'Please enter your password.';
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (code.includes('email-already-in-use')) return 'This email is already in use.';
  if (code.includes('user-not-found')) return 'No account found for this email.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Invalid email or password.';
  if (code.includes('account-suspended') || code.includes('user-disabled')) return 'Your account has been suspended. Contact an administrator.';
  if (code.includes('account-deleted')) return 'Your account has been deleted. Contact an administrator.';
  if (code.includes('permission-denied')) return 'Access denied. You don\'t have permission.';
  if (code.includes('network-request-failed')) return 'Network error. Please check your internet connection.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';

  return error?.message || 'Authentication failed. Please try again.';
};

export const waitForInitialAuthState = async () => {
  await authReadyPromise;

  if (!auth) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(toAuthUser(user));
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
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
  await ensureUserProfileDocument(nextAuthUser);
  return nextAuthUser;
};

export const loginUser = async ({ email, password }) => {
  if (!auth) {
    throw new Error('Authentication service is unavailable.');
  }

  const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  const nextAuthUser = toAuthUser(credential.user);
  await ensureUserProfileDocument(nextAuthUser);
  return nextAuthUser;
};

export const logoutUser = async () => {
  if (!auth) return;
  await signOut(auth);
};
