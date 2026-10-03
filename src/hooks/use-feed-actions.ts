import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { exportBackup, importBackup, type ImportResult } from '@/db/backup';
import { addFeed, listFeeds, setFeedCategory } from '@/db/feeds';
import { createCategory, listCategories } from '@/db/categories';
import { buildOpml, parseOpml, type OpmlEntry } from '@/feeds/opml';
import { probeFeed } from '@/sync/syncFeeds';

async function pickFile(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return null;
  return new File(picked.assets[0].uri).text();
}

async function shareText(name: string, contents: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(contents);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
  }
}

export function useFeedActions(onChanged: () => Promise<void> | void) {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState<string | null>(null);

  const withBusy = useCallback(
    async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
      setBusy(label);
      try {
        const result = await work();
        await onChanged();
        return result;
      } finally {
        setBusy(null);
      }
    },
    [onChanged]
  );

  const addByUrl = useCallback(
    (url: string) =>
      withBusy('Checking feed', async () => {
        const parsed = await probeFeed(url);
        await addFeed(db, {
          url: parsed.url,
          title: parsed.title,
          siteUrl: parsed.siteUrl,
          categoryId: null,
        });
      }),
    [db, withBusy]
  );

  const importOpml = useCallback(
    () =>
      withBusy('Importing OPML', async () => {
        const contents = await pickFile();
        if (contents === null) return 0;

        const entries = parseOpml(contents);
        const categoryIds = new Map<string, number>();

        for (const entry of entries) {
          let categoryId: number | null = null;
          if (entry.category) {
            const cached = categoryIds.get(entry.category);
            categoryId = cached ?? (await createCategory(db, entry.category));
            categoryIds.set(entry.category, categoryId);
          }
          const feedId = await addFeed(db, {
            url: entry.xmlUrl,
            title: entry.title,
            siteUrl: entry.htmlUrl,
            categoryId,
          });
          if (categoryId !== null) await setFeedCategory(db, feedId, categoryId);
        }
        return entries.length;
      }),
    [db, withBusy]
  );

  const shareOpml = useCallback(
    () =>
      withBusy('Exporting OPML', async () => {
        const [feeds, categories] = await Promise.all([listFeeds(db), listCategories(db)]);
        const nameFor = (id: number | null) =>
          id === null ? null : (categories.find((c) => c.id === id)?.name ?? null);

        const entries: OpmlEntry[] = feeds.map((feed) => ({
          title: feed.title,
          xmlUrl: feed.url,
          htmlUrl: feed.siteUrl,
          category: nameFor(feed.categoryId),
        }));

        await shareText('subscriptions.opml', buildOpml(entries), 'text/xml');
      }),
    [db, withBusy]
  );

  const shareBackup = useCallback(
    () =>
      withBusy('Creating backup', async () => {
        const backup = await exportBackup(db);
        await shareText('glass-reader-backup.json', JSON.stringify(backup, null, 2), 'application/json');
        return backup;
      }),
    [db, withBusy]
  );

  const restoreBackup = useCallback(
    (): Promise<ImportResult | null> =>
      withBusy('Restoring backup', async () => {
        const contents = await pickFile();
        if (contents === null) return null;
        return importBackup(db, JSON.parse(contents));
      }),
    [db, withBusy]
  );

  const addCategory = useCallback(
    (name: string) => withBusy('Adding category', () => createCategory(db, name)),
    [db, withBusy]
  );

  const assignCategory = useCallback(
    (feedId: number, categoryId: number | null) =>
      withBusy('Updating feed', () => setFeedCategory(db, feedId, categoryId)),
    [db, withBusy]
  );

  return { busy, addByUrl, importOpml, shareOpml, shareBackup, restoreBackup, addCategory, assignCategory };
}
