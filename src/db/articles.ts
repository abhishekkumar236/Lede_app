import type { SQLiteDatabase } from "expo-sqlite";

import type {
    ArticleDetail,
    ArticleFilter,
    ArticleListItem,
    ParsedArticle,
} from "./types";

type Row = {
    id: number;
    feed_id: number;
    feed_title: string;
    title: string;
    url: string | null;
    summary: string | null;
    image_url: string | null;
    published_at: number;
    is_read: number;
    is_bookmarked: number;
    is_favorite: number;
};

type DetailRow = Row & {
    full_content: string | null;
    author: string | null;
    content: string | null;
};

const LIST_COLUMNS = `
  a.id, a.feed_id, f.title AS feed_title, a.title, a.url, a.summary,
  a.image_url, a.published_at,
  COALESCE(s.is_read, 0) AS is_read,
  COALESCE(s.is_bookmarked, 0) AS is_bookmarked,
  COALESCE(s.is_favorite, 0) AS is_favorite
`;

const FROM_CLAUSE = `
  FROM articles a
  JOIN feeds f ON f.id = a.feed_id
  LEFT JOIN article_state s ON s.article_id = a.id
`;

function toListItem(row: Row): ArticleListItem {
    return {
        id: row.id,
        feedId: row.feed_id,
        feedTitle: row.feed_title,
        title: row.title,
        url: row.url,
        summary: row.summary,
        imageUrl: row.image_url,
        publishedAt: row.published_at,
        isRead: row.is_read === 1,
        isBookmarked: row.is_bookmarked === 1,
        isFavorite: row.is_favorite === 1,
    };
}

function buildWhere(filter: ArticleFilter, cursor?: number) {
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    if (filter.feedId !== undefined) {
        clauses.push("a.feed_id = ?");
        params.push(filter.feedId);
    }
    if (filter.categoryId !== undefined) {
        clauses.push("f.category_id = ?");
        params.push(filter.categoryId);
    }
    if (filter.unreadOnly) {
        clauses.push("COALESCE(s.is_read, 0) = 0");
    }
    if (filter.bookmarkedOnly) {
        clauses.push("COALESCE(s.is_bookmarked, 0) = 1");
    }
    if (filter.favoritesOnly) {
        clauses.push("COALESCE(s.is_favorite, 0) = 1");
    }
    if (filter.search) {
        clauses.push("(a.title LIKE ? OR a.summary LIKE ?)");
        const term = `%${filter.search}%`;
        params.push(term, term);
    }
    if (cursor !== undefined) {
        clauses.push("a.published_at < ?");
        params.push(cursor);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return { where, params };
}

export async function listArticles(
    db: SQLiteDatabase,
    filter: ArticleFilter,
    cursor: number | undefined,
    limit: number,
): Promise<ArticleListItem[]> {
    const { where, params } = buildWhere(filter, cursor);
    const rows = await db.getAllAsync<Row>(
        `SELECT ${LIST_COLUMNS} ${FROM_CLAUSE} ${where} ORDER BY a.published_at DESC LIMIT ?`,
        ...params,
        limit,
    );
    return rows.map(toListItem);
}

export async function getArticle(
    db: SQLiteDatabase,
    id: number,
): Promise<ArticleDetail | null> {
    const row = await db.getFirstAsync<DetailRow>(
        `SELECT ${LIST_COLUMNS}, a.author, a.content, a.full_content ${FROM_CLAUSE} WHERE a.id = ?`,
        id,
    );
    if (!row) return null;
    return {
        ...toListItem(row),
        author: row.author,
        content: row.content,
        fullContent: row.full_content,
    };
}

export async function countUnread(
    db: SQLiteDatabase,
    filter: ArticleFilter = {},
): Promise<number> {
    const { where, params } = buildWhere({ ...filter, unreadOnly: true });
    const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total ${FROM_CLAUSE} ${where}`,
        ...params,
    );
    return row?.total ?? 0;
}

export async function unreadCountsByFeed(
    db: SQLiteDatabase,
): Promise<Map<number, number>> {
    const rows = await db.getAllAsync<{ feed_id: number; total: number }>(
        `SELECT a.feed_id, COUNT(*) AS total
     FROM articles a
     LEFT JOIN article_state s ON s.article_id = a.id
     WHERE COALESCE(s.is_read, 0) = 0
     GROUP BY a.feed_id`,
    );
    return new Map(rows.map((r) => [r.feed_id, r.total]));
}

export async function insertArticles(
    db: SQLiteDatabase,
    feedId: number,
    articles: ParsedArticle[],
): Promise<number> {
    if (articles.length === 0) return 0;

    let inserted = 0;
    const statement = await db.prepareAsync(
        `INSERT OR IGNORE INTO articles
       (feed_id, stable_id, title, url, author, summary, content, image_url, published_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    try {
        await db.withTransactionAsync(async () => {
            const now = Date.now();
            for (const article of articles) {
                const result = await statement.executeAsync(
                    feedId,
                    article.stableId,
                    article.title,
                    article.url,
                    article.author,
                    article.summary,
                    article.content,
                    article.imageUrl,
                    article.publishedAt,
                    now,
                );
                inserted += result.changes;
            }
        });
    } finally {
        await statement.finalizeAsync();
    }

    return inserted;
}

async function setFlag(
    db: SQLiteDatabase,
    articleId: number,
    column: "is_read" | "is_bookmarked" | "is_favorite",
    value: boolean,
) {
    await db.runAsync(
        `INSERT INTO article_state (article_id, ${column}, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(article_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
        articleId,
        value ? 1 : 0,
        Date.now(),
    );
}

export function setRead(db: SQLiteDatabase, articleId: number, value: boolean) {
    return setFlag(db, articleId, "is_read", value);
}

export function setBookmarked(
    db: SQLiteDatabase,
    articleId: number,
    value: boolean,
) {
    return setFlag(db, articleId, "is_bookmarked", value);
}

export function setFavorite(
    db: SQLiteDatabase,
    articleId: number,
    value: boolean,
) {
    return setFlag(db, articleId, "is_favorite", value);
}

export async function markAllRead(
    db: SQLiteDatabase,
    filter: ArticleFilter = {},
) {
    const { where, params } = buildWhere({ ...filter, unreadOnly: true });
    await db.runAsync(
        `INSERT INTO article_state (article_id, is_read, updated_at)
     SELECT a.id, 1, ? ${FROM_CLAUSE} ${where}
     ON CONFLICT(article_id) DO UPDATE SET is_read = 1, updated_at = excluded.updated_at`,
        Date.now(),
        ...params,
    );
}

export async function pruneArticles(
    db: SQLiteDatabase,
    retentionDays: number,
    keepPerFeed: number,
) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const savedClause = `
        SELECT article_id FROM article_state WHERE is_bookmarked = 1 OR is_favorite = 1
    `;

    await db.runAsync(
        `DELETE FROM articles
         WHERE published_at < ?
           AND id NOT IN (${savedClause})`,
        cutoff,
    );

    await db.runAsync(
        `DELETE FROM articles
         WHERE id IN (
           SELECT id FROM (
             SELECT a.id, ROW_NUMBER() OVER (
               PARTITION BY a.feed_id ORDER BY a.published_at DESC
             ) AS position
             FROM articles a
           ) WHERE position > ?
         )
         AND id NOT IN (${savedClause})`,
        keepPerFeed,
    );
}

export async function saveFullContent(db: SQLiteDatabase, articleId: number, html: string) {
    await db.runAsync(
        "UPDATE articles SET full_content = ?, full_fetched_at = ? WHERE id = ?",
        html,
        Date.now(),
        articleId,
    );
}
