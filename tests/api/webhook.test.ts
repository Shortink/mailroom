import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { messages, threads } from "../../src/lib/db/schema";

const completeIngest = vi.fn();
vi.mock("../../src/lib/mail/ingest", () => ({
  completeIngest: (id: string) => completeIngest(id),
}));

// The real Webhook.verify() only checks the signature (throwing on failure)
// and always returns undefined; the route parses the body itself.
const verify = vi.fn();
vi.mock("svix", () => ({
  Webhook: class {
    verify(payload: string) {
      return verify(payload);
    }
  },
}));

// after() defers work past the response; running it inline keeps the test simple.
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => fn(),
}));

function post(body: unknown) {
  return new Request("https://example.test/api/webhooks/resend", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "svix-id": "1", "svix-timestamp": "2", "svix-signature": "v1,sig" },
  });
}

const received = {
  type: "email.received",
  data: {
    email_id: "hook-1",
    to: ["hi@example.test"],
    received_for: ["billing@example.test"],
    from: "sender@vendor.test",
    subject: "Hello",
  },
};

beforeEach(async () => {
  completeIngest.mockReset();
  verify.mockReset();
  verify.mockReturnValue(undefined);
  await db.execute(sql`truncate table messages, threads, addresses restart identity cascade`);
});

afterEach(() => vi.resetModules());

async function route() {
  return import("../../src/app/api/webhooks/resend/route");
}

describe("resend webhook", () => {
  it("rejects an invalid signature and writes nothing", async () => {
    verify.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const { POST } = await route();
    const response = await POST(post(received));

    expect(response.status).toBe(401);
    expect(await db.select().from(messages)).toHaveLength(0);
    expect(completeIngest).not.toHaveBeenCalled();
  });

  it("stores one pending message and returns 200", async () => {
    const { POST } = await route();
    const response = await POST(post(received));

    expect(response.status).toBe(200);

    const [row] = await db.select().from(messages).where(eq(messages.resendId, "hook-1"));
    expect(row.status).toBe("pending");
    expect(row.direction).toBe("inbound");
    expect(row.deliveredTo).toBe("billing@example.test");
    expect(row.fromAddress).toBe("sender@vendor.test");
    expect(completeIngest).toHaveBeenCalledWith(row.id);
  });

  it("is idempotent across retries of the same delivery", async () => {
    const { POST } = await route();
    await POST(post(received));
    await POST(post(received));

    const rows = await db.select().from(messages).where(eq(messages.resendId, "hook-1"));
    expect(rows).toHaveLength(1);
    expect(completeIngest).toHaveBeenCalledTimes(1);
  });

  it("leaves no orphan thread when a retry is discarded", async () => {
    const { POST } = await route();
    await POST(post(received));
    await POST(post(received));

    expect(await db.select().from(threads)).toHaveLength(1);
  });

  it("falls back to the to field when received_for is absent", async () => {
    const event = {
      type: "email.received",
      data: { email_id: "hook-2", to: ["hi@example.test"], from: "s@vendor.test" },
    };

    const { POST } = await route();
    await POST(post(event));

    const [row] = await db.select().from(messages).where(eq(messages.resendId, "hook-2"));
    expect(row.deliveredTo).toBe("hi@example.test");
  });

  it("ignores its own forwarded copies", async () => {
    const { forwardMarker } = await import("../../src/lib/mail/marker");
    const event = {
      type: "email.received",
      data: {
        email_id: "hook-3",
        to: ["hi@example.test"],
        headers: { "x-forwarded-by": forwardMarker() },
      },
    };

    const { POST } = await route();
    const response = await POST(post(event));

    expect(response.status).toBe(200);
    expect(await db.select().from(messages).where(eq(messages.resendId, "hook-3"))).toHaveLength(0);
  });

  it("acknowledges event types it does not handle", async () => {
    const event = { type: "email.delivered", data: { email_id: "other" } };

    const { POST } = await route();
    const response = await POST(post(event));

    expect(response.status).toBe(200);
    expect(await db.select().from(messages)).toHaveLength(0);
  });
});

describe("forward loop guard cannot be forged", () => {
  it("ignores only the deployment's own marker", async () => {
    const { forwardMarker } = await import("../../src/lib/mail/marker");
    const event = {
      type: "email.received",
      data: { email_id: "mine", to: ["hi@example.test"], headers: { "x-forwarded-by": forwardMarker() } },
    };

    const { POST } = await route();
    await POST(post(event));

    expect(await db.select().from(messages).where(eq(messages.resendId, "mine"))).toHaveLength(0);
  });

  it("stores mail carrying an attacker-supplied marker rather than dropping it", async () => {
    const event = {
      type: "email.received",
      data: {
        email_id: "forged",
        to: ["hi@example.test"],
        headers: { "x-forwarded-by": "resend-mail-client" },
      },
    };

    const { POST } = await route();
    await POST(post(event));

    const rows = await db.select().from(messages).where(eq(messages.resendId, "forged"));
    expect(rows).toHaveLength(1);
  });
});
