CREATE TABLE "project_favorites" (
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_favorites_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "project_favorites" ADD CONSTRAINT "project_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_favorites" ADD CONSTRAINT "project_favorites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "activity" a SET "project_id" = f."project_id" FROM "features" f WHERE a."feature_id" = f."id";--> statement-breakpoint
DO $$
DECLARE
  r record;
  base text;
  cand text;
  n int;
BEGIN
  -- Assign each project a globally-unique slug. Processing oldest-first and
  -- probing the FULL slug set (not just within-name duplicates) is collision
  -- proof even when a derived suffix (alpha-2) clashes with a literal name
  -- ("Alpha-2"). A simple PARTITION BY row_number suffix is NOT — it can
  -- produce two identical slugs and fail the unique index below.
  FOR r IN SELECT id, name FROM "projects" ORDER BY created_at, id LOOP
    base := regexp_replace(regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g');
    IF base = '' THEN base := 'project'; END IF;
    cand := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "projects" WHERE slug = cand AND id <> r.id) LOOP
      n := n + 1;
      cand := base || '-' || n;
    END LOOP;
    UPDATE "projects" SET slug = cand WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_project_id_idx" ON "activity" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_unique" UNIQUE("slug");
