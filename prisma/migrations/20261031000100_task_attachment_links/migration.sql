ALTER TABLE "team_platform"."tasks"
  ADD COLUMN "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
