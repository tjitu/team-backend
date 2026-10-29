# Team Platform Backend

NestJS API for the Team Platform. It stores workspace data in PostgreSQL through Prisma and verifies Supabase Auth access tokens through a dedicated auth-provider adapter. The Supabase project can be changed by replacing environment values; application services keep using Supabase user IDs as opaque identities.

## Feature 1: Team access

- A valid Supabase Auth session identifies the user; it does not grant Team Platform access by itself.
- The API also requires an active `TeamMember` row keyed by Supabase Auth's opaque `userId`.
- Team roles are separate from Jitu product roles: `SYSTEM_OWNER`, `SYSTEM_ADMIN`, and `MEMBER`.
- Missing membership denies access. The only membership bootstrap path is a one-time owner command.
- `GET /api/health` is public. `GET /api/team/me` requires a valid session and active Team membership.

## Local setup

1. Use Node.js 22.12 or newer. Create a Supabase project and copy its database connection string, project URL, and publishable key.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `TEAM_FRONTEND_ORIGIN`.
3. Run `npm install`, `npm run db:generate`, and `npm run db:deploy`.
4. Create or invite the initial user in Supabase Auth. Set `TEAM_OWNER_USER_ID`, `TEAM_OWNER_EMAIL`, and `TEAM_OWNER_NAME` to that Supabase Auth identity; run `npm run bootstrap:owner` once, then remove those temporary values.
5. Run `npm run start:dev`.

The API validates bearer access tokens with Supabase Auth's user endpoint. The frontend stores and refreshes sessions using Supabase's SSR cookie integration. Keep the Team Platform schema outside Supabase's exposed Data API schemas; business data is accessed through this API. Never put a Supabase secret or service-role key in the frontend. Nest runs on Node.js 20.19+ or Node.js 22.12+; this app targets Node.js 22.12+ ([NestJS requirements](https://docs.nestjs.com/first-steps)).

## Feature 2: Project workspaces

- `GET /api/team/projects` lists active projects the member can access; System Owners/Admins see all active projects.
- `POST /api/team/projects` creates a workspace for System Owners/Admins and gives its creator the Project Manager membership.
- `GET /api/team/projects/:projectId` returns only projects visible to the member; inaccessible IDs return 404.
- `PATCH /api/team/projects/:projectId` updates name or description with optimistic version checks.
- `POST /api/team/projects/:projectId/archive` archives the project without deleting its records.
- `POST /api/team/projects/:projectId/members` adds or reactivates an active Team member with a project role.
- Project creation, changes, archiving, and membership changes write ActivityLog entries in the same transaction.

## Feature 3: Task management

- `GET /api/team/projects/:projectId/tasks` lists tasks with status, priority, assignee, and text filters.
- `POST /api/team/projects/:projectId/tasks` creates a task and optional assignments to active project members.
- `GET` and `PATCH /api/team/projects/:projectId/tasks/:taskId` read or update project-scoped tasks; updates require the current version.
- `POST /api/team/projects/:projectId/tasks/:taskId/archive` archives a task with version conflict protection.
- `POST /api/team/projects/:projectId/tasks/:taskId/comments` adds a comment for project members who can write.
- Project Viewers can read tasks; Project Managers and system admins can manage assignments and archive tasks. The reporter and assignees can update task content/status.
- Task and comment mutations write ActivityLog rows in the same database transaction.

## Feature 4: Team administration and invitations

- `GET /api/team/members` lists members for System Owners/Admins. Admins can activate or deactivate members; only the Owner can change roles.
- `GET, POST /api/team/invitations` lists invitations and invites members. Owners/Admins can invite `MEMBER`; only the Owner can grant `SYSTEM_ADMIN`.
- `POST /api/team/invitations/:invitationId/resend` rotates the one-time token and expiry. `POST .../:invitationId/revoke` closes an outstanding invitation.
- `POST /api/team/invitations/accept` requires a signed-in Supabase Auth user with a verified email matching the invitation.
- Invitation tokens are random, stored only as SHA-256 hashes, expire after 72 hours, and are sent through configured SMTP. Delivery failures stay visible as `FAILED` invitations so an admin can retry.
- All state-changing HTTP routes require the exact configured frontend Origin to reduce CSRF risk for cookie-authenticated calls.

## Feature 5: Departments

- `GET /api/team/departments` lists active departments for members and all departments for system admins.
- `POST /api/team/departments` creates a department. `PATCH /api/team/departments/:departmentId` updates its name, description, or active state with version conflict protection.
- `GET /api/team/departments/:departmentId/members` lists active department members for system admins.
- `POST /api/team/departments/:departmentId/members` assigns an active Team member by email. `DELETE /api/team/departments/:departmentId/members/:teamMemberId` removes the association without deleting history.
- `/api/team/me` and the admin member list include active department assignments.
- Department and membership mutations write ActivityLog records in their database transaction.

## Feature 6: Activity history

- `GET /api/team/projects/:projectId/activity` returns the project history to active project members and system admins.
- `GET /api/team/activity` returns team-wide history to System Owners/Admins.
- Both endpoints support bounded cursor pagination plus event, entity, and actor filters. Cursors are checked against the active view before being used.
- Responses include the actor and optional project summary; metadata remains the event-specific record written by the originating feature.

## Feature 7: Project membership lifecycle

- `PATCH /api/team/projects/:projectId/members/:teamMemberId/role` changes a member's project role. Only system admins can assign another Project Manager.
- `DELETE /api/team/projects/:projectId/members/:teamMemberId` removes a membership without deleting its history.
- Project Manager role changes, removals, and Team-member deactivation are serialized against the project record; the last active Project Manager cannot be demoted, removed, or disabled.
- Re-adding an active member is idempotent. Changing an existing role uses the dedicated role endpoint.
- Role changes and removals write ActivityLog entries in the same transaction.

Database changes are versioned in `prisma/migrations`; each subsequent feature extends the schema in its own migration.
