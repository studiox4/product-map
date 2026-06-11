CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "doc_type" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"body_json" jsonb NOT NULL,
	"body_md" text NOT NULL,
	"prompt_hints" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "templates_default_per_type" ON "templates" USING btree ("type") WHERE "templates"."is_default";