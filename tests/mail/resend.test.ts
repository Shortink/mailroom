import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadAttachment,
  getAttachment,
  getEmail,
  getReceivedEmail,
  sendEmail,
} from "../../src/lib/mail/resend";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response) {
  const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("getReceivedEmail", () => {
  it("requests the receiving endpoint and returns the payload", async () => {
    const fetch = stubFetch(Response.json({ id: "abc", subject: "hi", text: "body" }));
    const mail = await getReceivedEmail("abc");

    expect(fetch.mock.calls[0][0]).toBe("https://api.resend.com/emails/receiving/abc");
    expect(mail.subject).toBe("hi");
  });

  it("throws with the status and Resend's message", async () => {
    stubFetch(Response.json({ message: "not found" }, { status: 404 }));
    await expect(getReceivedEmail("abc")).rejects.toThrow(/404.*not found/);
  });

  it("reports a restricted key clearly", async () => {
    stubFetch(Response.json({ message: "This API key is restricted to only send emails" }, { status: 401 }));
    await expect(getReceivedEmail("abc")).rejects.toThrow(/restricted/);
  });
});

describe("getAttachment", () => {
  it("addresses the attachment under its parent email", async () => {
    const fetch = stubFetch(Response.json({ id: "att", download_url: "https://cdn.test/f" }));
    const attachment = await getAttachment("mail-1", "att");

    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.resend.com/emails/receiving/mail-1/attachments/att",
    );
    expect(attachment.download_url).toBe("https://cdn.test/f");
  });
});

describe("downloadAttachment", () => {
  it("returns the bytes", async () => {
    stubFetch(new Response(new Uint8Array([1, 2, 3])));
    expect(await downloadAttachment("https://cdn.test/f", 16)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("throws on a failed download", async () => {
    stubFetch(new Response("gone", { status: 410 }));
    await expect(downloadAttachment("https://cdn.test/f", 16)).rejects.toThrow(/410/);
  });

  it("gives up on a body longer than the limit", async () => {
    stubFetch(new Response(new Uint8Array([1, 2, 3, 4, 5])));
    expect(await downloadAttachment("https://cdn.test/f", 4)).toBeNull();
  });

  it("keeps a body exactly on the limit", async () => {
    stubFetch(new Response(new Uint8Array([1, 2, 3, 4])));
    expect(await downloadAttachment("https://cdn.test/f", 4)).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});

describe("sendEmail", () => {
  it("passes headers through and maps replyTo to reply_to", async () => {
    const fetch = stubFetch(Response.json({ id: "sent-1" }));
    await sendEmail({
      from: "hi@example.test",
      to: ["someone@vendor.test"],
      subject: "Re: Invoice",
      text: "paid",
      headers: { "In-Reply-To": "<a@x>" },
      replyTo: "hi@example.test",
    });

    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(body.headers["In-Reply-To"]).toBe("<a@x>");
    expect(body.reply_to).toBe("hi@example.test");
    expect(body.replyTo).toBeUndefined();
  });
});

describe("getEmail", () => {
  it("returns the assigned message id once delivered", async () => {
    stubFetch(Response.json({ id: "sent-1", last_event: "delivered", message_id: "<x@ses>" }));
    expect((await getEmail("sent-1")).message_id).toBe("<x@ses>");
  });
});
