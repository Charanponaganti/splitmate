import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '@/lib/api';
import { describeActivity } from '@/lib/activity';
import { expenseCategory } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { colors } from '@/lib/theme';
import type { ActivityItem, ExpenseListItem } from '@/lib/types';
import { firstName, formatDate, timeAgo } from '@/lib/utils';
import { Avatar, IconBadge, ListItem, Txt, errorMessage, toast } from './ui';

export function ExpenseRow({ expense, myId, showGroup }: { expense: ExpenseListItem; myId: string; showGroup?: boolean }) {
  const cat = expenseCategory(expense.category);
  const queryClient = useQueryClient();
  const lead = expense.payers[0];
  const payerText =
    expense.payers.length > 1
      ? `${expense.payers.length} people paid`
      : lead
        ? `${lead.id === myId ? 'You' : firstName(lead.name)} paid`
        : '';
  const net = expense.myPaid - expense.myShare;
  const involved = expense.myPaid > 0 || expense.myShare > 0;

  const toggleDone = async () => {
    try {
      await api(`expenses/${expense.id}/done`, { method: 'POST', body: { done: !expense.done } });
      await queryClient.invalidateQueries();
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  return (
    <ListItem
      onPress={() => router.push(`/expense/${expense.id}`)}
      left={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expense.done ? 'Mark as not done' : 'Mark as done'}
            onPress={toggleDone}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: expense.done ? colors.primary : colors.border,
              backgroundColor: expense.done ? colors.primary : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name="checkmark" size={16} color={expense.done ? '#fff' : colors.muted} />
          </Pressable>
          <IconBadge icon={cat.icon} tone="muted" />
        </View>
      }
      title={expense.title}
      subtitle={`${showGroup ? `${expense.groupName} · ` : ''}${payerText} ${formatMoney(expense.amountMinor, expense.currency)} · ${formatDate(expense.expenseDate)}${expense.done ? ' · Done' : ''}`}
      right={
        <View style={{ alignItems: 'flex-end', opacity: expense.done ? 0.65 : 1 }}>
          {!involved ? (
            <Txt variant="small">not involved</Txt>
          ) : net === 0 ? (
            <Txt variant="small">no balance</Txt>
          ) : (
            <>
              <Txt variant="small" style={{ color: net > 0 ? colors.positive : colors.negative }}>
                {net > 0 ? 'you lent' : 'you owe'}
              </Txt>
              <Text style={{ fontWeight: '700', color: net > 0 ? colors.positive : colors.negative }}>
                {formatMoney(Math.abs(net), expense.currency)}
              </Text>
            </>
          )}
        </View>
      }
    />
  );
}

function activityRoute(item: ActivityItem): string {
  if (item.expenseId && item.type !== 'expense.deleted') return `/expense/${item.expenseId}`;
  if (item.type.startsWith('settlement')) return `/group/${item.groupId}/settle`;
  return `/group/${item.groupId}`;
}

export function ActivityRow({ item, myId, showGroup }: { item: ActivityItem; myId: string; showGroup?: boolean }) {
  return (
    <ListItem
      onPress={() => router.push(activityRoute(item))}
      left={<Avatar id={item.actorId} name={item.actorName} size={34} />}
      title={
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
          <Text style={{ fontWeight: '600' }}>{item.actorId === myId ? 'You' : item.actorName}</Text>{' '}
          <Text style={{ color: colors.muted }}>{describeActivity(item, myId)}</Text>
        </Text>
      }
      subtitle={`${showGroup ? `${item.groupName} · ` : ''}${timeAgo(item.createdAt)}`}
    />
  );
}
