import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, messages, threads } from "../../src/lib/db/schema";
import {
  archiveStaleThreads,
  listHidden,
  loadAddress,
  reorderAddresses,
  sendingIdentity,
  updateAddress,
} from "../../src/lib/mail/addresses";
import { listInboxes } from "../../src/lib/mail/queries";
import { newThread } from "../helpers";

async function seedThread(opts: { subject: string; at: string; deliveredTo: string }) {
  const thread = await newThread(opts.deliveredTo, {
    subject: opts.subject,
    lastMessageAt: new Date(opts.at),
  });

  await db.insert(messages).values({
    threadId: thread.id,
    direction: "inbound",
    status: "complete",
    subject: opts.subject,
    deliveredTo: opts.deliveredTo,
    fromAddress: "someone@vendor.test",
    textBody: "body",
    receivedAt: new Date(opts.at),
  });

  return thread.id;
}

beforeEach(async () => {
  await db.execute(sql`truncate table messages, threads, drafts, addresses restart identity cascade`);
});

describe("loadAddress", () => {
  it("counts what has arrived and what is still unread", async () => {
    await seedThread({ subject: "one", at: "2026-09-01", deliveredTo: "hi@x.test" });
    await seedThread({ subject: "two", at: "2026-09-03", deliveredTo: "hi@x.test" });

    const detail = await loadAddress("hi@x.test");

    expect(detail?.received).toBe(2);
    expect(detail?.unread).toBe(2);
    expect(detail?.firstSeen).toEqual(new Date("2026-09-01"));
    expect(detail?.lastActivity).toEqual(new Date("2026-09-03"));
  });

  it("returns null for an address that was never seen", async () => {
    expect(await loadAddress("nobody@x.test")).toBeNull();
  });
});

describe("updateAddress", () => {
  it("stores settings for an address with no mail yet", async () => {
    await updateAddress("new@x.test", { label: "New", hue: 42, autoArchive: true });

    const detail = await loadAddress("new@x.test");
    expect(detail?.label).toBe("New");
    expect(detail?.hue).toBe(42);
    expect(detail?.autoArchive).toBe(true);
  });

  it("leaves untouched fields alone", async () => {
    await updateAddress("hi@x.test", { label: "Personal", hue: 88 });
    await updateAddress("hi@x.test", { autoArchive: true });

    const detail = await loadAddress("hi@x.test");
    expect(detail?.label).toBe("Personal");
    expect(detail?.hue).toBe(88);
    expect(detail?.autoArchive).toBe(true);
  });
});

describe("sendingIdentity", () => {
  it("uses the bare address when no display name is set", async () => {
    await updateAddress("hi@x.test", {});
    expect(await sendingIdentity("hi@x.test")).toEqual({ from: "hi@x.test", replyTo: undefined });
  });

  it("wraps the address in a display name and carries reply-to", async () => {
    await updateAddress("hi@x.test", { displayName: "Sam Doe", replyTo: "other@x.test" });

    expect(await sendingIdentity("hi@x.test")).toEqual({
      from: "Sam Doe <hi@x.test>",
      replyTo: "other@x.test",
    });
  });
});

describe("archiveStaleThreads", () => {
  it("archives quiet threads only for addresses that opted in", async () => {
    const old = await seedThread({ subject: "quiet", at: "2026-01-01", deliveredTo: "hi@x.test" });
    await seedThread({ subject: "elsewhere", at: "2026-01-01", deliveredTo: "other@x.test" });
    await updateAddress("hi@x.test", { autoArchive: true });

    expect(await archiveStaleThreads()).toBe(1);

    const [archived] = await db.select().from(threads).where(eq(threads.id, old));
    expect(archived.archived).toBe(true);

    const rest = await db.select().from(threads).where(eq(threads.archived, false));
    expect(rest.map((row) => row.subject)).toEqual(["elsewhere"]);
  });

  it("leaves recent threads in the inbox", async () => {
    await db.insert(addresses).values({ address: "hi@x.test", autoArchive: true });

    const thread = await newThread("hi@x.test", { subject: "fresh", lastMessageAt: new Date() });

    await db.insert(messages).values({
      threadId: thread.id,
      direction: "inbound",
      status: "complete",
      deliveredTo: "hi@x.test",
      textBody: "body",
    });

    expect(await archiveStaleThreads()).toBe(0);
  });

  it("does nothing when no address opted in", async () => {
    await seedThread({ subject: "quiet", at: "2026-01-01", deliveredTo: "hi@x.test" });
    expect(await archiveStaleThreads()).toBe(0);
  });
});

describe("sidebar order", () => {
  async function pinned(...list: string[]) {
    for (const address of list) await db.insert(addresses).values({ address, pinned: true });
  }

  it("lists placed addresses in their order, then the rest by name", async () => {
    await pinned("a@x.test", "b@x.test", "c@x.test", "d@x.test");
    await reorderAddresses(["c@x.test", "a@x.test"]);

    const { named } = await listInboxes();
    expect(named.map((inbox) => inbox.address)).toEqual([
      "c@x.test",
      "a@x.test",
      "b@x.test",
      "d@x.test",
    ]);
  });

  it("forgets the place of an address moved back to catch-all", async () => {
    await pinned("a@x.test", "b@x.test");
    await reorderAddresses(["b@x.test", "a@x.test"]);

    await updateAddress("b@x.test", { pinned: false });
    await updateAddress("b@x.test", { pinned: true });

    const { named } = await listInboxes();
    expect(named.map((inbox) => inbox.address)).toEqual(["a@x.test", "b@x.test"]);
  });

  it("takes a hidden address out of the sidebar and lists it for settings", async () => {
    await pinned("a@x.test", "b@x.test");
    await updateAddress("a@x.test", { hidden: true });

    const { named } = await listInboxes();
    expect(named.map((inbox) => inbox.address)).toEqual(["b@x.test"]);
    expect(await listHidden()).toEqual(["a@x.test"]);
    expect((await loadAddress("a@x.test"))?.hidden).toBe(true);
  });
});
