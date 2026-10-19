export interface Person {
  id: string;
  name: string;
  image: string | null;
}

export interface Me {
  user: { id: string; name: string; email: string; image: string | null; preferredCurrency: string };
  unreadNotifications: number;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  currency: string;
  role: string;
  members: Person[];
  memberCount: number;
  myBalance: number;
  totalSpent: number;
  lastActivityAt: string;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

export interface ExpenseListItem {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  amountMinor: number;
  currency: string;
  category: string;
  expenseDate: string;
  splitMethod: string;
  createdAt: string;
  payers: (Person & { amountMinor: number })[];
  participants: (Person & { shareMinor: number })[];
  myPaid: number;
  myShare: number;
  hasReceipt: boolean;
  done: boolean;
}

export interface ExpensePage {
  items: ExpenseListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface Dashboard {
  groups: GroupSummary[];
  totals: { currency: string; owe: number; owed: number; net: number }[];
  pending: (Transfer & { groupId: string; groupName: string; currency: string; counterparty: Person })[];
  recentExpenses: ExpenseListItem[];
}

export type Role = 'owner' | 'admin' | 'member';

export interface GroupMember extends Person {
  email: string;
  role: Role;
  status: 'active' | 'left' | 'removed';
  joinedAt: string;
  balance: number;
}

export interface GroupDetail {
  group: {
    id: string;
    name: string;
    description: string | null;
    category: string;
    currency: string;
    coverImageUrl: string | null;
    createdBy: string;
  };
  myRole: Role;
  members: GroupMember[];
  activeMembers: GroupMember[];
  balances: Record<string, number>;
  transfers: Transfer[];
  totalSpent: number;
  expenseCount: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  groupId: string;
  groupName: string;
  actorId: string;
  actorName: string;
  actorImage: string | null;
  subjectName: string | null;
  expenseId: string | null;
  settlementId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface SettlementItem {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  createdBy: string;
  createdByName: string;
  amountMinor: number;
  currency: string;
  settledOn: string;
  note: string | null;
  isOverpayment: boolean;
  createdAt: string;
  deletedAt: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  href: string;
  readAt: string | null;
  createdAt: string;
  actorName: string;
  actorImage: string | null;
  groupName: string;
  groupId: string;
  data: Record<string, unknown>;
  activityType: string;
}

export interface ExpenseDetail {
  expense: {
    id: string;
    groupId: string;
    title: string;
    amountMinor: number;
    currency: string;
    category: string;
    expenseDate: string;
    notes: string | null;
    tags: string[];
    splitMethod: 'equal' | 'exact' | 'percentage' | 'shares';
    version: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    doneAt: string | null;
    receiptAttachmentId: string | null;
  };
  payers: { userId: string; amountMinor: number }[];
  participants: { userId: string; shareMinor: number; inputValue: number | null }[];
  people: Record<string, Person>;
  receipt: { id: string; fileName: string; contentType: string; sizeBytes: number } | null;
  history: { id: string; type: string; createdAt: string; actorName: string; data: Record<string, unknown> }[];
}

export interface InvitationPreview {
  groupId: string | null;
  groupName: string;
  category: string;
  inviterName: string;
  memberCount: number;
  restrictedToEmail: string | null;
  state: 'valid' | 'expired' | 'revoked' | 'used';
  alreadyMember: boolean;
}
