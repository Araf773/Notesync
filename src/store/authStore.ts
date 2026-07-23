/**
 * Auth store (Zustand).
 *
 * Holds the current user + auth status and owns the wiring between Firebase auth
 * state and the sync session. Components read `user`/`status`; they call the
 * action creators to sign in/out.
 */
import { create } from 'zustand';
import {
  watchAuth,
  signInWithGoogle as svcGoogle,
  signInWithEmail as svcEmail,
  signUpWithEmail as svcSignUp,
  signOut as svcSignOut,
  type AuthUser,
} from '@/lib/auth';
import { isFirebaseConfigured } from '@/lib/firebase';
import { syncSession } from '@/sync/session';
import { updateSettings } from '@/data/db';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  /** Whether cloud features are even available in this build/config. */
  cloudAvailable: boolean;
  error: string | null;
  setUser: (user: AuthUser | null) => void;
  setError: (error: string | null) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: isFirebaseConfigured ? 'loading' : 'signed-out',
  cloudAvailable: isFirebaseConfigured,
  error: null,

  setUser: (user) => {
    set({ user, status: user ? 'signed-in' : 'signed-out', error: null });
    if (user) {
      syncSession.start(user.uid);
      void updateSettings({ lastUid: user.uid });
    } else {
      syncSession.stop();
    }
  },

  setError: (error) => set({ error }),

  signInWithGoogle: async () => {
    set({ error: null });
    await svcGoogle();
    // watchAuth will fire and call setUser.
  },

  signInWithEmail: async (email, password) => {
    set({ error: null });
    await svcEmail(email, password);
  },

  signUp: async (email, password, name) => {
    set({ error: null });
    await svcSignUp(email, password, name);
  },

  signOut: async () => {
    await svcSignOut();
    set({ user: null, status: 'signed-out' });
    syncSession.stop();
  },
}));

/** Wire Firebase auth-state changes into the store. Call once at app boot. */
export function initAuthListener(): () => void {
  return watchAuth((user) => {
    useAuthStore.getState().setUser(user);
  });
}
