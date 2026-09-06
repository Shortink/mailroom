import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "../../src/lib/mail/sanitize";

const cids = { "logo@x": "/api/attachments/abc" };

function clean(html: string, allowRemoteImages = false) {
  return sanitizeEmailHtml(html, { cids, allowRemoteImages });
}

describe("sanitizeEmailHtml", () => {
  it("removes script tags", () => {
    expect(clean(`<p>hi</p><script>steal()</script>`)).not.toMatch(/script/i);
  });

  it("removes event handler attributes", () => {
    const out = clean(`<p onclick="steal()" onerror="steal()">hi</p>`);
    expect(out).not.toMatch(/onclick|onerror/i);
    expect(out).toContain("hi");
  });

  it("drops javascript: urls", () => {
    expect(clean(`<a href="javascript:alert(1)">x</a>`)).not.toMatch(/javascript:/i);
  });

  it("drops obfuscated javascript: urls", () => {
    expect(clean(`<a href="JaVaScRiPt:alert(1)">x</a>`)).not.toMatch(/javascript:/i);
  });

  it("drops data: urls on links", () => {
    expect(clean(`<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>`)).not.toMatch(/data:text\/html/i);
  });

  it("removes iframes and objects", () => {
    const out = clean(`<iframe src="https://evil.test"></iframe><object data="x"></object>`);
    expect(out).not.toMatch(/iframe|object/i);
  });

  it("removes style and link tags that could exfiltrate", () => {
    const out = clean(`<style>@import url(https://evil.test)</style><link rel="stylesheet" href="https://evil.test">`);
    expect(out).not.toMatch(/evil\.test/);
  });

  it("blocks remote images by default", () => {
    expect(clean(`<img src="https://tracker.test/p.gif">`)).not.toContain("tracker.test");
  });

  it("allows remote images when opted in", () => {
    expect(clean(`<img src="https://tracker.test/p.gif">`, true)).toContain("tracker.test");
  });

  it("rewrites cid references to the stored attachment", () => {
    expect(clean(`<img src="cid:logo@x">`)).toContain("/api/attachments/abc");
  });

  it("drops a cid reference with no matching attachment", () => {
    expect(clean(`<img src="cid:missing@x">`)).not.toContain("cid:");
  });

  it("keeps cid images even when remote images are blocked", () => {
    expect(clean(`<img src="cid:logo@x">`, false)).toContain("/api/attachments/abc");
  });

  it("hardens links against tabnabbing", () => {
    const out = clean(`<a href="https://ok.test">x</a>`);
    expect(out).toContain(`rel="noopener noreferrer"`);
    expect(out).toContain(`target="_blank"`);
  });

  it("keeps ordinary formatting and tables intact", () => {
    const out = clean(`<table><tr><td><b>Total</b></td><td>10</td></tr></table>`);
    expect(out).toContain("<table>");
    expect(out).toContain("<b>Total</b>");
  });

  it("returns an empty string for empty input", () => {
    expect(clean("")).toBe("");
  });
});
