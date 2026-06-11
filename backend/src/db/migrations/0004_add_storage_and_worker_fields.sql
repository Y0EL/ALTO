ALTER TABLE "jobs" ADD COLUMN "storage_key" text;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "uploaded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "queued_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "started_at" timestamp with time zone;
