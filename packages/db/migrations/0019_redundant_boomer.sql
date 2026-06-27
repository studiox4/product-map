ALTER TYPE "public"."idea_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TABLE "notification_mutes" DROP CONSTRAINT "notification_mutes_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "submitter_name" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "submitter_email" text;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "notification_mutes" ADD CONSTRAINT "notification_mutes_kind_check" CHECK ("notification_mutes"."kind" IN ('mention', 'comment', 'reply', 'project_invite', 'idea_submitted'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" IN ('mention', 'comment', 'reply', 'project_invite', 'idea_submitted'));