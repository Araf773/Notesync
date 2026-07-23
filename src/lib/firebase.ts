/**
 * Firebase initialization.
 *
 * All config comes from Vite env vars (VITE_FIREBASE_*), which are loaded from
 * `.env` (git-ignored). See `.env.example` for the required keys and the README
 * for how to obtain them from the Firebase console.
 *
 * IMPORTANT: the app is designed to run **fully offline without Firebase**. If
 * the config is absent (e.g. you haven't set up a project yet), `isFirebaseConfigured`
 * is false, `initFirebase()` is a no-op, and the app still works against the local
 * Dexie/Yjs layer. Cloud sync simply stays dormant until config is provided.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** True only when the minimum required keys are present. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId &&
    firebaseConfig.authDomain,
);

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let storageInstance: FirebaseStorage | undefined;

/** Initialize Firebase once. Safe to call repeatedly; no-op if unconfigured. */
export function initFirebase(): void {
  if (!isFirebaseConfigured || app) return;

  app = initializeApp(firebaseConfig);

  authInstance = getAuth(app);
  // Persistent session: user stays signed in across reloads until explicit sign-out.
  void setPersistence(authInstance, browserLocalPersistence);

  // Firestore with its own persistent cache + multi-tab coordination. This is
  // separate from our Dexie/Yjs layer; it smooths Firestore's own reconnection.
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  storageInstance = getStorage(app);
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) throw new Error('Firebase Auth not initialized. Call initFirebase() first.');
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) throw new Error('Firestore not initialized. Call initFirebase() first.');
  return dbInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) throw new Error('Firebase Storage not initialized. Call initFirebase() first.');
  return storageInstance;
}

/** Non-throwing accessors for code paths that must tolerate the unconfigured state. */
export const maybeDb = (): Firestore | undefined => dbInstance;
export const maybeAuth = (): Auth | undefined => authInstance;
