import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { api, uploadReceipt } from '@/lib/api';
import { EXPENSE_CATEGORIES, SPLIT_METHOD_LABELS } from '@/lib/constants';
import {
  allocateProportionally,
  computeSplit,
  expenseTransfers,
  formatMoney,
  getCurrency,
  minorToDecimalString,
  parseScaledDecimal,
  parseToMinor,
  PERCENT_SCALE,
  scaledToDecimalString,
  SPLIT_METHODS,
  validatePayers,
  type SplitMethod,
} from '@/lib/money';
import { colors, radius } from '@/lib/theme';
import type { Person } from '@/lib/types';
import { firstName, newRequestId, sanitizeAmount, todayIso } from '@/lib/utils';
import { DateField } from './pickers';
import { Avatar, BottomBar, Button, Card, Checkbox, Chip, errorMessage, Field, Input, Row, Segmented, StatusLine, Txt, toast } from './ui';

export interface ExpenseFormInitial {
  expenseId: string;
  version: number;
  title: string;
  amountMinor: number;
  category: string;
  expenseDate: string;
  notes: string | null;
  tags: string[];
  splitMethod: SplitMethod;
  payers: { userId: string; amountMinor: number }[];
  participants: { userId: string; inputValue: number | null }[];
  receipt: { id: string; fileName: string } | null;
}

/** Percentages and shares accept two decimal places. */
const VALUE_DECIMALS = 2;

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

export function ExpenseForm({
  groupId,
  currency,
  members,
  myId,
  initial,
}: {
  groupId: string;
  currency: string;
  members: Person[];
  myId: string;
  initial?: ExpenseFormInitial;
}) {
  const queryClient = useQueryClient();
  const { decimals, symbol } = getCurrency(currency);
  const [requestId] = useState(newRequestId);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'food');
  const [date, setDate] = useState(initial?.expenseDate ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [showExtras, setShowExtras] = useState(!!(initial?.notes || initial?.tags.length || initial?.receipt));
  const [amount, setAmount] = useState(initial ? minorToDecimalString(initial.amountMinor, currency) : '');
  const [multiPayer, setMultiPayer] = useState((initial?.payers.length ?? 0) > 1);
  const [payerId, setPayerId] = useState(
    initial?.payers[0]?.userId ?? (members.some((m) => m.id === myId) ? myId : members[0]?.id),
  );
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.payers ?? []).map((p) => [p.userId, minorToDecimalString(p.amountMinor, currency)])),
  );
  const [included, setIncluded] = useState<string[]>(initial ? initial.participants.map((p) => p.userId) : members.map((m) => m.id));
  const [method, setMethod] = useState<SplitMethod>(initial?.splitMethod ?? 'equal');
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!initial || initial.splitMethod === 'equal') return {};
    return Object.fromEntries(
      initial.participants.map((p) => [
        p.userId,
        p.inputValue === null
          ? ''
          : initial.splitMethod === 'exact'
            ? minorToDecimalString(p.inputValue, currency)
            : scaledToDecimalString(p.inputValue, VALUE_DECIMALS),
      ]),
    );
  });
  const [receipt, setReceipt] = useState(initial?.receipt ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const amountMinor = parseToMinor(amount, currency);
  const amountValid = amountMinor !== null && amountMinor > 0;
  const total = amountValid ? amountMinor : 0;
  const nameOf = (id: string) => (id === myId ? 'You' : firstName(members.find((m) => m.id === id)?.name ?? 'Someone'));

  /* Payers ----------------------------------------------------------------- */
  const payers = useMemo(() => {
    if (!multiPayer) return payerId ? [{ userId: payerId, amountMinor: total }] : [];
    return members
      .filter((m) => (payerAmounts[m.id] ?? '').trim() !== '')
      .map((m) => ({ userId: m.id, amountMinor: parseToMinor(payerAmounts[m.id], currency) ?? -1 }));
  }, [multiPayer, payerId, total, members, payerAmounts, currency]);
  const payerSum = payers.reduce((s, p) => s + Math.max(0, p.amountMinor), 0);
  const payerCheck = payers.some((p) => p.amountMinor < 0)
    ? ({ ok: false, error: `Check the paid amounts — use up to ${decimals} decimal places.` } as const)
    : validatePayers(total, payers);

  /* Split ------------------------------------------------------------------ */
  const orderedIncluded = members.filter((m) => included.includes(m.id)).map((m) => m.id);
  const parseValue = (raw: string | undefined): number | null => {
    if (!raw || raw.trim() === '') return null;
    return method === 'exact' ? parseToMinor(raw, currency) : parseScaledDecimal(raw, VALUE_DECIMALS);
  };
  const participantInputs = orderedIncluded.map((userId) => ({ userId, value: method === 'equal' ? null : parseValue(values[userId]) }));
  const invalidValue = method !== 'equal' && orderedIncluded.some((id) => (values[id] ?? '').trim() !== '' && parseValue(values[id]) === null);
  const split =
    amountValid && !invalidValue ? computeSplit(total, method, participantInputs.map((p) => ({ ...p, value: p.value ?? 0 }))) : null;
  const shareOf = (id: string) => (split?.ok ? (split.shares.find((s) => s.userId === id)?.shareMinor ?? 0) : null);
  const assigned = participantInputs.reduce((s, p) => s + (p.value ?? 0), 0);

  let splitStatus: { ok: boolean; text: string } | null = null;
  if (!amountValid) splitStatus = { ok: false, text: 'Enter the total amount first.' };
  else if (orderedIncluded.length === 0) splitStatus = { ok: false, text: 'Choose at least one person to share this expense.' };
  else if (invalidValue) splitStatus = { ok: false, text: "One of the values isn't a valid number." };
  else if (method === 'exact') {
    const left = total - assigned;
    splitStatus =
      left === 0 && split?.ok
        ? { ok: true, text: 'Amounts add up to the total.' }
        : left === 0
          ? { ok: false, text: split && !split.ok ? split.error : '' }
          : { ok: false, text: left > 0 ? `${formatMoney(left, currency)} left to assign` : `${formatMoney(-left, currency)} over the total` };
  } else if (method === 'percentage') {
    const left = PERCENT_SCALE - assigned;
    splitStatus =
      left === 0 && split?.ok
        ? { ok: true, text: 'Percentages add up to 100%.' }
        : left === 0
          ? { ok: false, text: split && !split.ok ? split.error : '' }
          : { ok: false, text: left > 0 ? `${scaledToDecimalString(left, 2)}% left to assign` : `${scaledToDecimalString(-left, 2)}% over 100%` };
  } else if (split && !split.ok) splitStatus = { ok: false, text: split.error };
  else if (split?.ok) {
    splitStatus = {
      ok: true,
      text:
        method === 'equal'
          ? `${formatMoney(Math.floor(total / orderedIncluded.length), currency)} each${total % orderedIncluded.length ? ' (remainder spread fairly)' : ''}`
          : `${scaledToDecimalString(assigned, 2)} shares in total`,
    };
  }

  const canSave = amountValid && payerCheck.ok && !!split?.ok && !uploading && !saving;
  const transfers = amountValid && payerCheck.ok && split?.ok ? expenseTransfers({ payers, participants: split.shares }) : [];

  /* Actions ---------------------------------------------------------------- */
  const toggleIncluded = (id: string) => setIncluded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const changeMethod = (next: SplitMethod) => {
    setMethod(next);
    if (next === 'shares') setValues(Object.fromEntries(members.map((m) => [m.id, '1'])));
    else if (next !== method) setValues({});
  };

  const fillEvenly = () => {
    if (orderedIncluded.length === 0) return;
    if (method === 'percentage') {
      const parts = allocateProportionally(PERCENT_SCALE, orderedIncluded.map(() => 1));
      setValues(Object.fromEntries(orderedIncluded.map((id, i) => [id, scaledToDecimalString(parts[i], 2)])));
    } else if (method === 'exact' && amountValid) {
      const parts = allocateProportionally(total, orderedIncluded.map(() => 1));
      setValues(Object.fromEntries(orderedIncluded.map((id, i) => [id, minorToDecimalString(parts[i], currency)])));
    }
  };

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return toast('Receipts must be 5 MB or smaller.');
    setUploading(true);
    try {
      const uploaded = await uploadReceipt(groupId, {
        uri: asset.uri,
        name: asset.fileName ?? 'receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      setReceipt(uploaded);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setTitleError(null);
    if (!title.trim()) {
      setTitleError('Add a short description.');
      return;
    }
    if (!amountValid) return toast('Enter a valid amount.');
    if (!payerCheck.ok) return toast(payerCheck.error);
    if (!split?.ok) return toast(splitStatus?.text || 'Check how the expense is split.');

    const payload = {
      title: title.trim(),
      amountMinor: total,
      category,
      expenseDate: date,
      notes: notes.trim() || null,
      tags: parseTags(tags),
      splitMethod: method,
      payers,
      participants: participantInputs.map((p) => ({ userId: p.userId, value: method === 'equal' ? null : p.value })),
      receiptAttachmentId: receipt?.id ?? null,
    };

    setSaving(true);
    try {
      if (initial) {
        await api(`expenses/${initial.expenseId}`, { method: 'PATCH', body: { ...payload, expectedVersion: initial.version } });
        toast('Expense updated');
      } else {
        const result = await api<{ duplicate?: boolean }>('expenses', { method: 'POST', body: { ...payload, groupId, clientRequestId: requestId } });
        toast(result?.duplicate ? 'Already saved' : 'Expense added');
      }
      queryClient.invalidateQueries();
      router.back();
    } catch (e) {
      toast(errorMessage(e));
      setSaving(false);
    }
  };

  /* Render ----------------------------------------------------------------- */
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        <Card style={{ gap: 14 }}>
          <View>
            <Txt variant="small">Total amount</Txt>
            <Row style={{ borderBottomWidth: 2, borderColor: amount !== '' && !amountValid ? colors.negative : colors.primary, paddingBottom: 4 }}>
              <Text style={{ fontSize: 30, color: colors.muted, fontWeight: '500' }}>{symbol}</Text>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(sanitizeAmount(t))}
                keyboardType="decimal-pad"
                placeholder={decimals ? `0.${'0'.repeat(decimals)}` : '0'}
                placeholderTextColor="#d4d4d8"
                autoFocus={!initial}
                accessibilityLabel="Total amount"
                style={{ flex: 1, fontSize: 34, fontWeight: '700', color: colors.text, paddingVertical: 4 }}
              />
            </Row>
            {amount !== '' && !amountValid && (
              <Txt variant="small" style={{ color: colors.negative, marginTop: 4 }}>
                Enter a positive amount with up to {decimals} decimal places.
              </Txt>
            )}
          </View>
          <Field label="What was it for?" error={titleError}>
            <Input value={title} onChangeText={setTitle} placeholder="Dinner, cab to airport, groceries…" maxLength={120} />
          </Field>
          <Field label="Date">
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Category">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {EXPENSE_CATEGORIES.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  selected={category === c.value}
                  onPress={() => setCategory(c.value)}
                  left={<Ionicons name={c.icon} size={16} color={category === c.value ? colors.primary : colors.muted} />}
                />
              ))}
            </ScrollView>
          </Field>
        </Card>

        {/* Paid by */}
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt variant="h3">Paid by</Txt>
              <Txt variant="small">Who handed over the money.</Txt>
            </View>
            <Row gap={6}>
              <Txt variant="small">Multiple</Txt>
              <Switch
                value={multiPayer}
                trackColor={{ true: colors.primary }}
                onValueChange={(checked) => {
                  setMultiPayer(checked);
                  if (checked && payerId && Object.keys(payerAmounts).length === 0 && amountValid) {
                    setPayerAmounts({ [payerId]: minorToDecimalString(total, currency) });
                  }
                }}
              />
            </Row>
          </Row>
          {!multiPayer ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {members.map((m) => (
                <Chip
                  key={m.id}
                  label={m.id === myId ? 'You' : m.name}
                  selected={payerId === m.id}
                  onPress={() => setPayerId(m.id)}
                  left={<Avatar id={m.id} name={m.name} size={24} />}
                />
              ))}
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {members.map((m) => (
                <Row key={m.id} gap={10}>
                  <Avatar id={m.id} name={m.name} size={32} />
                  <Txt style={{ flex: 1 }} numberOfLines={1}>
                    {m.id === myId ? 'You' : m.name}
                  </Txt>
                  <Input
                    value={payerAmounts[m.id] ?? ''}
                    onChangeText={(t) => setPayerAmounts((cur) => ({ ...cur, [m.id]: sanitizeAmount(t) }))}
                    keyboardType="decimal-pad"
                    placeholder={`${symbol}0`}
                    accessibilityLabel={`Amount paid by ${m.name}`}
                    style={{ width: 120, textAlign: 'right' }}
                  />
                </Row>
              ))}
              <StatusLine
                ok={payerCheck.ok}
                text={
                  !amountValid
                    ? 'Enter the total amount first.'
                    : payerCheck.ok
                      ? 'Contributions add up to the total.'
                      : payerSum !== total
                        ? total - payerSum > 0
                          ? `${formatMoney(total - payerSum, currency)} still unaccounted for`
                          : `${formatMoney(payerSum - total, currency)} more than the total`
                        : payerCheck.error
                }
              />
            </View>
          )}
        </Card>

        {/* Split */}
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Split between</Txt>
              <Txt variant="small">Only the people ticked here are charged.</Txt>
            </View>
            <Button
              title={included.length === members.length ? 'Clear' : 'Everyone'}
              size="sm"
              variant="ghost"
              onPress={() => setIncluded(included.length === members.length ? [] : members.map((m) => m.id))}
            />
          </Row>
          <Segmented
            value={method}
            onChange={changeMethod}
            options={SPLIT_METHODS.map((m) => ({ value: m, label: { equal: 'Equal', exact: 'Exact', percentage: '%', shares: 'Shares' }[m] }))}
          />
          <View>
            {members.map((m) => {
              const isIn = included.includes(m.id);
              const share = isIn ? shareOf(m.id) : 0;
              return (
                <Row key={m.id} gap={10} style={{ minHeight: 52, borderBottomWidth: 1, borderColor: colors.subtle }}>
                  <Pressable
                    onPress={() => toggleIncluded(m.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isIn }}
                    accessibilityLabel={m.name}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingVertical: 8 }}>
                    <Checkbox checked={isIn} />
                    <Avatar id={m.id} name={m.name} size={30} />
                    <Txt style={{ flex: 1, color: isIn ? colors.text : colors.muted }} numberOfLines={1}>
                      {m.id === myId ? 'You' : m.name}
                    </Txt>
                  </Pressable>
                  {isIn && method !== 'equal' && (
                    <Input
                      value={values[m.id] ?? ''}
                      onChangeText={(t) => setValues((cur) => ({ ...cur, [m.id]: sanitizeAmount(t) }))}
                      keyboardType="decimal-pad"
                      placeholder={method === 'shares' ? '1' : method === 'percentage' ? '%' : `${symbol}0`}
                      accessibilityLabel={`${SPLIT_METHOD_LABELS[method]} for ${m.name}`}
                      style={{ width: 84, textAlign: 'right', minHeight: 40 }}
                    />
                  )}
                  <Txt style={{ width: 88, textAlign: 'right', fontWeight: isIn ? '600' : '400', color: isIn ? colors.text : colors.muted }}>
                    {!isIn ? '—' : share === null ? '…' : formatMoney(share, currency)}
                  </Txt>
                </Row>
              );
            })}
          </View>
          {splitStatus && <StatusLine ok={splitStatus.ok} text={splitStatus.text} />}
          {(method === 'percentage' || method === 'exact') && orderedIncluded.length > 0 && (
            <Button title="Fill in evenly" size="sm" variant="ghost" onPress={fillEvenly} style={{ alignSelf: 'flex-start' }} />
          )}
        </Card>

        {transfers.length > 0 && (
          <View style={{ backgroundColor: colors.accent, borderRadius: radius.lg, padding: 14, gap: 6 }}>
            <Txt style={{ fontWeight: '600' }}>Who owes whom for this expense</Txt>
            {transfers.map((t) => (
              <Row key={`${t.fromUserId}-${t.toUserId}`}>
                <Txt style={{ fontWeight: '600' }}>{nameOf(t.fromUserId)}</Txt>
                <Ionicons name="arrow-forward" size={14} color={colors.muted} />
                <Txt style={{ fontWeight: '600', flex: 1 }}>{nameOf(t.toUserId)}</Txt>
                <Txt style={{ fontWeight: '700' }}>{formatMoney(t.amountMinor, currency)}</Txt>
              </Row>
            ))}
          </View>
        )}

        <Card style={{ gap: 12 }}>
          <Pressable onPress={() => setShowExtras((v) => !v)} accessibilityRole="button">
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt style={{ fontWeight: '600' }}>
                Notes, tags & receipt <Txt variant="small">(optional)</Txt>
              </Txt>
              <Ionicons name={showExtras ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Row>
          </Pressable>
          {showExtras && (
            <>
              <Field label="Notes">
                <Input value={notes} onChangeText={setNotes} multiline maxLength={1000} />
              </Field>
              <Field label="Tags" hint="Separate with commas.">
                <Input value={tags} onChangeText={setTags} placeholder="beach, day-2" autoCapitalize="none" />
              </Field>
              <Field label="Receipt">
                {receipt ? (
                  <Row style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10 }}>
                    <Ionicons name="attach" size={18} color={colors.muted} />
                    <Txt style={{ flex: 1 }} numberOfLines={1}>
                      {receipt.fileName}
                    </Txt>
                    <Pressable onPress={() => setReceipt(null)} accessibilityLabel="Remove receipt" hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.negative} />
                    </Pressable>
                  </Row>
                ) : (
                  <Button title="Attach receipt photo" icon="image-outline" variant="outline" loading={uploading} onPress={pickReceipt} />
                )}
              </Field>
            </>
          )}
        </Card>
      </ScrollView>

      <BottomBar>
        <Row gap={12}>
          <View style={{ flex: 1 }}>
            <Txt variant="small">Total</Txt>
            <Txt style={{ fontWeight: '700', fontSize: 17 }}>{amountValid ? formatMoney(total, currency) : '—'}</Txt>
          </View>
          <Button title={initial ? 'Save changes' : 'Add expense'} size="lg" loading={saving} disabled={!canSave} onPress={submit} style={{ minWidth: 160 }} />
        </Row>
      </BottomBar>
    </View>
  );
}
