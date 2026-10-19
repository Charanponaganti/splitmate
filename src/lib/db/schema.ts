import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
});

/* -------------------------------------------------------------------------- */
/* Authentication (managed by Better Auth). `users` doubles as the profile.  */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    preferredCurrency: text("preferred_currency").notNull().default("INR"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_currency_len", sql`char_length(${t.preferredCurrency}) = 3`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/* -------------------------------------------------------------------------- */
/* Groups and membership                                                      */
/* -------------------------------------------------------------------------- */

export const groupCategory = pgEnum("group_category", ["trip", "roommates", "food", "shopping", "event", "other"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const memberStatus = pgEnum("member_status", ["active", "left", "removed"]);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    category: groupCategory("category").notNull().default("other"),
    currency: text("currency").notNull(),
    coverImageUrl: text("cover_image_url"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("groups_name_len", sql`char_length(${t.name}) between 1 and 80`),
    check("groups_currency_len", sql`char_length(${t.currency}) = 3`),
  ],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: memberRole("role").notNull().default("member"),
    status: memberStatus("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("group_members_user_idx").on(t.userId, t.status),
  ],
);

export const groupInvitations = pgTable(
  "group_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    /** SHA-256 of the secret token. The raw token is only ever shown to the inviter. */
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("group_invitations_group_idx").on(t.groupId),
    index("group_invitations_email_idx").on(sql`lower(${t.email})`),
    check("group_invitations_uses", sql`${t.useCount} >= 0 and (${t.maxUses} is null or ${t.useCount} <= ${t.maxUses})`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Ledger                                                                     */
/* -------------------------------------------------------------------------- */

export const expenseCategory = pgEnum("expense_category", [
  "food",
  "groceries",
  "transport",
  "travel",
  "accommodation",
  "entertainment",
  "shopping",
  "utilities",
  "rent",
  "health",
  "gifts",
  "other",
]);
export const splitMethod = pgEnum("split_method", ["equal", "exact", "percentage", "shares"]);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("attachments_group_idx").on(t.groupId),
    check("attachments_size", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 5242880`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull(),
    category: expenseCategory("category").notNull().default("other"),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    notes: text("notes"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    splitMethod: splitMethod("split_method").notNull(),
    receiptAttachmentId: uuid("receipt_attachment_id").references(() => attachments.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "restrict" }),
    clientRequestId: uuid("client_request_id").notNull(),
    version: integer("version").notNull().default(1),
    /** Soft checklist mark — does not change balances; settlements do that. */
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: text("done_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("expenses_idempotency_idx").on(t.createdBy, t.clientRequestId),
    index("expenses_group_date_idx").on(t.groupId, t.expenseDate, t.createdAt),
    index("expenses_group_live_idx").on(t.groupId).where(sql`${t.deletedAt} is null`),
    check("expenses_amount_positive", sql`${t.amountMinor} > 0`),
    check("expenses_title_len", sql`char_length(${t.title}) between 1 and 120`),
    check("expenses_version_positive", sql`${t.version} >= 1`),
  ],
);

export const expensePayers = pgTable(
  "expense_payers",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountMinor: money("amount_minor").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.userId] }),
    index("expense_payers_user_idx").on(t.userId),
    check("expense_payers_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const expenseParticipants = pgTable(
  "expense_participants",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    shareMinor: money("share_minor").notNull(),
    /** Raw split input (exact minor units, basis points or hundredths of a share). */
    inputValue: bigint("input_value", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.userId] }),
    index("expense_participants_user_idx").on(t.userId),
    check("expense_participants_share_nonneg", sql`${t.shareMinor} >= 0`),
  ],
);

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull(),
    settledOn: date("settled_on", { mode: "string" }).notNull(),
    note: text("note"),
    isOverpayment: boolean("is_overpayment").notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientRequestId: uuid("client_request_id").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("settlements_idempotency_idx").on(t.createdBy, t.clientRequestId),
    index("settlements_group_idx").on(t.groupId, t.createdAt),
    check("settlements_amount_positive", sql`${t.amountMinor} > 0`),
    check("settlements_distinct_parties", sql`${t.fromUserId} <> ${t.toUserId}`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Audit trail and notifications                                              */
/* -------------------------------------------------------------------------- */

export const activityType = pgEnum("activity_type", [
  "group.created",
  "group.updated",
  "member.joined",
  "member.added",
  "member.left",
  "member.removed",
  "member.role_changed",
  "invitation.created",
  "expense.created",
  "expense.updated",
  "expense.deleted",
  "settlement.created",
  "settlement.deleted",
]);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: activityType("type").notNull(),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    settlementId: uuid("settlement_id").references(() => settlements.id, { onDelete: "set null" }),
    subjectUserId: text("subject_user_id").references(() => users.id, { onDelete: "restrict" }),
    /** Snapshot of what changed, kept for the audit trail. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_group_created_idx").on(t.groupId, t.createdAt),
    index("activity_expense_idx").on(t.expenseId),
  ],
);

export const notificationType = pgEnum("notification_type", [
  "expense_added",
  "expense_involved",
  "expense_updated",
  "expense_deleted",
  "settlement_recorded",
  "group_invitation",
  "member_added",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activityLog.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    /** For invitations: the link path the invitee should open. */
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_user_activity_idx").on(t.userId, t.activityId),
    index("notifications_user_unread_idx").on(t.userId, t.createdAt).where(sql`${t.readAt} is null`),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type ActivityType = (typeof activityType.enumValues)[number];
export type NotificationType = (typeof notificationType.enumValues)[number];
export type GroupCategory = (typeof groupCategory.enumValues)[number];
export type ExpenseCategory = (typeof expenseCategory.enumValues)[number];
export type MemberRole = (typeof memberRole.enumValues)[number];
