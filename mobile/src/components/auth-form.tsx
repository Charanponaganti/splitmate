import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getServerUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius } from '@/lib/theme';
import { Button, Card, errorMessage, Field, Input, Row, Txt } from './ui';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { signIn, signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [server, setServer] = useState(getServerUrl());
  const [showServer, setShowServer] = useState(!getServerUrl());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!server.trim()) return setError('Enter the server address.');
    if (mode === 'sign-up' && !name.trim()) return setError('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'sign-in') await signIn(server, email, password);
      else await signUp(server, name, email, password);
    } catch (e) {
      setError(errorMessage(e));
      if (/reach the server/.test(errorMessage(e))) setShowServer(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: insets.top + 20, gap: 20 }}>
        {mode === 'sign-in' && (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="wallet-outline" size={32} color="#fff" />
            </View>
            <Txt variant="title">SplitMate</Txt>
            <Txt variant="muted">Split expenses with friends, fairly.</Txt>
          </View>
        )}

        <Card style={{ gap: 14 }}>
          <Txt variant="h2">{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</Txt>
          {mode === 'sign-up' && (
            <Field label="Your name">
              <Input value={name} onChangeText={setName} placeholder="Asha Rao" autoComplete="name" textContentType="name" />
            </Field>
          )}
          <Field label="Email">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </Field>
          <Field label="Password" hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}>
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete={mode === 'sign-in' ? 'password' : 'new-password'}
              onSubmitEditing={submit}
            />
          </Field>

          {showServer ? (
            <Field label="Server address" hint="Where SplitMate is running, e.g. http://192.168.1.20:3000 or https://splitmate.example.com">
              <Input value={server} onChangeText={setServer} placeholder="http://192.168.1.20:3000" autoCapitalize="none" keyboardType="url" />
            </Field>
          ) : (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>
                Server: {server}
              </Txt>
              <Button title="Change" variant="ghost" size="sm" onPress={() => setShowServer(true)} />
            </Row>
          )}

          {error && (
            <View style={{ backgroundColor: colors.negativeBg, borderRadius: radius.md, padding: 10 }}>
              <Txt variant="small" style={{ color: colors.negative }}>
                {error}
              </Txt>
            </View>
          )}

          <Button title={mode === 'sign-in' ? 'Sign in' : 'Create account'} size="lg" loading={busy} onPress={submit} />
        </Card>

        <Row style={{ justifyContent: 'center' }} gap={4}>
          <Txt variant="muted">{mode === 'sign-in' ? 'New here?' : 'Already have an account?'}</Txt>
          <Link href={mode === 'sign-in' ? '/sign-up' : '/sign-in'} replace style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
            {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
          </Link>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
