import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Text } from 'react-native';

// Defines the background task at startup (required by expo-task-manager).
import '../lib/background';
import type { FindNotificationData } from '../lib/notifications';
import { SettingsProvider } from '../lib/settings-context';
import { colors } from '../lib/theme';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
}

/** Tapping a "new finds" notification opens the matching tab and category chip. */
function useNotificationTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as FindNotificationData | undefined;
      if (!data?.kind) return;
      router.navigate({
        pathname: data.kind === 'deal' ? '/deals' : '/',
        params: { category: data.category },
      });
    };
    // The app may have been launched by tapping a notification.
    const last = Notifications.getLastNotificationResponse();
    open(last);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useNotificationTaps();
  return (
    <SettingsProvider>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.text,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Pop-ups',
            tabBarActiveTintColor: colors.popup,
            tabBarIcon: ({ focused }) => <TabIcon glyph="🎪" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="deals"
          options={{
            title: 'Deals',
            tabBarActiveTintColor: colors.deal,
            tabBarIcon: ({ focused }) => <TabIcon glyph="🏷️" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ focused }) => <TabIcon glyph="⚙️" focused={focused} />,
          }}
        />
      </Tabs>
    </SettingsProvider>
  );
}
