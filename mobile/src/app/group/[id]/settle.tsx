import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BottomSheet, DateField, Select } from '@/components/pickers';
import {
  Avatar,
  Badge,
  Button,
  Card,
  confirm,
  Divider,
  EmptyState,
  errorMessage,
  ErrorView,
  Field,
  Input,
  LoadingView,
  Row,
  Screen,
  StatusLine,
  Txt,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import { formatMoney, getCurrency, minorToDecimalString, parseToMinor } from '@/lib/money';
import { colors } from '@/lib/theme';
import type { GroupDetail, SettlementItem, Transfer } from '@/lib/types';
import { firstName, formatDate, newRequestId, sanitizeAmount, todayIso } from '@/lib/utils';

function outstanding(balances: Record<string, number>, from: string, to: string) {
  const f = balances[from] ?? 0;
  const t = balances[to] ?? 0;
  if (f >= 0 || t <= 0) return 0;
  return Math.min(-f, t);
}

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useMyId();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ from: string; to: string; amount: string } | null>(null);

  const group = useQuery({ queryKey: ['group', id], queryFn: () => api<GroupDetail>(`groups/${id}`) });
  const history = useQuery({ queryKey: ['settlements', id], queryFn: () => api<SettlementItem[]>(`groups/${id}/settlements`) });

  if (group.isPending) return <LoadingView />;
  if (group.isError) return <ErrorView error={group.error} onRetry={() => group.refetch()} />;

  const g = group.data;
  const currency = g.group.currency;
  const isAdmin = g.myRole === 'owner' || g.myRole === 'admin';
  const byId = new Map(g.members.map((m) => [m.id, m]));
  const label = (uid: string) => (uid === myId ? 'You' : firstName(byId.get(uid)?.name ?? 'Former member'));
  const canRecord = (t: Transfer) => isAdmin || t.fromUserId === myId || t.toUserId === myId;
  const mine = g.transfers.filter((t) => t.fromUserId === myId || t.toUserId === myId);
  const others = g.transfers.filter((t) => !mine.includes(t));

  const openFor = (t?: Transfer) => {
    if (t) return setForm({ from: t.fromUserId, to: t.toUserId, amount: minorToDecimalString(t.amountMinor, currency) });
    const youOwe = g.transfers.find((x) => x.fromUserId === myId);
    setForm(
      youOwe
        ? { from: youOwe.fromUserId, to: youOwe.toUserId, amount: minorToDecimalString(youOwe.amountMinor, currency) }
        : { from: myId, to: g.activeMembers.find((m) => m.id !== myId)?.id ?? '', amount: '' },
    );
  };

  const undo = async (s: SettlementItem) => {
    const ok = await confirm('Undo this repayment?', 'Balances go back to how they were. History keeps a record that it was undone.', 'Undo');
    if (!ok) return;
    try {
      await api(`settlements/${s.id}`, { method: 'DELETE' });
      toast('Repayment undone');
      queryClient.invalidateQueries();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const renderTransfer = (t: Transfer, i: number) => (
    <View key={`${t.fromUserId}-${t.toUserId}`}>
      {i > 0 && <Divider />}
      <View style={{ paddingVertical: 12, gap: 10 }}>
        <Row gap={8}>
          <Avatar id={t.fromUserId} name={byId.get(t.fromUserId)?.name ?? '?'} size={30} />
          <Ionicons name="arrow-forward" size={16} color={colors.muted} />
          <Avatar id={t.toUserId} name={byId.get(t.toUserId)?.name ?? '?'} size={30} />
          <Txt style={{ flex: 1, marginLeft: 4 }}>
            <Txt style={{ fontWeight: '600' }}>{label(t.fromUserId)}</Txt> {t.fromUserId === myId ? 'pay' : 'pays'}{' '}
            <Txt style={{ fontWeight: '600' }}>{label(t.toUserId)}</Txt>
          </Txt>
          <Txt
            style={{
              fontWeight: '700',
              color: t.fromUserId === myId ? colors.negative : t.toUserId === myId ? colors.positive : colors.text,
            }}>
            {formatMoney(t.amountMinor, currency)}
          </Txt>
        </Row>
        {canRecord(t) && (
          <Button
            title="Mark as paid"
            icon="checkmark-circle-outline"
            size="sm"
            variant={t.fromUserId === myId || t.toUserId === myId ? 'primary' : 'outline'}
            onPress={() => openFor(t)}
          />
        )}
      </View>
    </View>
  );

  return (
    <Screen
      refreshing={group.isRefetching || history.isRefetching}
      onRefresh={() => {
        group.refetch();
        history.refetch();
      }}>
      <Row style={{ backgroundColor: colors.subtle, borderRadius: 12, padding: 12, alignItems: 'flex-start' }}>
        <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
        <Txt variant="small" style={{ flex: 1 }}>
          Recording a repayment only updates balances in SplitMate — it doesn&apos;t move money. Pay by UPI, bank transfer or cash first, then
          record it here.
        </Txt>
      </Row>

      <Card style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Suggested payments</Txt>
            <Txt variant="small">
              {g.transfers.length === 0 ? 'Everyone is settled up.' : `The fewest payments (${g.transfers.length}) that settle everyone.`}
            </Txt>
          </View>
          <Button title="Record" icon="add" size="sm" variant="outline" onPress={() => openFor()} />
        </Row>
        {g.transfers.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="All settled up" body="No one owes anything in this group." />
        ) : (
          <>
            {mine.map(renderTransfer)}
            {others.length > 0 && (
              <>
                {mine.length > 0 && (
                  <Txt variant="small" style={{ marginTop: 10, fontWeight: '600', textTransform: 'uppercase' }}>
                    Between others
                  </Txt>
                )}
                {others.map(renderTransfer)}
              </>
            )}
          </>
        )}
      </Card>

      <Card style={{ gap: 6 }}>
        <Txt variant="h3">Repayment history</Txt>
        {history.isPending ? (
          <Txt variant="muted">Loading…</Txt>
        ) : !history.data?.length ? (
          <Txt variant="muted">No repayments recorded yet.</Txt>
        ) : (
          history.data.map((h, i) => {
            const undoable = !h.deletedAt && (isAdmin || [h.createdBy, h.fromUserId, h.toUserId].includes(myId));
            return (
              <View key={h.id}>
                {i > 0 && <Divider />}
                <View style={{ paddingVertical: 10, gap: 4, opacity: h.deletedAt ? 0.55 : 1 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt style={{ flex: 1, textDecorationLine: h.deletedAt ? 'line-through' : 'none' }}>
                      <Txt style={{ fontWeight: '600' }}>{h.fromUserId === myId ? 'You' : h.fromName}</Txt> paid{' '}
                      <Txt style={{ fontWeight: '600' }}>{h.toUserId === myId ? 'you' : h.toName}</Txt>
                    </Txt>
                    <Txt style={{ fontWeight: '700' }}>{formatMoney(h.amountMinor, currency)}</Txt>
                  </Row>
                  <Txt variant="small">
                    {formatDate(h.settledOn)} · recorded by {h.createdBy === myId ? 'you' : h.createdByName}
                    {h.note ? ` · “${h.note}”` : ''}
                  </Txt>
                  <Row>
                    {h.isOverpayment && <Badge label="Overpayment" />}
                    {h.deletedAt && <Badge label="Undone" />}
                    {undoable && <Button title="Undo" icon="arrow-undo-outline" variant="ghost" size="sm" onPress={() => undo(h)} />}
                  </Row>
                </View>
              </View>
            );
          })
        )}
      </Card>

      {form && (
        <RecordSheet
          key={`${form.from}-${form.to}-${form.amount}`}
          groupId={id}
          currency={currency}
          members={g.activeMembers}
          balances={g.balances}
          myId={myId}
          isAdmin={isAdmin}
          initial={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            queryClient.invalidateQueries();
          }}
        />
      )}
    </Screen>
  );
}

function RecordSheet({
  groupId,
  currency,
  members,
  balances,
  myId,
  isAdmin,
  initial,
  onClose,
  onSaved,
}: {
  groupId: string;
  currency: string;
  members: { id: string; name: string }[];
  balances: Record<string, number>;
  myId: string;
  isAdmin: boolean;
  initial: { from: string; to: string; amount: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [requestId] = useState(newRequestId);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [overpay, setOverpay] = useState(false);
  const [pending, setPending] = useState(false);
  const { symbol } = getCurrency(currency);

  const amountMinor = parseToMinor(amount, currency);
  const max = outstanding(balances, from, to);
  const over = amountMinor !== null && amountMinor > max;
  const permitted = isAdmin || from === myId || to === myId;

  let error: string | null = null;
  if (from === to) error = 'Choose two different people.';
  else if (!permitted) error = 'Only the people involved or a group admin can record this.';
  else if (amount !== '' && (amountMinor === null || amountMinor <= 0)) error = 'Enter a valid amount.';
  else if (over && !overpay)
    error = max === 0 ? 'Nothing is owed in this direction. Turn on overpayment if intended.' : `More than the outstanding ${formatMoney(max, currency)}.`;

  const options = members.map((m) => ({ value: m.id, label: m.id === myId ? 'You' : m.name, left: <Avatar id={m.id} name={m.name} size={28} /> }));

  const submit = async () => {
    if (error || !amountMinor) return;
    setPending(true);
    try {
      const result = await api<{ duplicate?: boolean }>('settlements', {
        method: 'POST',
        body: {
          groupId,
          fromUserId: from,
          toUserId: to,
          amountMinor,
          settledOn: date,
          note: note.trim() || null,
          allowOverpayment: overpay,
          clientRequestId: requestId,
        },
      });
      toast(result?.duplicate ? 'Already recorded' : 'Repayment recorded');
      onSaved();
    } catch (e) {
      toast(errorMessage(e));
      setPending(false);
    }
  };

  return (
    <BottomSheet visible onClose={() => !pending && onClose()} title="Record a repayment">
      <Txt variant="muted">Confirm a payment that already happened outside the app.</Txt>
      <Field label="Who paid">
        <Select title="Who paid" value={from} options={options} onChange={setFrom} />
      </Field>
      <Field label="Who received">
        <Select title="Who received" value={to} options={options} onChange={setTo} />
      </Field>
      <Field label={from !== to ? `Amount · outstanding ${formatMoney(max, currency)}` : 'Amount'}>
        <Row>
          <Txt style={{ fontSize: 20, color: colors.muted }}>{symbol}</Txt>
          <Input
            value={amount}
            onChangeText={(t) => setAmount(sanitizeAmount(t))}
            keyboardType="decimal-pad"
            placeholder="0"
            style={{ flex: 1, fontSize: 20, fontWeight: '700' }}
          />
          {max > 0 && <Button title="Full" size="sm" variant="ghost" onPress={() => setAmount(minorToDecimalString(max, currency))} />}
        </Row>
      </Field>
      <Field label="Date paid">
        <DateField value={date} onChange={setDate} maxToday />
      </Field>
      <Field label="Note (optional)">
        <Input value={note} onChangeText={setNote} placeholder="UPI ref, cash…" maxLength={300} />
      </Field>
      {over && (
        <Row style={{ justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: '600' }}>Record as overpayment</Txt>
            <Txt variant="small">The extra will be owed back to the payer.</Txt>
          </View>
          <Switch value={overpay} onValueChange={setOverpay} trackColor={{ true: colors.primary }} />
        </Row>
      )}
      {error && <StatusLine ok={false} text={error} />}
      <Button title="Record repayment" size="lg" loading={pending} disabled={!!error || !amountMinor} onPress={submit} />
    </BottomSheet>
  );
}
