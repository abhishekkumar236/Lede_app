import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ArticleListItem } from "@/db/types";
import { relativeTime } from "@/lib/time";
import { useTheme } from "@/theme/theme-context";
import { radius, space, typeScale } from "@/theme/tokens";

export type ArticleRowProps = {
    article: ArticleListItem;
    onPress: (id: number) => void;
};

export function ArticleRow({ article, onPress }: ArticleRowProps) {
    const { colors } = useTheme();
    const read = article.isRead;

    return (
        <Pressable
            onPress={() => onPress(article.id)}
            style={({ pressed }) => [
                styles.row,
                {
                    backgroundColor: pressed
                        ? colors.surfaceAlt
                        : "transparent",
                    borderBottomColor: colors.divider,
                },
            ]}
        >
            <View style={styles.body}>
                <View style={styles.meta}>
                    {!read ? (
                        <View
                            style={[
                                styles.dot,
                                { backgroundColor: colors.accent },
                            ]}
                        />
                    ) : null}
                    <Text
                        numberOfLines={1}
                        style={[
                            typeScale.micro,
                            styles.source,
                            {
                                color: read
                                    ? colors.textFaint
                                    : colors.textMuted,
                            },
                        ]}
                    >
                        {article.feedTitle.toUpperCase()}
                    </Text>
                    <Text
                        style={[typeScale.micro, { color: colors.textFaint }]}
                    >
                        {relativeTime(article.publishedAt)}
                    </Text>
                </View>

                <Text
                    numberOfLines={3}
                    style={[
                        typeScale.heading,
                        { color: read ? colors.textMuted : colors.text },
                    ]}
                >
                    {article.title}
                </Text>

                {article.summary ? (
                    <Text
                        numberOfLines={2}
                        style={[typeScale.caption, { color: colors.textFaint }]}
                    >
                        {article.summary}
                    </Text>
                ) : null}

                {article.isBookmarked || article.isFavorite ? (
                    <View style={styles.tags}>
                        {article.isBookmarked ? (
                            <Text
                                style={[
                                    typeScale.micro,
                                    { color: colors.accent },
                                ]}
                            >
                                SAVED
                            </Text>
                        ) : null}
                        {article.isFavorite ? (
                            <Text
                                style={[
                                    typeScale.micro,
                                    { color: colors.danger },
                                ]}
                            >
                                FAVOURITE
                            </Text>
                        ) : null}
                    </View>
                ) : null}
            </View>

            {article.imageUrl ? (
                <Image
                    source={article.imageUrl}
                    style={[
                        styles.thumb,
                        { backgroundColor: colors.surfaceAlt },
                    ]}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="disk"
                    recyclingKey={String(article.id)}
                />
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.lg - 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    body: {
        flex: 1,
        gap: space.sm - 2,
    },
    meta: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm - 2,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 999,
    },
    source: {
        flexShrink: 1,
    },
    thumb: {
        width: 72,
        height: 72,
        borderRadius: radius.sm,
        marginTop: 2,
    },
    tags: {
        flexDirection: "row",
        gap: space.md,
        paddingTop: 2,
    },
});
