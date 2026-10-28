CREATE SCHEMA IF NOT EXISTS "team_platform";

CREATE TYPE "team_platform"."TeamRole" AS ENUM ('SYSTEM_OWNER', 'SYSTEM_ADMIN', 'MEMBER');

CREATE TABLE "team_platform"."team_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "team_platform"."TeamRole" NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_members_user_id_key" ON "team_platform"."team_members"("user_id");
CREATE UNIQUE INDEX "team_members_email_key" ON "team_platform"."team_members"("email");
