import { db } from "../db/client";
import { securityEvents } from "../db/schema";

export type SecurityEvent =
  | "login.success"
  | "login.failure"
  | "login.blocked"
  | "totp.enrolled"
  | "totp.verified"
  | "recovery.used"
  | "invite.created"
  | "invite.accepted"
  | "account.created"
  | "session.revoked"
  | "message.sent";

// Kept separate from login_attempts, which drives rate limiting and is pruned
// by time. These rows are kept for the operator to read after an incident.
export async function record(
  kind: SecurityEvent,
  options: { actor?: string; ip?: string; detail?: Record<string, unknown> } = {},
) {
  try {
    await db.insert(securityEvents).values({
      kind,
      actor: options.actor ?? null,
      ip: options.ip ?? null,
      detail: options.detail ?? null,
    });
  } catch {
    // An audit write must never block the action it describes.
  }
}
