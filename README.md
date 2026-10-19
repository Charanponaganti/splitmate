# SplitMate

Split shared expenses with friends: groups, flexible splits, exact balances, settle-ups and live updates across everyone's phones.

**Stack:** Next.js 16 (App Router, React 19, TypeScript) · Tailwind CSS v4 · Radix UI · Drizzle ORM on PostgreSQL · Better Auth · Zod · React Hook Form · Recharts · Vitest.

## Quick start (local, zero setup)

Requires Node.js 20.9+.

```bash
npm install
cp .env.example .env.local      # then set BETTER_AUTH_SECRET (see below)
npm run db:seed                 # optional demo data
npm run dev                     # http://localhost:3000
```

With no `DATABASE_URL`, the app uses **PGlite** (real Postgres compiled to WASM) stored in `./.data/pglite`. Migrations run automatically on first access. Only one process can open that directory at a time, so stop `npm run dev` before running `db:seed` / `db:migrate`.

Demo accounts created by `npm run db:seed` (password `demo-password-123`): `asha@`, `bilal@`, `chen@`, `divya@demo.splitmate.test`. Seed data is for local development only; the script refuses to run with `NODE_ENV=production` unless `--force` is passed. Sign up with your own account for real use.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit + integration tests (in-memory Postgres) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run db:generate` | Create a migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations in `./drizzle` to `DATABASE_URL` |
| `npm run db:seed` | Load demo data (development only) |

## Environment variables

See `.env.example` for the full annotated list.

| Variable | Required | Notes |
| --- | --- | --- |
| `BETTER_AUTH_URL` | yes | Public URL of the app |
| `BETTER_AUTH_SECRET` | yes (prod) | 32+ random bytes |
| `DATABASE_URL` | prod | `postgres://…`; unset = local PGlite |
| `DATABASE_POOL_SIZE` | no | Default 10 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables "Continue with Google" |
| `RESEND_API_KEY` / `EMAIL_FROM` | no | Sends invitation emails; otherwise share invite links |
| `TRUSTED_ORIGINS` | no | Extra origins for auth (e.g. LAN URL for phone testing) |
| `ALLOWED_DEV_ORIGINS` | no | LAN hosts allowed by `next dev` |
| `NEXT_PUBLIC_APP_NAME` | no | Rename the app |

### Google sign-in (optional)

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application).
2. Authorized redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google` (e.g. `http://localhost:3000/api/auth/callback/google`).
3. Put the client ID and secret in `.env.local` and restart. The Google button only appears when both are set.

### Invitation emails (optional)

Create a [Resend](https://resend.com) API key, verify a sending domain, and set `RESEND_API_KEY` and `EMAIL_FROM`. Without it, email invites are still created (and restricted to that email address); the inviter gets a link to share manually.

## Testing on phones (same Wi-Fi)

1. Find your PC's LAN IP (e.g. `192.168.1.20`).
2. In `.env.local`: `BETTER_AUTH_URL=http://192.168.1.20:3000`, `TRUSTED_ORIGINS=http://192.168.1.20:3000`, `ALLOWED_DEV_ORIGINS=192.168.1.20`.
3. `npm run dev -- -H 0.0.0.0` and open `http://192.168.1.20:3000` on each phone. Allow Node through the Windows firewall if prompted.

## Android app (`mobile/`)

A native Android app built with Expo / React Native. It talks to this same server through a JSON API (`/api/v1/*`) using a bearer token, gets live updates over the same SSE stream, and reuses the exact money engine from `src/lib/money/` — so splits and balances are identical on web and phone.

**Install on a phone:** copy `mobile/android/app/build/outputs/apk/release/app-release.apk` to the phone (WhatsApp/Drive/USB), open it, and allow "Install unknown apps" when Android asks.

**Connect it to a server:** the server must be reachable from the phone.

- *Same Wi-Fi (testing):* run `npm run dev -- -H 0.0.0.0` on the PC, allow Node.js through the Windows firewall (Private networks), and use `http://<PC Wi-Fi IP>:3000` as the server address on the sign-in screen.
- *Friends anywhere (real use):* deploy the server (see below) and enter its `https://` URL as the server address. The address can be changed on the sign-in screen at any time.

**Build the APK yourself** (needs Android Studio's SDK and JDK 17; Windows PowerShell shown):

```powershell
cd mobile
npm install
# Default server address baked into the app (users can still change it):
#   edit mobile/.env -> EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run build:apk
```

Other commands: `npm run typecheck`, `npm run lint`, `npm start` (dev server for Expo development builds), `node scripts/make-icons.mjs` (regenerate icons).

**Notes:** the release APK is signed with the default debug key, which is fine for sharing directly but not for the Play Store (create your own keystore for that). Updates arrive live while the app is open; there are no push notifications when it is closed. PDF receipts are viewable on the web app; image receipts show in the app.

## Deploying

**Best host for SplitMate: [Railway](https://railway.app)** — always-on Node (needed for live SSE), Postgres with `LISTEN/NOTIFY` in the same project, and a public HTTPS URL friends can open from anywhere.

Live updates use Server-Sent Events (`/api/live`) fed by Postgres `LISTEN/NOTIFY`, so do **not** use a purely serverless host (e.g. Vercel alone). Render’s free tier sleeps, which breaks live updates.

### Railway (recommended)

1. Create a free account at [railway.app](https://railway.app) and install the CLI (`npm i -g @railway/cli`) or use `npx @railway/cli`.
2. From this repo:

```bash
npx @railway/cli login
npx @railway/cli init
npx @railway/cli add --database postgres
```

3. Generate a secret and set variables (replace the URL after the first deploy gives you a domain):

```bash
npx @railway/cli variables set BETTER_AUTH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
npx @railway/cli variables set BETTER_AUTH_URL=https://YOUR-APP.up.railway.app
npx @railway/cli variables set NEXT_PUBLIC_APP_NAME=SplitMate
```

`DATABASE_URL` is linked automatically from the Postgres plugin — use the **direct** Postgres URL (Railway’s default), not a transaction pooler.

4. Deploy:

```bash
npx @railway/cli up
npx @railway/cli domain   # create a public *.up.railway.app URL if needed
```

5. After the domain exists, set `BETTER_AUTH_URL` to that exact `https://…` URL and redeploy once so invite links and auth cookies work.

The Docker image runs migrations on every start, then serves the app. Share group invite links from **Group → Settings → Invite friends**.

### Other hosts

1. Provision Postgres (Neon, Supabase, Railway, RDS…). Use a **direct or session-mode** connection string — transaction-mode poolers (e.g. port 6543) do not support `LISTEN`.
2. Set `DATABASE_URL`, `BETTER_AUTH_URL` (your https URL) and `BETTER_AUTH_SECRET`.
3. `npm run db:migrate` (with the production `DATABASE_URL`), then `npm run build && npm start`.

Multiple app instances are fine: each instance listens on Postgres and forwards events to its own connected clients.

## How it works

- **Money** is stored as integer minor units (`bigint`) in the group's currency (INR default; 0- and 3-decimal currencies supported). Splits use largest-remainder allocation with a deterministic tiebreak, so shares always sum exactly to the total.
- **Split methods:** equal, exact amounts, percentages (basis points), shares (supports fractions like 1.5). Multiple payers supported.
- **Balances** are never stored; they are derived from the ledger (expenses + settlements) in SQL, with a pure TypeScript engine (`src/lib/money/`) mirrored and cross-checked in tests.
- **Settle up** suggests at most n−1 payments (exact matches first, then greedy). Recording a payment is capped at what is owed unless "overpayment" is explicitly confirmed. Only the payer, the receiver or a group admin can record or undo one. No real money moves — SplitMate only records what you tell it.
- **Consistency:** every ledger write locks the group row (`SELECT … FOR UPDATE`) inside a transaction; edits use optimistic versioning; creates are idempotent via a client request ID, so double-taps or retries never duplicate records. Deletes are soft for auditability.
- **Security:** all authorization is server-side (non-members get 404), inputs validated with Zod on the server, invite tokens are random and stored hashed, receipts are type-checked by magic bytes and served only to group members, CSV export is formula-injection safe, errors never leak internals.
- **Notifications:** one activity entry per action; notifications are de-duplicated per user/activity and never sent to the actor.

## Project layout

```
drizzle/              SQL migrations
scripts/              migrate + seed
src/app/              routes, server actions (actions.ts), API routes
src/components/       UI
src/lib/money/        pure money/split/balance engine (+ unit tests)
src/lib/db/           schema + connection
src/lib/server/       domain services (groups, expenses, settlements, queries…) + mobile JSON API
tests/                integration tests against in-memory Postgres
mobile/               Android app (Expo Router screens in mobile/src/app)
```

## Limitations

- No real payment integration (UPI/Stripe); settlements are records only.
- Invitation emails require Resend; otherwise share links.
- PGlite is for local development (single process). Use real Postgres in production.
- Receipts are stored in Postgres (max 5 MB each); for heavy use, move to object storage.
- Expenses use the group currency; no multi-currency conversion inside a group.
