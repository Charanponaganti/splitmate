import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { BottomBar, Button, Card, Chip, errorMessage, Field, Input, Screen, Txt, toast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GROUP_CATEGORIES, POPULAR_CURRENCIES } from '@/lib/constants';
import { colors } from '@/lib/theme';

export default function NewGroupScreen() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('trip');
  const [currency, setCurrency] = useState(me?.preferredCurrency ?? 'INR');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setError(null);
    if (!name.trim()) return setError('Give your group a name.');
    setSaving(true);
    try {
      const { id } = await api<{ id: string }>('groups', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim() || null, category, currency, coverImageUrl: null },
      });
      queryClient.invalidateQueries();
      toast('Group created');
      router.replace(`/group/${id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const currencies = POPULAR_CURRENCIES.includes(currency) ? POPULAR_CURRENCIES : [currency, ...POPULAR_CURRENCIES];

  return (
    <Screen footer={<BottomBar><Button title="Create group" size="lg" loading={saving} onPress={create} /></BottomBar>}>
      <Card style={{ gap: 14 }}>
        <Field label="Group name" error={error}>
          <Input value={name} onChangeText={setName} placeholder="Goa trip, Flat 4B…" maxLength={80} autoFocus />
        </Field>
        <Field label="Description (optional)">
          <Input value={description} onChangeText={setDescription} placeholder="What's this group for?" maxLength={500} multiline />
        </Field>
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt variant="h3">Type</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GROUP_CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={category === c.value}
              onPress={() => setCategory(c.value)}
              left={<Ionicons name={c.icon} size={16} color={category === c.value ? colors.primary : colors.muted} />}
            />
          ))}
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt variant="h3">Currency</Txt>
        <Txt variant="small">All expenses in this group use this currency. It can&apos;t be changed later.</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {currencies.map((c) => (
            <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
          ))}
        </ScrollView>
      </Card>
    </Screen>
  );
}
