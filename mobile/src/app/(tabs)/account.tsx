import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Chip, confirm, errorMessage, Field, Input, Row, Screen, Txt, toast } from '@/components/ui';
import { api, getServerUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { POPULAR_CURRENCIES } from '@/lib/constants';
import type { Me } from '@/lib/types';

export default function AccountScreen() {
  const { me, setMe, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me?.name ?? '');
  const [currency, setCurrency] = useState(me?.preferredCurrency ?? 'INR');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;
  const dirty = name.trim() !== me.name || currency !== me.preferredCurrency;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    setSaving(true);
    try {
      await api('me', { method: 'PATCH', body: { name: name.trim(), image: me.image, preferredCurrency: currency } });
      const fresh = await api<Me>('me');
      setMe(fresh.user);
      queryClient.setQueryData(['me'], fresh);
      queryClient.invalidateQueries();
      toast('Profile saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <Avatar id={me.id} name={me.name} size={72} />
        <Txt variant="h2">{me.name}</Txt>
        <Txt variant="muted">{me.email}</Txt>
      </Card>

      <Card style={{ gap: 14 }}>
        <Txt variant="h3">Profile</Txt>
        <Field label="Name" error={error}>
          <Input value={name} onChangeText={setName} maxLength={60} />
        </Field>
        <Field label="Preferred currency" hint="Used as the default for new groups.">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {POPULAR_CURRENCIES.map((c) => (
              <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
            ))}
          </ScrollView>
        </Field>
        <Button title="Save changes" onPress={save} loading={saving} disabled={!dirty} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt variant="h3">Connection</Txt>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="muted">Server</Txt>
          <Txt variant="small" numberOfLines={1} style={{ flex: 1, textAlign: 'right', marginLeft: 12 }}>
            {getServerUrl()}
          </Txt>
        </Row>
        <Txt variant="small">Changes from your friends appear automatically while the app is open.</Txt>
      </Card>

      <View>
        <Button
          title="Sign out"
          icon="log-out-outline"
          variant="danger"
          onPress={async () => {
            if (await confirm('Sign out?', 'You can sign back in any time.', 'Sign out')) await signOut();
          }}
        />
      </View>
    </Screen>
  );
}
