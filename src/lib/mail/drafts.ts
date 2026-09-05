import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { drafts, threads } from "../db/schema";

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
export async function saveDraft(input: DraftInput) {
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
      .where(eq(drafts.id, input.id))
      .returning({ id: drafts.id });
    if (row) return row.id;
  }

  const [row] = await db.insert(drafts).values(values).returning({ id: drafts.id });
  return row.id;
}

export async function deleteDraft(id: string) {
  await db.delete(drafts).where(eq(drafts.id, id));
}

export async function loadDraft(id: string) {
  const [row] = await db.select().from(drafts).where(eq(drafts.id, id));
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

export async function listDrafts(): Promise<DraftSummary[]> {
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
    .orderBy(desc(drafts.updatedAt));

  return rows.map(({ threadSubject, ...draft }) => ({
    ...draft,
    subject: draft.subject || threadSubject || "",
  }));
}

export async function countDrafts() {
  const rows = await db.select({ id: drafts.id }).from(drafts);
  return rows.length;
}
