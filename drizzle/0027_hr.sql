CREATE TYPE "public"."holiday_source" AS ENUM('custom', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."time_off_kind" AS ENUM('vacation', 'sick', 'personal', 'unpaid', 'religious');--> statement-breakpoint
CREATE TYPE "public"."time_off_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"team_id" integer,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_dates_order" CHECK ("events"."end_date" >= "events"."start_date")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"day_off" boolean DEFAULT true NOT NULL,
	"source" "holiday_source" DEFAULT 'custom' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_allowances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"year" integer NOT NULL,
	"days" numeric(4, 1),
	"carried_over" numeric(4, 1),
	"carry_over_until" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" time_off_kind NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day" boolean DEFAULT false NOT NULL,
	"note" text,
	"status" time_off_status DEFAULT 'pending' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" integer,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "time_off_dates_order" CHECK ("time_off"."end_date" >= "time_off"."start_date")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "annual_leave_days" numeric(4, 1) DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_allowances" ADD CONSTRAINT "leave_allowances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_dates_idx" ON "events" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_allowances_user_year" ON "leave_allowances" USING btree ("user_id","year");--> statement-breakpoint
CREATE INDEX "time_off_user_idx" ON "time_off" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_off_dates_idx" ON "time_off" USING btree ("start_date","end_date");