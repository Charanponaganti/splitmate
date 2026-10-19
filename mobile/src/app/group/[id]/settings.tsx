import { useState } from 'react';
import { Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  confirm,
  Divider,
  errorMessage,
  ErrorView,
  Field,
  Input,
  LoadingView,
  Money,
  Row,
  Screen,
  Txt,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import { GROUP_CATEGORIES } from '@/lib/constants';
import { colors } from '@/lib/theme';
import type { GroupDetail, GroupMember } from '@/lib/types';
import { expiresIn } from '@/lib/utils';

interface Invitation {
  id: string;
  email: string | null;
  expiresAt: string;
  useCount: number;
  maxUses: number | null;
  invitedByName: string;
}

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useMyId();
  const queryClient = useQueryClient();
  const group = useQuery({ queryKey: ['group', id], queryFn: () => api<GroupDetail>(`groups/${id}`) });
  const invitations = useQuery({ queryKey: ['invitations', id], queryFn: () => api<Invitation[]>(`groups/${id}/invitations`) });

  if (group.isPending) return <LoadingView />;
  if (group.isError) return <ErrorView error={group.error} onRetry={() => group.refetch()} />;
  const g = group.data;
  const isAdmin = g.myRole === 'owner' || g.myRole === 'admin';
  const refresh = () => queryClient.invalidateQueries();

  return (
    <Screen refreshing={group.isRefetching} onRefresh={() => group.refetch()}>
      <InviteCard groupId={id} groupName={g.group.name} onCreated={() => invitations.refetch()} />

      <Card padded={false}>
        <View style={{ padding: 16, paddingBottom: 6 }}>
          <Txt variant="h3">Members · {g.activeMembers.length}</Txt>
        </View>
        {g.activeMembers.map((m, i) => (
          <View key={m.id}>
            {i > 0 && <Divider />}
            <MemberRow member={m} groupId={id} myId={myId} myRole={g.myRole} currency={g.group.currency} onChanged={refresh} />
          </View>
        ))}
      </Card>

      {isAdmin && <AddByEmail groupId={id} onAdded={refresh} />}

      {invitations.data && invitations.data.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Txt variant="h3">Open invitations</Txt>
          {invitations.data.map((inv, i) => (
            <View key={inv.id}>
              {i > 0 && <Divider />}
              <Row style={{ paddingVertical: 8 }}>
                <View style={{ flex: 1 }}>
                  <Txt numberOfLines={1}>{inv.email ?? 'Shareable link'}</Txt>
                  <Txt variant="small">
                    by {inv.invitedByName} · used {inv.useCount}
                    {inv.maxUses ? `/${inv.maxUses}` : ''} · expires {expiresIn(inv.expiresAt)}
                  </Txt>
                </View>
                {isAdmin && (
                  <Button
                    title="Revoke"
                    size="sm"
                    variant="ghost"
                    onPress={async () => {
                      if (!(await confirm('Revoke invitation?', 'The link will stop working.', 'Revoke'))) return;
                      try {
                        await api(`invitations/${inv.id}`, { method: 'DELETE' });
                        invitations.refetch();
                      } catch (e) {
                        toast(errorMessage(e));
                      }
                    }}
                  />
                )}
              </Row>
            </View>
          ))}
        </Card>
      )}

      {isAdmin && <EditGroup detail={g} onSaved={refresh} />}

      <Card style={{ gap: 10 }}>
        <Txt variant="h3">Leave group</Txt>
        <Txt variant="small">
          You can leave once your balance in this group is settled. Your past expenses stay in the group&apos;s history.
        </Txt>
        <Button
          title="Leave group"
          icon="exit-outline"
          variant="danger"
          onPress={async () => {
            if (!(await confirm('Leave this group?', 'You will no longer see its expenses.', 'Leave'))) return;
            try {
              await api(`groups/${id}/leave`, { method: 'POST' });
              queryClient.invalidateQueries();
              toast('You left the group');
              router.dismissTo('/groups');
            } catch (e) {
              toast(errorMessage(e));
            }
          }}
        />
      </Card>
    </Screen>
  );
}

function InviteCard({ groupId, groupName, onCreated }: { groupId: string; groupName: string; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const shareLink = async () => {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(`groups/${groupId}/invitations`, { method: 'POST', body: { email: null } });
      onCreated();
      await Share.share({
        message: `Join "${groupName}" on SplitMate to split expenses with me: ${url}`,
      });
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Row gap={10}>
        <Ionicons name="person-add-outline" size={20} color={colors.primary} />
        <Txt variant="h3">Invite friends</Txt>
      </Row>
      <Txt variant="small">
        Share a link on WhatsApp or anywhere else. Friends open it, sign in, and join — or paste it in the app under Groups → Join with link.
        Links expire after 7 days.
      </Txt>
      <Button title="Share invite link" icon="share-social-outline" loading={busy} onPress={shareLink} />
    </Card>
  );
}

function AddByEmail({ groupId, onAdded }: { groupId: string; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    setBusy(true);
    try {
      await api(`groups/${groupId}/members`, { method: 'POST', body: { email: email.trim() } });
      setEmail('');
      toast('Member added');
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Txt variant="h3">Add someone who already has an account</Txt>
      <Field label="Their email" error={error}>
        <Input value={email} onChangeText={setEmail} placeholder="friend@example.com" autoCapitalize="none" keyboardType="email-address" />
      </Field>
      <Button title="Add to group" variant="outline" loading={busy} onPress={add} />
    </Card>
  );
}

function MemberRow({
  member,
  groupId,
  myId,
  myRole,
  currency,
  onChanged,
}: {
  member: GroupMember;
  groupId: string;
  myId: string;
  myRole: string;
  currency: string;
  onChanged: () => void;
}) {
  const isMe = member.id === myId;
  const canRemove = !isMe && member.role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && member.role === 'member'));
  const canChangeRole = !isMe && myRole === 'owner' && member.role !== 'owner';

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast(success);
      onChanged();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
      <Row gap={12}>
        <Avatar id={member.id} name={member.name} />
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            <Txt numberOfLines={1} style={{ fontWeight: '500', flexShrink: 1 }}>
              {isMe ? `${member.name} (you)` : member.name}
            </Txt>
            {member.role !== 'member' && <Badge label={member.role === 'owner' ? 'Owner' : 'Admin'} tone="accent" />}
          </Row>
          <Txt variant="small" numberOfLines={1}>
            {member.email}
          </Txt>
        </View>
        {member.balance === 0 ? <Txt variant="small">settled</Txt> : <Money minor={member.balance} currency={currency} signed />}
      </Row>
      {(canRemove || canChangeRole) && (
        <Row style={{ justifyContent: 'flex-end' }}>
          {canChangeRole && (
            <Button
              title={member.role === 'admin' ? 'Make member' : 'Make admin'}
              size="sm"
              variant="ghost"
              onPress={() =>
                run(
                  () => api(`groups/${groupId}/members/${member.id}`, { method: 'PATCH', body: { role: member.role === 'admin' ? 'member' : 'admin' } }),
                  'Role updated',
                )
              }
            />
          )}
          {canRemove && (
            <Button
              title="Remove"
              size="sm"
              variant="ghost"
              onPress={async () => {
                if (!(await confirm(`Remove ${member.name}?`, 'Members can only be removed once their balance is settled.', 'Remove'))) return;
                run(() => api(`groups/${groupId}/members/${member.id}`, { method: 'DELETE' }), 'Member removed');
              }}
            />
          )}
        </Row>
      )}
    </View>
  );
}

function EditGroup({ detail, onSaved }: { detail: GroupDetail; onSaved: () => void }) {
  const [name, setName] = useState(detail.group.name);
  const [description, setDescription] = useState(detail.group.description ?? '');
  const [category, setCategory] = useState(detail.group.category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== detail.group.name || description !== (detail.group.description ?? '') || category !== detail.group.category;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Group name is required.');
    setBusy(true);
    try {
      await api(`groups/${detail.group.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), description: description.trim() || null, category, coverImageUrl: detail.group.coverImageUrl },
      });
      toast('Group updated');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Txt variant="h3">Group details</Txt>
      <Field label="Name" error={error}>
        <Input value={name} onChangeText={setName} maxLength={80} />
      </Field>
      <Field label="Description">
        <Input value={description} onChangeText={setDescription} maxLength={500} multiline />
      </Field>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {GROUP_CATEGORIES.map((c) => (
          <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
        ))}
      </View>
      <Txt variant="small">Currency: {detail.group.currency} (fixed)</Txt>
      <Button title="Save" loading={busy} disabled={!dirty} onPress={save} />
    </Card>
  );
}
