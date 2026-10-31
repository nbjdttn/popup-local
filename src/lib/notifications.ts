import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { FeedKind, Finding } from './types';

const CHANNEL_ID = 'new-finds';

// Show notifications as banners even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Ask for notification permission. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'New pop-ups and deals',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Data attached to each notification so tapping it opens the right tab and chip. */
export interface FindNotificationData {
  kind: FeedKind;
  category: string;
  [key: string]: unknown;
}

/** Post one notification summarising interesting new finds for a feed + category. */
export async function notifyNewFinds(kind: FeedKind, category: string, finds: Finding[]) {
  if (finds.length === 0 || Platform.OS === 'web') return;
  const noun = kind === 'popup' ? 'pop-up' : 'deal';
  const title =
    finds.length === 1
      ? `New ${category} ${noun}`
      : `${finds.length} new ${category} ${noun}s`;
  const first = finds[0];
  const body = [first.offer, first.title, first.dates].filter(Boolean).join(' · ');
  const more = finds.length > 1 ? ` (+${finds.length - 1} more)` : '';
  const data: FindNotificationData = { kind, category };

  await Notifications.scheduleNotificationAsync({
    content: { title, body: body + more, data },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}
