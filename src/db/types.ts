export type Category = {
    id: number;
    name: string;
};

export type Feed = {
    id: number;
    url: string;
    title: string;
    siteUrl: string | null;
    categoryId: number | null;
    etag: string | null;
    lastModified: string | null;
    lastFetchedAt: number | null;
    pollIntervalMs: number;
    failureCount: number;
    lastError: string | null;
};

export type ArticleListItem = {
    id: number;
    feedId: number;
    feedTitle: string;
    title: string;
    url: string | null;
    summary: string | null;
    imageUrl: string | null;
    publishedAt: number;
    isRead: boolean;
    isBookmarked: boolean;
    isFavorite: boolean;
};

export type ArticleDetail = ArticleListItem & {
    fullContent: string | null;
    author: string | null;
    content: string | null;
};

export type ArticleFilter = {
    feedId?: number;
    categoryId?: number;
    unreadOnly?: boolean;
    bookmarkedOnly?: boolean;
    favoritesOnly?: boolean;
    search?: string;
};

export type ParsedArticle = {
    stableId: string;
    title: string;
    url: string | null;
    author: string | null;
    summary: string | null;
    content: string | null;
    imageUrl: string | null;
    publishedAt: number;
};

export type ParsedFeed = {
    title: string;
    siteUrl: string | null;
    ttlMs: number | null;
    articles: ParsedArticle[];
};
