ALTER TABLE "time_off" ADD COLUMN "cancelled_by_id" integer;--> statement-breakpoint
ALTER TABLE "time_off" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;