/**
 * Small status pill reflecting the live sync state. Uses color + icon + text so
 * it's not color-only (accessibility). Clicking it triggers a manual sync.
 */
import { CloudOff, RefreshCw, AlertTriangle, CheckCircle2, UserX } from 'lucide-react';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { syncSession } from '@/sync/session';
import { cn } from '@/lib/utils';
import type { SyncStatus } from '@/types/note';

const CONFIG: Record<SyncStatus, { icon: React.ElementType; label: string; className: string; spin?: boolean }> = {
  synced: { icon: CheckCircle2, label: 'Synced', className: 'text-emerald-600 dark:text-emerald-400' },
  syncing: { icon: RefreshCw, label: 'Syncing…', className: 'text-blue-600 dark:text-blue-400', spin: true },
  offline: { icon: CloudOff, label: 'Offline', className: 'text-muted-foreground' },
  conflict: { icon: AlertTriangle, label: 'Conflict', className: 'text-amber-600 dark:text-amber-400' },
  error: { icon: AlertTriangle, label: 'Sync error', className: 'text-destructive' },
  'signed-out': { icon: UserX, label: 'Local only', className: 'text-muted-foreground' },
};

export function SyncStatusIndicator({ className }: { className?: string }) {
  const status = useSyncStatus();
  const { icon: Icon, label, className: color, spin } = CONFIG[status];

  const canSync = status !== 'signed-out' && status !== 'syncing';

  return (
    <button
      type="button"
      onClick={() => canSync && void syncSession.forceSync()}
      disabled={!canSync}
      aria-live="polite"
      aria-label={`Sync status: ${label}${canSync ? '. Click to sync now.' : ''}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        canSync && 'hover:bg-accent',
        color,
        className,
      )}
      title={canSync ? 'Click to sync now' : label}
    >
      <Icon className={cn('size-3.5', spin && 'animate-spin')} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
