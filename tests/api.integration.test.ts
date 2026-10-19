import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { createInvitation, acceptInvitation } from "@/lib/server/invitations";
import { createGroup } from "@/lib/server/groups";
import { createUser, equalExpense, today } from "./helpers";

let signedIn: CurrentUser | null = null;
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => signedIn }));

const { handleApiRequest } = await import("@/lib/server/api");

const as = (id: string | null) => {
  signedIn = id ? { id, name: id, email: `${id}@example.test`, image: null, preferredCurrency: "INR" } : null;
};

async function call(method: string, path: string, body?: unknown) {
  const request = new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const segments = new URL(request.url).pathname.split("/").slice(3).filter(Boolean);
  const res = await handleApiRequest(request, segments);
  return { status: res.status, json: await res.json(), cache: res.headers.get("Cache-Control") };
}

let A: string, B: string, outsider: string;
let groupId: string;

beforeAll(async () => {
  await getDb();
  [A, B, outsider] = await Promise.all(["Asha", "Bilal", "Eve"].map(createUser));
  groupId = (await createGroup(A, { name: "Flat", category: "roommates", currency: "INR" })).id;
  const { url } = await createInvitation(A, { groupId });
  await acceptInvitation(B, url.split("/invite/")[1]);
});

afterAll(async () => {
  await closeDb();
});

describe("mobile JSON API", () => {
  it("rejects requests without a session", async () => {
    as(null);
    const res = await call("GET", "dashboard");
    expect(res.status).toBe(401);
    expect(res.cache).toBe("no-store");
  });

  it("returns 404 for unknown routes", async () => {
    as(A);
    expect((await call("GET", "nope")).status).toBe(404);
  });

  it("creates an expense idempotently and updates balances", async () => {
    as(A);
    const input = equalExpense(groupId, A, 10_000, [A, B]);
    const first = await call("POST", "expenses", input);
    const again = await call("POST", "expenses", input);
    expect(first.status).toBe(200);
    expect(again.json.data.id).toBe(first.json.data.id);

    const group = await call("GET", `groups/${groupId}`);
    expect(group.json.data.balances).toMatchObject({ [A]: 5_000, [B]: -5_000 });
  });

  it("returns field errors for invalid input", async () => {
    as(A);
    const res = await call("POST", "expenses", { ...equalExpense(groupId, A, 10_000, [A]), title: "" });
    expect(res.status).toBe(400);
    expect(res.json.fieldErrors).toHaveProperty("title");
  });

  it("rejects malformed JSON without leaking details", async () => {
    as(A);
    const res = await call("POST", "expenses", "{not json");
    expect(res).toMatchObject({ status: 400, json: { error: "Invalid request body." } });
  });

  it("detects conflicting edits", async () => {
    as(A);
    const created = await call("POST", "expenses", equalExpense(groupId, A, 3_000, [A, B], "Milk"));
    const id = created.json.data.id;
    const { expense } = (await call("GET", `expenses/${id}`)).json.data;
    const update = (title: string) => ({
      title,
      amountMinor: 3_000,
      category: "food",
      expenseDate: today(),
      splitMethod: "equal",
      payers: [{ userId: A, amountMinor: 3_000 }],
      participants: [{ userId: A }, { userId: B }],
      expectedVersion: expense.version,
    });
    const ok = await call("PATCH", `expenses/${id}`, update("Milk and eggs"));
    const stale = await call("PATCH", `expenses/${id}`, update("Bread"));
    expect(ok.status).toBe(200);
    expect(stale.status).toBe(409);
  });

  it("hides groups and expenses from non-members", async () => {
    as(A);
    const created = await call("POST", "expenses", equalExpense(groupId, A, 2_000, [A, B], "Soap"));
    as(outsider);
    expect((await call("GET", `groups/${groupId}`)).status).toBe(404);
    expect((await call("GET", `expenses/${created.json.data.id}`)).status).toBe(404);
    expect((await call("DELETE", `expenses/${created.json.data.id}`)).status).toBe(404);
    expect((await call("POST", "expenses", equalExpense(groupId, outsider, 1_000, [outsider]))).status).toBe(404);
  });

  it("toggles the shared done tick without changing balances", async () => {
    as(A);
    const created = await call("POST", "expenses", equalExpense(groupId, A, 4_000, [A, B], "Snacks"));
    const id = created.json.data.id;
    const before = (await call("GET", `groups/${groupId}`)).json.data.balances;
    const marked = await call("POST", `expenses/${id}/done`, { done: true });
    expect(marked.status).toBe(200);
    expect(marked.json.data.done).toBe(true);
    const list = await call("GET", `groups/${groupId}/expenses`);
    expect(list.json.data.items.find((e: { id: string }) => e.id === id)?.done).toBe(true);
    const after = (await call("GET", `groups/${groupId}`)).json.data.balances;
    expect(after).toEqual(before);
    as(B);
    const undone = await call("POST", `expenses/${id}/done`, { done: false });
    expect(undone.json.data.done).toBe(false);
  });

  it("settles up through the API", async () => {
    as(B);
    const before = (await call("GET", `groups/${groupId}`)).json.data.balances[B];
    const res = await call("POST", "settlements", {
      groupId,
      fromUserId: B,
      toUserId: A,
      amountMinor: 1_000,
      settledOn: today(),
      clientRequestId: randomUUID(),
    });
    expect(res.status).toBe(200);
    const after = (await call("GET", `groups/${groupId}`)).json.data.balances[B];
    expect(after - before).toBe(1_000);
  });
});
