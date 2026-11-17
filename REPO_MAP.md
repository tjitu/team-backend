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

* **Auth & Permissions**: Validates Supabase bearer access token + `TrustedOriginGuard`; user MUST have an active `TeamMember` row in database.
* **Audit Trail**: Every project, task, and comment change creates an `ActivityLog` entry in the same transaction.
* **Optimistic Versioning**: Task mutations check current version to prevent race condition overwrites.
* **Control Center Bridge**: Reads/coordinates Main DB tryout & question workflow metrics safely per `ECOSYSTEM_MAP.md`.
