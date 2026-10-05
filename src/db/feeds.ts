import type { SQLiteDatabase } from "expo-sqlite";

import type { Feed } from "./types";

type Row = {
    id: number;
    url: string;
    title: string;
    site_url: string | null;
    category_id: number | null;
    etag: string | null;
    last_modified: string | null;
    last_fetched_at: number | null;
    poll_interval_ms: number;
    skip_stubs: number;
    failure_count: number;
    last_error: string | null;
};

const COLUMNS = `
  id, url, title, site_url, category_id, etag, last_modified,
  last_fetched_at, poll_interval_ms, skip_stubs, failure_count, last_error
`;

function toFeed(row: Row): Feed {
    return {
        id: row.id,
        url: row.url,
        title: row.title,
        siteUrl: row.site_url,
        categoryId: row.category_id,
        etag: row.etag,
        lastModified: row.last_modified,
        lastFetchedAt: row.last_fetched_at,
        pollIntervalMs: row.poll_interval_ms,
        skipStubs: row.skip_stubs === 1,
        failureCount: row.failure_count,
        lastError: row.last_error,
    };
}

export async function listFeeds(db: SQLiteDatabase): Promise<Feed[]> {
    const rows = await db.getAllAsync<Row>(
        `SELECT ${COLUMNS} FROM feeds ORDER BY title COLLATE NOCASE`,
    );
    return rows.map(toFeed);
}

export async function getFeedByUrl(
    db: SQLiteDatabase,
    url: string,
): Promise<Feed | null> {
    const row = await db.getFirstAsync<Row>(
        `SELECT ${COLUMNS} FROM feeds WHERE url = ?`,
        url,
    );
    return row ? toFeed(row) : null;
}

export async function addFeed(
    db: SQLiteDatabase,
    input: {
        url: string;
        title: string;
        siteUrl: string | null;
        categoryId: number | null;
    },
): Promise<number> {
    const result = await db.runAsync(
        `INSERT INTO feeds (url, title, site_url, category_id, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET title = excluded.title, site_url = excluded.site_url`,
        input.url,
        input.title,
        input.siteUrl,
        input.categoryId,
        Date.now(),
    );

    if (result.changes > 0 && result.lastInsertRowId > 0) {
        return result.lastInsertRowId;
    }
    const existing = await getFeedByUrl(db, input.url);
    if (!existing)
        throw new Error(`feed disappeared after upsert: ${input.url}`);
    return existing.id;
}

export async function removeFeed(db: SQLiteDatabase, id: number) {
    await db.runAsync("DELETE FROM feeds WHERE id = ?", id);
}

export async function renameFeed(
    db: SQLiteDatabase,
    id: number,
    title: string,
) {
    await db.runAsync("UPDATE feeds SET title = ? WHERE id = ?", title, id);
}

export async function setFeedCategory(
    db: SQLiteDatabase,
    id: number,
    categoryId: number | null,
) {
    await db.runAsync(
        "UPDATE feeds SET category_id = ? WHERE id = ?",
        categoryId,
        id,
    );
}

export async function recordFetchSuccess(
    db: SQLiteDatabase,
    id: number,
    meta: {
        etag: string | null;
        lastModified: string | null;
        pollIntervalMs?: number;
    },
) {
    await db.runAsync(
        `UPDATE feeds
     SET etag = ?, last_modified = ?, last_fetched_at = ?,
         failure_count = 0, last_error = NULL,
         poll_interval_ms = COALESCE(?, poll_interval_ms)
     WHERE id = ?`,
        meta.etag,
        meta.lastModified,
        Date.now(),
        meta.pollIntervalMs ?? null,
        id,
    );
}

export async function recordFetchFailure(
    db: SQLiteDatabase,
    id: number,
    message: string,
) {
    await db.runAsync(
        `UPDATE feeds
     SET failure_count = failure_count + 1, last_error = ?, last_fetched_at = ?
     WHERE id = ?`,
        message,
        Date.now(),
        id,
    );
}

export async function feedsDueForRefresh(
    db: SQLiteDatabase,
    now = Date.now(),
): Promise<Feed[]> {
    const rows = await db.getAllAsync<Row>(
        `SELECT ${COLUMNS} FROM feeds
     WHERE last_fetched_at IS NULL
        OR ? - last_fetched_at >= poll_interval_ms * (1 << MIN(failure_count, 5))
     ORDER BY last_fetched_at IS NOT NULL, last_fetched_at ASC`,
        now,
    );
    return rows.map(toFeed);
}

export async function setSkipStubs(
    db: SQLiteDatabase,
    id: number,
    value: boolean,
) {
    await db.runAsync(
        "UPDATE feeds SET skip_stubs = ? WHERE id = ?",
        value ? 1 : 0,
        id,
    );
}
