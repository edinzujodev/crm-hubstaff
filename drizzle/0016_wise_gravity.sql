ALTER TABLE "dashboard_widgets" ADD COLUMN "column_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dashboard_layout" text DEFAULT '2' NOT NULL;
--> statement-breakpoint
-- Existing widgets: spread them over the two default columns, keeping their order.
UPDATE "dashboard_widgets" w SET "column_index" = (r.rn - 1) % 2
FROM (SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "position", "id") AS rn FROM "dashboard_widgets") r
WHERE r."id" = w."id";
