import { FeedFetchError, decodeBody } from "./fetch";
import { sanitizeHtml, toPlainText } from "./sanitize";

const BROWSER_USER_AGENT =
    "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Lede/1.0";

const REQUEST_TIMEOUT_MS = 20000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MIN_USEFUL_LENGTH = 400;

const CHROME_BLOCKS =
    /<(script|style|nav|header|footer|aside|form|noscript|svg|iframe|button|select|template)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const CONTENT_BLOCKS =
    /<(p|h2|h3|h4|pre|blockquote|ul|ol|figure|table|dl)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

function stripChrome(html: string): string {
    let previous = html;
    for (let i = 0; i < 3; i += 1) {
        const next = previous.replace(CHROME_BLOCKS, "").replace(COMMENTS, "");
        if (next === previous) break;
        previous = next;
    }
    return previous;
}

function longestMatch(html: string, tag: string): string | null {
    const pattern = new RegExp(
        `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`,
        "gi",
    );
    let best: string | null = null;
    for (const match of html.matchAll(pattern)) {
        const body = match[1];
        if (!best || body.length > best.length) best = body;
    }
    return best;
}

function collectBlocks(html: string): string {
    const blocks: string[] = [];
    for (const match of html.matchAll(CONTENT_BLOCKS)) {
        blocks.push(match[0]);
    }
    return blocks.join("\n");
}

function resolveUrls(html: string, pageUrl: string): string {
    let origin = "";
    let directory = "";
    const match = /^(https?:\/\/[^/]+)(\/[^?#]*)?/i.exec(pageUrl);
    if (match) {
        origin = match[1];
        const path = match[2] ?? "/";
        directory = origin + path.slice(0, path.lastIndexOf("/") + 1);
    }
    if (!origin) return html;

    return html.replace(
        /\s(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
        (
            whole,
            attribute: string,
            double: string | undefined,
            single: string | undefined,
        ) => {
            const value = double ?? single ?? "";
            if (value.length === 0 || /^(https?:|mailto:|tel:|#)/i.test(value))
                return whole;
            if (value.startsWith("//")) return ` ${attribute}="https:${value}"`;
            if (value.startsWith("/"))
                return ` ${attribute}="${origin}${value}"`;
            return ` ${attribute}="${directory}${value}"`;
        },
    );
}

export function textLength(html: string | null | undefined): number {
    return toPlainText(html, Number.MAX_SAFE_INTEGER)?.length ?? 0;
}

export async function extractArticle(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": BROWSER_USER_AGENT,
                Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Language": "en",
            },
            signal: controller.signal,
            redirect: "follow",
        });

        if (!response.ok)
            throw new FeedFetchError(`page returned ${response.status}`);

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_PAGE_BYTES) {
            throw new FeedFetchError("page too large to extract");
        }

        const html = decodeBody(
            new Uint8Array(buffer),
            response.headers.get("content-type"),
        );
        const stripped = stripChrome(html);

        const candidates = [
            longestMatch(stripped, "article"),
            longestMatch(stripped, "main"),
            stripped,
        ];

        let best: { html: string; length: number } | null = null;

        for (const candidate of candidates) {
            if (!candidate) continue;
            const collected = collectBlocks(candidate);
            const length = textLength(collected);
            if (length < MIN_USEFUL_LENGTH) continue;
            if (best && length <= best.length) continue;

            const cleaned = sanitizeHtml(resolveUrls(collected, url));
            if (cleaned) best = { html: cleaned, length };
        }

        if (best) return best.html;

        throw new FeedFetchError("could not find article text on the page");
    } catch (error) {
        if (error instanceof FeedFetchError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
            throw new FeedFetchError(
                `extraction timed out after ${REQUEST_TIMEOUT_MS}ms`,
            );
        }
        throw new FeedFetchError(
            error instanceof Error ? error.message : "extraction failed",
        );
    } finally {
        clearTimeout(timeout);
    }
}
