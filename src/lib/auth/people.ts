import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, memberAddresses, users } from "../db/schema";
import { memberAddressList } from "../mail/limits";
import { Refusal } from "./refusal";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Granted addresses are pinned and shown, so they appear as switcher entries
// rather than buried under catch-all.
export async function grantAddresses(tx: Tx, userId: string, list: string[]) {
  await tx
    .insert(addresses)
    .values(list.map((address) => ({ address, pinned: true })))
    .onConflictDoUpdate({ target: addresses.address, set: { pinned: true, hidden: false } });
  await tx.insert(memberAddresses).values(list.map((address) => ({ userId, address })));
}

export interface Person {
  id: string;
  email: string;
  role: "owner" | "member";
  addresses: string[];
}

export async function listPeople(): Promise<Person[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, address: memberAddresses.address })
    .from(users)
    .leftJoin(memberAddresses, eq(memberAddresses.userId, users.id))
    .orderBy(asc(users.createdAt), asc(memberAddresses.address));

  const people = new Map<string, Person>();
  for (const row of rows) {
    const person = people.get(row.id) ?? { id: row.id, email: row.email, role: row.role, addresses: [] };
    if (row.address) person.addresses.push(row.address);
    people.set(row.id, person);
  }
  return [...people.values()];
}

export async function setMemberAddresses(userId: string, raw: string[]) {
  const list = memberAddressList.parse(raw);

  await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.role, "member")));
    if (!member) throw new Refusal("Only a member's addresses can be changed.");

    await tx.delete(memberAddresses).where(eq(memberAddresses.userId, userId));
    await grantAddresses(tx, userId, list);
  });
}

// Deleting the login ends its session at once: the version check finds no
// user. Drafts go with it, and an address nobody else holds is the owner's again.
export async function removeMember(userId: string) {
  const removed = await db
    .delete(users)
    .where(and(eq(users.id, userId), eq(users.role, "member")))
    .returning({ id: users.id });
  return removed.length > 0;
}
