import { describe, expect, it } from "vitest";
import { parseMime } from "../../src/lib/mail/mime";

// Two Authentication-Results lines: the top one is the receiving server's,
// the lower one came with the message.
const RAW = [
  "Authentication-Results: mx.cloudflare.net; dkim=pass header.d=vendor.test",
  "Received: from mail.vendor.test by mx.cloudflare.net",
  "Authentication-Results: mail.vendor.test; spf=fail",
  "From: Billing <billing@vendor.test>",
  "To: hi@example.test, Team: alice@x.test, bob@x.test;",
  "Cc: cc@vendor.test",
  "Subject: Invoice",
  "Message-ID: <inv-1@vendor.test>",
  "In-Reply-To: <orig@vendor.test>",
  "References: <a@vendor.test> <orig@vendor.test>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="outer"',
  "",
  "--outer",
  'Content-Type: multipart/alternative; boundary="inner"',
  "",
  "--inner",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "please pay",
  "--inner",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p>please pay <img src="cid:logo@vendor.test"></p>',
  "--inner--",
  "--outer",
  "Content-Type: image/png",
  "Content-ID: <logo@vendor.test>",
  'Content-Disposition: inline; filename="logo.png"',
  "Content-Transfer-Encoding: base64",
  "",
  "iVBORw0KGgo=",
  "--outer",
  "Content-Type: application/pdf",
  'Content-Disposition: attachment; filename="invoice.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0=",
  "--outer--",
  "",
].join("\r\n");

describe("parseMime", () => {
  it("maps addresses, flattening a group", async () => {
    const mail = await parseMime(Buffer.from(RAW), { to: "hi@example.test" });

    expect(mail.from).toBe("billing@vendor.test");
    expect(mail.to).toEqual(["hi@example.test", "alice@x.test", "bob@x.test"]);
    expect(mail.cc).toEqual(["cc@vendor.test"]);
    expect(mail.receivedFor).toBe("hi@example.test");
  });

  it("keeps the ids threading relies on in their header form", async () => {
    const mail = await parseMime(Buffer.from(RAW), { to: "hi@example.test" });

    expect(mail.messageId).toBe("<inv-1@vendor.test>");
    expect(mail.headers["in-reply-to"]).toBe("<orig@vendor.test>");
    expect(mail.headers["references"]).toBe("<a@vendor.test> <orig@vendor.test>");
  });

  it("takes the first of a repeated header", async () => {
    const mail = await parseMime(Buffer.from(RAW), { to: "hi@example.test" });
    expect(mail.headers["authentication-results"]).toMatch(/^mx\.cloudflare\.net/);
  });

  it("splits the alternative into text and html", async () => {
    const mail = await parseMime(Buffer.from(RAW), { to: "hi@example.test" });

    expect(mail.text?.trim()).toBe("please pay");
    expect(mail.html).toContain('src="cid:logo@vendor.test"');
  });

  it("decodes attachments and strips brackets from a content id", async () => {
    const mail = await parseMime(Buffer.from(RAW), { to: "hi@example.test" });

    expect(mail.attachments).toHaveLength(2);

    const [logo, invoice] = mail.attachments;
    expect(logo.contentId).toBe("logo@vendor.test");
    expect(logo.contentType).toBe("image/png");
    expect(logo.bytes).toEqual(Buffer.from("iVBORw0KGgo=", "base64"));
    expect(logo.size).toBe(logo.bytes!.length);

    expect(invoice.filename).toBe("invoice.pdf");
    expect(invoice.contentId).toBeNull();
    expect(invoice.bytes).toEqual(Buffer.from("%PDF-"));
  });

  it("gives each attachment an id that is stable across parses", async () => {
    const first = await parseMime(Buffer.from(RAW), { to: "hi@example.test" });
    const second = await parseMime(Buffer.from(RAW), { to: "hi@example.test" });

    expect(first.attachments.map((a) => a.id)).toEqual(second.attachments.map((a) => a.id));
  });
});
