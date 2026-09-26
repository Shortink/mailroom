CREATE TYPE "public"."user_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "member_addresses" (
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	CONSTRAINT "member_addresses_user_id_address_pk" PRIMARY KEY("user_id","address")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "addresses" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "created_by" uuid;--> statement-breakpoint
DROP INDEX "messages_resend_id_idx";--> statement-breakpoint
DROP INDEX "messages_message_id_idx";--> statement-breakpoint
-- Everyone who could sign in before roles existed ran the whole app.
UPDATE "users" SET "role" = 'owner';--> statement-breakpoint
-- An invite from before carries no addresses, and a member must have one.
DELETE FROM "invites" WHERE "accepted_at" IS NULL;--> statement-breakpoint
-- Rows that differ only by case become one lowercase row. The already
-- lowercase row's text wins; flags that show or keep an address win.
CREATE TEMP TABLE "merged_addresses" ON COMMIT DROP AS
SELECT
	lower("address") AS "address",
	(array_agg("label" ORDER BY "address" = lower("address") DESC) FILTER (WHERE "label" IS NOT NULL))[1] AS "label",
	bool_or("pinned") AS "pinned",
	bool_and("hidden") AS "hidden",
	min("position") AS "position",
	(array_agg("display_name" ORDER BY "address" = lower("address") DESC) FILTER (WHERE "display_name" IS NOT NULL))[1] AS "display_name",
	(array_agg("reply_to" ORDER BY "address" = lower("address") DESC) FILTER (WHERE "reply_to" IS NOT NULL))[1] AS "reply_to",
	(array_agg("hue" ORDER BY "address" = lower("address") DESC) FILTER (WHERE "hue" IS NOT NULL))[1] AS "hue",
	bool_or("auto_archive") AS "auto_archive"
FROM "addresses"
GROUP BY lower("address");--> statement-breakpoint
DELETE FROM "addresses";--> statement-breakpoint
INSERT INTO "addresses" ("address", "label", "pinned", "hidden", "position", "display_name", "reply_to", "hue", "auto_archive")
SELECT "address", "label", "pinned", "hidden", "position", "display_name", "reply_to", "hue", "auto_archive"
FROM "merged_addresses";--> statement-breakpoint
UPDATE "messages" SET "delivered_to" = lower("delivered_to") WHERE "delivered_to" <> lower("delivered_to");--> statement-breakpoint
UPDATE "messages" SET "from_address" = lower("from_address")
WHERE "direction" = 'outbound' AND "from_address" <> lower("from_address");--> statement-breakpoint
UPDATE "drafts" SET "from_address" = lower("from_address") WHERE "from_address" <> lower("from_address");--> statement-breakpoint
-- A send that failed after its thread was created left it empty.
DELETE FROM "threads" t WHERE NOT EXISTS (SELECT 1 FROM "messages" m WHERE m."thread_id" = t."id");--> statement-breakpoint
-- The address each message belongs to: where inbound mail was delivered, where
-- outbound mail was sent from. Pending and failed inbound rows can lack one.
CREATE TEMP TABLE "message_addresses" ON COMMIT DROP AS
SELECT m."id", m."thread_id", m."received_at", coalesce(
	CASE WHEN m."direction" = 'outbound' THEN m."from_address" ELSE m."delivered_to" END,
	lower(coalesce(substring(m."to"[1] from '<([^>]+)>'), m."to"[1])),
	(SELECT x."delivered_to" FROM "messages" x WHERE x."delivered_to" IS NOT NULL
		GROUP BY x."delivered_to" ORDER BY count(*) DESC, x."delivered_to" LIMIT 1)
) AS "address"
FROM "messages" m;--> statement-breakpoint
INSERT INTO "addresses" ("address") SELECT DISTINCT "address" FROM "message_addresses" ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "messages" m SET "delivered_to" = ma."address"
FROM "message_addresses" ma
WHERE ma."id" = m."id" AND m."direction" = 'inbound' AND m."delivered_to" IS NULL;--> statement-breakpoint
UPDATE "threads" t SET "address" = earliest."address"
FROM (
	SELECT DISTINCT ON ("thread_id") "thread_id", "address"
	FROM "message_addresses"
	ORDER BY "thread_id", "received_at", "id"
) earliest
WHERE earliest."thread_id" = t."id";--> statement-breakpoint
-- Each thread belongs to one address from here on. A thread holding mail for
-- two would show one address's mail to whoever holds the other, so stop.
DO $$
DECLARE
	mixed integer;
	listed text;
BEGIN
	SELECT count(*), string_agg("thread_id"::text, ', ' ORDER BY "nth") FILTER (WHERE "nth" <= 5)
	INTO mixed, listed
	FROM (
		SELECT "thread_id", row_number() OVER (ORDER BY "thread_id") AS "nth"
		FROM (
			SELECT DISTINCT ma."thread_id" FROM "message_addresses" ma JOIN "threads" t ON t."id" = ma."thread_id"
			WHERE ma."address" <> t."address"
		) d
	) numbered;
	IF mixed = 1 THEN
		RAISE EXCEPTION 'Thread % holds mail for more than one address. Split it by hand, then migrate again.', listed;
	ELSIF mixed > 1 THEN
		RAISE EXCEPTION '% threads hold mail for more than one address, starting with %. Split them by hand, then migrate again.', mixed, listed;
	END IF;
END $$;--> statement-breakpoint
UPDATE "drafts" d SET "from_address" = t."address" FROM "threads" t WHERE d."thread_id" = t."id";--> statement-breakpoint
UPDATE "drafts" SET "from_address" = coalesce(
	(SELECT "delivered_to" FROM "messages" WHERE "delivered_to" IS NOT NULL
		GROUP BY "delivered_to" ORDER BY count(*) DESC, "delivered_to" LIMIT 1),
	''
)
WHERE "thread_id" IS NULL AND "from_address" = '';--> statement-breakpoint
UPDATE "drafts" SET "created_by" = (SELECT "id" FROM "users" ORDER BY "created_at", "id" LIMIT 1);--> statement-breakpoint
-- No user means nobody to own them.
DELETE FROM "drafts" WHERE "created_by" IS NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "address" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "member_addresses" ADD CONSTRAINT "member_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_addresses" ADD CONSTRAINT "member_addresses_address_addresses_address_fk" FOREIGN KEY ("address") REFERENCES "public"."addresses"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_address_addresses_address_fk" FOREIGN KEY ("address") REFERENCES "public"."addresses"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_address_idx" ON "threads" USING btree ("address","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "messages_resend_id_idx" ON "messages" USING btree ("resend_id","delivered_to");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_message_id_idx" ON "messages" USING btree ("delivered_to","message_id") WHERE "messages"."direction" = 'inbound';--> statement-breakpoint
CREATE INDEX "messages_message_id_lookup_idx" ON "messages" USING btree ("message_id");