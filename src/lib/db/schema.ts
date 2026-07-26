import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const direction = pgEnum("direction", ["inbound", "outbound"]);
export const messageStatus = pgEnum("message_status", ["pending", "complete", "failed"]);

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subject: text("subject").notNull().default(""),
    participants: text("participants").array().notNull().default(sql`'{}'`),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    messageCount: integer("message_count").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [index("threads_last_message_at_idx").on(t.lastMessageAt.desc())],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    direction: direction("direction").notNull(),
    status: messageStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    resendId: text("resend_id"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references").array().notNull().default(sql`'{}'`),
    fromAddress: text("from_address"),
    fromName: text("from_name"),
    to: text("to").array().notNull().default(sql`'{}'`),
    cc: text("cc").array().notNull().default(sql`'{}'`),
    deliveredTo: text("delivered_to"),
    subject: text("subject").notNull().default(""),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    headers: jsonb("headers"),
    spf: text("spf"),
    dkim: text("dkim"),
    dmarc: text("dmarc"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('english', coalesce(${messages.subject}, '') || ' ' || coalesce(${messages.textBody}, ''))`,
    ),
  },
  (t) => [
    uniqueIndex("messages_resend_id_idx").on(t.resendId),
    uniqueIndex("messages_message_id_idx").on(t.messageId),
    index("messages_thread_idx").on(t.threadId),
    index("messages_inbox_idx").on(t.deliveredTo, t.receivedAt.desc()),
    index("messages_search_idx").using("gin", t.search),
  ],
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  contentId: text("content_id"),
  content: bytea("content"),
});

export const addresses = pgTable("addresses", {
  address: text("address").primaryKey(),
  label: text("label"),
  hidden: boolean("hidden").notNull().default(false),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),
  totpConfirmedAt: timestamp("totp_confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recoveryCodes = pgTable("recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    ip: text("ip").notNull(),
    succeeded: boolean("succeeded").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_identifier_idx").on(t.identifier, t.attemptedAt.desc()),
    index("login_attempts_ip_idx").on(t.ip, t.attemptedAt.desc()),
  ],
);
