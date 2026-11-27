-- Written so it can run again safely (it was applied by hand once during development).
ALTER TABLE "time_off" ADD COLUMN IF NOT EXISTS "cancelled_by_id" integer;--> statement-breakpoint
ALTER TABLE "time_off" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "time_off" ADD CONSTRAINT "time_off_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
-- Time off cancelled before this was recorded: whoever the cancellation notification names; without one, the person
-- themselves (when someone else cancels it, the person is always told).
UPDATE "time_off" t SET
	"cancelled_by_id" = COALESCE(
		(SELECT n."actor_id" FROM "notifications" n WHERE n."time_off_id" = t."id" AND n."kind" = 'time_off_cancelled' ORDER BY n."created_at" DESC LIMIT 1),
		t."user_id"
	),
	"cancelled_at" = COALESCE(
		(SELECT n."created_at" FROM "notifications" n WHERE n."time_off_id" = t."id" AND n."kind" = 'time_off_cancelled' ORDER BY n."created_at" DESC LIMIT 1),
		t."decided_at",
		t."created_at"
	)
WHERE t."status" = 'cancelled' AND t."cancelled_by_id" IS NULL;
