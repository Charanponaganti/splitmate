import type { z } from "zod";
import { invalid } from "@/lib/errors";

/** Validates untrusted input on the server, converting Zod issues into a safe AppError. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = result.error.issues[0]?.message ?? "Invalid input.";
  throw invalid(first, fieldErrors);
}
