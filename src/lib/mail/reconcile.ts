import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { messages } from "../db/schema";
import { archiveStaleThreads } from "./addresses";
import { completeIngest } from "./ingest";
import { captureMessageId } from "./send";

const STALE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export interface ReconcileResult {
  found: number;
  retried: number;
  archived: number;
}

// Ingest finishes out of band, so anything left pending is work that never
// came back. Callable from the timer or the task endpoint; both are safe to
// run concurrently because completeIngest ignores rows already complete.
export async function reconcile(): Promise<ReconcileResult> {
  const stale = await db
    .select({ id: messages.id, direction: messages.direction })
    .from(messages)
    .where(
      and(
        eq(messages.status, "pending"),
        lt(messages.attempts, MAX_ATTEMPTS),
        lt(messages.lastAttemptAt, new Date(Date.now() - STALE_MS)),
      ),
    );

  let retried = 0;
  for (const row of stale) {
    try {
      await (row.direction === "outbound" ? captureMessageId(row.id) : completeIngest(row.id));
      retried += 1;
    } catch {
      // The handlers record their own attempts and eventually mark the row
      // failed; one bad message must not stop the sweep.
    }
  }

  return { found: stale.length, retried, archived: await archiveStaleThreads() };
}

// A message that exhausted its attempts is not retried again on its own, so
// this is what the failure notice in the rail acts on.
export async function retryFailed() {
  const revived = await db
    .update(messages)
    .set({ status: "pending", attempts: 0, lastAttemptAt: null })
    .where(and(eq(messages.status, "failed"), eq(messages.direction, "inbound")))
    .returning({ id: messages.id });

  let recovered = 0;
  for (const row of revived) {
    try {
      await completeIngest(row.id);
      recovered += 1;
    } catch {
      // Still unreachable. It goes back to failed on its own once the
      // attempts run out again.
    }
  }

  return { attempted: revived.length, recovered };
}
