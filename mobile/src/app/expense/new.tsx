import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ExpenseForm } from '@/components/expense-form';
import { Card, Divider, EmptyState, ErrorView, IconBadge, ListItem, LoadingView, Screen, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import { groupCategory } from '@/lib/constants';
import type { GroupDetail, GroupSummary } from '@/lib/types';

export default function NewExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  return groupId ? <FormForGroup groupId={groupId} /> : <PickGroup />;
}

function FormForGroup({ groupId }: { groupId: string }) {
  const myId = useMyId();
  const group = useQuery({ queryKey: ['group', groupId], queryFn: () => api<GroupDetail>(`groups/${groupId}`) });
  if (group.isPending) return <LoadingView />;
  if (group.isError) return <ErrorView error={group.error} onRetry={() => group.refetch()} />;
  return (
    <ExpenseForm
      groupId={groupId}
      currency={group.data.group.currency}
      members={group.data.activeMembers.map((m) => ({ id: m.id, name: m.name, image: m.image }))}
      myId={myId}
    />
  );
}

function PickGroup() {
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api<GroupSummary[]>('groups') });
  if (groups.isPending) return <LoadingView />;
  if (groups.isError) return <ErrorView error={groups.error} onRetry={() => groups.refetch()} />;
  return (
    <Screen>
      <Txt variant="muted">Which group is this expense for?</Txt>
      <Card padded={false}>
        {groups.data.length === 0 ? (
          <EmptyState icon="people-outline" title="Create a group first" />
        ) : (
          groups.data.map((g, i) => (
            <View key={g.id}>
              {i > 0 && <Divider />}
              <ListItem
                left={<IconBadge icon={groupCategory(g.category).icon} size={36} />}
                title={g.name}
                subtitle={`${g.memberCount} members · ${g.currency}`}
                chevron
                onPress={() => router.replace(`/expense/new?groupId=${g.id}`)}
              />
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
