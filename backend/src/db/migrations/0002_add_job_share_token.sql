ALTER TABLE "jobs" ADD COLUMN "share_token" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_share_token_idx" ON "jobs" ("share_token");
