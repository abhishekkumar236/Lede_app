const FEED_LINK = /<link\b[^>]*>/gi;
const TYPE_ATTR = /type\s*=\s*["']([^"']+)["']/i;
const REL_ATTR = /rel\s*=\s*["']([^"']+)["']/i;
const HREF_ATTR = /href\s*=\s*["']([^"']+)["']/i;

const FEED_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/json',
];

const COMMON_PATHS = [
  '/feed',
  '/feed.xml',
  '/rss',
  '/rss.xml',
  '/atom.xml',
  '/index.xml',
  '/feed/',
  '/blog/feed',
];

export function absoluteUrl(href: string, pageUrl: string): string | null {
  if (/^https?:\/\//i.test(href)) return href;

  const match = /^(https?:\/\/[^/]+)(\/[^?#]*)?/i.exec(pageUrl);
  if (!match) return null;
  const origin = match[1];

  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `${origin}${href}`;

  const path = match[2] ?? '/';
  return `${origin}${path.slice(0, path.lastIndexOf('/') + 1)}${href}`;
}

export function discoverFeedsInHtml(html: string, pageUrl: string): string[] {
  const found: string[] = [];

  for (const tag of html.match(FEED_LINK) ?? []) {
    const rel = REL_ATTR.exec(tag)?.[1]?.toLowerCase() ?? '';
    const type = TYPE_ATTR.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!rel.includes('alternate') || !FEED_TYPES.includes(type)) continue;

    const href = HREF_ATTR.exec(tag)?.[1];
    if (!href) continue;

    const absolute = absoluteUrl(href, pageUrl);
    if (absolute && !found.includes(absolute)) found.push(absolute);
  }

  return found;
}

export function guessFeedUrls(pageUrl: string): string[] {
  const match = /^(https?:\/\/[^/]+)/i.exec(pageUrl);
  if (!match) return [];
  return COMMON_PATHS.map((path) => `${match[1]}${path}`);
}
