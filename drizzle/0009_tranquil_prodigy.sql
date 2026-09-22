CREATE TABLE "image_senders" (
	"address" text PRIMARY KEY NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "load_images" boolean DEFAULT false NOT NULL;