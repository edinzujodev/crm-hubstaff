CREATE TYPE "public"."event_repeat" AS ENUM('none', 'daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "repeat" "event_repeat" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "repeat_days" integer[];--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "repeat_until" date;