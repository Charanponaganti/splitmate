import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, waitForDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  preferredCurrency: string;
}

/**
 * Reads the session from the request cookies and loads the profile fresh from
 * the database. Cached per request, so layouts and pages share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await waitForDb();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const db = await getDb();
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      preferredCurrency: users.preferredCurrency,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return user ?? null;
});

/** For pages: redirects to the login screen when there is no session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
