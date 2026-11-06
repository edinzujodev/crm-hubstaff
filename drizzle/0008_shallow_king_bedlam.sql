CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'member');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "team_id" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "approaching_hours" integer DEFAULT 72 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "critical_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_team_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
-- Backfill: a task belongs to its assignee's team.
UPDATE tasks SET team_id = users.team_id FROM users WHERE tasks.assignee_id = users.id AND users.team_id IS NOT NULL;
--> statement-breakpoint
-- The first person in the CRM becomes super admin; change it on the Team page.
UPDATE users SET role = 'super_admin' WHERE id = (SELECT min(id) FROM users);
