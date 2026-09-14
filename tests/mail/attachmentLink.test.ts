import { afterEach, describe, expect, it, vi } from "vitest";
import { attachmentUrlIsValid, signAttachmentUrl } from "../../src/lib/mail/attachmentLink";

afterEach(() => vi.useRealTimers());

function parts(url: string) {
  const { searchParams } = new URL(url, "https://example.test");
  return { exp: searchParams.get("exp"), sig: searchParams.get("sig") };
}

describe("signed attachment links", () => {
  it("verifies what it signed", () => {
    const { exp, sig } = parts(signAttachmentUrl("/api/attachments/k", "msg/part-0"));
    expect(attachmentUrlIsValid("msg/part-0", exp, sig)).toBe(true);
  });

  it("is bound to the key", () => {
    const { exp, sig } = parts(signAttachmentUrl("/api/attachments/k", "msg/part-0"));
    expect(attachmentUrlIsValid("msg/part-1", exp, sig)).toBe(false);
  });

  it("rejects a changed expiry", () => {
    const { exp, sig } = parts(signAttachmentUrl("/api/attachments/k", "msg/part-0"));
    expect(attachmentUrlIsValid("msg/part-0", String(Number(exp) + 1), sig)).toBe(false);
  });

  it("rejects a link past its expiry", () => {
    vi.useFakeTimers();
    const { exp, sig } = parts(signAttachmentUrl("/api/attachments/k", "msg/part-0"));
    vi.setSystemTime(Number(exp) + 1);
    expect(attachmentUrlIsValid("msg/part-0", exp, sig)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(attachmentUrlIsValid("msg/part-0", String(Date.now() + 1000), null)).toBe(false);
  });
});
