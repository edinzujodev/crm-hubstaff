CREATE TYPE "public"."session_end_reason" AS ENUM('finished', 'switched', 'auto_closed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"qbo_customer_id" text,
	"hubstaff_project_id" integer
);
--> statement-breakpoint
CREATE TABLE "hubstaff_activities" (
	"id" bigint PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"hubstaff_user_id" integer NOT NULL,
	"hubstaff_project_id" integer NOT NULL,
	"hubstaff_task_id" integer,
	"task_id" integer,
	"tracked_seconds" integer NOT NULL,
	"active_seconds" integer NOT NULL,
	"billable" boolean,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client_id" integer,
	"assignee_id" integer,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"due_date" date,
	"hubstaff_task_id" integer,
	"hubstaff_project_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_hubstaff_task_id_unique" UNIQUE("hubstaff_task_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"hubstaff_user_id" integer,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_hubstaff_user_id_unique" UNIQUE("hubstaff_user_id")
);
--> statement-breakpoint
CREATE TABLE "work_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" "session_end_reason"
);
--> statement-breakpoint
ALTER TABLE "hubstaff_activities" ADD CONSTRAINT "hubstaff_activities_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hubstaff_activities_task_idx" ON "hubstaff_activities" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "hubstaff_activities_starts_idx" ON "hubstaff_activities" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "work_sessions_task_idx" ON "work_sessions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "work_sessions_user_idx" ON "work_sessions" USING btree ("user_id");