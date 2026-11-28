# TEAM BACKEND REPOSITORY MAP

> Quick reference for LLM agents. Consult before reading Team Backend code. This file is mutable — update it when adding modules or changing permissions.

---

## 1. Directory Structure

```
team-backend/
├── src/
│   ├── main.ts               # Bootstrap, port 3200, IPv4 result order
│   ├── app.module.ts         # Root AppModule + global TrustedOriginGuard
│   ├── create-app.ts         # Express setup, CORS for localhost:3100
│   ├── health.controller.ts  # Health check endpoints
│   ├── database/             # DatabaseModule & PrismaService
│   ├── auth/                 # Supabase token validation adapter, AuthGuard & TrustedOriginGuard
│   ├── team-access/          # Active TeamMember role & workspace access enforcement (`SYSTEM_OWNER`, `SYSTEM_ADMIN`, `MEMBER`)
│   ├── team-management/      # Team member roster, role updates & invitations
│   ├── departments/          # Department management
│   ├── projects/             # Project workspaces, member assignments, audit logs
│   ├── tasks/                # Task Kanban/table, comments, optimistic versioned updates
│   ├── activity/             # Global & project activity log queries
│   ├── control-center/       # Bank Soal, tryout workflow balancing & operational sync with Main DB
│   └── marketing/            # Marketing & partnership operations
├── prisma/
│   └── schema.prisma         # Team DB schema (TeamMember, Project, Task, Comment, ActivityLog, etc.)
├── docs/
│   └── operations-runbook.md # Production operations & troubleshooting runbook
└── scripts/
    └── bootstrap-owner.cjs   # Initial workspace owner bootstrap script
```

---

## 2. Key Architecture Patterns

* **Affiliate workspace**: `src/affiliate/` supplies authenticated self reports/boosts/agreements, administrator configuration/bonus/payouts, and Owner agreement publishing. Financial data stays in Main DB through `AffiliateDatabase`; `AffiliateIdentityService` mirrors Team member lifecycle with fail-closed reconciliation.
* **New role boundary**: `AFFILIATOR` uses existing Supabase sessions. Global `AffiliatorBoundaryGuard` denies operational APIs and allows only own affiliate APIs plus current membership. Agreement acceptance is additionally required for protected operations. Owner/Admin/Member permissions stay unchanged.
* **Username alias**: optional unique `TeamMember.username`, `auth/username-login.controller.ts` and `team_login_throttle` forward password verification to existing Supabase Auth without persisting credentials.
* **Referral assignment**: existing voucher DTOs accept nullable `affiliateId`; admin validation requires an active Team affiliate. Snapshot ledger totals preserve historical commissions after reassignment or rate changes.
* **Runbook and verification**: `docs/affiliate-program.md` lists endpoints and deployment requirements; `test/affiliate-services.test.cjs` covers acceptance, access, lifecycle, reports and application DI against a temporary local DB.

* **Auth & Permissions**: Validates Supabase bearer access token + `TrustedOriginGuard`; user MUST have an active `TeamMember` row in database.
* **Audit Trail**: Every project, task, and comment change creates an `ActivityLog` entry in the same transaction.
* **Optimistic Versioning**: Task mutations check current version to prevent race condition overwrites.
* **Control Center Bridge**: Reads/coordinates Main DB tryout & question workflow metrics safely per `ECOSYSTEM_MAP.md`.
* **Tryout Deletion**: `tryouts.controller.ts` validates the optional `DELETE /team/control-center/tryouts/:id?force=true` flag. Administrator-only force deletion uses `tryout-deletion.ts` in a serializable transaction to remove exam history and sandbox sessions, detach reusable questions by QC status, and delete the tryout/subtests. Default deletion still rejects dependencies.
* **Tryout Participants**: Administrator-only participant listing and finished-attempt reset are handled by `tryout-participants.ts`; results count correct, wrong and unanswered READY questions across the tryout's subtests. Unfinished attempts have no result counts. Reset preserves registration and solution unlocks.

* **Shared schema initialization**: `jitu_internal.SchemaMigration` records completed lifecycle schema setup so serverless instances avoid repeated DDL and PostgREST schema reloads. Bump the lifecycle marker when its initialization changes.
* Admin batch removal uses DELETE /api/team/control-center/questions/batches/selected with name, target and optional tryoutId. It clears batch labels on matching active questions.
* Admin POST /api/team/control-center/questions/bulk-delete removes selected questions in one transaction. When the tryout editor supplies its tryoutId, the transaction also clears sandbox answers for those questions in that tryout. Other answer history blocks the deletion.

* **Registration growth**: `src/control-center/growth/` owns authenticated Owner/Admin configuration, private verification queue/detail/review and analytics. Existing tryout create/edit atomically validates/version-checks Main DB growth settings; it reuses `JituPostgresManagementDataSource.growthDatabase()`. Main repo owns migrations; optional `JITU_COMMUNITY_URL` prefills new settings. See `docs/registration-growth.md` and `npm run test:growth`.
