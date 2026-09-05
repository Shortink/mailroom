CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid,
	"from_address" text DEFAULT '' NOT NULL,
	"to" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "reply_to" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "hue" integer;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "auto_archive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;