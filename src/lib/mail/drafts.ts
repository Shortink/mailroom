import { and, count, desc, eq, or } from "drizzle-orm";
import type { Viewer } from "../auth/viewer";
import { db } from "../db/client";
import { drafts, threads } from "../db/schema";
import { inReach } from "./reach";

export interface DraftInput {
  id?: string;
  threadId?: string | null;
  from: string;
  to: string;
  subject: string;
  body: string;
}

// The composer saves as you type, so the first save creates the row and every
// later one updates it in place.
export async function saveDraft(userId: string, input: DraftInput) {
  const values = {
    threadId: input.threadId ?? null,
    fromAddress: input.from,
    to: input.to,
    subject: input.subject,
    body: input.body,
    updatedAt: new Date(),
  };

  if (input.id) {
    const [row] = await db
      .update(drafts)
      .set(values)
      .where(and(eq(drafts.id, input.id), eq(drafts.createdBy, userId)))
      .returning({ id: drafts.id });
    if (row) return row.id;
  }

  const [row] = await db
    .insert(drafts)
    .values({ ...values, createdBy: userId })
    .returning({ id: drafts.id });
  return row.id;
}

export async function deleteDraft(id: string) {
  await db.delete(drafts).where(eq(drafts.id, id));
}

// A draft with no From yet is still its author's to finish, in any view.
function ownDrafts(viewer: Pick<Viewer, "userId" | "view">) {
  return and(
    eq(drafts.createdBy, viewer.userId),
    or(eq(drafts.fromAddress, ""), inReach(drafts.fromAddress, viewer.view)),
  );
}

export async function loadDraft(viewer: Pick<Viewer, "userId" | "allowed">, id: string) {
  const [row] = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.id, id),
        eq(drafts.createdBy, viewer.userId),
        or(eq(drafts.fromAddress, ""), inReach(drafts.fromAddress, viewer.allowed)),
      ),
    );
  return row ?? null;
}

export interface DraftSummary {
  id: string;
  threadId: string | null;
  from: string;
  to: string;
  subject: string;
  body: string;
  updatedAt: Date;
}

export async function listDrafts(viewer: Pick<Viewer, "userId" | "view">): Promise<DraftSummary[]> {
  const rows = await db
    .select({
      id: drafts.id,
      threadId: drafts.threadId,
      from: drafts.fromAddress,
      to: drafts.to,
      subject: drafts.subject,
      body: drafts.body,
      updatedAt: drafts.updatedAt,
      threadSubject: threads.subject,
    })
    .from(drafts)
    .leftJoin(threads, eq(threads.id, drafts.threadId))
    .where(ownDrafts(viewer))
    .orderBy(desc(drafts.updatedAt));

  return rows.map(({ threadSubject, ...draft }) => ({
    ...draft,
    subject: draft.subject || threadSubject || "",
  }));
}

export async function countDrafts(viewer: Pick<Viewer, "userId" | "view">) {
  const [row] = await db.select({ n: count() }).from(drafts).where(ownDrafts(viewer));
  return row?.n ?? 0;
}
