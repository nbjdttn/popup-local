import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { notifyNewFinds } from './notifications';
import { refreshFeed } from './refresh';
import { loadSettings } from './storage';
import type { FeedKind } from './types';

/**
 * Background checks.
 *
 * The phone's OS decides when to wake the app (on iOS usually when the phone is
 * idle, on Wi-Fi or charging), at most about every few hours. Each run checks
 * the next category in turn on both tabs, and posts a notification if the agent
 * found new items it marked as interesting.
 */

export const BACKGROUND_TASK = 'popup-local-background-check';
const CURSOR_KEY = 'popup-local:bg-cursor';
const KINDS: FeedKind[] = ['popup', 'deal'];
/** Minimum minutes between runs. The OS may wait longer. */
const INTERVAL_MINUTES = 4 * 60;

// Must be defined at module load, outside any component.
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  const controller = new AbortController();
  const expiry =
    Platform.OS === 'ios' ? BackgroundTask.addExpirationListener(() => controller.abort()) : null;
  try {
    await runBackgroundCheck(controller.signal);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    expiry?.remove();
  }
});

export async function runBackgroundCheck(signal?: AbortSignal) {
  const settings = await loadSettings();
  if (!settings.notifications || !settings.apiKey || !settings.city) return;
  if (settings.categories.length === 0) return;

  const cursor = Number((await AsyncStorage.getItem(CURSOR_KEY)) ?? 0) || 0;
  const category = settings.categories[cursor % settings.categories.length];
  await AsyncStorage.setItem(CURSOR_KEY, String(cursor + 1));

  // Both tabs for this category at once, so one wake-up does useful work.
  await Promise.all(
    KINDS.map(async (kind) => {
      const { fresh } = await refreshFeed(kind, category, settings, signal);
      await notifyNewFinds(
        kind,
        category,
        fresh.filter((f) => f.interesting),
      );
    }),
  );
}

export async function enableBackgroundChecks() {
  if (Platform.OS === 'web') return;
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error('Background refresh is turned off for this app in the phone settings.');
  }
  if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK))) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, { minimumInterval: INTERVAL_MINUTES });
  }
}

export async function disableBackgroundChecks() {
  if (Platform.OS === 'web') return;
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK);
  }
}
