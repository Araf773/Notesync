/**
 * Native (Capacitor) integration.
 *
 * All of this is a no-op on the web build — the plugins only do work when
 * running inside the Android/iOS shell. Keeping it isolated here means the web
 * app never pays for native concerns and vice-versa.
 *
 * Handles:
 *  - Status bar styling to match the current theme.
 *  - Hardware back button: close the open note / sidebar before exiting the app.
 *  - Keyboard: nothing beyond resize (configured natively) but exposed for hooks.
 */
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = Capacitor.isNativePlatform();

/** Sync the native status bar with the app theme (dark vs light). */
export async function applyStatusBarTheme(dark: boolean): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? '#0b0f19' : '#ffffff' });
  } catch {
    // Status bar plugin unavailable (e.g. iOS without the setting) — ignore.
  }
}

/**
 * Wire the Android hardware back button. `onBack` should return true if it
 * handled the press (e.g. closed a note); if it returns false and there's no
 * web history, we exit the app.
 */
export function registerBackButton(onBack: () => boolean): () => void {
  if (!isNative) return () => {};
  const handle = CapApp.addListener('backButton', ({ canGoBack }) => {
    const handled = onBack();
    if (!handled && !canGoBack) void CapApp.exitApp();
  });
  return () => {
    void handle.then((h) => h.remove());
  };
}
