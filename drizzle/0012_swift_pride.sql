CREATE TYPE "public"."project_kind" AS ENUM('one_off', 'ongoing');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client_id" integer NOT NULL,
	"kind" "project_kind" DEFAULT 'one_off' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_client_name_idx" ON "projects" USING btree ("client_id","name");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");
--> statement-breakpoint
-- Existing tasks: one ongoing "General" project per client that has tasks.
INSERT INTO "projects" ("name", "client_id", "kind")
SELECT 'General', "client_id", 'ongoing' FROM "tasks" WHERE "client_id" IS NOT NULL GROUP BY "client_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "tasks" SET "project_id" = p."id"
FROM "projects" p
WHERE p."client_id" = "tasks"."client_id" AND p."name" = 'General' AND "tasks"."project_id" IS NULL;
