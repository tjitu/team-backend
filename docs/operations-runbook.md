# Team Platform operations runbook

This runbook covers the two separate repositories: deploy `team-frontend` and `team-backend` as separate Vercel projects, and keep Supabase PostgreSQL as the source of truth. Never put `.env`, database URLs, Supabase keys, or backup archives in Git or chat.

## Deployment setup

The frontend is a Next.js project. The backend is a NestJS project and exposes `/api/health` for liveness and `/api/health/ready` for database readiness.

Create each Vercel project under the Jitu company team, connected to its matching GitHub repository, with the repository root as the project root. The Vercel account currently connected to this workstation is a personal team and does not contain either Team Platform project; do not use it for company deployment.

Configure production environment variables in Vercel's dashboard, never in source control:

| Project | Variables |
| --- | --- |
| `team-frontend` | `NEXT_PUBLIC_TEAM_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `team-backend` | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `TEAM_FRONTEND_ORIGIN` |

Configure `NEXT_PUBLIC_TEAM_API_URL` with the backend's HTTPS `/api` URL and `TEAM_FRONTEND_ORIGIN` with the frontend's exact HTTPS origin. Add the existing SMTP variables to the backend only when the company mail provider is ready. Configure `TEAM_OWNER_USER_ID`, `TEAM_OWNER_EMAIL`, and `TEAM_OWNER_NAME` only for the one-time owner bootstrap; do not leave bootstrap access enabled as a regular runtime feature.

Deploy previews first. Verify login, project access, invitations, task updates, and both health endpoints against the preview URLs. Production rollout needs the Jitu Vercel team and confirmation of the production domain `team.jituptn.com` and API origin before domains or production environment variables are changed.

## Free-plan database backups

Supabase Free does not include the automatic daily backups described for paid plans. Use the local PostgreSQL client tools and save archives to a private location outside Git. The backup script reads `DIRECT_URL` (preferred) or `DATABASE_URL` from the backend's local `.env`; it does not print the connection string.

```powershell
cd new-repo\team-backend
./scripts/backup-team-platform.ps1
```

The archive contains the `team_platform` schema, its RLS policies, migration history, and data. `.gitignore` excludes the generated `backups/` directory. Copy verified archives to company-managed private storage and set a retention schedule; leaving them only on this workstation is not an off-site backup.

The dump intentionally excludes Supabase-managed schemas such as `auth` and `storage`. It does not back up Auth users or project-level Auth settings. Keep those outside this database backup plan; a full project-loss recovery needs a separate identity and configuration recovery procedure.

## Restore rehearsal

Restore only into a fresh, isolated recovery project. Set `TEAM_PLATFORM_RESTORE_URL` in the current PowerShell session to that target's session-pooler connection string without pasting it into chat, then run:

```powershell
$env:TEAM_PLATFORM_RESTORE_URL = '<target session-pooler connection string>'
./scripts/restore-team-platform.ps1 -BackupFile '.\backups\<timestamp>\team-platform.dump'
```

The restore script does not drop existing objects. A non-empty target can produce conflicts; do not point it at the live project. After restore, run Prisma migrations in a controlled change window, verify RLS and the health endpoint, and perform a login/project/task smoke check before directing traffic to the recovery project.

## Migration and application rollback

Apply database migrations before promoting code that depends on them. Prefer additive, backward-compatible migrations. Record the migration name and result. Prisma migrations do not provide automatic down migrations: for a bad additive change, deploy a corrective migration; for a major recovery, restore the latest verified archive into a new project and switch configuration only after verification.

For the foreign-key index migration, rollback is non-destructive to application rows but may slow related queries. If needed, remove only the six named indexes with a reviewed migration; do not delete rows or edit `_prisma_migrations` manually.

For application rollback, redeploy the last known-good Vercel deployment after checking that it remains compatible with the current database schema. Do not roll the database back by dropping columns while old/new app versions may be serving traffic.

## Pilot gate

- Company-owned Vercel projects and production domain confirmed.
- Required production environment variables set in Vercel.
- Latest migrations applied and Prisma migration history reconciled.
- Verified database archive copied to company-managed private storage.
- Restore rehearsal completed against an isolated project.
- Login, project membership, role enforcement, invitations, task CRUD, and activity history verified.
- Owner and operational support contact confirmed by Jitu.
