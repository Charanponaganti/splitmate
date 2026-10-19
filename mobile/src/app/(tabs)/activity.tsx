import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ActivityRow, ExpenseRow } from '@/components/rows';
import { Divider, EmptyState, ErrorView, Input, listCell, LoadingView, Segmented } from '@/components/ui';
import { api } from '@/lib/api';
import { useMyId } from '@/lib/auth';
import { colors } from '@/lib/theme';
import type { ActivityItem, ExpensePage } from '@/lib/types';

export default function ActivityScreen() {
  const [tab, setTab] = useState<'feed' | 'expenses'>('feed');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'feed', label: 'Recent activity' },
            { value: 'expenses', label: 'All expenses' },
          ]}
        />
      </View>
      {tab === 'feed' ? <Feed /> : <AllExpenses />}
    </View>
  );
}

function Feed() {
  const myId = useMyId();
  const query = useQuery({ queryKey: ['activity'], queryFn: () => api<ActivityItem[]>('activity?limit=60') });
  if (query.isPending) return <LoadingView />;
  if (query.isError) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  return (
    <FlatList
      data={query.data}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} colors={[colors.primary]} />}
      ItemSeparatorComponent={Divider}
      renderItem={({ item, index }) => (
        <View style={listCell(index, query.data.length)}>
          <ActivityRow item={item} myId={myId} showGroup />
        </View>
      )}
      ListEmptyComponent={<EmptyState icon="time-outline" title="Nothing yet" body="Changes in your groups will show up here." />}
    />
  );
}

function AllExpenses() {
  const myId = useMyId();
  const [search, setSearch] = useState('');
  const q = search.trim();
  const query = useInfiniteQuery({
    queryKey: ['expenses', 'all', q],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<ExpensePage>(`expenses?page=${pageParam}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    getNextPageParam: (last) => (last.page < last.pageCount ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Input value={search} onChangeText={setSearch} placeholder="Search expenses" returnKeyType="search" />
      </View>
      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <ErrorView error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} colors={[colors.primary]} />}
          ItemSeparatorComponent={Divider}
          renderItem={({ item, index }) => (
            <View style={listCell(index, items.length)}>
              <ExpenseRow expense={item} myId={myId} showGroup />
            </View>
          )}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon="search-outline" title={q ? 'No matches' : 'No expenses yet'} />}
        />
      )}
    </View>
  );
}
