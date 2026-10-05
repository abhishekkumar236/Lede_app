import type { SQLiteDatabase } from "expo-sqlite";

import { insertArticles, pruneArticles } from "@/db/articles";
import {
    feedsDueForRefresh,
    recordFetchFailure,
    recordFetchSuccess,
} from "@/db/feeds";
import type { Feed } from "@/db/types";
import { discoverFeedsInHtml, guessFeedUrls } from "@/feeds/discover";
import { FeedFetchError, fetchFeed } from "@/feeds/fetch";
import { parseFeed } from "@/feeds/parse";
import { toPlainText } from "@/feeds/sanitize";
import { hostLabel } from "@/lib/url";

import { delay, mapWithConcurrency } from "./limit";

const HOST_CONCURRENCY = 4;
const SAME_HOST_DELAY_MS = 400;
const RETENTION_DAYS = 45;
const KEEP_PER_FEED = 200;
const STUB_LENGTH = 600;

export type SyncSummary = {
    checked: number;
    notModified: number;
    inserted: number;
    skipped: number;
    failed: number;
};

function hostOf(url: string): string {
    const match = /^https?:\/\/([^/?#]+)/i.exec(url);
    return match ? match[1].toLowerCase() : url;
}

function groupByHost(feeds: Feed[]): Feed[][] {
    const groups = new Map<string, Feed[]>();
    for (const feed of feeds) {
        const host = hostOf(feed.url);
        const existing = groups.get(host);
        if (existing) existing.push(feed);
        else groups.set(host, [feed]);
    }
    return [...groups.values()];
}

async function syncOne(db: SQLiteDatabase, feed: Feed, summary: SyncSummary) {
    summary.checked += 1;
    try {
        const result = await fetchFeed(feed.url, {
            etag: feed.etag,
            lastModified: feed.lastModified,
        });

        if (result.status === "not-modified") {
            summary.notModified += 1;
            await recordFetchSuccess(db, feed.id, {
                etag: feed.etag,
                lastModified: feed.lastModified,
            });
            return;
        }

        const parsed = parseFeed(result.body);
        const articles = feed.skipStubs
            ? parsed.articles.filter(
                  (article) =>
                      (toPlainText(article.content, Number.MAX_SAFE_INTEGER)
                          ?.length ?? 0) >= STUB_LENGTH,
              )
            : parsed.articles;

        summary.skipped += parsed.articles.length - articles.length;
        summary.inserted += await insertArticles(db, feed.id, articles);
        await recordFetchSuccess(db, feed.id, {
            etag: result.etag,
            lastModified: result.lastModified,
            pollIntervalMs: parsed.ttlMs ?? undefined,
        });
    } catch (error) {
        summary.failed += 1;
        const message =
            error instanceof Error ? error.message : "unknown error";
        await recordFetchFailure(db, feed.id, message);
        if (error instanceof FeedFetchError && error.retryAfterMs) {
            await delay(Math.min(error.retryAfterMs, 5000));
        }
    }
}

export async function syncFeeds(
    db: SQLiteDatabase,
    feeds?: Feed[],
): Promise<SyncSummary> {
    const due = feeds ?? (await feedsDueForRefresh(db));
    const summary: SyncSummary = {
        checked: 0,
        notModified: 0,
        inserted: 0,
        skipped: 0,
        failed: 0,
    };

    if (due.length === 0) return summary;

    await mapWithConcurrency(
        groupByHost(due),
        HOST_CONCURRENCY,
        async (group) => {
            for (let i = 0; i < group.length; i += 1) {
                if (i > 0) await delay(SAME_HOST_DELAY_MS);
                await syncOne(db, group[i], summary);
            }
        },
    );

    if (summary.inserted > 0) {
        await pruneArticles(db, RETENTION_DAYS, KEEP_PER_FEED);
    }

    return summary;
}

export async function probeFeed(url: string) {
    const attempted = new Set<string>();

    const read = async (candidate: string) => {
        attempted.add(candidate);
        const result = await fetchFeed(candidate, {
            etag: null,
            lastModified: null,
        });
        if (result.status === "not-modified") {
            throw new FeedFetchError(
                "server returned 304 for a first-time fetch",
            );
        }
        return result.body;
    };

    const body = await read(url);

    try {
        const parsed = parseFeed(body);
        return {
            ...parsed,
            url,
            title:
                parsed.title === "Untitled feed"
                    ? hostLabel(url)
                    : parsed.title,
        };
    } catch {
        // not a feed - treat the response as a page and look for one
    }

    const candidates = [
        ...discoverFeedsInHtml(body, url),
        ...guessFeedUrls(url),
    ];

    for (const candidate of candidates) {
        if (attempted.has(candidate)) continue;
        try {
            const parsed = parseFeed(await read(candidate));
            if (parsed.articles.length === 0) continue;
            return {
                ...parsed,
                url: candidate,
                title:
                    parsed.title === "Untitled feed"
                        ? hostLabel(candidate)
                        : parsed.title,
            };
        } catch {
            continue;
        }
    }

    throw new FeedFetchError(
        "that URL is not a feed, and no feed was found on the page. Try the site's RSS link directly.",
    );
}
