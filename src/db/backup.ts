import type { SQLiteDatabase } from 'expo-sqlite';

import { createCategory } from './categories';
import { addFeed } from './feeds';

export const BACKUP_FORMAT = 'glass-reader-backup';
export const BACKUP_VERSION = 1;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  categories: string[];
  feeds: { url: string; title: string; siteUrl: string | null; category: string | null }[];
  states: {
    feedUrl: string;
    stableId: string;
    read: boolean;
    bookmarked: boolean;
    favorite: boolean;
  }[];
};

export type ImportResult = {
  categories: number;
  feeds: number;
  statesApplied: number;
  statesSkipped: number;
};

export async function exportBackup(db: SQLiteDatabase): Promise<BackupFile> {
  const categories = await db.getAllAsync<{ name: string }>('SELECT name FROM categories ORDER BY name');

  const feeds = await db.getAllAsync<{
    url: string;
    title: string;
    site_url: string | null;
    category: string | null;
  }>(
    `SELECT f.url, f.title, f.site_url, c.name AS category
     FROM feeds f
     LEFT JOIN categories c ON c.id = f.category_id
     ORDER BY f.title COLLATE NOCASE`
  );

  const states = await db.getAllAsync<{
    feed_url: string;
    stable_id: string;
    is_read: number;
    is_bookmarked: number;
    is_favorite: number;
  }>(
    `SELECT f.url AS feed_url, a.stable_id, s.is_read, s.is_bookmarked, s.is_favorite
     FROM article_state s
     JOIN articles a ON a.id = s.article_id
     JOIN feeds f ON f.id = a.feed_id
     WHERE s.is_read = 1 OR s.is_bookmarked = 1 OR s.is_favorite = 1`
  );

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: categories.map((row) => row.name),
    feeds: feeds.map((row) => ({
      url: row.url,
      title: row.title,
      siteUrl: row.site_url,
      category: row.category,
    })),
    states: states.map((row) => ({
      feedUrl: row.feed_url,
      stableId: row.stable_id,
      read: row.is_read === 1,
      bookmarked: row.is_bookmarked === 1,
      favorite: row.is_favorite === 1,
    })),
  };
}

function assertBackup(value: unknown): BackupFile {
  if (!value || typeof value !== 'object') throw new Error('backup file is not an object');
  const candidate = value as Partial<BackupFile>;
  if (candidate.format !== BACKUP_FORMAT) throw new Error('not a Glass Reader backup file');
  if (!Array.isArray(candidate.feeds)) throw new Error('backup is missing its feed list');
  return {
    format: BACKUP_FORMAT,
    version: candidate.version ?? 1,
    exportedAt: candidate.exportedAt ?? '',
    categories: Array.isArray(candidate.categories) ? candidate.categories : [],
    feeds: candidate.feeds,
    states: Array.isArray(candidate.states) ? candidate.states : [],
  };
}

export async function importBackup(db: SQLiteDatabase, raw: unknown): Promise<ImportResult> {
  const backup = assertBackup(raw);
  const result: ImportResult = { categories: 0, feeds: 0, statesApplied: 0, statesSkipped: 0 };

  const categoryIds = new Map<string, number>();
  for (const name of backup.categories) {
    categoryIds.set(name, await createCategory(db, name));
    result.categories += 1;
  }

  const feedIds = new Map<string, number>();
  for (const feed of backup.feeds) {
    let categoryId: number | null = null;
    if (feed.category) {
      const cached = categoryIds.get(feed.category);
      categoryId = cached ?? (await createCategory(db, feed.category));
      categoryIds.set(feed.category, categoryId);
    }
    const id = await addFeed(db, {
      url: feed.url,
      title: feed.title,
      siteUrl: feed.siteUrl,
      categoryId,
    });
    feedIds.set(feed.url, id);
    result.feeds += 1;
  }

  const statement = await db.prepareAsync(
    `INSERT INTO article_state (article_id, is_read, is_bookmarked, is_favorite, updated_at)
     SELECT a.id, ?, ?, ?, ?
     FROM articles a
     WHERE a.feed_id = ? AND a.stable_id = ?
     ON CONFLICT(article_id) DO UPDATE SET
       is_read = MAX(is_read, excluded.is_read),
       is_bookmarked = MAX(is_bookmarked, excluded.is_bookmarked),
       is_favorite = MAX(is_favorite, excluded.is_favorite),
       updated_at = excluded.updated_at`
  );

  try {
    await db.withTransactionAsync(async () => {
      const now = Date.now();
      for (const state of backup.states) {
        const feedId = feedIds.get(state.feedUrl);
        if (feedId === undefined) {
          result.statesSkipped += 1;
          continue;
        }
        const outcome = await statement.executeAsync(
          state.read ? 1 : 0,
          state.bookmarked ? 1 : 0,
          state.favorite ? 1 : 0,
          now,
          feedId,
          state.stableId
        );
        if (outcome.changes > 0) result.statesApplied += 1;
        else result.statesSkipped += 1;
      }
    });
  } finally {
    await statement.finalizeAsync();
  }

  return result;
}
