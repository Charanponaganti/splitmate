ALTER TABLE "expenses" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "done_by" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
