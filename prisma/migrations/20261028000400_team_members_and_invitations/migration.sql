CREATE TYPE "team_platform"."InvitationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'ACCEPTED', 'REVOKED');

CREATE TABLE "team_platform"."team_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "team_platform"."TeamRole" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "status" "team_platform"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_team_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_invitations_token_hash_key" ON "team_platform"."team_invitations"("token_hash");
CREATE INDEX "team_invitations_email_status_expires_at_idx" ON "team_platform"."team_invitations"("email", "status", "expires_at");
CREATE INDEX "team_invitations_status_created_at_idx" ON "team_platform"."team_invitations"("status", "created_at");

ALTER TABLE "team_platform"."team_invitations" ADD CONSTRAINT "team_invitations_created_by_team_member_id_fkey" FOREIGN KEY ("created_by_team_member_id") REFERENCES "team_platform"."team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
