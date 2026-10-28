CREATE TYPE "team_platform"."TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');
CREATE TYPE "team_platform"."TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "team_platform"."tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "team_platform"."TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "team_platform"."TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "due_at" TIMESTAMP(3),
    "created_by_team_member_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_platform"."task_assignees" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "assigned_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_platform"."task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tasks_project_id_status_archived_at_updated_at_idx" ON "team_platform"."tasks"("project_id", "status", "archived_at", "updated_at");
CREATE INDEX "tasks_created_by_team_member_id_archived_at_idx" ON "team_platform"."tasks"("created_by_team_member_id", "archived_at");
CREATE UNIQUE INDEX "task_assignees_task_id_team_member_id_key" ON "team_platform"."task_assignees"("task_id", "team_member_id");
CREATE INDEX "task_assignees_team_member_id_task_id_idx" ON "team_platform"."task_assignees"("team_member_id", "task_id");
CREATE INDEX "task_comments_task_id_created_at_idx" ON "team_platform"."task_comments"("task_id", "created_at");

ALTER TABLE "team_platform"."tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "team_platform"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."tasks" ADD CONSTRAINT "tasks_created_by_team_member_id_fkey" FOREIGN KEY ("created_by_team_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "team_platform"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."task_assignees" ADD CONSTRAINT "task_assignees_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."task_assignees" ADD CONSTRAINT "task_assignees_assigned_by_member_id_fkey" FOREIGN KEY ("assigned_by_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "team_platform"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."task_comments" ADD CONSTRAINT "task_comments_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
