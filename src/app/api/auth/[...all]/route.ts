import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { waitForDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  await waitForDb();
  const handler = toNextJsHandler(getAuth());
  return request.method === "GET" ? handler.GET(request) : handler.POST(request);
}

export { handle as GET, handle as POST };
