import { timingSafeEqual } from "node:crypto";
import { ingestParsed } from "@/lib/mail/ingest";
import { MAX_INBOUND_BYTES } from "@/lib/mail/limits";
import { parseMime } from "@/lib/mail/mime";
import { readUpTo } from "@/lib/mail/stream";

export const runtime = "nodejs";

function authorized(request: Request) {
  // With no secret configured the route refuses everything.
  const secret = process.env.INBOUND_SECRET;
  if (!secret) return false;

  const presented = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(secret);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

// The Cloudflare Email Worker posts each message here whole, and everything
// happens inside the request. A non-2xx makes the worker try again, then
// bounce the sender.
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("unauthorized", { status: 401 });

  const to = request.headers.get("x-envelope-to");
  if (!to) return new Response("missing envelope", { status: 400 });

  const raw = await readUpTo(request.body, MAX_INBOUND_BYTES);
  if (!raw) return new Response("too large", { status: 413 });

  await ingestParsed(await parseMime(raw, { to }));

  return new Response("ok", { status: 200 });
}
