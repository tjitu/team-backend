CREATE TYPE "team_platform"."ProjectRole" AS ENUM ('PROJECT_MANAGER', 'MEMBER', 'VIEWER');

CREATE TABLE "team_platform"."projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_platform"."project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "role" "team_platform"."ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_platform"."activity_logs" (
    "id" TEXT NOT NULL,
    "actor_team_member_id" TEXT NOT NULL,
    "project_id" TEXT,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_slug_key" ON "team_platform"."projects"("slug");
CREATE INDEX "projects_archived_at_updated_at_idx" ON "team_platform"."projects"("archived_at", "updated_at");
CREATE UNIQUE INDEX "project_members_project_id_team_member_id_key" ON "team_platform"."project_members"("project_id", "team_member_id");
CREATE INDEX "project_members_team_member_id_is_active_idx" ON "team_platform"."project_members"("team_member_id", "is_active");
CREATE INDEX "activity_logs_project_id_created_at_idx" ON "team_platform"."activity_logs"("project_id", "created_at");
CREATE INDEX "activity_logs_entity_type_entity_id_created_at_idx" ON "team_platform"."activity_logs"("entity_type", "entity_id", "created_at");

ALTER TABLE "team_platform"."project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "team_platform"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."project_members" ADD CONSTRAINT "project_members_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."activity_logs" ADD CONSTRAINT "activity_logs_actor_team_member_id_fkey" FOREIGN KEY ("actor_team_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."activity_logs" ADD CONSTRAINT "activity_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "team_platform"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
