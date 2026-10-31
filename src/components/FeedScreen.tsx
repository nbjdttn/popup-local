import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentError } from '../lib/agent';
import { refreshFeed } from '../lib/refresh';
import { useSettings } from '../lib/settings-context';
import { loadFeed } from '../lib/storage';
import { accentFor, colors } from '../lib/theme';
import { findingKey, type FeedKind, type FeedResult } from '../lib/types';
import { FindingCard } from './FindingCard';

const COPY = {
  popup: { title: 'Pop-ups', empty: 'No pop-ups found yet.' },
  deal: { title: 'Deals', empty: 'No discounts found yet.' },
} as const;

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function FeedScreen({ kind }: { kind: FeedKind }) {
  const { settings, loaded } = useSettings();
  const accent = accentFor(kind);
  const categories = settings.categories;

  // A tapped notification opens this tab with ?category=<name>.
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState(categories[0] ?? '');

  useEffect(() => {
    if (params.category && categories.includes(params.category)) setCategory(params.category);
  }, [params.category, categories]);
  const [results, setResults] = useState<Record<string, FeedResult | null>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const aborter = useRef<AbortController | null>(null);

  // Keep the selected chip valid when the category list changes in Settings.
  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] ?? '');
  }, [categories, category]);

  // Load saved results each time this tab is shown (background checks may have
  // added new ones) and whenever the city or category list changes.
  useFocusEffect(
    useCallback(() => {
      if (!loaded) return;
      let cancelled = false;
      Promise.all(categories.map((c) => loadFeed(kind, c, settings.city))).then((list) => {
        if (cancelled) return;
        const next: Record<string, FeedResult | null> = {};
        categories.forEach((c, i) => (next[c] = list[i]));
        setResults(next);
      });
      return () => {
        cancelled = true;
      };
    }, [kind, categories, settings.city, loaded]),
  );

  useEffect(() => () => aborter.current?.abort(), []);

  const search = useCallback(
    async (cat: string, signal?: AbortSignal) => {
      setBusy((b) => ({ ...b, [cat]: true }));
      setErrors((e) => ({ ...e, [cat]: '' }));
      try {
        const { result } = await refreshFeed(kind, cat, settings, signal);
        setResults((r) => ({ ...r, [cat]: result }));
      } catch (err) {
        if (signal?.aborted) return;
        const message =
          err instanceof AgentError ? err.message : 'Something went wrong. Please try again.';
        setErrors((e) => ({ ...e, [cat]: message }));
      } finally {
        setBusy((b) => ({ ...b, [cat]: false }));
      }
    },
    [kind, settings],
  );

  const searchAll = useCallback(async () => {
    aborter.current?.abort();
    const controller = new AbortController();
    aborter.current = controller;
    setBulk({ done: 0, total: categories.length });
    // One at a time keeps API usage and rate limits gentle.
    for (let i = 0; i < categories.length; i++) {
      if (controller.signal.aborted) break;
      await search(categories[i], controller.signal);
      setBulk({ done: i + 1, total: categories.length });
    }
    setBulk(null);
  }, [categories, search]);

  const needsSetup = loaded && (!settings.apiKey || !settings.city);
  const current = results[category];
  const isBusy = !!busy[category];
  const error = errors[category];
  const newKeys = new Set(current?.newKeys ?? []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.heading}>{COPY[kind].title}</Text>
          <Text style={styles.sub}>{settings.city ? `Near ${settings.city}` : 'No city set'}</Text>
        </View>
        <Pressable
          onPress={bulk ? () => aborter.current?.abort() : searchAll}
          disabled={needsSetup}
          style={[styles.allBtn, { borderColor: accent }, needsSetup && { opacity: 0.4 }]}
        >
          <Text style={[styles.allBtnText, { color: accent }]}>
            {bulk ? `Stop (${bulk.done}/${bulk.total})` : 'Search all'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        {categories.map((c) => {
          const active = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>
                {c}
                {busy[c]
                  ? ' …'
                  : results[c]?.findings.length
                    ? ` · ${results[c]!.findings.length}`
                    : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {needsSetup ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Let's get you set up</Text>
          <Text style={styles.emptyText}>
            Add your city and an Anthropic API key so the agent can search for you.
          </Text>
          <Link href="/settings" asChild>
            <Pressable style={[styles.primary, { backgroundColor: accent }]}>
              <Text style={styles.primaryText}>Open Settings</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <FlatList
          data={current?.findings ?? []}
          keyExtractor={(item, i) => `${item.url}-${i}`}
          renderItem={({ item }) => (
            <FindingCard item={item} kind={kind} isNew={newKeys.has(findingKey(item))} />
          )}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={isBusy}
              onRefresh={() => search(category)}
              tintColor={accent}
              colors={[accent]}
            />
          }
          ListHeaderComponent={
            <View style={styles.status}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {isBusy ? (
                <Text style={styles.statusText}>
                  Agent is searching the web… this can take a minute.
                </Text>
              ) : current ? (
                <Text style={styles.statusText}>
                  Updated {timeAgo(current.fetchedAt)} · pull to refresh
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            isBusy ? (
              <View style={styles.center}>
                <ActivityIndicator color={accent} size="large" />
              </View>
            ) : (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>
                  {current ? COPY[kind].empty : `Nothing searched for ${category} yet`}
                </Text>
                <Pressable
                  style={[styles.primary, { backgroundColor: accent }]}
                  onPress={() => search(category)}
                >
                  <Text style={styles.primaryText}>Search {category}</Text>
                </Pressable>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  allBtn: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  allBtnText: { fontWeight: '700', fontSize: 13 },
  chipRow: { flexGrow: 0, marginTop: 12 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  status: { paddingHorizontal: 16, paddingBottom: 8 },
  statusText: { fontSize: 12, color: colors.muted },
  error: { fontSize: 13, color: colors.danger, marginBottom: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  primary: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
