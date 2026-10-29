DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    '_prisma_migrations',
    'activity_logs',
    'departments',
    'project_members',
    'projects',
    'task_assignees',
    'task_comments',
    'tasks',
    'team_invitations',
    'team_member_departments',
    'team_members'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      'team_platform', target_table
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'team_platform'
        AND tablename = target_table
        AND policyname = 'deny_direct_supabase_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        'deny_direct_supabase_access', 'team_platform', target_table
      );
    END IF;
  END LOOP;
END $$;
