import { sql } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { addresses, messages, threads, users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";

// Credentials for the throwaway account the browser tests sign in as. They
// exist only in the e2e database, which is rebuilt before every test.
export const OPERATOR = {
  email: "operator@example.com",
  password: "e2e-operator-password",
};

// Two unread at the top, so unread behaviour has something to act on.
const SAMPLE = [
  ["Stripe", "notifications@stripe.example", "billing@example.com", "Your payout of $2,480.00 is on the way", "Arriving Thursday to the account ending 4471.", 0.2, true],
  ["Namecheap", "support@namecheap.example", "domains@example.com", "example.com renews in 14 days", "Auto-renew is on, so there is nothing to do.", 0.4, true],
  ["Dana Whitfield", "dana@northbound.example", "hi@example.com", "Re: Booking flow feedback", "Had a proper look this morning.", 1.2, false],
  ["AWS Billing", "billing@aws.example", "billing@example.com", "Invoice 4471-B available", "$63.18 for July. No action required.", 1.6, false],
  ["Marcus Bell", "marcus@bellstudio.example", "hi@example.com", "Quote for the September shoot", "Two days, one assistant, includes the edit.", 2.4, false],
  ["Anna Kovacs", "anna@kovacs.example", "billing@example.com", "Re: Re: Invoice 219", "Paid this morning, sorry for the delay.", 12.0, false],
] as const;

export const UNREAD_COUNT = SAMPLE.filter((row) => row[6]).length;

export async function resetDatabase() {
  await db.execute(sql`
    truncate table
      messages, threads, attachments, addresses, drafts,
      users, recovery_codes, invites, login_attempts
    restart identity cascade
  `);

  await db.insert(users).values({
    email: OPERATOR.email,
    passwordHash: await hashPassword(OPERATOR.password),
  });

  for (const [fromName, from, to, subject, body, daysAgo, unread] of SAMPLE) {
    const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const [thread] = await db
      .insert(threads)
      .values({ subject, lastMessageAt: at, participants: [from, to], messageCount: 1 })
      .returning();

    await db.insert(messages).values({
      threadId: thread.id,
      direction: "inbound",
      status: "complete",
      subject,
      textBody: body,
      fromAddress: from,
      fromName,
      deliveredTo: to,
      receivedAt: at,
      readAt: unread ? null : at,
    });

    await db.insert(addresses).values({ address: to }).onConflictDoNothing();
  }

  await db.execute(
    sql`update addresses set pinned = true where address in ('hi@example.com', 'billing@example.com', 'domains@example.com')`,
  );
}

// The sample above is all plain text and never reaches the sandboxed frame,
// so a test about the frame seeds its own message.
export async function seedHtmlMessage(html: string) {
  const at = new Date();
  const [thread] = await db
    .insert(threads)
    .values({
      subject: "Rendered as html",
      lastMessageAt: at,
      participants: ["sender@html.example", "hi@example.com"],
      messageCount: 1,
    })
    .returning();

  await db.insert(messages).values({
    threadId: thread.id,
    direction: "inbound",
    status: "complete",
    subject: "Rendered as html",
    textBody: "A plain part too short to stand in for the html.",
    htmlBody: html,
    fromAddress: "sender@html.example",
    fromName: "HTML Sender",
    deliveredTo: "hi@example.com",
    receivedAt: at,
    readAt: at,
  });

  return thread.id;
}
