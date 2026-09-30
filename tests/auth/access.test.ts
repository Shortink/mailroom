import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { attachments, drafts, memberAddresses } from "../../src/lib/db/schema";
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

const { listThreads, listInboxes, loadThread, loadMessageHtml, loadSender, countFailed, searchThreads } =
  await import("../../src/lib/mail/queries");
const { listDrafts, loadDraft } = await import("../../src/lib/mail/drafts");
const { loadAddress } = await import("../../src/lib/mail/addresses");
const { requireAddress, requireOwner } = await import("../../src/lib/auth/require");
const { GET: getAttachment } = await import("../../src/app/api/attachments/[key]/route");

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
