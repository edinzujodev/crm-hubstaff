CREATE TYPE "public"."task_repeat" AS ENUM('weekly', 'monthly');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repeat" "task_repeat";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repeat_day" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repeated_from_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repeated_from_id_tasks_id_fk" FOREIGN KEY ("repeated_from_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repeated_from_id_unique" UNIQUE("repeated_from_id");