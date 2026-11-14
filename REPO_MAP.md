# TEAM BACKEND REPOSITORY MAP

> Quick reference for LLM agents. Consult before reading Team Backend code.

---

## 1. Directory Structure

```
team-backend/
├── src/
│   ├── main.ts           # Bootstrap, port 3200, IPv4 result order
│   ├── app.module.ts     # AppModule
│   ├── create-app.ts     # Express setup, CORS for localhost:3100
│   ├── auth/             # Supabase token validation adapter & AuthGuard
│   ├── team/             # Team membership (`SYSTEM_OWNER`, `SYSTEM_ADMIN`, `MEMBER`)
│   ├── projects/         # Project workspaces, member assignments, audit logs
│   ├── tasks/            # Task Kanban/table, comments, versioned updates
│   ├── invitations/      # Admin member invitations & token generation
│   └── prisma/           # PrismaService singleton
├── prisma/
│   └── schema.prisma     # TeamMember, Project, Task, Comment, ActivityLog models
└── scripts/
    └── bootstrap-owner.cjs # Initial workspace owner bootstrap script
```

---

## 2. Key Architecture Patterns

* **Auth & Permissions**: Validates Supabase bearer access token; user MUST have an active `TeamMember` row in database.
* **Audit Trail**: Every project, task, and comment change creates an `ActivityLog` entry in the same transaction.
* **Optimistic Versioning**: Task mutations check current version to prevent race condition overwrites.
