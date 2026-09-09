import { timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";
import { reconcile } from "@/lib/mail/reconcile";

export const runtime = "nodejs";

function authorized(request: Request) {
  const presented = Buffer.from(
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
  );
  const expected = Buffer.from(requireEnv("RECONCILE_TOKEN"));
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

// Kept for hosts that cannot run a timer of their own. Long-lived deployments
// sweep on their own from instrumentation.
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("unauthorized", { status: 401 });

  return Response.json(await reconcile());
}
