# Team Platform Backend

NestJS API for the Team Platform. It uses PostgreSQL through Prisma and verifies the existing Better Auth session by calling its `get-session` endpoint; it does not create or modify Better Auth tables.

## Feature 1: Team access

- A valid Better Auth session identifies the user; it does not grant Team Platform access by itself.
- The API also requires an active `TeamMember` row keyed by Better Auth's opaque `userId`.
- Team roles are separate from Jitu product roles: `SYSTEM_OWNER`, `SYSTEM_ADMIN`, and `MEMBER`.
- Missing membership denies access. The only membership bootstrap path is a one-time owner command.
- `GET /api/health` is public. `GET /api/team/me` requires a valid session and active Team membership.

## Local setup

1. Use Node.js 22.12 or newer and PostgreSQL 15 or newer. Create a database for this service.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL`, `BETTER_AUTH_SESSION_URL`, and `TEAM_FRONTEND_ORIGIN`.
3. Run `npm install`, `npm run db:generate`, and `npm run db:deploy`.
4. Set `TEAM_OWNER_USER_ID`, `TEAM_OWNER_EMAIL`, and `TEAM_OWNER_NAME` to an existing Better Auth identity; run `npm run bootstrap:owner` once, then remove those temporary values.
5. Run `npm run start:dev`.

The API forwards the browser's HttpOnly session cookie to Better Auth's server-side `get-session` endpoint, which is the session lookup pattern described in the [Better Auth session documentation](https://better-auth.com/docs/concepts/session-management). Nest runs on Node.js 20.19+ or Node.js 22.12+; this app targets Node.js 22.12+ ([NestJS requirements](https://docs.nestjs.com/first-steps)).

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
- `POST /api/team/invitations/accept` requires a signed-in Better Auth user with a verified email matching the invitation.
- Invitation tokens are random, stored only as SHA-256 hashes, expire after 72 hours, and are sent through configured SMTP. Delivery failures stay visible as `FAILED` invitations so an admin can retry.
- All state-changing HTTP routes require the exact configured frontend Origin to reduce CSRF risk for cookie-authenticated calls.

## Feature 5: Departments

- `GET /api/team/departments` lists active departments for members and all departments for system admins.
- `POST /api/team/departments` creates a department. `PATCH /api/team/departments/:departmentId` updates its name, description, or active state with version conflict protection.
- `GET /api/team/departments/:departmentId/members` lists active department members for system admins.
- `POST /api/team/departments/:departmentId/members` assigns an active Team member by email. `DELETE /api/team/departments/:departmentId/members/:teamMemberId` removes the association without deleting history.
- `/api/team/me` and the admin member list include active department assignments.
- Department and membership mutations write ActivityLog records in their database transaction.

Database changes are versioned in `prisma/migrations`; each subsequent feature extends the schema in its own migration.
