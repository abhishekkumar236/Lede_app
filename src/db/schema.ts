import type { SQLiteDatabase } from "expo-sqlite";

export const DATABASE_NAME = "reader.db";

const LATEST_VERSION = 3;

export async function migrate(db: SQLiteDatabase) {
    await db.execAsync("PRAGMA journal_mode = WAL");
    await db.execAsync("PRAGMA foreign_keys = ON");

    const row = await db.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version",
    );
    let version = row?.user_version ?? 0;

    if (version < 1) {
        await db.execAsync(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE feeds (
        id INTEGER PRIMARY KEY NOT NULL,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        site_url TEXT,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        etag TEXT,
        last_modified TEXT,
        last_fetched_at INTEGER,
        poll_interval_ms INTEGER NOT NULL DEFAULT 1800000,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE articles (
        id INTEGER PRIMARY KEY NOT NULL,
        feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
        stable_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        author TEXT,
        summary TEXT,
        content TEXT,
        image_url TEXT,
        published_at INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX articles_dedup ON articles (feed_id, stable_id);
      CREATE INDEX articles_published ON articles (published_at DESC);
      CREATE INDEX articles_feed ON articles (feed_id, published_at DESC);

      CREATE TABLE article_state (
        article_id INTEGER PRIMARY KEY NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        is_read INTEGER NOT NULL DEFAULT 0,
        is_bookmarked INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX article_state_read ON article_state (is_read);
      CREATE INDEX article_state_bookmarked ON article_state (is_bookmarked) WHERE is_bookmarked = 1;
      CREATE INDEX article_state_favorite ON article_state (is_favorite) WHERE is_favorite = 1;

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
        version = 1;
    }

    if (version < 2) {
        await db.execAsync(`
      ALTER TABLE articles ADD COLUMN full_content TEXT;
      ALTER TABLE articles ADD COLUMN full_fetched_at INTEGER;
    `);
        version = 2;
    }

    if (version < 3) {
        await db.execAsync(`
      ALTER TABLE feeds ADD COLUMN skip_stubs INTEGER NOT NULL DEFAULT 0;
    `);
        version = 3;
    }

    if (version !== LATEST_VERSION) {
        throw new Error(
            `migration stopped at version ${version}, expected ${LATEST_VERSION}`,
        );
    }

    await db.execAsync(`PRAGMA user_version = ${version}`);
}
