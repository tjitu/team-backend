# Team affiliate API

Runtime update: the configured databases received the additive feature SQL on
27 November 2026. Read [the execution record](affiliate-runtime-migrations-20261127.md)
before running migration deployment again; historical Prisma baselining is pending.

The implementation shares existing Supabase sessions and Team Management. Read
`jitu-backend/docs/affiliate-program.md` for financial rules, migrations, deployment
order, Owner decisions, synchronization recovery and production verification.

## Routes (under /api)

| Method | Path | Access |
| --- | --- | --- |
| POST | /team/auth/username-session | Existing-account Supabase login; throttled |
| GET | /team/affiliate/me | Active affiliate with required agreement |
| POST | /team/affiliate/me/boosts | Same; confirmation and request key required |
| GET | /team/affiliate/me/agreement | Active affiliate; accessible before acceptance |
| POST | /team/affiliate/me/agreement/accept | Active affiliate; acknowledgment and preview hash |
| GET | /team/affiliate/admin | Owner / System Admin |
| GET | /team/affiliate/admin/agreement-options | Owner / System Admin; published commercial versions |
| GET | /team/affiliate/admin/:id | Owner / System Admin; scoped report and history |
| POST | /team/affiliate/admin/:id/config | Owner / System Admin; immutable scheduled terms |
| POST | /team/affiliate/admin/:id/bonus | Owner / System Admin; current-month bonus |
| POST | /team/affiliate/admin/:id/payouts | Owner / System Admin; manual tracking only |
| PATCH | /team/affiliate/admin/payouts/:id/status | Owner / System Admin; pending settlement |
| GET / POST | /team/affiliate/agreements | System Owner; list / new draft version |
| PATCH | /team/affiliate/agreements/:id | System Owner; drafts only |
| POST | /team/affiliate/agreements/:id/publish | System Owner; immutable publication |
| GET | /team/affiliate/agreements/:id/preview?affiliateId= | System Owner; personal preview |

Existing member creation accepts `AFFILIATOR` and an optional lowercase username.
Member status and role changes synchronize Main DB identity without removing its
financial history. Affiliate invitations are disabled; administrators create these
credentials through Add Team Member. Existing bootstrap-only Owner creation and
Owner-only System Admin creation remain enforced.

Existing referral create/update endpoints accept nullable `affiliateId`. Assignment
requires an active Team affiliate and records its administrator. List statistics
use snapshot ledger values for affiliate payments; existing promotional statistics
retain their prior treatment. An existing code may be reassigned without rewriting
checkout attribution. The existing validity, status and limits stay available.

Reports accept ISO `from`, exclusive `to`, `limit` (1–500) and `offset`. They omit
customer identity. Affiliates cannot retrieve internal payout notes. Payout records
are tracked separately from per-transaction EARNED/PENDING/INELIGIBLE states.
Boost and payout history responses return the latest 200 entries; transaction
history is paginated. Lifetime journal totals do not depend on the page limit.

The global role boundary reads authoritative membership before operational
requests, including status changes and revocation. Existing roles keep existing
access rules. Agreement checks live in services and pricing/activation functions,
so navigation visibility alone never grants access. Every mutation retains the
existing trusted-origin and authenticated-session requirements.

## Test and release

Account creation requires a valid server-only `SUPABASE_SECRET_KEY` from the same
Team project as `SUPABASE_URL`. `SUPABASE_SERVICE_ROLE_KEY` is supported as a legacy
fallback. Secret keys are sent as `apikey`; legacy service-role JWTs additionally
use the Bearer header. Publishable keys and anon/user JWTs are rejected for account
administration. HTTP 401/403 errors now identify invalid or unauthorized server
credentials without returning their values. Updating the environment requires a
backend restart. Do not place these keys in frontend environment variables.

`npm run test:affiliate` builds and runs service, authorization, identity lifecycle,
agreement, reporting and dependency-graph integration tests. Main Backend must be
available as the sibling `../jitu-backend`, or set `AFFILIATE_FIXTURE_ROOT` to its
`test` directory. Tests create their own localhost-only database and restore test
environment overrides; Supabase account creation uses a test adapter.

Deploy the Main DB migrations first, then `npm run db:deploy` and
`npm run db:generate` for Team DB. All four services must be deployed before
assigning a code. The additive runtime SQL has since been applied as documented
in the execution record above. No live account creation was performed for testing.
