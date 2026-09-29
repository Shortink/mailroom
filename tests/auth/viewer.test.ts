import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, memberAddresses, threads } from "../../src/lib/db/schema";
import { loadViewer, resolveView } from "../../src/lib/auth/viewer";
import { inReach, reachesAddress } from "../../src/lib/mail/reach";
import { newThread, newUser } from "../helpers";

beforeEach(async () => {
  await db.execute(sql`truncate table users, addresses, threads, messages restart identity cascade`);
});

describe("resolveView", () => {
  it("lets an owner look at any one address", () => {
    expect(resolveView("owner", [], "Alex@X.test")).toEqual({
      view: { kind: "addresses", list: ["alex@x.test"] },
      choice: "alex@x.test",
    });
  });

  it("gives an owner's All as every unassigned address", () => {
    expect(resolveView("owner", [], undefined).view).toEqual({ kind: "unassigned" });
    expect(resolveView("owner", [], "all").choice).toBeNull();
  });

  it("ignores a member's forged cookie for an address they do not hold", () => {
    expect(resolveView("member", ["alex@x.test"], "you@x.test")).toEqual({
      view: { kind: "addresses", list: ["alex@x.test"] },
      choice: null,
    });
  });
});

describe("loadViewer", () => {
  it("gives an owner everything", async () => {
    const owner = await newUser("o@x.test", "owner");
    const viewer = await loadViewer(owner.id, undefined);
    expect(viewer).toMatchObject({ role: "owner", allowed: "all", view: { kind: "unassigned" } });
  });

  it("gives a member exactly their rows", async () => {
    const member = await newUser("m@x.test", "member");
    await db.insert(addresses).values([{ address: "alex@x.test" }, { address: "team@x.test" }]);
    await db.insert(memberAddresses).values([
      { userId: member.id, address: "alex@x.test" },
      { userId: member.id, address: "team@x.test" },
    ]);

    const viewer = await loadViewer(member.id, "team@x.test");
    expect(viewer?.allowed).toEqual({ kind: "addresses", list: expect.arrayContaining(["alex@x.test", "team@x.test"]) });
    expect(viewer?.view).toEqual({ kind: "addresses", list: ["team@x.test"] });
  });

  it("returns null for a user that no longer exists", async () => {
    expect(await loadViewer("00000000-0000-0000-0000-000000000000", undefined)).toBeNull();
  });
});

describe("inReach", () => {
  it("treats unassigned as every address no member holds, including new ones", async () => {
    const member = await newUser("m@x.test", "member");
    await newThread("alex@x.test", { subject: "theirs" });
    await db.insert(memberAddresses).values({ userId: member.id, address: "alex@x.test" });
    await newThread("brand-new@x.test", { subject: "mine" });

    const rows = await db
      .select({ subject: threads.subject })
      .from(threads)
      .where(inReach(threads.address, { kind: "unassigned" }));
    expect(rows.map((row) => row.subject)).toEqual(["mine"]);

    expect(await reachesAddress({ kind: "unassigned" }, "alex@x.test")).toBe(false);
    expect(await reachesAddress({ kind: "unassigned" }, "brand-new@x.test")).toBe(true);
  });

  it("matches nothing for an empty list", async () => {
    await newThread("alex@x.test");
    const rows = await db.select().from(threads).where(inReach(threads.address, { kind: "addresses", list: [] }));
    expect(rows).toHaveLength(0);
  });
});
