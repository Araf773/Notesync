/**
 * Settings dialog: appearance (theme), editor defaults (font family/size),
 * sync controls (force sync now), data (export), and account (sign out).
 */
import { useState } from 'react';
import { Loader2, Download, RefreshCw, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { syncSession } from '@/sync/session';
import { exportNotesToJSON } from '@/lib/exportNotes';
import type { ThemeMode } from '@/types/note';

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter (sans-serif)' },
  { value: 'Georgia, serif', label: 'Georgia (serif)' },
  { value: 'ui-monospace, monospace', label: 'Monospace' },
  { value: 'system-ui', label: 'System default' },
];
const FONT_SIZES = [
  { value: '14px', label: 'Small' },
  { value: '16px', label: 'Medium' },
  { value: '18px', label: 'Large' },
  { value: '20px', label: 'Extra large' },
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const fontFamily = useSettingsStore((s) => s.defaultFontFamily);
  const fontSize = useSettingsStore((s) => s.defaultFontSize);
  const setDefaultFont = useSettingsStore((s) => s.setDefaultFont);

  const user = useAuthStore((s) => s.user);
  const cloudAvailable = useAuthStore((s) => s.cloudAvailable);
  const signOut = useAuthStore((s) => s.signOut);

  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const ownerId = user?.uid ?? 'local';

  const forceSync = async () => {
    setSyncing(true);
    try {
      await syncSession.forceSync();
    } finally {
      setSyncing(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await exportNotesToJSON(ownerId);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Personalize NoteSync and manage your data.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Appearance</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="theme">Theme</Label>
              <div className="w-40">
                <Select value={theme} onValueChange={(v) => setTheme(v as ThemeMode)}>
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Editor</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="font-family">Default font</Label>
              <div className="w-40">
                <Select value={fontFamily} onValueChange={(v) => setDefaultFont(v, fontSize)}>
                  <SelectTrigger id="font-family">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="font-size">Font size</Label>
              <div className="w-40">
                <Select value={fontSize} onValueChange={(v) => setDefaultFont(fontFamily, v)}>
                  <SelectTrigger id="font-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_SIZES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Data & sync</h3>
            {cloudAvailable && user && (
              <Button variant="outline" className="w-full justify-start" onClick={forceSync} disabled={syncing}>
                {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
              </Button>
            )}
            <Button variant="outline" className="w-full justify-start" onClick={doExport} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export all notes (JSON)
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Account</h3>
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-md border p-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="size-9 rounded-full" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                      {(user.displayName ?? user.email ?? '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.displayName ?? 'Signed in'}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full justify-start" onClick={() => void signOut()}>
                  <LogOut /> Sign out
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You're using NoteSync offline. Notes are stored on this device only.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
