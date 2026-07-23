import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.notesync.app',
  appName: 'NoteSync',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      backgroundColor: '#0b0f19',
      showSpinner: false,
    },
    Keyboard: {
      // Resize the web view (not just overlay) so the editor stays above the
      // on-screen keyboard while typing a note.
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
