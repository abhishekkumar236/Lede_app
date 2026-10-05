import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    textNodeName: "#text",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
});

export type OpmlEntry = {
    title: string;
    xmlUrl: string;
    htmlUrl: string | null;
    category: string | null;
};

type Node = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function attribute(node: unknown, name: string): string | null {
    if (node && typeof node === "object") {
        const value = (node as Node)[`@${name}`];
        if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
}

function walk(outlines: unknown[], category: string | null, out: OpmlEntry[]) {
    for (const outline of outlines) {
        if (!outline || typeof outline !== "object") continue;

        const xmlUrl = attribute(outline, "xmlUrl");
        const label = attribute(outline, "text") ?? attribute(outline, "title");

        if (xmlUrl) {
            out.push({
                title: label ?? xmlUrl,
                xmlUrl,
                htmlUrl: attribute(outline, "htmlUrl"),
                category,
            });
        }

        const children = asArray((outline as Node).outline);
        if (children.length > 0) {
            walk(children, xmlUrl ? category : (label ?? category), out);
        }
    }
}

export function parseOpml(xml: string): OpmlEntry[] {
    const document = parser.parse(xml) as Node;
    const body = ((document.opml as Node)?.body ?? {}) as Node;
    const out: OpmlEntry[] = [];
    walk(asArray(body.outline), null, out);
    return out;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function buildOpml(
    entries: OpmlEntry[],
    documentTitle = "Glass Reader subscriptions",
): string {
    const grouped = new Map<string, OpmlEntry[]>();
    for (const entry of entries) {
        const key = entry.category ?? "";
        const existing = grouped.get(key);
        if (existing) existing.push(entry);
        else grouped.set(key, [entry]);
    }

    const lines: string[] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<opml version="2.0">',
        "  <head>",
        `    <title>${escapeXml(documentTitle)}</title>`,
        `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
        "  </head>",
        "  <body>",
    ];

    const outlineFor = (entry: OpmlEntry, indent: string) => {
        const html = entry.htmlUrl
            ? ` htmlUrl="${escapeXml(entry.htmlUrl)}"`
            : "";
        return `${indent}<outline type="rss" text="${escapeXml(entry.title)}" xmlUrl="${escapeXml(entry.xmlUrl)}"${html} />`;
    };

    for (const [category, items] of grouped) {
        if (category.length === 0) {
            for (const item of items) lines.push(outlineFor(item, "    "));
        } else {
            lines.push(`    <outline text="${escapeXml(category)}">`);
            for (const item of items) lines.push(outlineFor(item, "      "));
            lines.push("    </outline>");
        }
    }

    lines.push("  </body>", "</opml>", "");
    return lines.join("\n");
}
