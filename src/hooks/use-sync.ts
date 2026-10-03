import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { syncFeeds, type SyncSummary } from '@/sync/syncFeeds';

export function useSync() {
  const db = useSQLiteContext();
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);

  const run = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncFeeds(db);
      setSummary(result);
      return result;
    } finally {
      setSyncing(false);
    }
  }, [db]);

  return { syncing, summary, run };
}
