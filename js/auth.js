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
const USER_ROLES = ['teacher', 'admin', 'developer'];
const DEFAULT_USER_ROLE = 'teacher';

export const normalizeUserRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  return USER_ROLES.includes(normalized) ? normalized : DEFAULT_USER_ROLE;
};

const getUserProfileRef = (uid) => doc(db, 'users', String(uid || '').trim());

const sanitizeProfilePayload = (authUser) => ({
  role: DEFAULT_USER_ROLE,
  name: normalizeName(authUser?.name),
  email: normalizeEmail(authUser?.email),
  createdAt: serverTimestamp()
});

const ensureUserProfileDocument = async (authUser) => {
  const uid = String(authUser?.uid || '').trim();
  if (!uid || !isFirebaseConfigured || !db) {
    return {
      role: DEFAULT_USER_ROLE,
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
      role: DEFAULT_USER_ROLE,
      name: payload.name,
      email: payload.email
    };
  }

  const data = profileSnapshot.data() || {};
  const normalizedRole = normalizeUserRole(data.role);
  const normalizedName = normalizeName(data.name || authUser?.name);
  const normalizedEmail = normalizeEmail(data.email || authUser?.email);

  const patch = {};
  if (normalizeName(data.name) !== normalizedName) {
    patch.name = normalizedName;
  }
  if (normalizeEmail(data.email) !== normalizedEmail) {
    patch.email = normalizedEmail;
  }
  if (!('role' in data)) {
    patch.role = DEFAULT_USER_ROLE;
  }

  if (Object.keys(patch).length) {
    await setDoc(profileRef, patch, { merge: true });
  }

  return {
    role: normalizedRole,
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
    console.error('Failed to resolve user role. Falling back to teacher:', error);
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
