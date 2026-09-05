import { sql } from "drizzle-orm";
import { beforeAll } from "vitest";
import { db } from "../src/lib/db/client";

// Test files run sequentially, each starting from an empty database, so a rerun
// never collides with rows left by the previous one.
beforeAll(async () => {
  await db.execute(sql`
    truncate table
      messages, threads, attachments, addresses,
      users, recovery_codes, invites, login_attempts
    restart identity cascade
  `);
});
