import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { DEFAULT_SETTINGS, type FeedKind, type FeedResult, type Settings } from './types';

const SETTINGS_KEY = 'popup-local:settings';
const API_KEY_KEY = 'popup-local.apiKey';
const FEED_PREFIX = 'popup-local:feed:';

// The API key lives in the OS keychain/keystore; everything else in AsyncStorage.
// SecureStore has no web implementation, so fall back to AsyncStorage there.
async function readSecret(): Promise<string> {
  try {
    if (Platform.OS === 'web') return (await AsyncStorage.getItem(API_KEY_KEY)) ?? '';
    return (await SecureStore.getItemAsync(API_KEY_KEY)) ?? '';
  } catch {
    return '';
  }
}

async function writeSecret(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(API_KEY_KEY, value);
    return;
  }
  if (value) await SecureStore.setItemAsync(API_KEY_KEY, value);
  else await SecureStore.deleteItemAsync(API_KEY_KEY);
}

export async function loadSettings(): Promise<Settings> {
  const [raw, apiKey] = await Promise.all([AsyncStorage.getItem(SETTINGS_KEY), readSecret()]);
  let stored: Partial<Settings> = {};
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch {
    stored = {};
  }
  const categories =
    Array.isArray(stored.categories) && stored.categories.length > 0
      ? stored.categories
      : DEFAULT_SETTINGS.categories;
  return { ...DEFAULT_SETTINGS, ...stored, categories, apiKey };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const { apiKey, ...rest } = settings;
  await Promise.all([AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(rest)), writeSecret(apiKey)]);
}

function feedKey(kind: FeedKind, category: string, city: string) {
  return `${FEED_PREFIX}${kind}:${city.toLowerCase()}:${category.toLowerCase()}`;
}

export async function loadFeed(
  kind: FeedKind,
  category: string,
  city: string,
): Promise<FeedResult | null> {
  const raw = await AsyncStorage.getItem(feedKey(kind, category, city));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FeedResult;
  } catch {
    return null;
  }
}

export async function saveFeed(result: FeedResult): Promise<void> {
  await AsyncStorage.setItem(
    feedKey(result.kind, result.category, result.city),
    JSON.stringify(result),
  );
}

export async function clearFeeds(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(FEED_PREFIX)));
}
