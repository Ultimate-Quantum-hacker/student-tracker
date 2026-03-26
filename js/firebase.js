/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — firebase.js
   Firebase v9 modular SDK setup and initialization.
   ═══════════════════════════════════════════════ */

// Import Firebase SDK modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, collectionGroup, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Firebase configuration
const PLACEHOLDER_FIREBASE_CONFIG = {
  apiKey: "your-api-key-here",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};

const REQUIRED_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

const getRuntimeFirebaseConfig = () => {
  if (typeof window === 'undefined') return null;
  const runtimeConfig = window.__FIREBASE_CONFIG__ || window.firebaseConfig || null;
  return runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig : null;
};

const runtimeFirebaseConfig = getRuntimeFirebaseConfig();
const firebaseConfig = runtimeFirebaseConfig
  ? { ...runtimeFirebaseConfig }
  : null;

console.log('Firebase config:', runtimeFirebaseConfig || null);

const looksLikePlaceholder = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return true;

  const lower = normalized.toLowerCase();
  if (lower.includes('your-') || lower.includes('your_project') || lower.includes('your project')) {
    return true;
  }

  return Object.values(PLACEHOLDER_FIREBASE_CONFIG).includes(normalized);
};

// Check if Firebase is properly configured
let isFirebaseConfigured = Boolean(firebaseConfig)
  && REQUIRED_CONFIG_KEYS.every((key) => !looksLikePlaceholder(firebaseConfig[key]));

if (!isFirebaseConfigured) {
  console.error('Firebase config is missing or uses placeholder values. Provide real credentials in window.__FIREBASE_CONFIG__ (or window.firebaseConfig) before app bootstrap, or update js/firebase.js directly.');
}

let app, db;
let auth = null;
let authReadyPromise = Promise.resolve(null);

if (isFirebaseConfigured) {
  try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    // Initialize Firestore
    db = getFirestore(app);
    if (!db) {
      throw new Error('Firestore initialization returned null');
    }

    auth = getAuth(app);
    authReadyPromise = setPersistence(auth, browserLocalPersistence)
      .then(() => auth)
      .catch((error) => {
        console.error('Failed to set auth persistence:', error);
        return auth;
      });

    console.log("Firebase initialized successfully with real configuration");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    isFirebaseConfigured = false;
  }
}

console.log('Firebase initialized:', !!db);

if (!isFirebaseConfigured) {
  console.warn("Firebase not configured - Firestore sync disabled; fallback mode enabled");
  // Create mock Firebase objects for fallback
  app = { name: "mock-app" };
  db = null;
  auth = null;
  authReadyPromise = Promise.resolve(null);
}

// Export Firebase modules for reuse
export {
  collection,
  collectionGroup,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
};

// Export app instance and db for potential future use
export { app };
export { db };
export { auth };
export { authReadyPromise };

// Export configuration status
export { isFirebaseConfigured };

console.log("Firebase module loaded -", isFirebaseConfigured ? "configured" : "fallback mode");
