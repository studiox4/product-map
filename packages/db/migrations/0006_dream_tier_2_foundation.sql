CREATE TYPE "public"."objective_status" AS ENUM('on_track', 'at_risk', 'achieved', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'applied', 'archived');--> statement-breakpoint
ALTER TYPE "public"."doc_type" ADD VALUE 'idea_pitch';--> statement-breakpoint
ALTER TYPE "public"."doc_type" ADD VALUE 'release_notes';--> statement-breakpoint
CREATE TABLE "plan_entries" (
	"plan_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"start_date" date,
	"end_date" date,
	"horizon" "horizon" NOT NULL,
	CONSTRAINT "plan_entries_plan_id_feature_id_pk" PRIMARY KEY("plan_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "feature_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "idea_id" uuid;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "description_md" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "current" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "status" "objective_status" DEFAULT 'on_track' NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "notes_doc_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_notes_doc_id_documents_id_fk" FOREIGN KEY ("notes_doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" DROP COLUMN "notes_md";--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_check" CHECK (CASE WHEN "documents"."type"::text = 'release_notes' THEN "documents"."feature_id" IS NULL AND "documents"."idea_id" IS NULL ELSE "documents"."feature_id" IS NOT NULL OR "documents"."idea_id" IS NOT NULL END);