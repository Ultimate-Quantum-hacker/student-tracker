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
const ROLE_USER = 'user';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const LEGACY_ROLE_TEACHER = 'teacher';
const USER_ROLES = [ROLE_USER, ROLE_ADMIN, ROLE_DEVELOPER, LEGACY_ROLE_TEACHER];
const DEFAULT_USER_ROLE = ROLE_USER;

export const isDeveloperAccountEmail = (email) => normalizeEmail(email) === DEVELOPER_EMAIL;

export const normalizeUserRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === LEGACY_ROLE_TEACHER) {
    return ROLE_USER;
  }
  return USER_ROLES.includes(normalized) ? normalized : DEFAULT_USER_ROLE;
};

const getUserProfileRef = (uid) => doc(db, 'users', String(uid || '').trim());

const resolveProfileRole = (authUser, existingRole = '') => {
  if (isDeveloperAccountEmail(authUser?.email)) {
    return ROLE_DEVELOPER;
  }

  const normalizedExistingRole = normalizeUserRole(existingRole);
  if (normalizedExistingRole === ROLE_ADMIN) {
    return ROLE_ADMIN;
  }

  return ROLE_USER;
};

const sanitizeProfilePayload = (authUser, existingRole = '') => ({
  uid: String(authUser?.uid || '').trim(),
  role: resolveProfileRole(authUser, existingRole),
  name: normalizeName(authUser?.name),
  email: normalizeEmail(authUser?.email),
  createdAt: serverTimestamp()
});

const ensureUserProfileDocument = async (authUser) => {
  const uid = String(authUser?.uid || '').trim();
  if (!uid || !isFirebaseConfigured || !db) {
    return {
      uid,
      role: resolveProfileRole(authUser),
      name: normalizeName(authUser?.name),
      email: normalizeEmail(authUser?.email)
    };
  }

  const profileRef = getUserProfileRef(uid);
  const profileSnapshot = await getDoc(profileRef);

  if (!profileSnapshot.exists()) {
    const payload = sanitizeProfilePayload(authUser);
    await setDoc(profileRef, payload, { merge: true });
    return {
      uid,
      role: payload.role,
      name: payload.name,
      email: payload.email
    };
  }

  const data = profileSnapshot.data() || {};
  const normalizedName = normalizeName(data.name || authUser?.name);
  const normalizedEmail = normalizeEmail(data.email || authUser?.email);
  const resolvedRole = resolveProfileRole(
    {
      uid,
      name: normalizedName,
      email: normalizedEmail
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
  if (normalizeEmail(data.email) !== normalizedEmail) {
    patch.email = normalizedEmail;
  }
  if (String(data.role || '').trim().toLowerCase() !== resolvedRole) {
    patch.role = resolvedRole;
  }

  if (Object.keys(patch).length) {
    await setDoc(profileRef, patch, { merge: true });
  }

  return {
    uid,
    role: resolvedRole,
    name: normalizedName,
    email: normalizedEmail,
    createdAt: data.createdAt || null
  };
};

export const resolveUserRole = async (authUser) => {
  try {
    const profile = await ensureUserProfileDocument(authUser);
    return normalizeUserRole(profile?.role);
  } catch (error) {
    console.error('Failed to resolve user role. Falling back to user:', error);
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

export const logoutUser = async () => {
  if (!auth) return;
  await signOut(auth);
};
