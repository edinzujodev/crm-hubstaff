CREATE TYPE "public"."repeat_show" AS ENUM('days_before', 'week_start', 'month_start', 'due_day');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repeat_show" "repeat_show";