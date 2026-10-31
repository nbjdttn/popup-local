import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';

import { SettingsProvider } from '../lib/settings-context';
import { colors } from '../lib/theme';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
}

export default function RootLayout() {
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
