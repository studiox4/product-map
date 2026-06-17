DO $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM projects ORDER BY created_at ASC LIMIT 1;
  IF pid IS NOT NULL THEN
    UPDATE ideas        SET project_id = pid WHERE project_id IS NULL;
    UPDATE releases     SET project_id = pid WHERE project_id IS NULL;
    UPDATE objectives   SET project_id = pid WHERE project_id IS NULL;
    UPDATE plans        SET project_id = pid WHERE project_id IS NULL;
    UPDATE share_tokens SET project_id = pid WHERE project_id IS NULL;
    UPDATE documents    SET project_id = pid WHERE project_id IS NULL;
    UPDATE decisions    SET project_id = pid WHERE project_id IS NULL;
    INSERT INTO memberships (user_id, project_id, role)
      SELECT u.id, pid, CASE WHEN u.role = 'admin' THEN 'owner'::member_role ELSE 'editor'::member_role END
      FROM users u
      ON CONFLICT (user_id, project_id) DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "ideas"        ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "releases"     ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "objectives"   ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans"        ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "share_tokens" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents"    ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "decisions"    ALTER COLUMN "project_id" SET NOT NULL;
