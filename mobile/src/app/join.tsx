import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, errorMessage, Field, Input, Screen, Txt, toast } from '@/components/ui';
import { api } from '@/lib/api';
import type { InvitationPreview } from '@/lib/types';

function extractToken(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /\/invite\/([A-Za-z0-9_-]{20,100})/.exec(trimmed);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,100}$/.test(trimmed) ? trimmed : null;
}

export default function JoinScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const queryClient = useQueryClient();
  const [link, setLink] = useState(params.token ?? '');
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = extractToken(link);

  const check = async () => {
    setError(null);
    setPreview(null);
    if (!token) return setError('Paste the full invite link your friend shared.');
    setBusy(true);
    try {
      const data = await api<InvitationPreview | null>(`invitations/token/${token}`);
      if (!data) setError('This invite link is not valid.');
      else setPreview(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const result = await api<{ groupId: string; joined: boolean }>('invitations/accept', { method: 'POST', body: { token } });
      queryClient.invalidateQueries();
      toast(result.joined ? 'You joined the group' : "You're already in this group");
      router.replace(`/group/${result.groupId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <Txt variant="muted">Paste the invite link a friend sent you (for example on WhatsApp).</Txt>
        <Field label="Invite link" error={error}>
          <Input value={link} onChangeText={(t) => { setLink(t); setPreview(null); }} placeholder="https://…/invite/…" autoCapitalize="none" autoCorrect={false} />
        </Field>
        {!preview && <Button title="Check link" loading={busy} onPress={check} />}
      </Card>

      {preview && (
        <Card style={{ gap: 10 }}>
          <Txt variant="h2">{preview.groupName}</Txt>
          <Txt variant="muted">
            {preview.inviterName} invited you · {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}
          </Txt>
          {preview.restrictedToEmail && <Txt variant="small">This invitation is for {preview.restrictedToEmail}.</Txt>}
          {preview.alreadyMember ? (
            <Button title="Open group" onPress={() => preview.groupId && router.replace(`/group/${preview.groupId}`)} />
          ) : preview.state !== 'valid' ? (
            <Txt style={{ fontWeight: '600' }}>
              {preview.state === 'expired' ? 'This invitation has expired. Ask for a new link.' : preview.state === 'revoked' ? 'This invitation was revoked.' : 'This invitation has already been used.'}
            </Txt>
          ) : (
            <Button title="Join group" size="lg" loading={busy} onPress={accept} />
          )}
        </Card>
      )}
    </Screen>
  );
}
