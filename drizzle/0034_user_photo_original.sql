-- Written so it can run again safely (it was applied by hand once during development).
ALTER TABLE "user_photos" ADD COLUMN IF NOT EXISTS "original" text;--> statement-breakpoint
ALTER TABLE "user_photos" ADD COLUMN IF NOT EXISTS "crop" jsonb;
