export const USER_AGENT =
    "GlassReader/0.1 (+https://github.com/abhishek/rss-reader)";

const REQUEST_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const WINDOWS_1252_HIGH = [
    0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030,
    0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c,
    0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d,
    0x17e, 0x178,
];

export type FetchResult =
    | { status: "not-modified" }
    | {
          status: "ok";
          body: string;
          etag: string | null;
          lastModified: string | null;
      };

export class FeedFetchError extends Error {
    readonly retryAfterMs: number | null;

    constructor(message: string, retryAfterMs: number | null = null) {
        super(message);
        this.name = "FeedFetchError";
        this.retryAfterMs = retryAfterMs;
    }
}

function charsetFromContentType(header: string | null): string | null {
    if (!header) return null;
    const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(header);
    return match ? match[1].toLowerCase() : null;
}

function charsetFromDeclaration(bytes: Uint8Array): string | null {
    const head = String.fromCharCode(
        ...bytes.subarray(0, Math.min(256, bytes.length)),
    );
    const match = /encoding\s*=\s*"([\w-]+)"/i.exec(head);
    return match ? match[1].toLowerCase() : null;
}

function decodeSingleByte(bytes: Uint8Array, windows1252: boolean): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i];
        if (windows1252 && byte >= 0x80 && byte <= 0x9f) {
            out += String.fromCharCode(WINDOWS_1252_HIGH[byte - 0x80]);
        } else {
            out += String.fromCharCode(byte);
        }
    }
    return out;
}

export function decodeBody(
    bytes: Uint8Array,
    contentType: string | null,
): string {
    const charset =
        charsetFromContentType(contentType) ??
        charsetFromDeclaration(bytes) ??
        "utf-8";

    if (charset === "iso-8859-1" || charset === "latin1") {
        return decodeSingleByte(bytes, false);
    }
    if (charset === "windows-1252" || charset === "cp1252") {
        return decodeSingleByte(bytes, true);
    }

    try {
        return new TextDecoder(charset).decode(bytes);
    } catch {
        return new TextDecoder("utf-8").decode(bytes);
    }
}

function retryAfterMs(header: string | null): number | null {
    if (!header) return null;
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export async function fetchFeed(
    url: string,
    conditional: { etag: string | null; lastModified: string | null },
): Promise<FetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.8, */*;q=0.5",
        "Accept-Encoding": "gzip, deflate",
    };
    if (conditional.etag) headers["If-None-Match"] = conditional.etag;
    if (conditional.lastModified)
        headers["If-Modified-Since"] = conditional.lastModified;

    try {
        const response = await fetch(url, {
            headers,
            signal: controller.signal,
            redirect: "follow",
        });

        if (response.status === 304) {
            return { status: "not-modified" };
        }

        if (response.status === 429 || response.status === 503) {
            throw new FeedFetchError(
                `rate limited with ${response.status}`,
                retryAfterMs(response.headers.get("retry-after")),
            );
        }

        if (!response.ok) {
            throw new FeedFetchError(`request failed with ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        const buffer = await response.arrayBuffer();

        if (buffer.byteLength > MAX_BODY_BYTES) {
            throw new FeedFetchError(
                `feed larger than ${MAX_BODY_BYTES} bytes`,
            );
        }

        return {
            status: "ok",
            body: decodeBody(new Uint8Array(buffer), contentType),
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
        };
    } catch (error) {
        if (error instanceof FeedFetchError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
            throw new FeedFetchError(`timed out after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw new FeedFetchError(
            error instanceof Error ? error.message : "unknown network error",
        );
    } finally {
        clearTimeout(timeout);
    }
}
