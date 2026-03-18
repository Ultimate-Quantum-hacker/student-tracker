/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — firebase.js
   Firebase v9 modular SDK setup and initialization.
   ═══════════════════════════════════════════════ */

// Import Firebase SDK modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "your-api-key-here",
  authDomain: "your-project-id.firebaseapp.com", 
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};

// Check if Firebase is properly configured
const isFirebaseConfigured = firebaseConfig.apiKey && 
                           firebaseConfig.apiKey !== "your-api-key-here" && 
                           firebaseConfig.projectId && 
                           firebaseConfig.projectId !== "your-project-id";

let app, db;

if (isFirebaseConfigured) {
  try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    // Initialize Firestore
    db = getFirestore(app);
    console.log("Firebase initialized successfully with real configuration");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    isFirebaseConfigured = false;
  }
}

if (!isFirebaseConfigured) {
  console.warn("Firebase not configured - using fallback mode");
  // Create mock Firebase objects for fallback
  app = { name: "mock-app" };
  db = null;
}

// Export Firebase modules for reuse
export {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot
};

// Export app instance and db for potential future use
export { app };
export { db };

// Export configuration status
export { isFirebaseConfigured };

console.log("Firebase module loaded -", isFirebaseConfigured ? "configured" : "fallback mode");
