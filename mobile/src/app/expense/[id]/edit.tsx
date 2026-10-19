import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ExpenseForm } from '@/components/expense-form';
import { ErrorView, LoadingView } from '@/components/ui';
import { api } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import type { ExpenseDetail, GroupDetail } from '@/lib/types';

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useMyId();
  const detail = useQuery({ queryKey: ['expense', id], queryFn: () => api<ExpenseDetail>(`expenses/${id}`) });
  const groupId = detail.data?.expense.groupId;
  const group = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api<GroupDetail>(`groups/${groupId}`),
    enabled: !!groupId,
  });

  if (detail.isPending || (groupId && group.isPending)) return <LoadingView />;
  if (detail.isError) return <ErrorView error={detail.error} onRetry={() => detail.refetch()} />;
  if (group.isError || !group.data) return <ErrorView error={group.error} onRetry={() => group.refetch()} />;

  const { expense, payers, participants, receipt } = detail.data;
  // Former members who are part of this expense must stay selectable.
  const memberIds = new Set(group.data.activeMembers.map((m) => m.id));
  const extra = [...payers.map((p) => p.userId), ...participants.map((p) => p.userId)]
    .filter((uid, i, all) => !memberIds.has(uid) && all.indexOf(uid) === i)
    .map((uid) => ({ id: uid, name: detail.data.people[uid]?.name ?? 'Former member', image: null }));

  return (
    <ExpenseForm
      groupId={expense.groupId}
      currency={expense.currency}
      members={[...group.data.activeMembers.map((m) => ({ id: m.id, name: m.name, image: m.image })), ...extra]}
      myId={myId}
      initial={{
        expenseId: expense.id,
        version: expense.version,
        title: expense.title,
        amountMinor: expense.amountMinor,
        category: expense.category,
        expenseDate: expense.expenseDate,
        notes: expense.notes,
        tags: expense.tags,
        splitMethod: expense.splitMethod,
        payers,
        participants: [...participants]
          .sort((a, b) => (a.userId < b.userId ? -1 : 1))
          .map((p) => ({ userId: p.userId, inputValue: p.inputValue })),
        receipt: receipt ? { id: receipt.id, fileName: receipt.fileName } : null,
      }}
    />
  );
}
