export function hashString(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

const VOLATILE_GUID = /^(?:\d+|)$/;

export function stableIdFor(input: {
    guid: string | null;
    link: string | null;
    title: string;
    publishedAt: number;
}): string {
    const guid = input.guid?.trim();
    if (guid && !VOLATILE_GUID.test(guid)) {
        return `g:${guid}`;
    }

    const link = input.link?.trim();
    if (link) {
        return `l:${link}`;
    }

    return `h:${hashString(`${input.title}\u0000${input.publishedAt}`)}`;
}
