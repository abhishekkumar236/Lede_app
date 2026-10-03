const DANGEROUS_BLOCKS =
    /<(script|style|iframe|object|embed|form|noscript)\b[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_VOIDS =
    /<(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*\/?>/gi;
const EVENT_ATTRS = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const UNSAFE_URLS =
    /\s(href|src|srcset|action|xlink:href)\s*=\s*(?:"\s*(?:javascript|data|vbscript):[^"]*"|'\s*(?:javascript|data|vbscript):[^']*'|(?:javascript|data|vbscript):[^\s>]+)/gi;
const STYLE_ATTRS = /\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi;
const TAGS = /<[^>]*>/g;

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
    "#x27": "'",
};

export function sanitizeHtml(input: string | null | undefined): string | null {
    if (!input) return null;

    const cleaned = input
        .replace(DANGEROUS_BLOCKS, "")
        .replace(DANGEROUS_VOIDS, "")
        .replace(EVENT_ATTRS, "")
        .replace(UNSAFE_URLS, "")
        .replace(STYLE_ATTRS, "")
        .trim();

    return cleaned.length > 0 ? cleaned : null;
}

export function decodeEntities(input: string): string {
    return input.replace(
        /&(#x?[0-9a-f]+|[a-z]+);/gi,
        (match, entity: string) => {
            const key = entity.toLowerCase();
            if (ENTITIES[key] !== undefined) return ENTITIES[key];
            if (key.startsWith("#x")) {
                const code = Number.parseInt(key.slice(2), 16);
                return Number.isFinite(code)
                    ? String.fromCodePoint(code)
                    : match;
            }
            if (key.startsWith("#")) {
                const code = Number.parseInt(key.slice(1), 10);
                return Number.isFinite(code)
                    ? String.fromCodePoint(code)
                    : match;
            }
            return match;
        },
    );
}

export function toPlainText(
    input: string | null | undefined,
    maxLength = 280,
): string | null {
    if (!input) return null;

    const stripped = decodeEntities(
        input.replace(DANGEROUS_BLOCKS, "").replace(TAGS, " "),
    )
        .replace(/\s+/g, " ")
        .trim();

    if (stripped.length === 0) return null;
    if (stripped.length <= maxLength) return stripped;
    return `${stripped.slice(0, maxLength - 1).trimEnd()}…`;
}

export function firstImageUrl(html: string | null | undefined): string | null {
    if (!html) return null;
    const match = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(html);
    const url = match?.[1] ?? match?.[2] ?? null;
    if (!url) return null;
    return /^https?:\/\//i.test(url) ? url : null;
}
