import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { attachments } from "../db/schema";
import type { Storage } from "./types";

export class PostgresStorage implements Storage {
  async put(key: string, body: Buffer) {
    await db.update(attachments).set({ content: body }).where(eq(attachments.storageKey, key));
  }

  async get(key: string) {
    const [row] = await db
      .select({ content: attachments.content })
      .from(attachments)
      .where(eq(attachments.storageKey, key));
    return row?.content ?? null;
  }

  async delete(key: string) {
    await db.update(attachments).set({ content: null }).where(eq(attachments.storageKey, key));
  }

  url(key: string) {
    return `/api/attachments/${encodeURIComponent(key)}`;
  }
}
