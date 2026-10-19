export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SplitMate";

export const GROUP_CATEGORIES = [
  { value: "trip", label: "Trips" },
  { value: "roommates", label: "Roommates" },
  { value: "food", label: "Food & outings" },
  { value: "shopping", label: "Shopping" },
  { value: "event", label: "Events" },
  { value: "other", label: "Other" },
] as const;
export type GroupCategoryValue = (typeof GROUP_CATEGORIES)[number]["value"];
export const GROUP_CATEGORY_VALUES = GROUP_CATEGORIES.map((c) => c.value) as [
  GroupCategoryValue,
  ...GroupCategoryValue[],
];

export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Food & drinks" },
  { value: "groceries", label: "Groceries" },
  { value: "transport", label: "Transport" },
  { value: "travel", label: "Travel" },
  { value: "accommodation", label: "Accommodation" },
  { value: "entertainment", label: "Entertainment" },
  { value: "shopping", label: "Shopping" },
  { value: "utilities", label: "Utilities" },
  { value: "rent", label: "Rent" },
  { value: "health", label: "Health" },
  { value: "gifts", label: "Gifts" },
  { value: "other", label: "Other" },
] as const;
export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number]["value"];
export const EXPENSE_CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value) as [
  ExpenseCategoryValue,
  ...ExpenseCategoryValue[],
];

export function groupCategoryLabel(value: string): string {
  return GROUP_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export function expenseCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export const SPLIT_METHOD_LABELS = {
  equal: "Equally",
  exact: "Exact amounts",
  percentage: "Percentages",
  shares: "Shares",
} as const;

export const MAX_GROUP_MEMBERS = 100;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
export const EXPENSES_PAGE_SIZE = 20;
