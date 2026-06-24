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
UPDATE "projects" SET "slug" = regexp_replace(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g');--> statement-breakpoint
UPDATE "projects" SET "slug" = 'project' WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint
UPDATE "projects" p SET "slug" = p."slug" || '-' || r.rn FROM (SELECT id, row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn FROM "projects") r WHERE p.id = r.id AND r.rn > 1;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_project_id_idx" ON "activity" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_unique" UNIQUE("slug");
