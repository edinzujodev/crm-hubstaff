CREATE TYPE "public"."client_kind" AS ENUM('company', 'group');--> statement-breakpoint
CREATE TABLE "client_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kind" "client_kind" DEFAULT 'company' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_companies" ADD CONSTRAINT "client_companies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_companies_client_name_idx" ON "client_companies" USING btree ("client_id","name");