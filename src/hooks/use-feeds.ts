import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";

import { unreadCountsByFeed } from "@/db/articles";
import { listCategories } from "@/db/categories";
import { listFeeds } from "@/db/feeds";
import type { Category, Feed } from "@/db/types";

type Snapshot = {
    feeds: Feed[];
    categories: Category[];
    unread: Map<number, number>;
};

async function read(db: Parameters<typeof listFeeds>[0]): Promise<Snapshot> {
    const [feeds, categories, unread] = await Promise.all([
        listFeeds(db),
        listCategories(db),
        unreadCountsByFeed(db),
    ]);
    return { feeds, categories, unread };
}

export function useFeeds() {
    const db = useSQLiteContext();
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

    useEffect(() => {
        let active = true;
        read(db).then((next) => {
            if (active) setSnapshot(next);
        });
        return () => {
            active = false;
        };
    }, [db]);

    const reload = useCallback(async () => {
        setSnapshot(await read(db));
    }, [db]);

    return {
        feeds: snapshot?.feeds ?? [],
        categories: snapshot?.categories ?? [],
        unread: snapshot?.unread ?? new Map<number, number>(),
        loading: snapshot === null,
        reload,
    };
}
