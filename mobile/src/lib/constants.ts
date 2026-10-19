import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const GROUP_CATEGORIES: { value: string; label: string; icon: IconName }[] = [
  { value: 'trip', label: 'Trips', icon: 'airplane-outline' },
  { value: 'roommates', label: 'Roommates', icon: 'home-outline' },
  { value: 'food', label: 'Food & outings', icon: 'restaurant-outline' },
  { value: 'shopping', label: 'Shopping', icon: 'bag-handle-outline' },
  { value: 'event', label: 'Events', icon: 'sparkles-outline' },
  { value: 'other', label: 'Other', icon: 'people-outline' },
];

export const EXPENSE_CATEGORIES: { value: string; label: string; icon: IconName }[] = [
  { value: 'food', label: 'Food & drinks', icon: 'restaurant-outline' },
  { value: 'groceries', label: 'Groceries', icon: 'cart-outline' },
  { value: 'transport', label: 'Transport', icon: 'car-outline' },
  { value: 'travel', label: 'Travel', icon: 'airplane-outline' },
  { value: 'accommodation', label: 'Accommodation', icon: 'bed-outline' },
  { value: 'entertainment', label: 'Entertainment', icon: 'film-outline' },
  { value: 'shopping', label: 'Shopping', icon: 'bag-handle-outline' },
  { value: 'utilities', label: 'Utilities', icon: 'flash-outline' },
  { value: 'rent', label: 'Rent', icon: 'key-outline' },
  { value: 'health', label: 'Health', icon: 'medkit-outline' },
  { value: 'gifts', label: 'Gifts', icon: 'gift-outline' },
  { value: 'other', label: 'Other', icon: 'receipt-outline' },
];

export function groupCategory(value: string) {
  return GROUP_CATEGORIES.find((c) => c.value === value) ?? GROUP_CATEGORIES[GROUP_CATEGORIES.length - 1];
}

export function expenseCategory(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

export const SPLIT_METHOD_LABELS: Record<string, string> = {
  equal: 'Equally',
  exact: 'Exact amounts',
  percentage: 'Percentages',
  shares: 'Shares',
};

export const POPULAR_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'THB', 'NPR', 'LKR'];
