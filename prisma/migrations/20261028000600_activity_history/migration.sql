DROP INDEX IF EXISTS "team_platform"."activity_logs_project_id_created_at_idx";

CREATE INDEX "activity_logs_project_id_created_at_id_idx"
ON "team_platform"."activity_logs"("project_id", "created_at", "id");

CREATE INDEX "activity_logs_created_at_id_idx"
ON "team_platform"."activity_logs"("created_at", "id");
