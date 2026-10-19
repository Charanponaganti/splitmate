import { useLayoutEffect } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ExpenseRow } from '@/components/rows';
import {
  Avatar,
  BalanceLabel,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorView,
  Fab,
  IconBadge,
  IconButton,
  listCell,
  LoadingView,
  Money,
  Row,
  Txt,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import { groupCategory } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { colors } from '@/lib/theme';
import type { ExpensePage, GroupDetail } from '@/lib/types';
import { firstName } from '@/lib/utils';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useMyId();
  const navigation = useNavigation();

  const group = useQuery({ queryKey: ['group', id], queryFn: () => api<GroupDetail>(`groups/${id}`) });
  const expenses = useInfiniteQuery({
    queryKey: ['expenses', 'group', id],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<ExpensePage>(`groups/${id}/expenses?page=${pageParam}`),
    getNextPageParam: (last) => (last.page < last.pageCount ? last.page + 1 : undefined),
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: group.data?.group.name ?? '',
      headerRight: () => <IconButton icon="settings-outline" label="Group settings" onPress={() => router.push(`/group/${id}/settings`)} />,
    });
  }, [navigation, group.data?.group.name, id]);

  if (group.isPending) return <LoadingView />;
  if (group.isError) return <ErrorView error={group.error} onRetry={() => group.refetch()} />;

  const g = group.data;
  const currency = g.group.currency;
  const myBalance = g.balances[myId] ?? 0;
  const items = expenses.data?.pages.flatMap((p) => p.items) ?? [];
  const nameOf = (uid: string) => (uid === myId ? 'You' : firstName(g.members.find((m) => m.id === uid)?.name ?? 'Former member'));
  const myTransfers = g.transfers.filter((t) => t.fromUserId === myId || t.toUserId === myId);

  const header = (
    <View style={{ gap: 16, paddingBottom: 12 }}>
      <Card style={{ gap: 12 }}>
        <Row gap={12}>
          <IconBadge icon={groupCategory(g.group.category).icon} size={48} />
          <View style={{ flex: 1, gap: 4 }}>
            <Row gap={6}>
              <Badge label={groupCategory(g.group.category).label} />
              <Badge label={currency} />
            </Row>
            {g.group.description ? <Txt variant="small">{g.group.description}</Txt> : null}
          </View>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Txt variant="small">Your balance</Txt>
            <BalanceLabel minor={myBalance} currency={currency} size={17} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Txt variant="small">Total spent</Txt>
            <Txt style={{ fontWeight: '700' }}>{formatMoney(g.totalSpent, currency)}</Txt>
          </View>
        </Row>
        {myTransfers.length > 0 && (
          <View style={{ gap: 4 }}>
            {myTransfers.map((t) => (
              <Txt key={`${t.fromUserId}-${t.toUserId}`} variant="small">
                {t.fromUserId === myId ? `You pay ${nameOf(t.toUserId)}` : `${nameOf(t.fromUserId)} pays you`}{' '}
                <Txt variant="small" style={{ fontWeight: '700', color: t.fromUserId === myId ? colors.negative : colors.positive }}>
                  {formatMoney(t.amountMinor, currency)}
                </Txt>
              </Txt>
            ))}
          </View>
        )}
        <Row>
          <Button title="Settle up" icon="swap-horizontal" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/group/${id}/settle`)} />
          <Button title="Invite" icon="person-add-outline" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/group/${id}/settings`)} />
        </Row>
      </Card>

      <Card padded={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
          <Txt variant="h3">Balances</Txt>
        </View>
        {g.activeMembers.map((m) => (
          <Row key={m.id} gap={12} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <Avatar id={m.id} name={m.name} size={32} />
            <Txt style={{ flex: 1 }} numberOfLines={1}>
              {m.id === myId ? 'You' : m.name}
            </Txt>
            {m.balance === 0 ? <Txt variant="small">settled</Txt> : <Money minor={m.balance} currency={currency} signed />}
          </Row>
        ))}
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="h3">Expenses</Txt>
        <Txt variant="small">{g.expenseCount} total</Txt>
      </Row>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={group.isRefetching || (expenses.isRefetching && !expenses.isFetchingNextPage)}
            onRefresh={() => {
              group.refetch();
              expenses.refetch();
            }}
            colors={[colors.primary]}
          />
        }
        ItemSeparatorComponent={Divider}
        renderItem={({ item, index }) => (
          <View style={listCell(index, items.length)}>
            <ExpenseRow expense={item} myId={myId} />
          </View>
        )}
        onEndReached={() => expenses.hasNextPage && !expenses.isFetchingNextPage && expenses.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          expenses.isPending ? null : (
            <Card>
              <EmptyState icon="receipt-outline" title="No expenses yet" body="Add the first one — everyone in the group will see it instantly." />
            </Card>
          )
        }
      />
      <Fab onPress={() => router.push(`/expense/new?groupId=${id}`)} />
    </View>
  );
}
