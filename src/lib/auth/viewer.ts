import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { memberAddresses, users } from "../db/schema";
import { normalizeAddress } from "../mail/identity";
import type { Allowed, Reach } from "../mail/reach";

export const VIEW_COOKIE = "view";

export type Role = (typeof users.$inferSelect)["role"];

export interface Viewer {
  userId: string;
  role: Role;
  allowed: Allowed;
  view: Reach;
  // The one address being looked at, or null for "All".
  choice: string | null;
}

// The cookie is the browser's to change, so whatever it names is checked
// against what this viewer may open. Anything else means "All".
export function resolveView(role: Role, own: string[], cookie: string | undefined) {
  const named = cookie && normalizeAddress(cookie);
  if (named && named !== "all" && (role === "owner" || own.includes(named))) {
    const view: Reach = { kind: "addresses", list: [named] };
    return { view, choice: named };
  }

  const view: Reach = role === "owner" ? { kind: "unassigned" } : { kind: "addresses", list: own };
  return { view, choice: null };
}

export async function loadViewer(userId: string, cookie: string | undefined): Promise<Viewer | null> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!user) return null;

  if (user.role === "owner") {
    return { userId, role: "owner", allowed: "all", ...resolveView("owner", [], cookie) };
  }

  const rows = await db
    .select({ address: memberAddresses.address })
    .from(memberAddresses)
    .where(eq(memberAddresses.userId, userId));
  const own = rows.map((row) => row.address);

  return {
    userId,
    role: "member",
    allowed: { kind: "addresses", list: own },
    ...resolveView("member", own, cookie),
  };
}
