import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '../lib/settings-context';
import { clearFeeds } from '../lib/storage';
import { colors } from '../lib/theme';
import { DEFAULT_CATEGORIES } from '../lib/types';

export default function SettingsScreen() {
  const { settings, loaded, update } = useSettings();
  const [city, setCity] = useState(settings.city);
  const [country, setCountry] = useState(settings.country);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [categories, setCategories] = useState(settings.categories);
  const [newCategory, setNewCategory] = useState('');
  const [saved, setSaved] = useState(false);

  // Fill the form once stored settings have loaded.
  useEffect(() => {
    if (!loaded) return;
    setCity(settings.city);
    setCountry(settings.country);
    setApiKey(settings.apiKey);
    setCategories(settings.categories);
  }, [loaded, settings]);

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setNewCategory('');
      return;
    }
    setCategories([...categories, name]);
    setNewCategory('');
  };

  const removeCategory = (name: string) => {
    if (categories.length <= 1) return;
    setCategories(categories.filter((c) => c !== name));
  };

  const save = async () => {
    await update({
      apiKey: apiKey.trim(),
      city: city.trim(),
      country: country.trim().toUpperCase(),
      categories,
    });
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
          <TextInput
            style={styles.input}
            placeholder="City, e.g. London"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            placeholder="Country code, e.g. GB (optional)"
            value={country}
            onChangeText={setCountry}
            autoCapitalize="characters"
            maxLength={2}
          />

          <Text style={styles.section}>Categories</Text>
          <Text style={styles.help}>These appear as chips on both the Pop-ups and Deals tabs.</Text>
          <View style={styles.chips}>
            {categories.map((c) => (
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
          <Pressable onPress={() => setCategories(DEFAULT_CATEGORIES)}>
            <Text style={styles.link}>Reset to defaults</Text>
          </Pressable>

          <Text style={styles.section}>Anthropic API key</Text>
          <Text style={styles.help}>
            The agent uses Claude with web search. Your key is stored in this phone's secure
            keychain and is only sent to api.anthropic.com. Get one at console.anthropic.com.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="sk-ant-..."
            value={apiKey}
            onChangeText={setApiKey}
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
  save: {
    backgroundColor: colors.popup,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
