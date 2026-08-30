import { createHmac } from "node:crypto";
import { requireEnv } from "../env";

// A fixed sentinel could be set by any sender to make their mail vanish before
// it is ever stored, so the marker is derived per deployment and unguessable.
export function forwardMarker() {
  return createHmac("sha256", requireEnv("SESSION_SECRET"))
    .update("mailroom-forward-marker")
    .digest("hex")
    .slice(0, 32);
}
