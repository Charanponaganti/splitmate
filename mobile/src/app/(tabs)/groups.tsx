import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AvatarStack, BalanceLabel, Button, Card, EmptyState, ErrorView, IconBadge, LoadingView, Row, Screen, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { groupCategory } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { colors } from '@/lib/theme';
import type { GroupSummary } from '@/lib/types';

export default function GroupsScreen() {
  const query = useQuery({ queryKey: ['groups'], queryFn: () => api<GroupSummary[]>('groups') });

  if (query.isPending) return <LoadingView />;
  if (query.isError) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Row>
        <Button title="New group" icon="add" style={{ flex: 1 }} onPress={() => router.push('/group/new')} />
        <Button title="Join with link" icon="link" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/join')} />
      </Row>

      {query.data.length === 0 ? (
        <Card>
          <EmptyState icon="people-outline" title="No groups yet" body="Groups keep their own expenses, balances and settlements." />
        </Card>
      ) : (
        query.data.map((g) => {
          const cat = groupCategory(g.category);
          return (
            <Pressable key={g.id} onPress={() => router.push(`/group/${g.id}`)} accessibilityRole="button">
              {({ pressed }) => (
                <Card style={[{ gap: 14 }, pressed && { backgroundColor: colors.subtle }]}>
                  <Row gap={12}>
                    <IconBadge icon={cat.icon} size={44} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3" numberOfLines={1}>
                        {g.name}
                      </Txt>
                      <Txt variant="small">
                        {cat.label} · {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                      </Txt>
                    </View>
                  </Row>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <View style={{ gap: 2 }}>
                      <BalanceLabel minor={g.myBalance} currency={g.currency} />
                      <Txt variant="small">{formatMoney(g.totalSpent, g.currency)} total spent</Txt>
                    </View>
                    <AvatarStack people={g.members} />
                  </Row>
                </Card>
              )}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
