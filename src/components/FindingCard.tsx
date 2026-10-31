import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { accentFor, colors } from '../lib/theme';
import type { FeedKind, Finding } from '../lib/types';

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function FindingCard({ item, kind }: { item: Finding; kind: FeedKind }) {
  const accent = accentFor(kind);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={() => WebBrowser.openBrowserAsync(item.url)}
      accessibilityRole="link"
      accessibilityHint="Opens the source page"
    >
      <View style={styles.header}>
        {item.brand ? <Text style={[styles.brand, { color: accent }]}>{item.brand}</Text> : null}
        {item.offer ? (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Text style={styles.badgeText}>{item.offer}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title}>{item.title}</Text>
      {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
      {item.dates ? <Text style={styles.meta}>🗓  {item.dates}</Text> : null}
      {item.location ? <Text style={styles.meta}>📍  {item.location}</Text> : null}
      <Text style={styles.source}>{hostOf(item.url)} ↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brand: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 6 },
  summary: { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 6 },
  source: { fontSize: 12, color: colors.muted, marginTop: 10 },
});
