import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isAppError, type AppErrorCode } from "@/lib/errors";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { idSchema, parseExpenseFilters, profileSchema, uuidSchema } from "@/lib/validation";
import { createExpense, deleteExpense, getExpenseDetail, setExpenseDone, updateExpense } from "./expenses";
import { addMemberByEmail, createGroup, leaveGroup, removeMember, setMemberRole, updateGroup } from "./groups";
import { acceptInvitation, createInvitation, listInvitations, previewInvitation, revokeInvitation } from "./invitations";
import { parseInput } from "./parse";
import {
  getActivityFeed,
  getDashboard,
  getGroupOverview,
  getGroupsForUser,
  getUnreadNotificationCount,
  listExpenses,
  listNotifications,
  listSettlements,
  markNotificationsRead,
} from "./queries";
import { deleteSettlement, recordSettlement } from "./settlements";

/**
 * JSON API used by the Android app. Every handler runs as the signed-in user
 * and reuses the same services (and therefore the same authorization,
 * validation and transactions) as the web app's server actions.
 */

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface RouteContext {
  user: CurrentUser;
  params: string[];
  query: URLSearchParams;
  body: unknown;
}

type Handler = (ctx: RouteContext) => Promise<unknown>;

const uuid = (value: unknown) => parseInput(uuidSchema, value);
const id = (value: unknown) => parseInput(idSchema, value);

const routes: { method: Method; pattern: string[]; handler: Handler }[] = [];
function route(method: Method, path: string, handler: Handler) {
  routes.push({ method, pattern: path.split("/").filter(Boolean), handler });
}

/* Profile ------------------------------------------------------------------ */

route("GET", "me", async ({ user }) => ({ user, unreadNotifications: await getUnreadNotificationCount(user.id) }));

route("PATCH", "me", async ({ user, body }) => {
  const data = parseInput(profileSchema, body);
  const db = await getDb();
  await db.update(users).set(data).where(eq(users.id, user.id));
  return null;
});

/* Dashboard & activity ----------------------------------------------------- */

route("GET", "dashboard", ({ user }) => getDashboard(user.id));

route("GET", "activity", ({ user, query }) =>
  getActivityFeed(user.id, { limit: Math.min(Number(query.get("limit")) || 30, 100) }),
);

route("GET", "expenses", ({ user, query }) => listExpenses(user.id, parseExpenseFilters(Object.fromEntries(query))));

/* Groups ------------------------------------------------------------------- */

route("GET", "groups", ({ user }) => getGroupsForUser(user.id));

route("POST", "groups", async ({ user, body }) => {
  const group = await createGroup(user.id, body);
  return { id: group.id };
});

route("GET", "groups/:id", async ({ user, params }) => {
  const o = await getGroupOverview(user.id, uuid(params[0]));
  return {
    group: o.group,
    myRole: o.myRole,
    members: o.members,
    activeMembers: o.activeMembers,
    balances: Object.fromEntries(o.balances),
    transfers: o.transfers,
    totalSpent: o.totalSpent,
    expenseCount: o.expenseCount,
  };
});

route("PATCH", "groups/:id", async ({ user, params, body }) => {
  await updateGroup(user.id, uuid(params[0]), body);
  return null;
});

route("GET", "groups/:id/expenses", ({ user, params, query }) =>
  listExpenses(user.id, parseExpenseFilters({ ...Object.fromEntries(query), groupId: uuid(params[0]) })),
);

route("GET", "groups/:id/settlements", ({ user, params }) => listSettlements(user.id, uuid(params[0])));

route("GET", "groups/:id/activity", ({ user, params }) => getActivityFeed(user.id, { groupId: uuid(params[0]), limit: 30 }));

route("POST", "groups/:id/members", ({ user, params, body }) =>
  addMemberByEmail(user.id, { ...(body as object), groupId: uuid(params[0]) }),
);

route("DELETE", "groups/:id/members/:userId", async ({ user, params }) => {
  await removeMember(user.id, uuid(params[0]), id(params[1]));
  return null;
});

route("PATCH", "groups/:id/members/:userId", async ({ user, params, body }) => {
  const { role } = parseInput(z.object({ role: z.enum(["admin", "member"]) }), body);
  await setMemberRole(user.id, uuid(params[0]), id(params[1]), role);
  return null;
});

route("POST", "groups/:id/leave", async ({ user, params }) => {
  await leaveGroup(user.id, uuid(params[0]));
  return null;
});

route("GET", "groups/:id/invitations", ({ user, params }) => listInvitations(user.id, uuid(params[0])));

route("POST", "groups/:id/invitations", async ({ user, params, body }) => {
  const result = await createInvitation(user.id, { ...(body as object), groupId: uuid(params[0]) });
  return { url: result.url, emailSent: result.emailSent, expiresAt: result.expiresAt.toISOString() };
});

/* Invitations -------------------------------------------------------------- */

route("DELETE", "invitations/:id", async ({ user, params }) => {
  await revokeInvitation(user.id, uuid(params[0]));
  return null;
});

route("GET", "invitations/token/:token", ({ user, params }) => previewInvitation(String(params[0]), user.id));

route("POST", "invitations/accept", ({ user, body }) => {
  const { token } = parseInput(z.object({ token: z.string().trim().min(10).max(200) }), body);
  return acceptInvitation(user.id, token);
});

/* Expenses ----------------------------------------------------------------- */

route("POST", "expenses", ({ user, body }) => createExpense(user.id, body));

route("GET", "expenses/:id", async ({ user, params }) => {
  const detail = await getExpenseDetail(user.id, uuid(params[0]));
  return { ...detail, people: Object.fromEntries(detail.people) };
});

route("PATCH", "expenses/:id", ({ user, params, body }) => updateExpense(user.id, uuid(params[0]), body));

route("DELETE", "expenses/:id", ({ user, params }) => deleteExpense(user.id, uuid(params[0])));

route("POST", "expenses/:id/done", ({ user, params, body }) => {
  const { done } = parseInput(z.object({ done: z.boolean() }), body);
  return setExpenseDone(user.id, uuid(params[0]), done);
});

/* Settlements -------------------------------------------------------------- */

route("POST", "settlements", ({ user, body }) => recordSettlement(user.id, body));

route("DELETE", "settlements/:id", ({ user, params }) => deleteSettlement(user.id, uuid(params[0])));

/* Notifications ------------------------------------------------------------ */

route("GET", "notifications", ({ user }) => listNotifications(user.id));

route("POST", "notifications/read", async ({ user, body }) => {
  const { ids } = parseInput(z.object({ ids: z.array(uuidSchema).max(200).optional() }), body ?? {});
  await markNotificationsRead(user.id, ids);
  return null;
});

/* Dispatcher --------------------------------------------------------------- */

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

function match(method: string, segments: string[]) {
  for (const r of routes) {
    if (r.method !== method || r.pattern.length !== segments.length) continue;
    const params: string[] = [];
    const ok = r.pattern.every((part, i) => {
      if (part.startsWith(":")) {
        params.push(decodeURIComponent(segments[i]));
        return true;
      }
      return part === segments[i];
    });
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleApiRequest(request: Request, segments: string[]): Promise<Response> {
  const found = match(request.method, segments);
  if (!found) return json({ error: "Not found." }, 404);

  const user = await getCurrentUser();
  if (!user) return json({ error: "Your session has expired. Please sign in again." }, 401);

  let body: unknown = undefined;
  if (request.method === "POST" || request.method === "PATCH") {
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }
  }

  try {
    const data = await found.handler({ user, params: found.params, query: new URL(request.url).searchParams, body });
    return json({ data: data ?? null });
  } catch (error) {
    if (isAppError(error)) {
      return json({ error: error.message, fieldErrors: error.fieldErrors }, STATUS[error.code]);
    }
    if (isUniqueViolation(error)) return json({ error: "This was already saved." }, 409);
    console.error("[api] unexpected error:", error instanceof Error ? error.name : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
