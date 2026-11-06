ALTER TABLE "tasks" ADD COLUMN "repeat_lead_days" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "series_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_id_tasks_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_series_idx" ON "tasks" USING btree ("series_id");--> statement-breakpoint
-- Backfill: group existing repeat chains into series (series id = the first task of the chain).
WITH RECURSIVE chain AS (
  SELECT t.id, t.id AS root
  FROM tasks t
  WHERE t.repeated_from_id IS NULL
    AND (t.repeat IS NOT NULL OR EXISTS (SELECT 1 FROM tasks c WHERE c.repeated_from_id = t.id))
  UNION ALL
  SELECT t.id, chain.root
  FROM tasks t
  JOIN chain ON t.repeated_from_id = chain.id
)
UPDATE tasks SET series_id = chain.root FROM chain WHERE tasks.id = chain.id;
