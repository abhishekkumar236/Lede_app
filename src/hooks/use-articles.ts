import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';

import { listArticles } from '@/db/articles';
import type { ArticleFilter, ArticleListItem } from '@/db/types';

const PAGE_SIZE = 40;

type Page = {
  key: string;
  items: ArticleListItem[];
  exhausted: boolean;
};

export function useArticles(filter: ArticleFilter) {
  const db = useSQLiteContext();
  const key = JSON.stringify(filter);
  const [page, setPage] = useState<Page | null>(null);

  const loaded = page?.key === key;

  useEffect(() => {
    let active = true;
    listArticles(db, JSON.parse(key) as ArticleFilter, undefined, PAGE_SIZE).then((items) => {
      if (active) setPage({ key, items, exhausted: items.length < PAGE_SIZE });
    });
    return () => {
      active = false;
    };
  }, [db, key]);

  const reload = useCallback(async () => {
    const items = await listArticles(db, JSON.parse(key) as ArticleFilter, undefined, PAGE_SIZE);
    setPage({ key, items, exhausted: items.length < PAGE_SIZE });
  }, [db, key]);

  const loadMore = useCallback(async () => {
    if (!page || page.key !== key || page.exhausted || page.items.length === 0) return;

    const cursor = page.items[page.items.length - 1].publishedAt;
    const next = await listArticles(db, JSON.parse(key) as ArticleFilter, cursor, PAGE_SIZE);

    setPage((current) => {
      if (!current || current.key !== key) return current;
      return {
        key,
        items: [...current.items, ...next],
        exhausted: next.length < PAGE_SIZE,
      };
    });
  }, [db, key, page]);

  const patch = useCallback((id: number, changes: Partial<ArticleListItem>) => {
    setPage((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      };
    });
  }, []);

  return {
    items: loaded ? page.items : [],
    loading: !loaded,
    exhausted: page?.exhausted ?? false,
    reload,
    loadMore,
    patch,
  };
}
