import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import {
  allowSender,
  disallowSender,
  imageRules,
  listAllowedSenders,
  senderOf,
  type ImageMessage,
} from "../../src/lib/mail/images";

beforeEach(async () => {
  await db.execute(sql`truncate table image_senders restart identity cascade`);
});

function inbound(overrides: Partial<ImageMessage> = {}): ImageMessage {
  return {
    direction: "inbound",
    fromAddress: "news@shop.test",
    verdict: "pass",
    ...overrides,
  };
}

describe("senderOf", () => {
  it("takes the address out of a display name", () => {
    expect(senderOf("Shop News <News@Shop.test>")).toBe("news@shop.test");
    expect(senderOf(" news@shop.test ")).toBe("news@shop.test");
  });

  it("gives nothing back for something that is not an address", () => {
    expect(senderOf("undisclosed-recipients")).toBeNull();
    expect(senderOf(null)).toBeNull();
  });
});

describe("imageRules", () => {
  it("blocks by default", async () => {
    expect(await imageRules([inbound()], false, true)).toEqual([null]);
  });

  it("loads everything when the reader said so", async () => {
    expect(await imageRules([inbound(), inbound({ fromAddress: "a@b.test" })], true, true)).toEqual([
      "all",
      "all",
    ]);
  });

  it("loads for an allowed sender, however the From line was written", async () => {
    await allowSender("Shop <NEWS@shop.test>");
    expect(await listAllowedSenders()).toEqual(["news@shop.test"]);

    const rules = await imageRules([inbound({ fromAddress: "Shop News <news@shop.test>" })], false, true);
    expect(rules).toEqual(["sender"]);
  });

  it("never loads for mail that failed authentication, whatever the settings", async () => {
    await allowSender("news@shop.test");

    expect(await imageRules([inbound({ verdict: "fail" })], false, true)).toEqual([null]);
    expect(await imageRules([inbound({ verdict: "fail" })], true, true)).toEqual([null]);
  });

  it("still loads when authentication is unknown, which most mail is", async () => {
    await allowSender("news@shop.test");
    expect(await imageRules([inbound({ verdict: "unknown" })], false, true)).toEqual(["sender"]);
  });

  it("stops once the sender is removed", async () => {
    await allowSender("news@shop.test");
    await disallowSender("Shop <news@shop.test>");

    expect(await imageRules([inbound()], false, true)).toEqual([null]);
  });
});
