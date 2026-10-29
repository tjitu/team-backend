ALTER TABLE "team_platform"."projects"
ADD COLUMN "department_id" TEXT,
ADD COLUMN "starts_at" TIMESTAMP(3),
ADD COLUMN "ends_at" TIMESTAMP(3);

DO $$
DECLARE
  fallback_department_id TEXT;
BEGIN
  SELECT "id" INTO fallback_department_id
  FROM "team_platform"."departments"
  WHERE "slug" = 'umum' OR "name" = 'Umum'
  ORDER BY CASE WHEN "slug" = 'umum' THEN 0 ELSE 1 END
  LIMIT 1;

  IF fallback_department_id IS NULL THEN
    fallback_department_id := 'migration-default-general';
    INSERT INTO "team_platform"."departments"
      ("id", "name", "slug", "description", "is_active", "version", "created_at", "updated_at")
    VALUES
      (fallback_department_id, 'Umum', 'umum', 'Departemen default untuk proyek lama.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  END IF;

  UPDATE "team_platform"."projects"
  SET "department_id" = fallback_department_id
  WHERE "department_id" IS NULL;
END $$;

ALTER TABLE "team_platform"."projects"
ALTER COLUMN "department_id" SET NOT NULL;

CREATE INDEX "projects_department_id_archived_at_updated_at_idx"
ON "team_platform"."projects"("department_id", "archived_at", "updated_at");

ALTER TABLE "team_platform"."projects"
ADD CONSTRAINT "projects_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "team_platform"."departments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
