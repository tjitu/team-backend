CREATE TYPE "team_platform"."BroadcastStatus" AS ENUM (
    'NOT_STARTED',
    'CONTACTED',
    'NEGOTIATING',
    'AWAITING_RESPONSE',
    'PUBLISHED',
    'DECLINED'
);

CREATE TABLE "team_platform"."marketing_partnerships" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Creator',
    "platform" TEXT NOT NULL DEFAULT 'X',
    "total_members" INTEGER NOT NULL DEFAULT 0,
    "pic_name" TEXT,
    "pic_contact" TEXT,
    "broadcast_status" "team_platform"."BroadcastStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "follow_up_date" TIMESTAMP(3),
    "notes" TEXT,
    "department_id" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_partnerships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_partnerships_archived_at_sort_order_created_at_idx"
ON "team_platform"."marketing_partnerships"("archived_at", "sort_order", "created_at");

CREATE INDEX "marketing_partnerships_broadcast_status_archived_at_idx"
ON "team_platform"."marketing_partnerships"("broadcast_status", "archived_at");

CREATE INDEX "marketing_partnerships_platform_archived_at_idx"
ON "team_platform"."marketing_partnerships"("platform", "archived_at");

CREATE INDEX "marketing_partnerships_follow_up_date_archived_at_idx"
ON "team_platform"."marketing_partnerships"("follow_up_date", "archived_at");

CREATE INDEX "marketing_partnerships_department_id_idx"
ON "team_platform"."marketing_partnerships"("department_id");

ALTER TABLE "team_platform"."marketing_partnerships"
ADD CONSTRAINT "marketing_partnerships_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "team_platform"."departments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "team_platform"."marketing_partnerships"
ADD CONSTRAINT "marketing_partnerships_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "team_platform"."team_members"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "team_platform"."marketing_partnerships"
ADD CONSTRAINT "marketing_partnerships_updated_by_id_fkey"
FOREIGN KEY ("updated_by_id") REFERENCES "team_platform"."team_members"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "team_platform"."marketing_partnerships" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'team_platform'
      AND tablename = 'marketing_partnerships'
      AND policyname = 'deny_direct_supabase_access'
  ) THEN
    CREATE POLICY "deny_direct_supabase_access"
    ON "team_platform"."marketing_partnerships"
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;

INSERT INTO "team_platform"."marketing_partnerships" (
  "id",
  "name",
  "category",
  "platform",
  "total_members",
  "pic_name",
  "pic_contact",
  "broadcast_status",
  "follow_up_date",
  "notes",
  "department_id",
  "sort_order",
  "version",
  "created_at",
  "updated_at"
)
SELECT
  seed."id",
  seed."name",
  seed."category",
  seed."platform",
  0,
  NULL,
  NULL,
  'NOT_STARTED'::"team_platform"."BroadcastStatus",
  NULL,
  seed."notes",
  (
    SELECT d."id"
    FROM "team_platform"."departments" d
    WHERE d."slug" = 'marketing'
    LIMIT 1
  ),
  seed."sort_order",
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (VALUES
  ('seed-marketing-partner-1', 'studyarchive27', 'Creator', 'X', NULL::TEXT, 1),
  ('seed-marketing-partner-2', 'piscesslifes', 'Creator', 'X', NULL::TEXT, 2),
  ('seed-marketing-partner-3', 'b4efaa', 'Creator', 'X', 'https://x.com/b4efaa?s=11', 3),
  ('seed-marketing-partner-4', 'lalaaskyyy', 'Creator', 'X', 'https://x.com/lalaaskyyy?s=11', 4),
  ('seed-marketing-partner-5', 'zupazuft', 'Creator', 'X', 'https://x.com/zupazuft?s=11', 5),
  ('seed-marketing-partner-6', 'altherlys', 'Creator', 'X', 'https://x.com/altherlys?s=11', 6)
) AS seed("id", "name", "category", "platform", "notes", "sort_order")
WHERE NOT EXISTS (
  SELECT 1
  FROM "team_platform"."marketing_partnerships" existing
  WHERE existing."id" = seed."id"
     OR (LOWER(existing."name") = LOWER(seed."name") AND LOWER(existing."platform") = LOWER(seed."platform") AND existing."archived_at" IS NULL)
)
ON CONFLICT DO NOTHING;
