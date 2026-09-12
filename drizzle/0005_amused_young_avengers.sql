ALTER TABLE "invites" DROP CONSTRAINT "invites_token_hash_unique";--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "selector" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_selector_unique" UNIQUE("selector");