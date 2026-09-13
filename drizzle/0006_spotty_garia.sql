ALTER TABLE "messages" ADD COLUMN "ingested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "forwarded_at" timestamp with time zone;