import { timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { requireEnv } from "@/lib/env";
import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { completeIngest } from "@/lib/mail/ingest";

export const runtime = "nodejs";

const STALE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function authorized(request: Request) {
  const presented = Buffer.from(
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
  );
  const expected = Buffer.from(requireEnv("RECONCILE_TOKEN"));
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response("unauthorized", { status: 401 });

  const stale = await db
    .select({ id: messages.id })
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
      await completeIngest(row.id);
      retried += 1;
    } catch {
      // completeIngest records the attempt and eventually marks the row failed;
      // one bad message must not stop the sweep.
    }
  }

  return Response.json({ found: stale.length, retried });
}
