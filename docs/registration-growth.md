# Registration verification API

Growth administration is integrated into the existing Control Center. `GrowthAdminService` reuses its Main PostgreSQL management connection. Every request checks fresh Team membership and permits only SYSTEM_OWNER/SYSTEM_ADMIN; Member and Affiliator are forbidden. Actor IDs from submitted JSON are ignored in favor of authenticated membership.

Authenticated routes under `/api/team/control-center`:

- `GET /tryout-growth/defaults`
- `GET/PATCH /tryouts/:id/growth`
- `GET /tryouts/:id/growth/analytics`
- `GET /tryouts/:id/registrations`
- `GET /tryouts/:id/registrations/:registrationId`
- `POST /tryouts/:id/registrations/:registrationId/review`

Queue query supports name/email/Instagram search, status, inclusive WIB from/to dates, pagination and Story-first priority; default ordering is oldest first. Counts and Instagram data are administrator-private. Review supports SAVE_PROGRESS, APPROVE, REJECT, multiple reasons and optional next pending ID. The shared Main DB functions validate required checks, retain snapshots/audit, serialize decisions and create scheduled NOT_STARTED attempts only after approval.

Existing tryout create/update accepts `growthConfig` and `growthVersion`. Configuration and tryout edits are one statement, with trusted administrator attribution and version conflict checking. Prisma 6 integer arguments to `growth_config_update` use explicit PostgreSQL casts.

## Deployment/configuration

Apply the four `20261128*` growth SQL migrations from `jitu-backend` to the **Main** database first. There is no new Team DB migration. Keep `JITU_CONTROL_CENTER_DATABASE_URL` server-only, using a role permitted to call the privileged growth functions and access their tables. Browser Supabase roles cannot execute these functions.

Optional `JITU_COMMUNITY_URL` prefills the community URL for new tryout configuration. It must be HTTPS; it never enables the invitation automatically. A saved per-tryout URL overrides this initial default. No external notification/Instagram API credentials are required. Settings saved through Team take effect on the student website without redeployment; existing tryouts remain disabled until configured.

`npm run test:growth` builds and runs 7 service integration cases using actual Prisma 6 with an isolated localhost Main schema. Tests cover guard metadata, Member/Affiliator denial, fresh authorization, URL/config revision validation, filters, partial save/approval/next, trusted actor, history, cross-tryout access and decision races. Use adjacent `jitu-backend/test/growth-fixture.cjs` or `GROWTH_FIXTURE_ROOT`. Remote database URLs are refused by the fixture. Existing Auth admin (4) and tryout controller (2) regression tests also pass; production build passes.

Review is manual: private accounts/expired Stories never cause automatic rejection. Team shows time-sensitive Story work and preserves all review actions. Clicks/declarations are not verified membership/engagement. See Main backend documentation for database rollout and metrics, and `registration-growth-files.md` for modified files.
