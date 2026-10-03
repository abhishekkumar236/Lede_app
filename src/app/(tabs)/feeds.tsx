import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { PickerSheet, type PickerOption } from '@/components/picker-sheet';
import { Surface } from '@/components/surface';
import { removeFeed } from '@/db/feeds';
import { useFeedActions } from '@/hooks/use-feed-actions';
import { useFeeds } from '@/hooks/use-feeds';
import { useSync } from '@/hooks/use-sync';
import { useTheme, type ThemeMode } from '@/theme/theme-context';
import { radius, space, typeScale } from '@/theme/tokens';

const THEME_MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export default function FeedsScreen() {
  const db = useSQLiteContext();
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { feeds, categories, unread, reload } = useFeeds();
  const { run } = useSync();
  const actions = useFeedActions(reload);

  const [url, setUrl] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [picking, setPicking] = useState<number | null>(null);

  const nameFor = (id: number | null) =>
    id === null ? null : (categories.find((category) => category.id === id)?.name ?? null);

  const guard = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      Alert.alert('Something went wrong', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const add = () =>
    guard(async () => {
      const candidate = url.trim();
      if (candidate.length === 0) return;
      await actions.addByUrl(candidate);
      setUrl('');
      await run();
      await reload();
    });

  const addCategory = () =>
    guard(async () => {
      const name = categoryName.trim();
      if (name.length === 0) return;
      await actions.addCategory(name);
      setCategoryName('');
    });

  const importOpml = () =>
    guard(async () => {
      const count = await actions.importOpml();
      if (count > 0) Alert.alert('Import complete', `${count} feeds imported. Pull to refresh on Latest.`);
    });

  const restore = () =>
    guard(async () => {
      const result = await actions.restoreBackup();
      if (!result) return;
      Alert.alert(
        'Restore complete',
        `${result.feeds} feeds, ${result.categories} categories, ${result.statesApplied} markers applied.` +
          (result.statesSkipped > 0
            ? `\n\n${result.statesSkipped} markers skipped because those articles are not downloaded yet. Refresh and restore again to apply them.`
            : '')
      );
    });

  const confirmRemove = (id: number, title: string) =>
    Alert.alert('Remove feed', `Delete "${title}" and its articles?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            await removeFeed(db, id);
            await reload();
          }),
      },
    ]);

  const categoryOptions: PickerOption[] = [
    {
      key: 'none',
      label: 'No category',
      selected: feeds.find((feed) => feed.id === picking)?.categoryId == null,
    },
    ...categories.map((category) => ({
      key: String(category.id),
      label: category.name,
      selected: feeds.find((feed) => feed.id === picking)?.categoryId === category.id,
    })),
  ];

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: 84 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[typeScale.display, { color: colors.text }]}>Feeds</Text>

        <Surface style={styles.card}>
          <Text style={[typeScale.micro, { color: colors.textFaint }]}>ADD A FEED</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com/feed.xml"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={add}
            style={[typeScale.body, styles.input, { color: colors.text, borderColor: colors.divider }]}
          />
          <View style={styles.actions}>
            <Chip label="Add feed" active tone="accent" onPress={add} />
            <Chip label="Import OPML" onPress={importOpml} />
            <Chip label="Export OPML" onPress={() => guard(actions.shareOpml)} />
          </View>
          <View style={styles.actions}>
            <Chip label="Back up everything" onPress={() => guard(async () => { await actions.shareBackup(); })} />
            <Chip label="Restore" onPress={restore} />
          </View>
          {actions.busy ? (
            <View style={styles.busy}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[typeScale.caption, { color: colors.textMuted }]}>{actions.busy}</Text>
            </View>
          ) : null}
        </Surface>

        <Surface style={styles.card}>
          <Text style={[typeScale.micro, { color: colors.textFaint }]}>CATEGORIES</Text>
          <View style={styles.row}>
            <TextInput
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="New category"
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={addCategory}
              style={[typeScale.body, styles.input, styles.grow, { color: colors.text, borderColor: colors.divider }]}
            />
            <Chip label="Add" active tone="accent" onPress={addCategory} />
          </View>
          {categories.length > 0 ? (
            <View style={styles.actions}>
              {categories.map((category) => (
                <Chip key={category.id} label={category.name} />
              ))}
            </View>
          ) : (
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>
              None yet. Tap any feed below to assign one.
            </Text>
          )}
        </Surface>

        <Surface style={styles.card}>
          <Text style={[typeScale.micro, { color: colors.textFaint }]}>APPEARANCE</Text>
          <View style={styles.actions}>
            {THEME_MODES.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                active={mode === option.key}
                onPress={() => setMode(option.key)}
              />
            ))}
          </View>
        </Surface>

        <View style={styles.listHead}>
          <Text style={[typeScale.micro, { color: colors.textFaint }]}>
            {feeds.length > 0 ? `${feeds.length} SUBSCRIPTIONS` : 'SUBSCRIPTIONS'}
          </Text>
        </View>

        <Surface style={styles.list} cornerRadius={radius.md}>
          {feeds.map((feed, index) => (
            <Pressable
              key={feed.id}
              onPress={() => setPicking(feed.id)}
              style={({ pressed }) => [
                styles.feedRow,
                {
                  borderBottomColor: colors.divider,
                  borderBottomWidth: index === feeds.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                },
              ]}
            >
              <View style={styles.feedBody}>
                <Text numberOfLines={1} style={[typeScale.label, { color: colors.text }]}>
                  {feed.title}
                </Text>
                <Text numberOfLines={1} style={[typeScale.caption, { color: colors.textFaint }]}>
                  {nameFor(feed.categoryId) ?? 'No category'}
                </Text>
                {feed.lastError ? (
                  <Text numberOfLines={1} style={[typeScale.caption, { color: colors.danger }]}>
                    {feed.lastError}
                  </Text>
                ) : null}
              </View>

              {(unread.get(feed.id) ?? 0) > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[typeScale.micro, { color: colors.accent }]}>{unread.get(feed.id)}</Text>
                </View>
              ) : null}

              <Pressable onPress={() => confirmRemove(feed.id, feed.title)} hitSlop={10}>
                <Ionicons name="close" size={18} color={colors.textFaint} />
              </Pressable>
            </Pressable>
          ))}

          {feeds.length === 0 ? (
            <Text style={[typeScale.body, styles.emptyText, { color: colors.textMuted }]}>
              No feeds yet. Paste a URL above, or import your OPML file.
            </Text>
          ) : null}
        </Surface>
      </ScrollView>

      <PickerSheet
        visible={picking !== null}
        title="Assign category"
        options={categoryOptions}
        onClose={() => setPicking(null)}
        onSelect={(key) => {
          const feedId = picking;
          setPicking(null);
          if (feedId === null) return;
          guard(() => actions.assignCategory(feedId, key === 'none' ? null : Number.parseInt(key, 10)));
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  card: {
    padding: space.lg,
    gap: space.md,
  },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
  },
  grow: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  listHead: {
    paddingHorizontal: space.xs,
    marginBottom: -space.sm,
  },
  list: {
    paddingHorizontal: space.lg,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md + 2,
  },
  feedBody: {
    flex: 1,
    gap: 2,
  },
  badge: {
    minWidth: 26,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  emptyText: {
    paddingVertical: space.xl,
    textAlign: 'center',
  },
});
