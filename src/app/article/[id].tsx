import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Surface } from '@/components/surface';
import { getArticle, saveFullContent, setBookmarked, setFavorite } from '@/db/articles';
import type { ArticleDetail } from '@/db/types';
import { extractArticle } from '@/feeds/extract';
import { toPlainText } from '@/feeds/sanitize';
import { buildReaderDocument } from '@/lib/reader-html';
import { relativeTime } from '@/lib/time';
import { useTheme } from '@/theme/theme-context';
import { space, typeScale } from '@/theme/tokens';

const TRUNCATED_THRESHOLD = 1800;

type Mode = 'reader' | 'live';

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [mode, setMode] = useState<Mode>('reader');
  const [note, setNote] = useState<string | null>(null);

  const articleId = Number.parseInt(id ?? '', 10);

  useEffect(() => {
    if (!Number.isFinite(articleId)) return;
    let active = true;

    getArticle(db, articleId).then((found) => {
      if (!active || !found) return;
      setArticle(found);

      const length = toPlainText(found.content, Number.MAX_SAFE_INTEGER)?.length ?? 0;
      const needsFullText =
        !found.fullContent && Boolean(found.url) && length < TRUNCATED_THRESHOLD;
      if (!needsFullText) return;

      setExtracting(true);
      return extractArticle(found.url as string)
        .then(async (html) => {
          await saveFullContent(db, found.id, html);
          if (active) setArticle((current) => (current ? { ...current, fullContent: html } : current));
        })
        .catch(() => {
          if (!active) return;
          setMode('live');
          setNote('Showing the original page');
        })
        .finally(() => {
          if (active) setExtracting(false);
        });
    });

    return () => {
      active = false;
    };
  }, [db, articleId]);

  const toggleBookmark = () => {
    if (!article) return;
    const next = !article.isBookmarked;
    setArticle({ ...article, isBookmarked: next });
    setBookmarked(db, article.id, next);
  };

  const toggleFavorite = () => {
    if (!article) return;
    const next = !article.isFavorite;
    setArticle({ ...article, isFavorite: next });
    setFavorite(db, article.id, next);
  };

  const reload = async () => {
    if (!article?.url || extracting) return;
    if (mode === 'live') {
      setMode('reader');
      setNote(null);
      return;
    }
    setExtracting(true);
    setNote(null);
    try {
      const html = await extractArticle(article.url);
      await saveFullContent(db, article.id, html);
      setArticle((current) => (current ? { ...current, fullContent: html } : current));
    } catch {
      setMode('live');
      setNote('Showing the original page');
    } finally {
      setExtracting(false);
    }
  };

  if (!article) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.base }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const body = article.fullContent ?? article.content;
  const document = buildReaderDocument({
    title: article.title,
    content: body ? `<h1>${article.title}</h1>${body}` : null,
    colors,
    topPadding: insets.top + 72,
    bottomPadding: insets.bottom + 48,
  });

  const showLive = mode === 'live' && Boolean(article.url);

  return (
    <View style={[styles.root, { backgroundColor: colors.base }]}>
      {showLive ? (
        <WebView
          key="live"
          source={{ uri: article.url as string }}
          style={styles.web}
          containerStyle={[styles.webContainer, { backgroundColor: colors.base }]}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.loading, { backgroundColor: colors.base }]}>
              <ActivityIndicator color={colors.accent} />
            </View>
          )}
          setSupportMultipleWindows={false}
        />
      ) : (
        <WebView
          key="reader"
          originWhitelist={['*']}
          source={{ html: document, baseUrl: article.url ?? undefined }}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          allowsInlineMediaPlayback
          style={styles.web}
          containerStyle={[styles.webContainer, { backgroundColor: colors.base }]}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url === 'about:blank' || request.url.startsWith('data:')) return true;
            WebBrowser.openBrowserAsync(request.url);
            return false;
          }}
        />
      )}

      <Surface
        style={[styles.bar, { paddingTop: insets.top + space.sm, borderBottomColor: colors.divider }]}
        tone="chrome"
        cornerRadius={0}
        bordered={false}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <View style={styles.barBody}>
          <Text numberOfLines={1} style={[typeScale.caption, { color: colors.text }]}>
            {article.feedTitle}
          </Text>
          <Text numberOfLines={1} style={[typeScale.caption, { color: colors.textFaint }]}>
            {extracting
              ? 'Loading full article…'
              : (note ??
                `${relativeTime(article.publishedAt)}${
                  article.author && article.author !== article.feedTitle ? ` · ${article.author}` : ''
                }`)}
          </Text>
        </View>

        {article.url ? (
          <Pressable onPress={reload} hitSlop={10} disabled={extracting}>
            {extracting ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons
                name={showLive ? 'reader-outline' : 'globe-outline'}
                size={21}
                color={colors.text}
              />
            )}
          </Pressable>
        ) : null}

        <Pressable onPress={toggleFavorite} hitSlop={10}>
          <Ionicons
            name={article.isFavorite ? 'heart' : 'heart-outline'}
            size={21}
            color={article.isFavorite ? colors.danger : colors.text}
          />
        </Pressable>
        <Pressable onPress={toggleBookmark} hitSlop={10}>
          <Ionicons
            name={article.isBookmarked ? 'bookmark' : 'bookmark-outline'}
            size={21}
            color={article.isBookmarked ? colors.accent : colors.text}
          />
        </Pressable>
        <Pressable
          onPress={() => article.url && WebBrowser.openBrowserAsync(article.url)}
          hitSlop={10}
          disabled={!article.url}
        >
          <Ionicons name="open-outline" size={21} color={article.url ? colors.text : colors.textFaint} />
        </Pressable>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  web: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webContainer: {
    flex: 1,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barBody: {
    flex: 1,
  },
});
