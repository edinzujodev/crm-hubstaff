CREATE TABLE "task_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"reviewer_id" integer,
	"result" "review_result" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_reviews_task_idx" ON "task_reviews" USING btree ("task_id");
--> statement-breakpoint
INSERT INTO "task_reviews" ("task_id", "reviewer_id", "result", "note", "created_at")
SELECT "id", "reviewer_id", "review_result", "review_note", COALESCE("reviewed_at", now()) FROM "tasks" WHERE "review_result" IS NOT NULL;
