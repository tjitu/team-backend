ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'AFFILIATOR';
ALTER TABLE "team_members" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "team_members_username_key" ON "team_members" ("username");
CREATE TABLE "team_login_throttle" ("key" TEXT PRIMARY KEY,"attempts" INTEGER NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL);
ALTER TABLE "team_login_throttle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "team_login_throttle" FROM PUBLIC;
