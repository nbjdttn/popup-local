import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { disableBackgroundChecks, enableBackgroundChecks } from '../lib/background';
import { requestNotificationPermission } from '../lib/notifications';
import { useSettings } from '../lib/settings-context';
import { clearFeeds } from '../lib/storage';
import { colors } from '../lib/theme';
import { DEFAULT_CATEGORIES, type Settings } from '../lib/types';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') console.warn(`${title}: ${message}`);
  else Alert.alert(title, message);
}

export default function SettingsScreen() {
  const { settings, loaded, update } = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [newCategory, setNewCategory] = useState('');
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fill the form once stored settings have loaded.
  useEffect(() => {
    if (loaded) setForm(settings);
  }, [loaded, settings]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const fillFromLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        notify('Location is off', 'Allow location access in Settings, or type your city instead.');
        return;
      }
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const [place] = await Location.reverseGeocodeAsync(pos.coords);
      if (!place) {
        notify('Could not find your city', 'Please type it in instead.');
        return;
      }
      setForm((f) => ({
        ...f,
        city: place.city ?? place.subregion ?? place.district ?? f.city,
        region: place.region ?? '',
        country: place.isoCountryCode ?? f.country,
      }));
    } catch {
      notify('Could not get your location', 'Please type your city instead.');
    } finally {
      setLocating(false);
    }
  };

  const addCategory = () => {
    const name = newCategory.trim();
    setNewCategory('');
    if (!name || form.categories.some((c) => c.toLowerCase() === name.toLowerCase())) return;
    set('categories', [...form.categories, name]);
  };

  const removeCategory = (name: string) => {
    if (form.categories.length <= 1) return;
    set(
      'categories',
      form.categories.filter((c) => c !== name),
    );
  };

  const toggleNotifications = async (on: boolean) => {
    if (!on) {
      set('notifications', false);
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      notify('Notifications are off', 'Allow notifications for Popup Local in your phone settings.');
      return;
    }
    set('notifications', true);
  };

  const save = async () => {
    const next: Settings = {
      ...form,
      apiKey: form.apiKey.trim(),
      city: form.city.trim(),
      region: form.region.trim(),
      country: form.country.trim().toUpperCase(),
    };
    await update(next);
    try {
      if (next.notifications) await enableBackgroundChecks();
      else await disableBackgroundChecks();
    } catch (err) {
      notify('Background checks unavailable', err instanceof Error ? err.message : String(err));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const confirmClear = () => {
    const run = () => clearFeeds();
    if (Platform.OS === 'web') {
      run();
      return;
    }
    Alert.alert('Clear saved results?', 'Saved pop-ups and deals will be removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Settings</Text>

          <Text style={styles.section}>Location</Text>
          <Pressable style={styles.locBtn} onPress={fillFromLocation} disabled={locating}>
            {locating ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.locBtnText}>📍  Use my location</Text>
            )}
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="City, e.g. London or 上海"
            value={form.city}
            onChangeText={(v) => set('city', v)}
            autoCapitalize="words"
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Region (optional)"
              value={form.region}
              onChangeText={(v) => set('region', v)}
            />
            <TextInput
              style={[styles.input, { width: 110 }]}
              placeholder="Country, GB"
              value={form.country}
              onChangeText={(v) => set('country', v)}
              autoCapitalize="characters"
              maxLength={2}
            />
          </View>

          <Text style={styles.section}>Categories</Text>
          <Text style={styles.help}>
            Shown as chips on both the Pop-ups and Deals tabs. Chinese names work too, e.g. 泡泡玛特.
            Tap a category to remove it.
          </Text>
          <View style={styles.chips}>
            {form.categories.map((c) => (
              <Pressable key={c} style={styles.chip} onPress={() => removeCategory(c)}>
                <Text style={styles.chipText}>{c}  ✕</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Add a category, e.g. Bubble tea"
              value={newCategory}
              onChangeText={setNewCategory}
              onSubmitEditing={addCategory}
              returnKeyType="done"
            />
            <Pressable style={styles.smallBtn} onPress={addCategory}>
              <Text style={styles.smallBtnText}>Add</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => set('categories', DEFAULT_CATEGORIES)}>
            <Text style={styles.link}>Reset to defaults</Text>
          </Pressable>

          <Text style={styles.section}>Sources and language</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Chinese social media</Text>
              <Text style={styles.help}>
                Also search Xiaohongshu (小红书 / RED), Weibo, Dianping and WeChat in Chinese.
              </Text>
            </View>
            <Switch value={form.chineseSources} onValueChange={(v) => set('chineseSources', v)} />
          </View>
          <View style={styles.segment}>
            {(
              [
                ['en', 'English results'],
                ['zh', '中文结果'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.segmentItem, form.language === value && styles.segmentActive]}
                onPress={() => set('language', value)}
              >
                <Text
                  style={[styles.segmentText, form.language === value && { color: '#fff' }]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>Notifications</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Notify me about new finds</Text>
              <Text style={styles.help}>
                The app checks one category at a time in the background and alerts you when the
                agent finds something stand-out: a new opening, a limited drop, a big discount.
                Your phone decides exactly when checks run (often a few times a day).
              </Text>
            </View>
            <Switch value={form.notifications} onValueChange={toggleNotifications} />
          </View>

          <Text style={styles.section}>Anthropic API key</Text>
          <Text style={styles.help}>
            The agent uses Claude with web search. Your key is stored in this phone's secure
            keychain and is only sent to api.anthropic.com. Get one at console.anthropic.com.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="sk-ant-..."
            value={form.apiKey}
            onChangeText={(v) => set('apiKey', v)}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable style={styles.save} onPress={save}>
            <Text style={styles.saveText}>{saved ? 'Saved ✓' : 'Save'}</Text>
          </Pressable>

          <Pressable onPress={confirmClear}>
            <Text style={[styles.link, { color: colors.danger, marginTop: 24 }]}>
              Clear saved results
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 8 },
  help: { fontSize: 13, color: colors.muted, marginBottom: 10, lineHeight: 18 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginBottom: 10,
  },
  locBtn: {
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 10,
  },
  locBtnText: { fontWeight: '700', color: colors.text, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, color: colors.text },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  smallBtn: {
    backgroundColor: colors.text,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  link: { color: colors.muted, fontSize: 13, marginTop: 10, textDecorationLine: 'underline' },
  switchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  segmentItem: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card },
  segmentActive: { backgroundColor: colors.text },
  segmentText: { fontWeight: '600', color: colors.text },
  save: {
    backgroundColor: colors.popup,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
