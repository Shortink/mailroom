import { db } from "../src/lib/db/client";
import { addresses, messages, threads, users } from "../src/lib/db/schema";

// A thread's address must exist first, the same order every real path follows.
export async function newThread(
  address: string,
  values: Omit<typeof threads.$inferInsert, "address"> = {},
) {
  await db.insert(addresses).values({ address }).onConflictDoNothing();
  const [thread] = await db
    .insert(threads)
    .values({ address, ...values })
    .returning();
  return thread;
}

export async function newUser(email = "owner@example.test", role: "owner" | "member" = "owner") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash", role })
    .returning();
  return user;
}

// One inbound message in a thread of its own, readable and unread unless told otherwise.
export async function seedMessage(opts: {
  address: string;
  subject: string;
  at?: string;
  read?: boolean;
  status?: "complete" | "failed";
  html?: string;
  from?: string;
}) {
  const at = new Date(opts.at ?? "2026-09-01");
  const thread = await newThread(opts.address, {
    subject: opts.subject,
    lastMessageAt: at,
    participants: [opts.from ?? "sender@vendor.test", opts.address],
    messageCount: 1,
  });
  const [message] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      status: opts.status ?? "complete",
      subject: opts.subject,
      textBody: `invoice for ${opts.subject}`,
      htmlBody: opts.html ?? null,
      deliveredTo: opts.address,
      fromAddress: opts.from ?? "sender@vendor.test",
      receivedAt: at,
      readAt: opts.read ? at : null,
    })
    .returning();
  return { threadId: thread.id, messageId: message.id };
}
