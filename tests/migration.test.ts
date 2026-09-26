import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The backfill runs once, against data shaped by the migrations before it, so
// it gets a database of its own rather than the shared test one.
const base = new URL(process.env.DATABASE_URL!);
const name = `${base.pathname.slice(1)}_migration`;
const target = new URL(base);
target.pathname = `/${name}`;
const mixedName = `${name}_mixed`;
const mixedTarget = new URL(base);
mixedTarget.pathname = `/${mixedName}`;

let sql: postgres.Sql;

function migrationsUpTo(tag: string) {
  const dir = mkdtempSync(join(tmpdir(), "mailroom-migrations-"));
  cpSync("drizzle", dir, { recursive: true });
  const path = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(path, "utf8"));
  const last = journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag);
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(path, JSON.stringify(journal));
  return dir;
}

async function seedOldShape() {
  await sql`insert into users (id, email, password_hash, created_at) values
    ('00000000-0000-0000-0000-000000000001', 'first@x.test', 'h', '2026-01-01'),
    ('00000000-0000-0000-0000-000000000002', 'second@x.test', 'h', '2026-02-01')`;

  await sql`insert into invites (selector, token_hash, expires_at, accepted_at) values
    ('open', 'h', now() + interval '1 day', null),
    ('used', 'h', now() + interval '1 day', now())`;

  await sql`insert into addresses (address, label, pinned, hidden, position, auto_archive) values
    ('Hi@x.test', 'Shouty', true, false, 3, false),
    ('hi@x.test', 'Hello', false, true, 1, true)`;

  // A: one address once lowercased, with an outbound reply.
  // C: pending with no delivered_to, falls back to its first To.
  // D: no delivered_to and no To, falls back to the most common address.
  // E: no messages at all.
  await sql`insert into threads (id, subject) values
    ('10000000-0000-0000-0000-00000000000a', 'A'),
    ('10000000-0000-0000-0000-00000000000c', 'C'),
    ('10000000-0000-0000-0000-00000000000d', 'D'),
    ('10000000-0000-0000-0000-00000000000e', 'E')`;

  await sql`insert into messages (thread_id, direction, status, subject, delivered_to, from_address, "to", received_at, message_id) values
    ('10000000-0000-0000-0000-00000000000a', 'inbound', 'complete', 'A', 'Hi@x.test', 's@v.test', '{Hi@x.test}', '2026-03-01', '<a1@v>'),
    ('10000000-0000-0000-0000-00000000000a', 'outbound', 'complete', 'Re: A', 'hi@x.test', 'hi@x.test', '{s@v.test}', '2026-03-02', '<a2@x>'),
    ('10000000-0000-0000-0000-00000000000c', 'inbound', 'pending', '', null, null, '{Ops <Ops@x.test>}', '2026-05-01', null),
    ('10000000-0000-0000-0000-00000000000d', 'inbound', 'failed', '', null, null, '{}', '2026-05-02', null)`;

  await sql`insert into drafts (thread_id, from_address, subject) values
    ('10000000-0000-0000-0000-00000000000a', 'other@x.test', 'reply'),
    (null, '', 'blank'),
    (null, 'Sales@X.test', 'cased')`;
}

async function freshDatabase(db: string) {
  const admin = postgres(base.toString(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${db}" with (force)`);
  await admin.unsafe(`create database "${db}"`);
  await admin.end();
}

beforeAll(async () => {
  await freshDatabase(name);

  sql = postgres(target.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: migrationsUpTo("0009_tranquil_prodigy") });
  await seedOldShape();
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
}, 60_000);

afterAll(async () => {
  await sql.end();
  const admin = postgres(base.toString(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${mixedName}" with (force)`);
  await admin.end();
});

describe("per-address migration", () => {
  it("makes everyone who exists an owner", async () => {
    const rows = await sql`select role from users`;
    expect(rows.map((row) => row.role)).toEqual(["owner", "owner"]);
  });

  it("drops open invites and keeps accepted ones", async () => {
    const rows = await sql`select selector from invites`;
    expect(rows.map((row) => row.selector)).toEqual(["used"]);
  });

  it("merges address rows that differ only by case", async () => {
    const rows = await sql`select * from addresses where lower(address) = 'hi@x.test'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      address: "hi@x.test",
      label: "Hello",
      pinned: true,
      hidden: false,
      position: 1,
      auto_archive: true,
    });
  });

  it("removes threads that have no messages", async () => {
    const rows = await sql`select 1 from threads where subject = 'E'`;
    expect(rows).toHaveLength(0);
  });

  it("gives a thread the address of its first message", async () => {
    const [a] = await sql`select address from threads where id = '10000000-0000-0000-0000-00000000000a'`;
    expect(a.address).toBe("hi@x.test");
  });

  it("falls back to the first To, then to the most common address", async () => {
    const [c] = await sql`select address from threads where id = '10000000-0000-0000-0000-00000000000c'`;
    const [d] = await sql`select address from threads where id = '10000000-0000-0000-0000-00000000000d'`;
    expect(c.address).toBe("ops@x.test");
    expect(d.address).toBe("hi@x.test");

    const [ops] = await sql`select 1 from addresses where address = 'ops@x.test'`;
    expect(ops).toBeDefined();

    const blank = await sql`select 1 from messages where direction = 'inbound' and delivered_to is null`;
    expect(blank).toHaveLength(0);
  });

  it("points reply drafts at their thread's address and gives every draft an author", async () => {
    const rows = await sql`select subject, from_address, created_by from drafts order by subject`;
    expect(rows).toEqual([
      { subject: "blank", from_address: "hi@x.test", created_by: "00000000-0000-0000-0000-000000000001" },
      { subject: "cased", from_address: "sales@x.test", created_by: "00000000-0000-0000-0000-000000000001" },
      { subject: "reply", from_address: "hi@x.test", created_by: "00000000-0000-0000-0000-000000000001" },
    ]);
  });

  it("stops rather than guess when a thread holds mail for two addresses", async () => {
    await freshDatabase(mixedName);
    const mixed = postgres(mixedTarget.toString(), { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(mixed), { migrationsFolder: migrationsUpTo("0009_tranquil_prodigy") });
      await mixed`insert into threads (id, subject) values ('20000000-0000-0000-0000-000000000001', 'M')`;
      await mixed`insert into messages (thread_id, direction, status, delivered_to, received_at) values
        ('20000000-0000-0000-0000-000000000001', 'inbound', 'complete', 'a@x.test', '2026-04-01'),
        ('20000000-0000-0000-0000-000000000001', 'inbound', 'complete', 'b@x.test', '2026-04-02')`;

      const failure = await migrate(drizzle(mixed), { migrationsFolder: "drizzle" }).then(
        () => null,
        (error: Error) => error,
      );
      // drizzle wraps the error with the failed statement, whose text holds
      // the same words, so only the database's own error counts.
      expect(failure?.cause).toMatchObject({
        message: expect.stringMatching(
          /Thread 20000000-0000-0000-0000-000000000001 holds mail for more than one address/,
        ),
      });
    } finally {
      await mixed.end();
    }
  }, 60_000);
});
