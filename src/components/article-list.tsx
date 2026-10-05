import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { markAllRead, setRead } from "@/db/articles";
import type { ArticleFilter, ArticleListItem } from "@/db/types";
import { useArticles } from "@/hooks/use-articles";
import { useFeeds } from "@/hooks/use-feeds";
import { useSync } from "@/hooks/use-sync";
import { useTheme } from "@/theme/theme-context";
import { space, typeScale } from "@/theme/tokens";

import { ArticleRow } from "./article-row";
import { Chip } from "./chip";
import { SearchBar } from "./search-bar";

const TAB_BAR_CLEARANCE = 84;
const SEARCH_DEBOUNCE_MS = 280;

export type ListMode = {
    key: string;
    label: string;
    filter: ArticleFilter;
};

export type ArticleListProps = {
    title: string;
    baseFilter: ArticleFilter;
    modes?: ListMode[];
    showCategories?: boolean;
    showUnreadToggle?: boolean;
    showMarkAllRead?: boolean;
    emptyMessage: string;
};

export function ArticleList({
    title,
    baseFilter,
    modes,
    showCategories = false,
    showUnreadToggle = false,
    showMarkAllRead = false,
    emptyMessage,
}: ArticleListProps) {
    const db = useSQLiteContext();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { categories } = useFeeds();

    const [modeKey, setModeKey] = useState(modes?.[0]?.key ?? "");
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [query, setQuery] = useState("");
    const [search, setSearch] = useState("");

    useEffect(() => {
        const timer = setTimeout(
            () => setSearch(query.trim()),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [query]);

    const activeMode =
        modes?.find((mode) => mode.key === modeKey) ?? modes?.[0];

    const filter: ArticleFilter = {
        ...baseFilter,
        ...(activeMode?.filter ?? {}),
        ...(categoryId !== null ? { categoryId } : {}),
        ...(unreadOnly ? { unreadOnly: true } : {}),
        ...(search.length > 0 ? { search } : {}),
    };

    const { items, loading, reload, loadMore, patch } = useArticles(filter);
    const { syncing, run } = useSync();

    useFocusEffect(
        useCallback(() => {
            reload();
        }, [reload]),
    );

    const open = (id: number) => {
        patch(id, { isRead: true });
        setRead(db, id, true);
        router.push({ pathname: "/article/[id]", params: { id: String(id) } });
    };

    const refresh = async () => {
        await run();
        await reload();
    };

    const clearUnread = async () => {
        await markAllRead(db, filter);
        await reload();
    };

    const hasChips =
        (modes && modes.length > 1) ||
        (showCategories && categories.length > 0);

    return (
        <View style={styles.root}>
            <View
                style={[styles.header, { paddingTop: insets.top + space.md }]}
            >
                <View style={styles.titleRow}>
                    <Text style={[typeScale.display, { color: colors.text }]}>
                        {title}
                    </Text>
                    <View style={styles.titleActions}>
                        {showUnreadToggle ? (
                            <Chip
                                label={unreadOnly ? "Unread" : "All"}
                                active={unreadOnly}
                                onPress={() => setUnreadOnly((value) => !value)}
                            />
                        ) : null}
                        {showMarkAllRead ? (
                            <Pressable onPress={clearUnread} hitSlop={10}>
                                <Ionicons
                                    name="checkmark-done"
                                    size={21}
                                    color={colors.textMuted}
                                />
                            </Pressable>
                        ) : null}
                    </View>
                </View>

                <SearchBar value={query} onChange={setQuery} />

                {hasChips ? (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                    >
                        {modes && modes.length > 1
                            ? modes.map((mode) => (
                                  <Chip
                                      key={mode.key}
                                      label={mode.label}
                                      active={mode.key === activeMode?.key}
                                      onPress={() => setModeKey(mode.key)}
                                  />
                              ))
                            : null}

                        {showCategories && categories.length > 0 ? (
                            <>
                                <Chip
                                    label="All feeds"
                                    active={categoryId === null}
                                    onPress={() => setCategoryId(null)}
                                />
                                {categories.map((category) => (
                                    <Chip
                                        key={category.id}
                                        label={category.name}
                                        active={categoryId === category.id}
                                        onPress={() =>
                                            setCategoryId(
                                                categoryId === category.id
                                                    ? null
                                                    : category.id,
                                            )
                                        }
                                    />
                                ))}
                            </>
                        ) : null}
                    </ScrollView>
                ) : null}
            </View>

            <FlashList
                data={items}
                keyExtractor={(item: ArticleListItem) => String(item.id)}
                renderItem={({ item }) => (
                    <ArticleRow article={item} onPress={open} />
                )}
                onEndReached={loadMore}
                onEndReachedThreshold={0.6}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                    paddingBottom: TAB_BAR_CLEARANCE + insets.bottom,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={syncing}
                        onRefresh={refresh}
                        tintColor={colors.accent}
                    />
                }
                ListEmptyComponent={
                    loading ? null : (
                        <View style={styles.empty}>
                            <Text
                                style={[
                                    typeScale.body,
                                    styles.emptyText,
                                    { color: colors.textMuted },
                                ]}
                            >
                                {search.length > 0
                                    ? `Nothing matches "${search}".`
                                    : emptyMessage}
                            </Text>
                        </View>
                    )
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    header: {
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
        gap: space.md,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.md,
    },
    titleActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
    },
    chipRow: {
        flexDirection: "row",
        gap: space.sm,
        alignItems: "center",
        paddingRight: space.lg,
    },
    empty: {
        paddingHorizontal: space.xl,
        paddingTop: space.xxl * 2,
    },
    emptyText: {
        textAlign: "center",
        lineHeight: 24,
    },
});
