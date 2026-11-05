# FlatFlow

FlatFlow is a multi-tenant household expense PWA built with Next.js App Router, TypeScript, PostgreSQL, Drizzle ORM, Auth.js, and Tailwind CSS. Its financial core separates each member's prepaid food wallet from the household's monthly common-ration fund.

## What is implemented

- Phone-number registration and login with an environment-controlled fixed OTP, secure HTTP-only Auth.js sessions, and logout.
- Household creation, immediate phone-based addition of registered members, membership checks, admin/member roles, and household-scoped APIs.
- Multiple groups per account, separated into groups created and joined, with member rosters visible to group members and creator-only group editing/member management.
- PostgreSQL schema and migrations with UUID keys, composite household foreign keys, unique idempotency constraints, and indexes.
- Integer-paise wallet transactions, admin wallet contributions, equal/custom/percentage/share-based meal splits, atomic participant-only debits, compensating edits/refunds, and audit records.
- Admin wallet funding in one atomic batch, with either the same credit for every member or individually entered amounts.
- Monthly ration contributions and purchases in a separate fund. Purchases lock the fund row and cannot exceed its recorded balance.
- Household dashboard, wallet/ledger, meal creation/details, ration, monthly reports, and in-app notification pages.
- Group detail/history view for members, including the creator, roster, recent meal expenses, shared-fund contributions, and purchases.
- Push subscription storage and Web Push delivery after successful meal transactions. Expired endpoints are removed; push errors do not undo a committed meal.
- Installable PWA manifest, offline navigation fallback that never caches household data, notification service worker, and browser install/notification controls.
- Database-backed rate limits on authentication, invitations, and financial operations; security headers; Zod validation.

## Architecture

`src/app` contains pages and route handlers. Server-only authorization lives in `src/lib/auth/authorize.ts`; database schema and connection code are in `src/lib/db`; financial workflows live in `src/lib/services`; request schemas and split calculations are in `src/lib/validation`. UI components do not update wallet balances directly.

Every protected operation derives the account from the Auth.js server session and checks household membership (and role where required). Client-supplied household/member/resource IDs are validated and checked against household-scoped records. Composite foreign keys make cross-household wallet, meal, fund, notification, and audit relationships fail at the database layer. Wallet updates, immutable ledger inserts, meal participants, in-app notifications, and audit events are committed atomically. PostgreSQL row locks prevent concurrent overdrafts; advisory locks and unique keys make financial writes idempotent.

Amounts are stored as integer paise. Wallet balances are a transactionally maintained read model; the ledger is the financial history. Edits and cancellations add compensating ledger entries rather than deleting transactions. The ration fund is calculated from its own contribution and expense records and never touches personal wallets.

### Main database tables

| Area | Tables |
|---|---|
| Accounts and tenants | `users`, `households`, `household_members`, `invitations` |
| Periods and wallets | `monthly_periods`, `wallets`, `wallet_transactions` |
| Meals | `meals`, `meal_participants` |
| Common ration fund | `common_funds`, `common_fund_contributions`, `common_expenses` |
| Notifications and audit | `notifications`, `push_subscriptions`, `audit_logs` |
| Security | `password_reset_tokens`, `rate_limits` |

`drizzle/` contains the checked-in SQL migration history. Row-Level Security policies are not enabled in this initial implementation; server-side authorization plus composite foreign keys are enforced instead. Do not expose a database role with unrestricted access to clients.

## Requirements

- Node.js 22 or later.
- PostgreSQL 15+ (Neon is supported; use a TLS-enabled connection string).
- SMTP credentials for password recovery.
- HTTPS in production for service workers, install prompts, and push notifications.

## Local setup

1. Install packages:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set real, private values. Never commit `.env.local`.

3. Configure `DATABASE_URL` for your PostgreSQL/Neon database and `AUTH_SECRET` as a random secret. `APP_URL` must be the canonical origin used in password reset links.

4. Apply migrations:

   ```sh
   npm run db:migrate
   ```

5. Start the development server:

   ```sh
   npm run dev
   ```

   Open `http://localhost:3000`, register with a phone number and the configured demo OTP, create a household, then add registered housemates by phone from the admin dashboard.

## Environment variables

See [.env.example](./.env.example). Important values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL/Neon connection string; server-only |
| `MIGRATION_DATABASE_URL` | Optional direct PostgreSQL connection for migrations; falls back to `DATABASE_URL` |
| `AUTH_SECRET` | Auth.js session signing/encryption secret |
| `STATIC_OTP_ENABLED` | Set to `true` to enable the configured fixed OTP; set to `false` until an SMS provider is configured |
| `DEMO_OTP` | Six-digit fixed OTP used when `STATIC_OTP_ENABLED=true`; fixed OTPs are not secure for production |
| `APP_URL` | Public origin used to construct password-reset links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | SMTP transport for password recovery |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Server-side Web Push credentials |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Matching public VAPID key used by browsers |

Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Only the public key belongs in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Keep SMTP credentials, `AUTH_SECRET`, `DATABASE_URL`, and `VAPID_PRIVATE_KEY` in the hosting provider's secret environment configuration.

## Database workflow

After changing `src/lib/db/schema.ts`, create and review a migration:

```sh
npm run db:generate
npm run db:migrate
```

Migrations are append-only. Do not edit an already-applied migration in a deployed database; generate a follow-up migration instead.

## Authentication and invitations

Auth.js Credentials uses phone numbers and JWT sessions. When `STATIC_OTP_ENABLED=true` and `DEMO_OTP` is a six-digit value, that fixed OTP is stored hashed for each requested phone number, expires after 60 seconds, and is consumed on successful sign-in. This switch works independently of `NODE_ENV`, so enabling it on a production server also enables the fixed OTP there; do so only for controlled testing. When it is disabled, OTP sending and registration return `503` until an SMS delivery provider is integrated. Indian 10-digit phone numbers are stored in normalized `+91` format; international numbers must include their country code.

The user who creates a household is its `ADMIN`. Admins can add a housemate by name and phone; if the phone is new, a passwordless account, membership, and wallet are created atomically. If the account already exists, it is added without overwriting its profile. The housemate can then sign in with their phone and the development OTP and land on the dashboard. Admin-only endpoints guard household pricing and ration expense changes. Existing account rows retain their email and password fields for compatibility, but users created before phone login need a unique phone number added before they can sign in. Password reset by email remains for those legacy accounts only.

## Push and PWA

Push delivery is optional until all VAPID variables are configured. Users can enable browser notifications from the dashboard. Each subscription is associated with the authenticated user and household; multiple devices are supported. In-app notifications are stored independently of push delivery. The service worker caches only the offline fallback page and never caches authenticated API or dashboard responses.

Browser support varies: installation prompts and push are feature-detected; Safari/iOS behavior depends on OS version and whether the app is installed. Push requires HTTPS outside localhost.

## Development commands

```sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

`npm test` currently covers split calculation and deterministic paise rounding. Database-backed integration tests require a configured PostgreSQL database and are not yet part of the automated suite.

## Deployment

Vercel uses `npm run build:vercel` as its build command. This runs `npm run db:migrate` first and only starts the Next.js production build if migrations succeed. A migration failure therefore fails the Vercel deployment instead of publishing an app against an out-of-date schema.

1. Create a Neon PostgreSQL database.
2. In Vercel Project Settings → Environment Variables, configure `DATABASE_URL` for the application (the Neon pooled connection string is suitable).
3. Configure `MIGRATION_DATABASE_URL` with Neon’s direct, non-pooled connection string for Drizzle migrations. If omitted, migrations use `DATABASE_URL`.
4. Configure `AUTH_SECRET` and `APP_URL`; add optional SMTP and VAPID settings only when those services are configured. Do not add a production `DEMO_OTP`; the current fixed-OTP flow is development-only, so production authentication requires a real SMS integration.
5. Import the Git repository into Vercel and deploy. Each deployment runs migrations before building. Keep database and service credentials out of source control.

Use backward-compatible, append-only migrations for zero-downtime deployments: expand the schema first, deploy code compatible with both schemas, then remove obsolete schema in a later deployment.

## Scope notes

This codebase establishes the end-to-end account, household, wallet, meal, ration, reports, notification, audit-log, and PWA flows above. It is not yet a full implementation of every screen in the original specification: member removal/deactivation, profile and settings management, monthly closing/reconciliation UI, configurable meal confirmation, and receipt uploads/storage remain follow-up work. RLS and database-backed integration/concurrency tests also need deployment-specific setup before treating the service as production-certified.
#   f l o w - f l a t  
 