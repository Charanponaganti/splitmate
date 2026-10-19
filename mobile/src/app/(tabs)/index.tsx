import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ExpenseRow } from '@/components/rows';
import {
  Avatar,
  BalanceLabel,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorView,
  Fab,
  ListItem,
  LoadingView,
  Money,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { colors } from '@/lib/theme';
import type { Dashboard } from '@/lib/types';
import { firstName } from '@/lib/utils';

export default function HomeScreen() {
  const { me } = useAuth();
  const myId = me?.id ?? '';
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('dashboard') });

  if (query.isPending) return <LoadingView />;
  if (query.isError) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  const hasGroups = data.groups.length > 0;

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      footer={hasGroups ? <Fab aboveTabBar onPress={() => router.push('/expense/new')} /> : undefined}>
      <View>
        <Txt variant="title">Hi, {firstName(me?.name ?? '')}</Txt>
        <Txt variant="muted">Here&apos;s where you stand across your groups.</Txt>
      </View>

      {!hasGroups ? (
        <Card>
          <EmptyState
            icon="people-outline"
            title="Start your first group"
            body="Create a group for a trip, your flat or a night out, then invite your friends."
            action={
              <View style={{ gap: 8 }}>
                <Button title="Create a group" icon="add" onPress={() => router.push('/group/new')} />
                <Button title="I have an invite link" variant="outline" onPress={() => router.push('/join')} />
              </View>
            }
          />
        </Card>
      ) : (
        <>
          {data.totals.length === 0 ? null : (
            data.totals.map((t) => (
              <Card key={t.currency} style={{ gap: 14 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="muted">Net balance{data.totals.length > 1 ? ` · ${t.currency}` : ''}</Txt>
                  <Money minor={t.net} currency={t.currency} style={{ fontSize: 22 }} signed />
                </Row>
                <Row gap={12}>
                  <View style={{ flex: 1, backgroundColor: colors.negativeBg, borderRadius: 12, padding: 12 }}>
                    <Txt variant="small" style={{ color: colors.negative }}>
                      You owe
                    </Txt>
                    <Txt style={{ fontWeight: '700', fontSize: 18, color: colors.negative }}>{formatMoney(t.owe, t.currency)}</Txt>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.accent, borderRadius: 12, padding: 12 }}>
                    <Txt variant="small" style={{ color: colors.positive }}>
                      You are owed
                    </Txt>
                    <Txt style={{ fontWeight: '700', fontSize: 18, color: colors.positive }}>{formatMoney(t.owed, t.currency)}</Txt>
                  </View>
                </Row>
              </Card>
            ))
          )}

          {data.pending.length > 0 && (
            <>
              <SectionHeader title="Pending settlements" />
              <Card padded={false}>
                {data.pending.map((p, i) => {
                  const iOwe = p.fromUserId === myId;
                  return (
                    <View key={`${p.groupId}-${p.fromUserId}-${p.toUserId}`}>
                      {i > 0 && <Divider />}
                      <ListItem
                        onPress={() => router.push(`/group/${p.groupId}/settle`)}
                        left={<Avatar id={p.counterparty.id} name={p.counterparty.name} />}
                        title={iOwe ? `You owe ${firstName(p.counterparty.name)}` : `${firstName(p.counterparty.name)} owes you`}
                        subtitle={p.groupName}
                        right={<Money minor={iOwe ? -p.amountMinor : p.amountMinor} currency={p.currency} />}
                        chevron
                      />
                    </View>
                  );
                })}
              </Card>
            </>
          )}

          <SectionHeader title="Your groups" action={<Button title="See all" variant="ghost" size="sm" onPress={() => router.push('/groups')} />} />
          <Card padded={false}>
            {data.groups.slice(0, 5).map((g, i) => (
              <View key={g.id}>
                {i > 0 && <Divider />}
                <ListItem
                  onPress={() => router.push(`/group/${g.id}`)}
                  title={g.name}
                  subtitle={<BalanceLabel minor={g.myBalance} currency={g.currency} size={13} />}
                  chevron
                />
              </View>
            ))}
          </Card>

          <SectionHeader title="Recent expenses" />
          <Card padded={false}>
            {data.recentExpenses.length === 0 ? (
              <EmptyState icon="receipt-outline" title="No expenses yet" body="Tap “Add expense” to record your first one." />
            ) : (
              data.recentExpenses.map((e, i) => (
                <View key={e.id}>
                  {i > 0 && <Divider />}
                  <ExpenseRow expense={e} myId={myId} showGroup />
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
