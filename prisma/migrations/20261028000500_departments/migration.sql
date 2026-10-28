CREATE TABLE "team_platform"."departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_platform"."team_member_departments" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "assigned_by_team_member_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_member_departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_name_key" ON "team_platform"."departments"("name");
CREATE UNIQUE INDEX "departments_slug_key" ON "team_platform"."departments"("slug");
CREATE INDEX "departments_is_active_name_idx" ON "team_platform"."departments"("is_active", "name");
CREATE UNIQUE INDEX "team_member_departments_department_id_team_member_id_key" ON "team_platform"."team_member_departments"("department_id", "team_member_id");
CREATE INDEX "team_member_departments_team_member_id_is_active_idx" ON "team_platform"."team_member_departments"("team_member_id", "is_active");

ALTER TABLE "team_platform"."team_member_departments" ADD CONSTRAINT "team_member_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "team_platform"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."team_member_departments" ADD CONSTRAINT "team_member_departments_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_platform"."team_member_departments" ADD CONSTRAINT "team_member_departments_assigned_by_team_member_id_fkey" FOREIGN KEY ("assigned_by_team_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
