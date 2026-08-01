import { db } from "../../src/lib/db/client";
import { attachments, messages, threads } from "../../src/lib/db/schema";
import { PostgresStorage } from "../../src/lib/storage/postgres";
import { testStorage } from "./conformance";

const KEYS = ["k/bin", "k/absent", "k/gone", "k/over"];
let seeded = false;

// The driver updates rows the ingest pipeline creates, so the keys must exist.
async function make() {
  if (!seeded) {
    const [thread] = await db.insert(threads).values({ subject: "storage" }).returning();
    const [message] = await db
      .insert(messages)
      .values({ threadId: thread.id, direction: "inbound" })
      .returning();
    await db.insert(attachments).values(
      KEYS.filter((key) => key !== "k/absent").map((key) => ({
        messageId: message.id,
        filename: "f",
        contentType: "application/octet-stream",
        sizeBytes: 0,
        storageKey: key,
      })),
    );
    seeded = true;
  }
  return new PostgresStorage();
}

testStorage("PostgresStorage", make);
