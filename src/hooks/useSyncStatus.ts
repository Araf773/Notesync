/**
 * Subscribe to the app-wide sync status coming from the sync session.
 * Returns a SyncStatus the UI can render as an indicator.
 */
import { useEffect, useState } from 'react';
import { syncSession } from '@/sync/session';
import type { SyncStatus } from '@/types/note';

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>('signed-out');
  useEffect(() => syncSession.onStatus(setStatus), []);
  return status;
}
