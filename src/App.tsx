/**
 * App shell.
 *
 * Boots settings + auth, then routes between the auth screen and the main
 * workspace. The workspace is a sidebar + content area; content is either the
 * dashboard or the open note's editor. On small screens the sidebar becomes a
 * slide-over. All note data flows reactively from Dexie, so the UI stays in sync
 * with both local edits and remote changes with no manual refresh.
 */
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Dashboard } from '@/components/notes/Dashboard';
import { EditorScreen } from '@/components/editor/EditorScreen';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useAuthStore, initAuthListener } from '@/store/authStore';
import { initFirebase } from '@/lib/firebase';
import { useSettingsStore, watchSystemTheme } from '@/store/settingsStore';
import { useNotesStore } from '@/store/notesStore';
import { purgeExpiredTrash } from '@/data/notesRepo';
import { registerBackButton, applyStatusBarTheme } from '@/lib/native';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

/** Owner id used when running without a signed-in account (local-only mode). */
const LOCAL_OWNER = 'local';

export default function App() {
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.load);
  const theme = useSettingsStore((s) => s.theme);
  const openNoteId = useNotesStore((s) => s.openNoteId);
  const openNote = useNotesStore((s) => s.openNote);

  const [offlineMode, setOfflineMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Boot: initialize Firebase (no-op if unconfigured), load persisted settings,
  // wire auth + system-theme listeners. Firebase MUST init before the auth
  // listener, which reaches for the Auth instance on the first tick.
  useEffect(() => {
    initFirebase();
    void loadSettings();
    const unsubAuth = initAuthListener();
    const unsubTheme = watchSystemTheme();
    return () => {
      unsubAuth();
      unsubTheme();
    };
  }, [loadSettings]);

  const ownerId = user?.uid ?? (offlineMode ? LOCAL_OWNER : null);

  // Housekeeping: purge notes whose 30-day trash retention has elapsed.
  useEffect(() => {
    if (ownerId) void purgeExpiredTrash(ownerId);
  }, [ownerId]);

  // Keep the native status bar in step with the effective theme.
  useEffect(() => {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    void applyStatusBarTheme(theme === 'dark' || (theme === 'system' && prefersDark));
  }, [theme]);

  // Android hardware back button: unwind UI layers before letting the app exit.
  useEffect(() => {
    return registerBackButton(() => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (sidebarOpen) {
        setSidebarOpen(false);
        return true;
      }
      if (openNoteId) {
        openNote(null);
        return true;
      }
      return false;
    });
  }, [settingsOpen, sidebarOpen, openNoteId, openNote]);

  // Still initializing settings or auth — show a neutral splash.
  if (!settingsLoaded || authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not signed in and not in offline mode — gate on auth.
  if (!ownerId) {
    return <AuthScreen onContinueOffline={() => setOfflineMode(true)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar ownerId={ownerId} onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      {/* Mobile slide-over sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 h-full bg-background shadow-xl">
            <Sidebar
              ownerId={ownerId}
              onOpenSettings={() => {
                setSettingsOpen(true);
                setSidebarOpen(false);
              }}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <main className={cn('flex-1 overflow-hidden')}>
        {openNoteId ? (
          <EditorScreen noteId={openNoteId} onBack={() => openNote(null)} />
        ) : (
          <Dashboard ownerId={ownerId} onOpenSidebar={() => setSidebarOpen(true)} />
        )}
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
