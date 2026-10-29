CREATE INDEX "projects_created_by_id_idx"
  ON "team_platform"."projects"("created_by_id");

CREATE INDEX "activity_logs_actor_team_member_id_idx"
  ON "team_platform"."activity_logs"("actor_team_member_id");

CREATE INDEX "task_assignees_assigned_by_member_id_idx"
  ON "team_platform"."task_assignees"("assigned_by_member_id");

CREATE INDEX "task_comments_author_member_id_idx"
  ON "team_platform"."task_comments"("author_member_id");

CREATE INDEX "team_invitations_created_by_team_member_id_idx"
  ON "team_platform"."team_invitations"("created_by_team_member_id");

CREATE INDEX "team_member_departments_assigned_by_team_member_id_idx"
  ON "team_platform"."team_member_departments"("assigned_by_team_member_id");
