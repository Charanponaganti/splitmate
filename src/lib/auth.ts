import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";
import { getDbSync } from "@/lib/db";
import { accounts, sessions, users, verifications } from "@/lib/db/schema";
import { DEFAULT_CURRENCY } from "@/lib/money/currency";

/** Origin the Android app sends with auth requests (its URL scheme). */
export const MOBILE_APP_ORIGIN = "splitmate://";

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function createAuth() {
  const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  trustedOrigins.push(MOBILE_APP_ORIGIN);

  return betterAuth({
    appName: process.env.NEXT_PUBLIC_APP_NAME || "SplitMate",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins,
    database: drizzleAdapter(getDbSync(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    socialProviders: isGoogleAuthConfigured()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            prompt: "select_account",
          },
        }
      : {},
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    user: {
      additionalFields: {
        preferredCurrency: {
          type: "string",
          required: false,
          defaultValue: DEFAULT_CURRENCY,
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    plugins: [nextCookies(), bearer()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __splitmateAuth?: Auth };

/** Lazily constructs Better Auth so nothing touches the database at build time. */
export function getAuth(): Auth {
  if (!globalForAuth.__splitmateAuth) globalForAuth.__splitmateAuth = createAuth();
  return globalForAuth.__splitmateAuth;
}
