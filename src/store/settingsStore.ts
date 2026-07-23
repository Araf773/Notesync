/**
 * Settings store (Zustand) backed by Dexie for persistence.
 *
 * Loads once at boot from the `settings` table, then mirrors changes back to
 * Dexie so preferences survive reloads and are available offline. Theme is
 * applied to the document root here so it takes effect app-wide.
 */
import { create } from 'zustand';
import {
  getSettings,
  updateSettings as persistSettings,
  DEFAULT_SETTINGS,
  type AppSettings,
} from '@/data/db';
import type { ThemeMode, ViewMode, SortKey } from '@/types/note';

interface SettingsState extends Omit<AppSettings, 'id'> {
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSort: (sortKey: SortKey, sortDir: 'asc' | 'desc') => void;
  setDefaultFont: (family: string, size: string) => void;
}

/** Apply a theme to <html> honoring the OS preference when 'system'. */
export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', dark);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const s = await getSettings();
    set({ ...s, loaded: true });
    applyTheme(s.theme);
  },

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    void persistSettings({ theme });
  },

  setViewMode: (viewMode) => {
    set({ viewMode });
    void persistSettings({ viewMode });
  },

  setSort: (sortKey, sortDir) => {
    set({ sortKey, sortDir });
    void persistSettings({ sortKey, sortDir });
  },

  setDefaultFont: (defaultFontFamily, defaultFontSize) => {
    set({ defaultFontFamily, defaultFontSize });
    void persistSettings({ defaultFontFamily, defaultFontSize });
  },
}));

/** Keep the theme in sync with OS changes when in 'system' mode. */
export function watchSystemTheme(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (useSettingsStore.getState().theme === 'system') applyTheme('system');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
