ALTER TABLE "team_platform"."tasks"
  ALTER COLUMN "project_id" DROP NOT NULL;

CREATE INDEX "tasks_project_id_archived_at_updated_at_idx"
  ON "team_platform"."tasks"("project_id", "archived_at", "updated_at");
