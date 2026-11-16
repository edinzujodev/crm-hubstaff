CREATE TYPE "public"."review_result" AS ENUM('approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "checklist_template_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "task_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "template_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reviewer_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "review_result" "review_result";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_template_items_template_idx" ON "checklist_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "task_checklist_items_task_idx" ON "task_checklist_items" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;