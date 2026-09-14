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

describe("CSS cannot fetch remote resources", () => {
  it("strips background:url() that would act as a tracking pixel", () => {
    const out = clean(`<div style="background:url(https://tracker.test/p.gif)">hi</div>`);
    expect(out).not.toContain("tracker.test");
    expect(out).toContain("hi");
  });

  it("strips background-image, list-style-image, cursor and border-image urls", () => {
    for (const css of [
      "background-image:url(https://tracker.test/a.gif)",
      "list-style-image:url(https://tracker.test/b.gif)",
      "cursor:url(https://tracker.test/c.cur),auto",
      "border-image:url(https://tracker.test/d.png)",
    ]) {
      expect(clean(`<div style="${css}">x</div>`)).not.toContain("tracker.test");
    }
  });

  it("keeps harmless declarations", () => {
    const out = clean(`<p style="color:#ff0000;font-weight:bold;text-align:center">x</p>`);
    expect(out).toContain("color");
    expect(out).toContain("bold");
  });

  it("strips a url() smuggled into an allowed property", () => {
    expect(clean(`<div style="color:url(https://tracker.test/e.gif)">x</div>`)).not.toContain(
      "tracker.test",
    );
  });
});

// What a message needs to look like its sender meant, and the line that
// still cannot be crossed: nothing that fetches.
describe("mail layout styling", () => {
  it("keeps what a button is made of", () => {
    const out = clean(
      `<a href="https://x.test" style="display:inline-block;background-color:#1a56db;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:Arial, sans-serif">Go</a>`,
    );
    expect(out).toContain("display:inline-block");
    expect(out).toContain("border-radius:6px");
    expect(out).toContain("background-color:#1a56db");
    expect(out).toContain("font-family:Arial, sans-serif");
  });

  it("keeps table layout attributes", () => {
    const out = clean(
      `<table border="0" cellpadding="8" cellspacing="0"><tr><td bgcolor="#eeeeee" valign="top" align="center">x</td></tr></table>`,
    );
    expect(out).toContain('bgcolor="#eeeeee"');
    expect(out).toContain('valign="top"');
    expect(out).toContain('cellpadding="8"');
  });

  it("keeps borders and line height", () => {
    const out = clean(`<div style="border:1px solid #ddd;line-height:1.6;letter-spacing:0.5px">x</div>`);
    expect(out).toContain("border:1px solid #ddd");
    expect(out).toContain("line-height:1.6");
  });

  it("still refuses anything that could fetch", () => {
    const out = clean(
      `<div style="background:url(https://x.test/p.gif);background-image:url(https://x.test/p.gif);list-style:url(https://x.test/p.gif);border:1px solid url(https://x.test/p.gif)">x</div>`,
    );
    expect(out).not.toContain("url(");
  });

  it("keeps positioning and behaviour out", () => {
    const out = clean(`<div style="position:fixed;z-index:9;cursor:pointer;behavior:url(x)">x</div>`);
    expect(out).not.toContain("position");
    expect(out).not.toContain("z-index");
    expect(out).not.toContain("behavior");
  });

  it("drops a background attribute, which is a url", () => {
    expect(clean(`<td background="https://x.test/p.gif">x</td>`)).not.toContain("background=");
  });
});

describe("quoted reply markers", () => {
  it("keeps what identifies a quoted reply", () => {
    expect(clean('<div class="gmail_quote">x</div>')).toContain('class="gmail_quote"');
    expect(clean('<blockquote type="cite">x</blockquote>')).toContain('type="cite"');
    expect(clean('<div id="divRplyFwdMsg">x</div>')).toContain('id="divRplyFwdMsg"');
  });
});
