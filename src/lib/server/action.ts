import "server-only";
import { revalidatePath } from "next/cache";
import { isAppError } from "@/lib/errors";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Wraps a server action: requires a signed-in user, converts known errors into
 * user-safe messages, and hides internal details of anything unexpected.
 */
export async function runAction<T>(
  fn: (user: CurrentUser) => Promise<T>,
  options: { revalidate?: boolean } = { revalidate: true },
): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
  try {
    const data = await fn(user);
    if (options.revalidate !== false) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    if (isUniqueViolation(error)) return { ok: false, error: "This was already saved." };
    console.error("[action] unexpected error:", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}
