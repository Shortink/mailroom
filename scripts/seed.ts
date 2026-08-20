import { sql } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { addresses, messages, threads } from "../src/lib/db/schema";

const sample = [
  ["Stripe", "notifications@stripe.example", "billing@example.com", "Your payout of $2,480.00 is on the way", "Arriving Thursday to the account ending 4471.", 0.2, true],
  ["Namecheap", "support@namecheap.example", "domains@example.com", "example.com renews in 14 days", "Auto-renew is on, so there is nothing to do.", 0.4, true],
  ["Dana Whitfield", "dana@northbound.example", "hi@example.com", "Re: Booking flow feedback", "Had a proper look this morning. The second screen still felt slow on mobile, about two seconds before anything renders.", 1.2, false],
  ["AWS Billing", "billing@aws.example", "billing@example.com", "Invoice 4471-B available", "$63.18 for July. No action required.", 1.6, false],
  ["Marcus Bell", "marcus@bellstudio.example", "hi@example.com", "Quote for the September shoot", "Two days, one assistant, includes the edit.", 2.4, false],
  ["Resend", "team@resend.example", "hi@example.com", "Inbound is live on your domain", "MX verified and receiving is enabled.", 2.9, false],
  ["Priya Raman", "priya@ramanlegal.example", "support@example.com", "Contract countersigned", "Attaching the executed copy for your records.", 4.1, false],
  ["Neon", "alerts@neon.example", "ops@example.com", "Your database was idle for 7 days", "It will scale to zero automatically.", 5.0, false],
  ["Tom Okafor", "tom@okafor.example", "hi@example.com", "Following up on last week", "Did the revised timeline work on your end?", 8.0, false],
  ["Cloudflare", "noreply@cloudflare.example", "domains@example.com", "Email routing disabled", "MX records now point elsewhere.", 9.0, false],
  ["Anna Kovacs", "anna@kovacs.example", "billing@example.com", "Re: Re: Invoice 219", "Paid this morning, sorry for the delay.", 12.0, false],
  ["GitHub", "noreply@github.example", "ops@example.com", "Security advisory for a dependency", "One moderate severity finding in your lockfile.", 14.0, false],
] as const;

await db.execute(sql`truncate table messages, threads, addresses restart identity cascade`);

for (const [fromName, from, to, subject, body, daysAgo, unread] of sample) {
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

// Pin the addresses a real user would have opened by now.
await db.execute(sql`update addresses set pinned = true where address in ('hi@example.com', 'billing@example.com', 'support@example.com')`);

console.log(`seeded ${sample.length} threads`);
process.exit(0);
