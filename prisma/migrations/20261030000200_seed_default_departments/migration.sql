INSERT INTO "team_platform"."departments"
  ("id", "name", "slug", "description", "is_active", "version", "created_at", "updated_at")
SELECT
  seed."id", seed."name", seed."slug", seed."description", true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('seed-department-marketing', 'Marketing', 'marketing', 'Perencanaan dan pelaksanaan pemasaran JituPTN.'),
  ('seed-department-ops', 'Ops', 'ops', 'Operasional dan koordinasi layanan JituPTN.'),
  ('seed-department-engineering', 'Engineering', 'engineering', 'Pengembangan dan pemeliharaan produk JituPTN.')
) AS seed("id", "name", "slug", "description")
WHERE NOT EXISTS (
  SELECT 1
  FROM "team_platform"."departments" existing
  WHERE existing."slug" = seed."slug"
     OR LOWER(existing."name") = LOWER(seed."name")
)
ON CONFLICT DO NOTHING;
