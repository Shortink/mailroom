import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import {
  countDrafts,
  deleteDraft,
  listDrafts,
  loadDraft,
  saveDraft,
} from "../../src/lib/mail/drafts";
import { newThread, newUser } from "../helpers";

let userId: string;

beforeEach(async () => {
  await db.execute(
    sql`truncate table messages, threads, drafts, addresses, users restart identity cascade`,
  );
  userId = (await newUser()).id;
});

describe("saveDraft", () => {
  it("creates a row on the first save", async () => {
    const id = await saveDraft(userId, {
      from: "me@x.test",
      to: "them@y.test",
      subject: "hi",
      body: "one",
    });

    const draft = await loadDraft(id);
    expect(draft?.body).toBe("one");
    expect(await countDrafts()).toBe(1);
  });

  it("updates in place rather than piling up rows", async () => {
    const first = await saveDraft(userId, { from: "me@x.test", to: "", subject: "", body: "one" });
    const second = await saveDraft(userId, {
      id: first,
      from: "me@x.test",
      to: "them@y.test",
      subject: "now with a subject",
      body: "two",
    });

    expect(second).toBe(first);
    expect(await countDrafts()).toBe(1);

    const draft = await loadDraft(first);
    expect(draft?.body).toBe("two");
    expect(draft?.to).toBe("them@y.test");
  });

  it("creates a fresh row when the id no longer exists", async () => {
    const id = await saveDraft(userId, { from: "me@x.test", to: "", subject: "", body: "gone" });
    await deleteDraft(id);

    const replacement = await saveDraft(userId, {
      id,
      from: "me@x.test",
      to: "",
      subject: "",
      body: "new",
    });

    expect(replacement).not.toBe(id);
    expect(await countDrafts()).toBe(1);
  });
});

describe("listDrafts", () => {
  it("returns newest first", async () => {
    const older = await saveDraft(userId, { from: "me@x.test", to: "", subject: "older", body: "a" });
    await db.execute(sql`update drafts set updated_at = now() - interval '1 hour' where id = ${older}`);
    await saveDraft(userId, { from: "me@x.test", to: "", subject: "newer", body: "b" });

    const rows = await listDrafts();
    expect(rows.map((row) => row.subject)).toEqual(["newer", "older"]);
  });

  it("falls back to the thread subject for a reply with none of its own", async () => {
    const thread = await newThread("me@x.test", { subject: "Original subject" });
    await saveDraft(userId, {
      threadId: thread.id,
      from: "me@x.test",
      to: "",
      subject: "",
      body: "re",
    });

    const [row] = await listDrafts();
    expect(row.subject).toBe("Original subject");
    expect(row.threadId).toBe(thread.id);
  });

  it("drops drafts when their thread goes away", async () => {
    const thread = await newThread("me@x.test", { subject: "doomed" });
    await saveDraft(userId, {
      threadId: thread.id,
      from: "me@x.test",
      to: "",
      subject: "",
      body: "re",
    });

    await db.execute(sql`delete from threads where id = ${thread.id}`);

    expect(await countDrafts()).toBe(0);
  });
});
