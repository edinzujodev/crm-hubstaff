-- Written so it can run again safely (it was applied by hand once during development).
CREATE TABLE IF NOT EXISTS "time_off_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"time_off_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" bytea NOT NULL,
	"uploaded_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "time_off_documents" ADD CONSTRAINT "time_off_documents_time_off_id_time_off_id_fk" FOREIGN KEY ("time_off_id") REFERENCES "public"."time_off"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "time_off_documents" ADD CONSTRAINT "time_off_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_off_documents_time_off_idx" ON "time_off_documents" USING btree ("time_off_id");
