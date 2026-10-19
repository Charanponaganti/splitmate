import { z } from "zod";
import { CURRENCY_CODES, MAX_AMOUNT_MINOR } from "@/lib/money/currency";
import { SPLIT_METHODS } from "@/lib/money/split";
import { EXPENSE_CATEGORY_VALUES, GROUP_CATEGORY_VALUES } from "@/lib/constants";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https:\/\/[^\s]+$/i.test(v), "Use an https:// image URL.");

export const currencySchema = z.enum(CURRENCY_CODES, { message: "Choose a supported currency." });
export const idSchema = z.string().trim().min(1).max(128);
export const uuidSchema = z.uuid({ message: "Invalid identifier." });
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Use a valid date.");
export const minorAmountSchema = z
  .number({ message: "Enter an amount." })
  .int("Amount has too many decimal places.")
  .positive("Amount must be greater than zero.")
  .max(MAX_AMOUNT_MINOR, "Amount is too large.");

export const profileSchema = z.object({
  name: trimmed(1, 60, "Name"),
  image: optionalUrl,
  preferredCurrency: currencySchema,
});
export type ProfileInput = z.input<typeof profileSchema>;

export const groupSchema = z.object({
  name: trimmed(1, 80, "Group name"),
  description: optionalText(500),
  category: z.enum(GROUP_CATEGORY_VALUES),
  currency: currencySchema,
  coverImageUrl: optionalUrl,
});
export type GroupInput = z.input<typeof groupSchema>;

export const groupUpdateSchema = groupSchema.omit({ currency: true });

export const expenseSchema = z
  .object({
    groupId: uuidSchema,
    title: trimmed(1, 120, "Title"),
    amountMinor: minorAmountSchema,
    category: z.enum(EXPENSE_CATEGORY_VALUES),
    expenseDate: isoDateSchema,
    notes: optionalText(1000),
    tags: z
      .array(z.string().trim().toLowerCase().min(1).max(24))
      .max(10, "Use at most 10 tags.")
      .default([])
      .transform((tags) => [...new Set(tags)]),
    splitMethod: z.enum(SPLIT_METHODS),
    payers: z
      .array(z.object({ userId: idSchema, amountMinor: minorAmountSchema }))
      .min(1, "Select who paid.")
      .max(100),
    participants: z
      .array(
        z.object({
          userId: idSchema,
          value: z.number().int().nonnegative().max(MAX_AMOUNT_MINOR).nullable().optional(),
        }),
      )
      .min(1, "Select at least one person to share this expense.")
      .max(100),
    receiptAttachmentId: uuidSchema.nullable().optional(),
    clientRequestId: uuidSchema,
  })
  .strict();
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseData = z.output<typeof expenseSchema>;

export const expenseUpdateSchema = expenseSchema.omit({ clientRequestId: true, groupId: true }).extend({
  expectedVersion: z.number().int().positive(),
});
export type ExpenseUpdateData = z.output<typeof expenseUpdateSchema>;

export const settlementSchema = z
  .object({
    groupId: uuidSchema,
    fromUserId: idSchema,
    toUserId: idSchema,
    amountMinor: minorAmountSchema,
    settledOn: isoDateSchema,
    note: optionalText(300),
    allowOverpayment: z.boolean().default(false),
    clientRequestId: uuidSchema,
  })
  .strict()
  .refine((v) => v.fromUserId !== v.toUserId, {
    message: "Payer and receiver must be different people.",
    path: ["toUserId"],
  });
export type SettlementInput = z.input<typeof settlementSchema>;
export type SettlementData = z.output<typeof settlementSchema>;

export const inviteSchema = z.object({
  groupId: uuidSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address."),
});

export const addMemberSchema = z.object({
  groupId: uuidSchema,
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export const expenseFiltersSchema = z.object({
  groupId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
  category: z.enum(EXPENSE_CATEGORY_VALUES).optional(),
  payerId: idSchema.optional(),
  participantId: idSchema.optional(),
  memberId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ExpenseFilters = z.output<typeof expenseFiltersSchema>;

/** Parses URL search params into filters, silently dropping invalid values. */
export function parseExpenseFilters(params: Record<string, string | string[] | undefined>): ExpenseFilters {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "" && v !== "all") clean[key] = v;
  }
  const shape = expenseFiltersSchema.shape;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const parsed = shape[key].safeParse(clean[key]);
    if (parsed.success && parsed.data !== undefined) result[key] = parsed.data;
  }
  return expenseFiltersSchema.parse(result);
}
