/**
 * Authentication service — thin wrapper over Firebase Auth.
 *
 * Supports Google OAuth and email/password. Sessions are persistent
 * (browserLocalPersistence, set in firebase.ts) so the user stays signed in
 * across reloads and app restarts until they explicitly sign out.
 *
 * Every method degrades gracefully when Firebase is unconfigured: it throws a
 * clear, user-presentable error rather than a cryptic Firebase internal one, so
 * the UI can show "cloud sync isn't set up" instead of crashing.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

function toAuthUser(u: User): AuthUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL };
}

export class CloudNotConfiguredError extends Error {
  constructor() {
    super(
      'Cloud sync is not configured. Add your Firebase keys to .env to enable sign-in and multi-device sync. The app works offline without it.',
    );
    this.name = 'CloudNotConfiguredError';
  }
}

function ensureConfigured(): void {
  if (!isFirebaseConfigured) throw new CloudNotConfiguredError();
}

/** Map raw Firebase error codes to friendly messages. */
export function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists with that email.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }
}

export async function signInWithGoogle(): Promise<AuthUser> {
  ensureConfigured();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(getFirebaseAuth(), provider);
  return toAuthUser(cred.user);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  ensureConfigured();
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return toAuthUser(cred.user);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  ensureConfigured();
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
  return toAuthUser(cred.user);
}

export async function signOut(): Promise<void> {
  if (!isFirebaseConfigured) return;
  await fbSignOut(getFirebaseAuth());
}

/**
 * Subscribe to auth-state changes. Fires immediately with the current user (or
 * null). Returns an unsubscribe fn. No-op (fires null once) when unconfigured.
 */
export function watchAuth(cb: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseConfigured) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), (u) => cb(u ? toAuthUser(u) : null));
}
