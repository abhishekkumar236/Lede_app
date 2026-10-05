import { XMLParser } from "fast-xml-parser";

import type { ParsedArticle, ParsedFeed } from "@/db/types";
import { firstImageUrl, sanitizeHtml, toPlainText } from "./sanitize";
import { stableIdFor } from "./stableId";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    textNodeName: "#text",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
});

type Node = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
    if (typeof value === "string") return value.length > 0 ? value : null;
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object") {
        const inner = (value as Node)["#text"];
        if (typeof inner === "string") return inner.length > 0 ? inner : null;
        if (typeof inner === "number") return String(inner);
    }
    return null;
}

function pick(node: Node, ...keys: string[]): unknown {
    for (const key of keys) {
        if (node[key] !== undefined) return node[key];
    }
    return undefined;
}

function pickText(node: Node, ...keys: string[]): string | null {
    return text(pick(node, ...keys));
}

function attr(value: unknown, name: string): string | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const found = (value as Node)[`@${name}`];
        if (typeof found === "string") return found;
    }
    return null;
}

function parseDate(value: string | null): number {
    if (!value) return 0;
    const direct = Date.parse(value);
    if (Number.isFinite(direct)) return direct;
    const normalized = Date.parse(
        value.replace(/\s+(UT|GMT)$/i, " GMT").replace(/\s{2,}/g, " "),
    );
    return Number.isFinite(normalized) ? normalized : 0;
}

function atomLink(entry: Node): string | null {
    const links = asArray(entry.link);
    const alternate = links.find(
        (link) =>
            attr(link, "rel") === "alternate" || attr(link, "rel") === null,
    );
    const chosen = alternate ?? links[0];
    return attr(chosen, "href") ?? text(chosen);
}

function ttlFromChannel(channel: Node): number | null {
    const ttlMinutes = Number.parseInt(pickText(channel, "ttl") ?? "", 10);
    if (Number.isFinite(ttlMinutes) && ttlMinutes > 0)
        return ttlMinutes * 60 * 1000;

    const period = pickText(channel, "sy:updatePeriod", "updatePeriod");
    if (!period) return null;

    const frequency = Number.parseInt(
        pickText(channel, "sy:updateFrequency", "updateFrequency") ?? "1",
        10,
    );
    const divisor = Number.isFinite(frequency) && frequency > 0 ? frequency : 1;
    const periods: Record<string, number> = {
        hourly: 3600000,
        daily: 86400000,
        weekly: 604800000,
        monthly: 2592000000,
        yearly: 31536000000,
    };
    const base = periods[period.toLowerCase()];
    return base ? Math.round(base / divisor) : null;
}

function mediaImage(node: Node): string | null {
    const thumbnail = pick(node, "media:thumbnail", "media:content");
    const url = attr(asArray(thumbnail)[0], "url");
    if (url && /^https?:\/\//i.test(url)) return url;

    const enclosure = asArray(pick(node, "enclosure")).find((item) => {
        const type = attr(item, "type");
        return type === null || type.startsWith("image/");
    });
    const enclosureUrl = attr(enclosure, "url");
    return enclosureUrl && /^https?:\/\//i.test(enclosureUrl)
        ? enclosureUrl
        : null;
}

function buildArticle(input: {
    guid: string | null;
    link: string | null;
    title: string | null;
    author: string | null;
    rawContent: string | null;
    rawSummary: string | null;
    publishedAt: number;
    imageUrl: string | null;
}): ParsedArticle | null {
    const title =
        toPlainText(input.title, 300) ?? (input.link ? input.link : null);
    if (!title) return null;

    const content = sanitizeHtml(input.rawContent ?? input.rawSummary);
    const summary = toPlainText(input.rawSummary ?? input.rawContent);

    return {
        stableId: stableIdFor({
            guid: input.guid,
            link: input.link,
            title,
            publishedAt: input.publishedAt,
        }),
        title,
        url: input.link,
        author: toPlainText(input.author, 120),
        summary,
        content,
        imageUrl: input.imageUrl ?? firstImageUrl(content),
        publishedAt: input.publishedAt,
    };
}

function parseRssItems(items: unknown[]): ParsedArticle[] {
    const out: ParsedArticle[] = [];
    for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Node;
        const guidNode = pick(item, "guid", "dc:identifier");
        const link =
            pickText(item, "link") ??
            (attr(guidNode, "isPermaLink") === "true" ? text(guidNode) : null);

        const article = buildArticle({
            guid: text(guidNode),
            link,
            title: pickText(item, "title"),
            author: pickText(item, "dc:creator", "author"),
            rawContent: pickText(item, "content:encoded", "content"),
            rawSummary: pickText(item, "description", "summary"),
            publishedAt: parseDate(
                pickText(item, "pubDate", "dc:date", "published", "updated"),
            ),
            imageUrl: mediaImage(item),
        });
        if (article) out.push(article);
    }
    return out;
}

function parseAtomEntries(entries: unknown[]): ParsedArticle[] {
    const out: ParsedArticle[] = [];
    for (const raw of entries) {
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Node;
        const authorNode = pick(entry, "author");
        const author =
            authorNode && typeof authorNode === "object"
                ? text((asArray(authorNode)[0] as Node)?.name)
                : text(authorNode);

        const article = buildArticle({
            guid: pickText(entry, "id"),
            link: atomLink(entry),
            title: pickText(entry, "title"),
            author,
            rawContent: pickText(entry, "content"),
            rawSummary: pickText(entry, "summary"),
            publishedAt: parseDate(pickText(entry, "published", "updated")),
            imageUrl: mediaImage(entry),
        });
        if (article) out.push(article);
    }
    return out;
}

function parseJsonFeed(payload: Node): ParsedFeed {
    const items = asArray(payload.items);
    const articles: ParsedArticle[] = [];

    for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Node;
        const article = buildArticle({
            guid: text(item.id),
            link: text(item.url) ?? text(item.external_url),
            title: text(item.title),
            author:
                text((item.author as Node)?.name) ??
                text(asArray(item.authors)[0] as Node),
            rawContent: text(item.content_html),
            rawSummary: text(item.summary) ?? text(item.content_text),
            publishedAt: parseDate(
                text(item.date_published) ?? text(item.date_modified),
            ),
            imageUrl: text(item.image) ?? text(item.banner_image),
        });
        if (article) articles.push(article);
    }

    return {
        title: text(payload.title) ?? "Untitled feed",
        siteUrl: text(payload.home_page_url),
        ttlMs: null,
        articles,
    };
}

export function parseFeed(body: string): ParsedFeed {
    const trimmed = body.trimStart();

    if (trimmed.startsWith("{")) {
        return parseJsonFeed(JSON.parse(trimmed) as Node);
    }

    const document = parser.parse(trimmed) as Node;

    const rssChannel = (document.rss as Node)?.channel as Node | undefined;
    if (rssChannel) {
        return {
            title: pickText(rssChannel, "title") ?? "Untitled feed",
            siteUrl: pickText(rssChannel, "link"),
            ttlMs: ttlFromChannel(rssChannel),
            articles: parseRssItems(asArray(rssChannel.item)),
        };
    }

    const atomFeed = document.feed as Node | undefined;
    if (atomFeed) {
        return {
            title: pickText(atomFeed, "title") ?? "Untitled feed",
            siteUrl: atomLink(atomFeed),
            ttlMs: null,
            articles: parseAtomEntries(asArray(atomFeed.entry)),
        };
    }

    const rdf = (document["rdf:RDF"] ?? document.RDF) as Node | undefined;
    if (rdf) {
        const channel = (rdf.channel ?? {}) as Node;
        return {
            title: pickText(channel, "title") ?? "Untitled feed",
            siteUrl: pickText(channel, "link"),
            ttlMs: ttlFromChannel(channel),
            articles: parseRssItems(asArray(rdf.item)),
        };
    }

    throw new Error("unrecognised feed format");
}
