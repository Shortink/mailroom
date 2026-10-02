import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, attachments, drafts, imageSenders, memberAddresses, messages, threads } from "../../src/lib/db/schema";
import { SESSION_COOKIE, signSession } from "../../src/lib/auth/session";
import { VIEW_COOKIE, loadViewer, type Viewer } from "../../src/lib/auth/viewer";
import { newUser, seedMessage } from "../helpers";

// A request's cookies, so the real session and viewer code runs.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
const get = vi.fn(async () => Buffer.from("%PDF-"));
vi.mock("../../src/lib/storage", () => ({
  getStorage: () => ({ put: vi.fn(), get, delete: vi.fn(), url: (k: string) => `/api/attachments/${k}` }),
}));

const sendEmail = vi.fn(async (_input: unknown) => ({ id: "re_1" }));
vi.mock("../../src/lib/mail/resend", () => ({
  sendEmail: (input: unknown) => sendEmail(input),
  getEmail: vi.fn(),
  getReceivedEmail: vi.fn(),
  getAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
}));

const { listThreads, listInboxes, listSwitcher, loadThread, loadMessageHtml, loadSender, countFailed, searchThreads } =
  await import("../../src/lib/mail/queries");
const { listDrafts, loadDraft } = await import("../../src/lib/mail/drafts");
const { loadAddress } = await import("../../src/lib/mail/addresses");
const { requireAddress, requireOwner } = await import("../../src/lib/auth/require");
const { GET: getAttachment } = await import("../../src/app/api/attachments/[key]/route");
const actions = await import("../../src/app/(mail)/actions");
const settings = await import("../../src/app/(mail)/settings/actions");
const { imageRules } = await import("../../src/lib/mail/images");

const YOU = "you@example.test";
const ALEX = "alex@example.test";

let ownerId: string;
let memberId: string;
let you: { threadId: string; messageId: string };
let alex: { threadId: string; messageId: string };

async function signInAs(userId: string, view?: string) {
  jar.clear();
  jar.set(SESSION_COOKIE, await signSession(userId, "full", 0));
  if (view) jar.set(VIEW_COOKIE, view);
}

async function viewerFor(userId: string, view?: string) {
  return (await loadViewer(userId, view)) as Viewer;
}

beforeEach(async () => {
  await db.execute(sql`
    truncate table messages, threads, attachments, addresses, drafts, users, member_addresses, image_senders
    restart identity cascade
  `);
  ownerId = (await newUser("owner@example.test", "owner")).id;
  memberId = (await newUser("friend@example.test", "member")).id;

  you = await seedMessage({ address: YOU, subject: "for you", html: "<p>you</p>" });
  alex = await seedMessage({ address: ALEX, subject: "for alex", html: "<p>alex</p>" });
  await db.insert(memberAddresses).values({ userId: memberId, address: ALEX });

  await db.insert(attachments).values([
    { messageId: you.messageId, filename: "a.pdf", contentType: "application/pdf", sizeBytes: 5, storageKey: "you/a" },
    { messageId: alex.messageId, filename: "b.pdf", contentType: "application/pdf", sizeBytes: 5, storageKey: "alex/b" },
  ]);
  await db.insert(drafts).values({ fromAddress: YOU, subject: "owner draft", createdBy: ownerId });
});

describe("a member's lists", () => {
  it.each(["inbox", "sent", "archive", "trash"] as const)("never show the owner's thread in %s", async (box) => {
    if (box === "sent") {
      await db.execute(sql`update messages set direction = 'outbound', from_address = ${YOU} where id = ${you.messageId}`);
      await db.execute(sql`update messages set direction = 'outbound', from_address = ${ALEX} where id = ${alex.messageId}`);
    }
    if (box === "archive") await db.execute(sql`update threads set archived = true`);
    if (box === "trash") await db.execute(sql`update threads set trashed_at = now()`);

    const member = await viewerFor(memberId);
    const owner = await viewerFor(ownerId);

    expect((await listThreads(member.view, { box })).threads.map((t) => t.subject)).toEqual(["for alex"]);
    expect((await listThreads(owner.view, { box })).threads.map((t) => t.subject)).toEqual(["for you"]);
  });

  it("never find the owner's thread in search", async () => {
    // Both bodies say "invoice", so only the scope can tell them apart.
    const none = { unread: false, recent: false, attachments: false };
    const member = await searchThreads((await viewerFor(memberId)).view, "invoice", none);
    const owner = await searchThreads((await viewerFor(ownerId)).view, "invoice", none);
    expect(member.map((row) => row.subject)).toEqual(["for alex"]);
    expect(owner.map((row) => row.subject)).toEqual(["for you"]);
  });

  it("never list or open the owner's draft", async () => {
    const member = await viewerFor(memberId);
    expect(await listDrafts(member)).toHaveLength(0);
    const [draft] = await db.select().from(drafts);
    expect(await loadDraft(member, draft.id)).toBeNull();
  });

  it("keep the rail to the member's own addresses and counts", async () => {
    await db.execute(sql`update addresses set pinned = false, hidden = true where address = ${ALEX}`);
    const rail = await listInboxes(await viewerFor(memberId));

    expect(rail.named.map((inbox) => inbox.address)).toEqual([ALEX]);
    expect(rail.catchAll).toEqual([]);
    expect(rail.unread).toBe(1);
    expect(rail.drafts).toBe(0);
  });

  it("only count failed mail the member can see", async () => {
    await seedMessage({ address: YOU, subject: "broken", status: "failed" });
    expect(await countFailed((await viewerFor(memberId)).view)).toBe(0);
    expect(await countFailed((await viewerFor(ownerId)).view)).toBe(1);
  });
});

describe("a member's point lookups", () => {
  it("find nothing on the owner's address", async () => {
    const { allowed } = await viewerFor(memberId);
    expect(await loadThread(allowed, you.threadId)).toBeNull();
    expect(await loadMessageHtml(allowed, you.messageId)).toBeNull();
    expect(await loadSender(allowed, you.messageId)).toBeNull();
    expect(await loadAddress(allowed, YOU)).toBeNull();
    expect(await loadThread(allowed, alex.threadId)).not.toBeNull();
  });

  it("are refused attachments from the owner's address", async () => {
    await signInAs(memberId);
    const fetchKey = (key: string) =>
      getAttachment(new Request(`https://x.test/api/attachments/${key}`), {
        params: Promise.resolve({ key: encodeURIComponent(key) }),
      });

    expect((await fetchKey("you/a")).status).toBe(404);
    expect((await fetchKey("alex/b")).status).toBe(200);
  });

  it("are refused an address from the URL, whatever its case", async () => {
    await signInAs(memberId);
    await expect(requireAddress("you%40example.test", "allowed")).rejects.toThrow("NOT_FOUND");
    await expect(requireAddress("You%40Example.test", "allowed")).rejects.toThrow("NOT_FOUND");
    await expect(requireAddress("Alex%40example.test", "view")).resolves.toMatchObject({ address: ALEX });
  });

  it("are refused owner-only ground", async () => {
    await signInAs(memberId);
    await expect(requireOwner()).rejects.toThrow("NOT_FOUND");
  });
});

describe("the owner", () => {
  it("can open a member's thread", async () => {
    expect(await loadThread("all", alex.threadId)).not.toBeNull();
  });

  it("filters /a/ within the current view", async () => {
    await signInAs(ownerId, ALEX);
    await expect(requireAddress("you%40example.test", "view")).rejects.toThrow("NOT_FOUND");

    await signInAs(ownerId);
    await expect(requireAddress("alex%40example.test", "view")).rejects.toThrow("NOT_FOUND");
    await expect(requireAddress("alex%40example.test", "allowed")).resolves.toMatchObject({ address: ALEX });
  });

  it("sees a catch-all address that arrives later in All mine", async () => {
    await seedMessage({ address: "new@example.test", subject: "surprise" });
    const owner = await viewerFor(ownerId);
    const subjects = (await listThreads(owner.view, {})).threads.map((t) => t.subject);
    expect(subjects).toContain("surprise");
    expect(subjects).not.toContain("for alex");
  });
});

describe("a member's writes on the owner's thread", () => {
  beforeEach(async () => {
    sendEmail.mockClear();
    await signInAs(memberId);
  });

  async function youThread() {
    const [row] = await db.select().from(threads).where(eq(threads.id, you.threadId));
    return row;
  }

  it("cannot mark it read", async () => {
    await actions.markRead(you.threadId);
    const [message] = await db.select().from(messages).where(eq(messages.id, you.messageId));
    expect(message.readAt).toBeNull();
  });

  it("cannot archive, trash, restore or delete it", async () => {
    await actions.archiveThread(you.threadId, true);
    await actions.trashThread(you.threadId);
    expect(await youThread()).toMatchObject({ archived: false, trashedAt: null });

    await db.update(threads).set({ trashedAt: new Date() }).where(eq(threads.id, you.threadId));
    await expect(actions.restoreThread(you.threadId)).rejects.toThrow("REDIRECT");
    await expect(actions.deleteThread(you.threadId)).rejects.toThrow("REDIRECT");
    expect((await youThread()).trashedAt).not.toBeNull();
  });

  it("cannot touch the owner's draft", async () => {
    const [draft] = await db.select().from(drafts);
    await actions.storeDraft({ id: draft.id, from: ALEX, to: "x@y.test", subject: "hijack", body: "" });
    await actions.discardDraft(draft.id);
    const [after] = await db.select().from(drafts).where(eq(drafts.id, draft.id));
    expect(after.subject).toBe("owner draft");
  });

  it("cannot draft a reply on it, or from the wrong address on their own", async () => {
    expect(await actions.storeDraft({ threadId: you.threadId, from: YOU, to: "", subject: "", body: "x" })).toBeNull();
    expect(await actions.storeDraft({ threadId: alex.threadId, from: YOU, to: "", subject: "", body: "x" })).toBeNull();
    expect(await actions.storeDraft({ threadId: alex.threadId, from: ALEX, to: "", subject: "", body: "x" })).not.toBeNull();
  });

  it("cannot send from the owner's address or reply on the owner's thread", async () => {
    const fromYou = await actions.sendMessage({ from: YOU, to: "x@y.test", subject: "s", text: "t" });
    const reply = await actions.sendMessage({ threadId: you.threadId, from: YOU, to: "x@y.test", subject: "s", text: "t" });
    const wrongFrom = await actions.sendMessage({ threadId: alex.threadId, from: YOU, to: "x@y.test", subject: "s", text: "t" });

    expect([fromYou.ok, reply.ok, wrongFrom.ok]).toEqual([false, false, false]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("can reply on their own thread", async () => {
    const sent = await actions.sendMessage({ threadId: alex.threadId, from: ALEX, to: "x@y.test", subject: "s", text: "t" });
    expect(sent.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("can send from their own address", async () => {
    const sent = await actions.sendMessage({ from: ALEX, to: "x@y.test", subject: "s", text: "t" });
    expect(sent.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("cannot change the owner's address, whatever its case", async () => {
    await expect(settings.saveAddress(YOU, { displayName: "x" })).rejects.toThrow("NOT_FOUND");
    await expect(settings.saveAddress("You@Example.test", { displayName: "x" })).rejects.toThrow("NOT_FOUND");
  });

  it("keeps only the member's own fields on their address", async () => {
    await settings.saveAddress(ALEX, { pinned: true, hidden: true, label: "Mine", displayName: "Alex", hue: 42 });
    const [row] = await db.select().from(addresses).where(eq(addresses.address, ALEX));
    expect(row).toMatchObject({ pinned: false, hidden: false, label: null, displayName: "Alex", hue: 42 });
  });

  it.each([
    ["saveOrder", () => settings.saveOrder([ALEX])],
    ["addAccount", () => settings.addAccount("new@example.test")],
    ["issueInvite", () => settings.issueInvite()],
    ["alwaysShowImages", () => actions.alwaysShowImages(alex.messageId)],
    ["stopShowingImages", () => actions.stopShowingImages("sender@vendor.test")],
    ["retryFailedMail", () => actions.retryFailedMail()],
  ])("is refused %s", async (_name, call) => {
    await expect(call()).rejects.toThrow("NOT_FOUND");
  });
});

describe("images", () => {
  it("ignore the owner's sender allowlist in a member's thread", async () => {
    await db.insert(imageSenders).values({ address: "sender@vendor.test" });
    const message = { direction: "inbound", fromAddress: "sender@vendor.test", verdict: "pass" as const };
    expect(await imageRules([message], false, false)).toEqual([null]);
    expect(await imageRules([message], false, true)).toEqual(["sender"]);
  });
});

describe("the owner on a member's thread", () => {
  it("marks it read for the member too", async () => {
    await signInAs(ownerId);
    await actions.markRead(alex.threadId);
    const [message] = await db.select().from(messages).where(eq(messages.id, alex.messageId));
    expect(message.readAt).not.toBeNull();
  });
});

describe("a member's drafts", () => {
  it("list and open only those under their own addresses", async () => {
    await signInAs(memberId);
    const fromAlex = await actions.storeDraft({ from: ALEX, to: "", subject: "from alex", body: "" });
    const blank = await actions.storeDraft({ from: "", to: "", subject: "no from", body: "" });
    const [fromYou] = await db
      .insert(drafts)
      .values({ fromAddress: YOU, subject: "from you", createdBy: memberId })
      .returning();

    const member = await viewerFor(memberId);
    expect((await listDrafts(member)).map((d) => d.subject).sort()).toEqual(["from alex", "no from"]);
    expect(await loadDraft(member, fromAlex!)).not.toBeNull();
    expect(await loadDraft(member, blank!)).not.toBeNull();
    expect(await loadDraft(member, fromYou.id)).toBeNull();
  });
});

describe("a member's point lookups on their own address", () => {
  it("find the message, sender and address", async () => {
    const { allowed } = await viewerFor(memberId);
    expect(await loadMessageHtml(allowed, alex.messageId)).not.toBeNull();
    expect(await loadSender(allowed, alex.messageId)).not.toBeNull();
    expect(await loadAddress(allowed, ALEX)).not.toBeNull();
  });
});

describe("the rail", () => {
  it("counts archived and trashed only within the member's addresses", async () => {
    await db.update(threads).set({ archived: true }).where(eq(threads.id, you.threadId));
    expect((await listInboxes(await viewerFor(memberId))).archived).toBe(0);
    expect((await listInboxes(await viewerFor(ownerId))).archived).toBe(1);

    await db.update(threads).set({ trashedAt: new Date() }).where(eq(threads.id, you.threadId));
    expect((await listInboxes(await viewerFor(memberId))).trashed).toBe(0);
    expect((await listInboxes(await viewerFor(ownerId))).trashed).toBe(1);
  });

  it("keeps a member's address out of the owner's All mine", async () => {
    await db.update(addresses).set({ pinned: true }).where(eq(addresses.address, ALEX));
    const rail = await listInboxes(await viewerFor(ownerId));
    const listed = [...rail.named, ...rail.catchAll].map((inbox) => inbox.address);
    expect(listed).toContain(YOU);
    expect(listed).not.toContain(ALEX);
  });
});

describe("the switcher", () => {
  it("shows an owner their pinned addresses and each member's", async () => {
    await db.execute(sql`update addresses set pinned = true`);
    await seedMessage({ address: "hidden@example.test", subject: "tucked away" });
    await db.execute(sql`update addresses set pinned = true, hidden = true where address = 'hidden@example.test'`);
    const switcher = await listSwitcher(await viewerFor(ownerId));

    expect(switcher.own.map((entry) => entry.address)).toEqual([YOU]);
    expect(switcher.members).toEqual([expect.objectContaining({ address: ALEX, members: ["friend@example.test"], unread: 1 })]);
    // A hidden address has no entry, but its mail still counts toward "All mine".
    expect(switcher.allUnread).toBe(2);
  });

  it("shows a member only their own", async () => {
    const switcher = await listSwitcher(await viewerFor(memberId));
    expect(switcher.own.map((entry) => entry.address)).toEqual([ALEX]);
    expect(switcher.members).toEqual([]);
  });

  it("never tells a member who else holds their address", async () => {
    const other = await newUser("other@example.test", "member");
    await db.insert(memberAddresses).values({ userId: other.id, address: ALEX });

    const member = await listSwitcher(await viewerFor(memberId));
    expect(member.own.map((entry) => entry.members)).toEqual([[]]);

    const owner = await listSwitcher(await viewerFor(ownerId));
    expect(owner.members).toEqual([
      expect.objectContaining({ address: ALEX, members: ["friend@example.test", "other@example.test"] }),
    ]);
  });
});

describe("setView", () => {
  it("lets a member choose only their own address", async () => {
    await signInAs(memberId);
    await expect(actions.setView("Alex@example.test")).rejects.toThrow("REDIRECT /");
    expect(jar.get(VIEW_COOKIE)).toBe(ALEX);
    await expect(actions.setView(YOU)).rejects.toThrow("NOT_FOUND");
    await expect(actions.setView("all")).rejects.toThrow("REDIRECT /");
    expect(jar.get(VIEW_COOKIE)).toBe("all");
  });

  it("lets the owner choose any address", async () => {
    await signInAs(ownerId);
    await expect(actions.setView(ALEX)).rejects.toThrow("REDIRECT /");
    expect(jar.get(VIEW_COOKIE)).toBe(ALEX);
    await expect(actions.setView(YOU)).rejects.toThrow("REDIRECT /");
    expect(jar.get(VIEW_COOKIE)).toBe(YOU);
  });
});
