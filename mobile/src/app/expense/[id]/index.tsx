import { useLayoutEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { describeActivity } from '@/lib/activity';
import {
  Avatar,
  Badge,
  Button,
  Card,
  confirm,
  Divider,
  errorMessage,
  ErrorView,
  IconBadge,
  IconButton,
  LoadingView,
  Row,
  Screen,
  Txt,
  toast,
} from '@/components/ui';
import { api, attachmentUrl, getToken } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import { expenseCategory, SPLIT_METHOD_LABELS } from '@/lib/constants';
import { formatMoney, scaledToDecimalString } from '@/lib/money';
import { colors } from '@/lib/theme';
import type { ExpenseDetail } from '@/lib/types';
import { formatDate, timeAgo } from '@/lib/utils';
import { Image } from 'expo-image';

export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useMyId();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const query = useQuery({ queryKey: ['expense', id], queryFn: () => api<ExpenseDetail>(`expenses/${id}`) });
  const deleted = !!query.data?.expense.deletedAt;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        query.data && !deleted ? (
          <IconButton icon="create-outline" label="Edit expense" onPress={() => router.push(`/expense/${id}/edit`)} />
        ) : null,
    });
  }, [navigation, query.data, deleted, id]);

  if (query.isPending) return <LoadingView />;
  if (query.isError) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;

  const { expense, payers, participants, people, receipt, history } = query.data;
  const currency = expense.currency;
  const cat = expenseCategory(expense.category);
  const name = (uid: string) => (uid === myId ? 'You' : (people[uid]?.name ?? 'Former member'));
  const myPaid = payers.find((p) => p.userId === myId)?.amountMinor ?? 0;
  const myShare = participants.find((p) => p.userId === myId)?.shareMinor ?? 0;
  const net = myPaid - myShare;

  const inputLabel = (value: number | null) => {
    if (value === null) return null;
    if (expense.splitMethod === 'percentage') return `${scaledToDecimalString(value, 2)}%`;
    if (expense.splitMethod === 'shares') return `${scaledToDecimalString(value, 2)} ${value === 100 ? 'share' : 'shares'}`;
    return null;
  };

  const toggleDone = async () => {
    try {
      await api(`expenses/${id}/done`, { method: 'POST', body: { done: !expense.doneAt } });
      await queryClient.invalidateQueries();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const remove = async () => {
    const ok = await confirm('Delete this expense?', 'Balances will be recalculated for everyone. The activity log keeps a record.', 'Delete');
    if (!ok) return;
    setDeleting(true);
    try {
      await api(`expenses/${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries();
      toast('Expense deleted');
      router.back();
    } catch (e) {
      toast(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Card style={{ gap: 12 }}>
        <Row gap={12}>
          <IconBadge icon={cat.icon} size={48} />
          <View style={{ flex: 1 }}>
            <Txt variant="h2">{expense.title}</Txt>
            <Txt variant="small">
              {cat.label} · {formatDate(expense.expenseDate)}
            </Txt>
          </View>
        </Row>
        <Txt style={{ fontSize: 30, fontWeight: '700' }}>{formatMoney(expense.amountMinor, currency)}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge label={`Split ${SPLIT_METHOD_LABELS[expense.splitMethod].toLowerCase()}`} />
          {expense.doneAt && <Badge label="Done" tone="accent" />}
          {deleted && <Badge label="Deleted" tone="negative" />}
          {expense.tags.map((t) => (
            <Badge key={t} label={`#${t}`} tone="accent" />
          ))}
        </Row>
        {(myPaid > 0 || myShare > 0) && (
          <Txt style={{ color: net > 0 ? colors.positive : net < 0 ? colors.negative : colors.muted, fontWeight: '600' }}>
            {net > 0 ? `You lent ${formatMoney(net, currency)}` : net < 0 ? `You owe ${formatMoney(-net, currency)}` : 'No balance for you'}
          </Txt>
        )}
        {expense.notes ? <Txt variant="muted">{expense.notes}</Txt> : null}
        {!deleted && (
          <Button
            title={expense.doneAt ? 'Mark as not done' : 'Mark as done'}
            icon={expense.doneAt ? 'checkmark-circle' : 'checkmark-circle-outline'}
            variant={expense.doneAt ? 'primary' : 'outline'}
            onPress={toggleDone}
          />
        )}
      </Card>

      <Card style={{ gap: 4 }}>
        <Txt variant="h3">Paid by</Txt>
        {payers.map((p) => (
          <Row key={p.userId} gap={10} style={{ paddingVertical: 6 }}>
            <Avatar id={p.userId} name={people[p.userId]?.name ?? '?'} size={30} />
            <Txt style={{ flex: 1 }}>{name(p.userId)}</Txt>
            <Txt style={{ fontWeight: '600' }}>{formatMoney(p.amountMinor, currency)}</Txt>
          </Row>
        ))}
      </Card>

      <Card style={{ gap: 4 }}>
        <Txt variant="h3">Split between {participants.length}</Txt>
        {participants.map((p) => (
          <Row key={p.userId} gap={10} style={{ paddingVertical: 6 }}>
            <Avatar id={p.userId} name={people[p.userId]?.name ?? '?'} size={30} />
            <View style={{ flex: 1 }}>
              <Txt>{name(p.userId)}</Txt>
              {inputLabel(p.inputValue) && <Txt variant="small">{inputLabel(p.inputValue)}</Txt>}
            </View>
            <Txt style={{ fontWeight: '600' }}>{formatMoney(p.shareMinor, currency)}</Txt>
          </Row>
        ))}
      </Card>

      {receipt && (
        <Card style={{ gap: 10 }}>
          <Txt variant="h3">Receipt</Txt>
          {receipt.contentType.startsWith('image/') && receipt.contentType !== 'image/heic' ? (
            <Image
              source={{ uri: attachmentUrl(receipt.id), headers: { Authorization: `Bearer ${getToken()}` } }}
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.subtle }}
              contentFit="contain"
              accessibilityLabel="Receipt photo"
            />
          ) : (
            <Row>
              <IconBadge icon="document-outline" tone="muted" size={36} />
              <View style={{ flex: 1 }}>
                <Txt numberOfLines={1}>{receipt.fileName}</Txt>
                <Txt variant="small">Open SplitMate on the web to view this file.</Txt>
              </View>
            </Row>
          )}
        </Card>
      )}

      <Card style={{ gap: 6 }}>
        <Txt variant="h3">History</Txt>
        {history.map((h, i) => (
          <View key={h.id}>
            {i > 0 && <Divider />}
            <View style={{ paddingVertical: 8 }}>
              <Txt>
                <Txt style={{ fontWeight: '600' }}>{h.actorName}</Txt>{' '}
                <Txt style={{ color: colors.muted }}>{describeActivity({ type: h.type, data: h.data }, myId)}</Txt>
              </Txt>
              <Txt variant="small">{timeAgo(h.createdAt)}</Txt>
            </View>
          </View>
        ))}
      </Card>

      {!deleted && (
        <Row>
          <Button title="Edit" icon="create-outline" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/expense/${id}/edit`)} />
          <Button title="Delete" icon="trash-outline" variant="danger" style={{ flex: 1 }} loading={deleting} onPress={remove} />
        </Row>
      )}
    </Screen>
  );
}
