import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { memberAddresses } from "../db/schema";

// What a list shows. "unassigned" is every address no member holds, kept as a
// predicate rather than a list so catch-all mail to a brand-new address still
// lands in the owner's view.
export type Reach = { kind: "unassigned" } | { kind: "addresses"; list: string[] };

// What a viewer may open: everything for an owner, their addresses for a member.
export type Allowed = Reach | "all";

export function inReach(column: AnyPgColumn, reach: Allowed): SQL {
  if (reach === "all") return sql`true`;
  if (reach.kind === "unassigned") {
    return sql`not exists (select 1 from ${memberAddresses} where ${memberAddresses.address} = ${column})`;
  }
  return reach.list.length > 0 ? inArray(column, reach.list) : sql`false`;
}

export async function reachesAddress(reach: Allowed, address: string) {
  if (reach === "all") return true;
  if (reach.kind === "addresses") return reach.list.includes(address);

  const [held] = await db
    .select({ address: memberAddresses.address })
    .from(memberAddresses)
    .where(eq(memberAddresses.address, address))
    .limit(1);
  return !held;
}
