import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { Avatar, Button, Divider, EmptyState, ErrorView, listCell, ListItem, LoadingView, errorMessage, toast } from '@/components/ui';
import { appRouteFor, describeActivity } from '@/lib/activity';
import { api } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import { colors } from '@/lib/theme';
import type { NotificationItem } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

export default function NotificationsScreen() {
  const myId = useMyId();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => api<NotificationItem[]>('notifications') });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api('notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorMessage(e)),
  });

  const unread = query.data?.filter((n) => !n.readAt).length ?? 0;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        unread > 0 ? (
          <Button title="Mark all read" variant="ghost" size="sm" loading={markRead.isPending} onPress={() => markRead.mutate(undefined)} />
        ) : null,
    });
  }, [navigation, unread, markRead]);

  if (query.isPending) return <LoadingView />;
  if (query.isError) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;

  const open = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate([n.id]);
    const route = appRouteFor(n.href);
    if (route) router.push(route);
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={query.data}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} colors={[colors.primary]} />}
      ItemSeparatorComponent={Divider}
      renderItem={({ item, index }) => (
        <View style={[listCell(index, query.data.length), !item.readAt && { backgroundColor: colors.accent }]}>
          <ListItem
            onPress={() => open(item)}
            left={<Avatar id={item.actorName} name={item.actorName} size={34} />}
            title={
              <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
                <Text style={{ fontWeight: '600' }}>{item.actorName}</Text>{' '}
                <Text style={{ color: colors.muted }}>{describeActivity({ type: item.activityType, data: item.data }, myId)}</Text>
              </Text>
            }
            subtitle={`${item.groupName} · ${timeAgo(item.createdAt)}`}
            right={!item.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : undefined}
          />
        </View>
      )}
      ListEmptyComponent={<EmptyState icon="notifications-outline" title="You're all caught up" body="We'll let you know when friends add expenses or settle up." />}
    />
  );
}
