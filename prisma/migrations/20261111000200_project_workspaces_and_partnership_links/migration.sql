ALTER TABLE "team_platform"."projects"
  ADD COLUMN IF NOT EXISTS "has_partnership_sheet" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "team_platform"."tasks"
  ADD COLUMN IF NOT EXISTS "department_id" TEXT,
  ADD COLUMN IF NOT EXISTS "partnership_id" TEXT;

ALTER TABLE "team_platform"."marketing_partnerships"
  ADD COLUMN IF NOT EXISTS "project_id" TEXT;

CREATE INDEX IF NOT EXISTS "tasks_department_id_archived_at_updated_at_idx"
  ON "team_platform"."tasks"("department_id", "archived_at", "updated_at");

CREATE INDEX IF NOT EXISTS "tasks_partnership_id_archived_at_idx"
  ON "team_platform"."tasks"("partnership_id", "archived_at");

CREATE INDEX IF NOT EXISTS "marketing_partnerships_project_id_archived_at_idx"
  ON "team_platform"."marketing_partnerships"("project_id", "archived_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_department_id_fkey' AND connamespace = 'team_platform'::regnamespace) THEN
    ALTER TABLE "team_platform"."tasks"
      ADD CONSTRAINT "tasks_department_id_fkey"
      FOREIGN KEY ("department_id") REFERENCES "team_platform"."departments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_partnership_id_fkey' AND connamespace = 'team_platform'::regnamespace) THEN
    ALTER TABLE "team_platform"."tasks"
      ADD CONSTRAINT "tasks_partnership_id_fkey"
      FOREIGN KEY ("partnership_id") REFERENCES "team_platform"."marketing_partnerships"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_partnerships_project_id_fkey' AND connamespace = 'team_platform'::regnamespace) THEN
    ALTER TABLE "team_platform"."marketing_partnerships"
      ADD CONSTRAINT "marketing_partnerships_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "team_platform"."projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
