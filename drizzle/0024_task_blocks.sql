CREATE TABLE "task_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"reason" text,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_by_id" integer,
	"unblocked_at" timestamp with time zone,
	"unblocked_by_id" integer
);
--> statement-breakpoint
ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_blocked_by_id_users_id_fk" FOREIGN KEY ("blocked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_unblocked_by_id_users_id_fk" FOREIGN KEY ("unblocked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_blocks_task_idx" ON "task_blocks" USING btree ("task_id");