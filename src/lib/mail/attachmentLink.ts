import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "../env";

const TTL_MS = 24 * 60 * 60 * 1000;

function mac(key: string, exp: number) {
  return createHmac("sha256", requireEnv("SESSION_SECRET"))
    .update(`mailroom-attachment:${key}:${exp}`)
    .digest("hex")
    .slice(0, 32);
}

// The message body renders in a sandboxed frame with no origin of its own, so
// its image requests carry no cookie. A signed link lets the frame fetch what
// the page that produced it was allowed to see, for a day.
export function signAttachmentUrl(base: string, key: string) {
  const exp = Date.now() + TTL_MS;
  return `${base}?exp=${exp}&sig=${mac(key, exp)}`;
}

export function attachmentUrlIsValid(key: string, exp: string | null, sig: string | null) {
  const at = Number(exp);
  if (!sig || !Number.isFinite(at) || at < Date.now()) return false;

  const presented = Buffer.from(sig);
  const expected = Buffer.from(mac(key, at));
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
